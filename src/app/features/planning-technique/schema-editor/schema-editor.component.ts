import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import Konva from 'konva';
import { Exercice, FormationCustom, TechniqueService } from '../../../core/services/technique.service';
import { Joueur, JoueurService, VitesseJoueur } from '../../../core/services/joueur.service';
import { MatIcon } from "@angular/material/icon";

type Terrain = 'complet' | 'demi';
type Outil = 'select' | 'deplacement' | 'conduite' | 'passe' | 'tir' | 'supprimer';
type TraceType = 'deplacement' | 'conduite' | 'passe' | 'tir';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; label?: string; joueurId?: string; x: number; y: number; }
// elementId = jeton/ballon qui suit le tracé ; ballId = ballon entraîné par une conduite.
interface SchemaTrace { id: string; type: TraceType; points: number[]; elementId?: string; ballId?: string; }
interface Keyframe { t: number; positions: Record<string, { x: number; y: number }>; }

const VIOLET = '#7c3aed', JAUNE = '#eab308', ROUGE = '#ef4444';
const BLEU = '#2563eb';
const NOIR = '#1f2937';   // jetons « Adversaire » (génériques, éditables)

// Brique 3 : vitesses réelles. Joueur sans donnée GPS → vitesse de course par défaut.
const VITESSE_DEFAUT_KMH = 24;   // course modérée
const BALLE_KMH = 60;            // une passe va plus vite qu'une course
// Rayon (px) pour lier une flèche au jeton/ballon le plus proche de son point de départ.
const RAYON_LIEN = 60;
// Longueur réelle (m) représentée par la largeur du terrain, pour convertir km/h → px/s.
const LONGUEUR_TERRAIN_M = { complet: 105, demi: 52.5 };
// Tension de la spline Konva des tracés. DOIT rester identique côté rendu et côté
// échantillonnage de trajectoire (cheminRendu), sinon le jeton ne suit pas la courbe dessinée.
const TENSION_TRACE = 0.5;

@Component({
  selector: 'app-schema-editor',
  standalone: true,
  templateUrl: './schema-editor.component.html',
  styleUrl: './schema-editor.component.scss',
  imports: [MatIcon],
})
export class SchemaEditorComponent implements AfterViewInit, OnDestroy {

  @ViewChild('stageContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('editorRoot', { static: true }) editorRoot!: ElementRef<HTMLDivElement>;

  estPleinEcran = signal(false);

  readonly exercice: Exercice;

  terrain = signal<Terrain>('complet');
  outil = signal<Outil>('select');
  echelle = signal(1);
  // Mode de tracé : main libre (à la souris), semi-assisté (clics), assisté (droite départ→arrivée).
  modeDessin = signal<'libre' | 'semi' | 'assiste'>('semi');

  // ── Animation (Phase B) ──
  tempsCourant = signal(0);
  dureeSecondes = signal(10);
  enLecture = signal(false);
  boucle = signal(false);
  vitesse = signal(1);
  // Brique 2 : temps = tout le monde arrive ensemble ; vitesse = chacun son allure le long de sa flèche.
  modeAnim = signal<'temps' | 'vitesse'>('temps');
  // Brique 3 : en mode vitesse, on utilise la vraie vitesse GPS (record vmax ou moyenne vmoy).
  metriqueVitesse = signal<'max' | 'moyenne'>('moyenne');
  private vitesses = new Map<string, { vmax: number | null; vmoy: number | null }>();
  keyframes = signal<Keyframe[]>([]);
  private anim?: Konva.Animation;
  // Palette dépliable
  ouvert = signal<string | null>('formations');

  // équipes / jokers
  readonly equipeEffectif = { couleur: VIOLET, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly equipeRouge = { couleur: ROUGE, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly equipeJaune = { couleur: JAUNE, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  // Adversaire : jetons génériques numérotés, éditables (double-clic → texte libre).
  readonly adversaire = { couleur: NOIR, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly jokers = { couleur: ROUGE, nums: [1, 2, 3, 4] };

  // Vrais joueurs (joueurId) actuellement posés sur le terrain : grisés/désactivés dans les
  // palettes Mon équipe / Équipe 1 / Équipe 2 tant qu'ils y sont (un joueur = un seul jeton).
  joueursPlaces = signal<Set<string>>(new Set());
  readonly equipement = [
    { type: 'plot', couleur: ROUGE, label: 'Plot rouge' },
    { type: 'plot', couleur: BLEU, label: 'Plot bleu' },
    { type: 'but', couleur: '#ffffff', label: 'Mini-but' },
    { type: 'cerceau', couleur: '#f97316', label: 'Cerceau' },
    { type: 'mannequin', couleur: '#64748b', label: 'Mannequin' },
    { type: 'ballon', couleur: '#ffffff', label: 'Ballon' },
  ];

  // Quelle équipe on place : violet = nous (gauche), jaune = adverse (droite, en miroir)
  equipeFormation = signal<string>(VIOLET);
  // Positions normalisées (x = profondeur 0=notre but → 1=but adverse ; y = largeur 0→1)
  readonly formations: { nom: string; positions: { x: number; y: number }[] }[] = [
    {
      nom: '4-3-3', positions: [
        { x: .06, y: .5 }, { x: .20, y: .16 }, { x: .20, y: .39 }, { x: .20, y: .61 }, { x: .20, y: .84 },
        { x: .35, y: .27 }, { x: .35, y: .5 }, { x: .35, y: .73 }, { x: .47, y: .22 }, { x: .47, y: .5 }, { x: .47, y: .78 }]
    },
    {
      nom: '4-4-2', positions: [
        { x: .06, y: .5 }, { x: .20, y: .16 }, { x: .20, y: .39 }, { x: .20, y: .61 }, { x: .20, y: .84 },
        { x: .35, y: .16 }, { x: .35, y: .39 }, { x: .35, y: .61 }, { x: .35, y: .84 }, { x: .47, y: .4 }, { x: .47, y: .6 }]
    },
    {
      nom: '4-2-3-1', positions: [
        { x: .06, y: .5 }, { x: .20, y: .16 }, { x: .20, y: .39 }, { x: .20, y: .61 }, { x: .20, y: .84 },
        { x: .30, y: .38 }, { x: .30, y: .62 }, { x: .42, y: .22 }, { x: .42, y: .5 }, { x: .42, y: .78 }, { x: .5, y: .5 }]
    },
    {
      nom: '3-5-2', positions: [
        { x: .06, y: .5 }, { x: .20, y: .27 }, { x: .20, y: .5 }, { x: .20, y: .73 },
        { x: .34, y: .1 }, { x: .34, y: .32 }, { x: .34, y: .5 }, { x: .34, y: .68 }, { x: .34, y: .9 }, { x: .47, y: .4 }, { x: .47, y: .6 }]
    },
    {
      nom: '3-4-3', positions: [
        { x: .06, y: .5 }, { x: .20, y: .27 }, { x: .20, y: .5 }, { x: .20, y: .73 },
        { x: .35, y: .16 }, { x: .35, y: .39 }, { x: .35, y: .61 }, { x: .35, y: .84 }, { x: .47, y: .22 }, { x: .47, y: .5 }, { x: .47, y: .78 }]
    },
    {
      nom: '5-3-2', positions: [
        { x: .06, y: .5 }, { x: .20, y: .1 }, { x: .20, y: .3 }, { x: .20, y: .5 }, { x: .20, y: .7 }, { x: .20, y: .9 },
        { x: .35, y: .27 }, { x: .35, y: .5 }, { x: .35, y: .73 }, { x: .47, y: .4 }, { x: .47, y: .6 }]
    },
  ];
  formationsCustom = signal<FormationCustom[]>([]);

  // ── Effectif réel (Brique 1) : joueurs de l'équipe de l'utilisateur connecté ──
  effectif = signal<Joueur[]>([]);

  // ── Coups de pied arrêtés ──
  modeArret = signal<'offensif' | 'defensif'>('offensif');
  // Base : on attaque le but DROIT, corner/CF côté "D" (y haut). Le ballon est dans l'angle.
  // Pour défensif, on retourne x (on défend le but gauche) ; pour le côté G, on retourne y.
  private readonly arret: Record<'corner' | 'cf', {
    ball: { x: number; y: number };
    attaquants: { x: number; y: number }[];
    defenseurs: { x: number; y: number }[];
    mur?: { x: number; y: number }[];
  }> = {
      corner: {
        ball: { x: .992, y: .965 },              // dans l'angle
        attaquants: [
          { x: .96, y: .92 },                    // tireur du corner
          { x: .93, y: .85 }, { x: .9, y: .7 }, { x: .92, y: .5 }, { x: .9, y: .3 },
          { x: .84, y: .5 }, { x: .77, y: .4 }, { x: .77, y: .6 }, { x: .55, y: .45 }, { x: .55, y: .6 }, { x: .07, y: .5 }],
        defenseurs: [
          { x: .965, y: .5 },                    // gardien adverse
          { x: .93, y: .44 }, { x: .93, y: .56 }, { x: .88, y: .38 }, { x: .88, y: .5 }, { x: .88, y: .62 },
          { x: .85, y: .46 }, { x: .85, y: .58 }, { x: .78, y: .5 }, { x: .9, y: .82 }, { x: .6, y: .5 }],
      },
      cf: {
        ball: { x: .72, y: .6 },                 // entrée de la surface, côté droit
        attaquants: [
          { x: .71, y: .57 }, { x: .69, y: .66 },           // tireurs
          { x: .86, y: .4 }, { x: .86, y: .5 }, { x: .86, y: .6 }, { x: .82, y: .32 }, { x: .82, y: .68 },
          { x: .6, y: .45 }, { x: .6, y: .6 }, { x: .42, y: .5 }, { x: .07, y: .5 }],
        defenseurs: [
          { x: .965, y: .5 },                    // gardien adverse
          { x: .9, y: .4 }, { x: .9, y: .6 }, { x: .87, y: .45 }, { x: .87, y: .5 }, { x: .87, y: .55 },
          { x: .7, y: .42 }, { x: .7, y: .58 }, { x: .55, y: .5 }, { x: .5, y: .4 }, { x: .5, y: .6 }],
        mur: [{ x: .8, y: .47 }, { x: .8, y: .51 }, { x: .8, y: .55 }, { x: .8, y: .59 }],  // mannequins
      },
    };

  private stage!: Konva.Stage;
  private fieldLayer!: Konva.Layer;
  private layer!: Konva.Layer;          // éléments + tracés
  private elements: SchemaElement[] = [];
  private traces: SchemaTrace[] = [];
  private nodesById = new Map<string, Konva.Group>();

  private dessinEnCours: Konva.Line | null = null;
  private pointsEnCours: number[] = [];

  private get W() { return this.terrain() === 'complet' ? 1040 : 600; }
  private get H() { return 680; }

  constructor(
    public dialogRef: MatDialogRef<SchemaEditorComponent>,
    @Inject(MAT_DIALOG_DATA) data: { exercice: Exercice },
    private service: TechniqueService,
    private joueurService: JoueurService,
    private snack: MatSnackBar,
  ) {
    this.exercice = data.exercice;
    if (this.exercice.schemaJson) {
      try { const d = JSON.parse(this.exercice.schemaJson); if (d.terrain) this.terrain.set(d.terrain); } catch { }
    }
  }

  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({ container: this.containerRef.nativeElement, width: this.W, height: this.H });
    this.fieldLayer = new Konva.Layer();
    this.layer = new Konva.Layer();
    this.stage.add(this.fieldLayer);
    this.stage.add(this.layer);
    this.dessinerTerrain();
    this.chargerSchema();
    this.brancherDessin();
    this.chargerFormations();
    this.chargerEffectif();
    this.chargerVitesses();
    if (this.keyframes().length === 0) this.resetKeyframes();
    this.onFs = () => this.estPleinEcran.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', this.onFs);
  }

  private onFs?: () => void;

  private chargerFormations(): void {
    this.service.listerFormations().subscribe({ next: f => this.formationsCustom.set(f), error: () => { } });
  }

  private chargerEffectif(): void {
    this.joueurService.getAll().subscribe({
      next: js => this.effectif.set(
        js.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))),
      error: () => { },
    });
  }

  private chargerVitesses(): void {
    this.joueurService.getVitesses().subscribe({
      next: (vs: VitesseJoueur[]) => {
        this.vitesses.clear();
        vs.forEach(v => this.vitesses.set(v.joueurId, { vmax: v.vmaxKmh, vmoy: v.vmoyKmh }));
      },
      error: () => { },
    });
  }

  /** px par mètre selon le terrain (pour convertir une vitesse km/h en px/s). */
  private get pxParMetre(): number {
    return this.W / LONGUEUR_TERRAIN_M[this.terrain()];
  }
  private kmhEnPxS(kmh: number): number { return (kmh / 3.6) * this.pxParMetre; }
  private vitesseBallePxS(): number { return this.kmhEnPxS(BALLE_KMH); }
  /** Vitesse (px/s) d'un joueur : sa donnée GPS (vmax ou vmoy) sinon vitesse par défaut. */
  private vitesseJoueurPxS(joueur?: SchemaElement): number {
    const v = joueur?.joueurId ? this.vitesses.get(joueur.joueurId) : undefined;
    const kmh = v ? (this.metriqueVitesse() === 'max' ? v.vmax : v.vmoy) : null;
    return this.kmhEnPxS(kmh && kmh > 0 ? kmh : VITESSE_DEFAUT_KMH);
  }

  /** Étiquette portée par le jeton : nom de famille (initiales seulement si vraiment trop long). */
  private labelJoueur(j: Joueur): string {
    const nom = (j.nom || '').trim();
    if (nom && nom.length <= 14) return nom.toUpperCase();
    const ini = ((j.prenom?.[0] ?? '') + (nom[0] ?? '')).toUpperCase();
    return ini || nom.slice(0, 3).toUpperCase() || '?';
  }

  /** Rang de ligne d'un poste : gardien(0) → défense(1) → milieu(2-3) → attaque(5).
   *  Codes réels de l'effectif (cf. joueur-form-dialog) : GK, DC, LB, RB, MDC, MC, MG, MD, AG, AD, ATT. */
  private rangPoste(poste?: string): number {
    switch (poste) {
      case 'GK': return 0;
      case 'DC': case 'LB': case 'RB': return 1;
      case 'MDC': return 2;
      case 'MC': case 'MG': case 'MD': return 3;
      case 'AG': case 'AD': return 4;
      case 'ATT': return 5;
      default: return 6; // poste non défini → en fin de liste
    }
  }

  /** Effectif trié par ligne (gardien → attaque) puis par nom, pour remplir une formation. */
  private effectifTriParLigne(): Joueur[] {
    return this.effectif().slice().sort((a, b) =>
      this.rangPoste(a.postePrincipal) - this.rangPoste(b.postePrincipal)
      || (a.nom || '').localeCompare(b.nom || ''));
  }

  /** Ligne d'un emplacement selon sa profondeur x (0=notre but → 1=but adverse) :
   *  0 gardien, 1 défense, 2 milieu, 3 attaque. */
  private lignePosition(x: number): number {
    if (x <= 0.12) return 0;
    if (x <= 0.27) return 1;
    if (x <= 0.40) return 2;
    return 3;
  }

  /** Ligne d'un joueur d'après son poste (mêmes 4 paliers que lignePosition). */
  private ligneJoueur(j: Joueur): number {
    const r = this.rangPoste(j.postePrincipal);
    if (r === 0) return 0;          // GK
    if (r === 1) return 1;          // DC / LB / RB
    if (r <= 3) return 2;           // MDC / MC / MG / MD
    if (r <= 5) return 3;           // AG / AD / ATT
    return 2;                       // poste inconnu → milieu (neutre)
  }

  /** Affecte à chaque emplacement le meilleur joueur dispo : même ligne en priorité, puis la
   *  plus proche. Les joueurs en surnombre sur une ligne restent sur le banc (non placés)
   *  au lieu de déborder sur une autre ligne. positions = profondeurs normalisées (x∈[0,1]). */
  private affecterJoueurs(positions: { x: number; y: number }[]): (Joueur | undefined)[] {
    const pool = this.effectifTriParLigne();   // trié gardien→attaque (départage par rang puis nom)
    return positions.map(pos => {
      const lp = this.lignePosition(pos.x);
      let best = -1, bestScore = Infinity;
      pool.forEach((j, idx) => {
        const score = Math.abs(this.ligneJoueur(j) - lp);   // distance de ligne
        if (score < bestScore) { bestScore = score; best = idx; }
      });
      return best < 0 ? undefined : pool.splice(best, 1)[0];
    });
  }

  /** Ajoute un jeton lié à un vrai joueur, dans la couleur de l'équipe choisie (Mon équipe /
   *  Équipe 1 / Équipe 2). Sans effet si le joueur est déjà posé (grisé dans la palette). */
  ajouterJoueurReel(j: Joueur, couleur: string = VIOLET): void {
    if (this.joueursPlaces().has(j.id)) return;
    this.ajouterElement({
      id: this.uid(), type: 'joueur', couleur,
      label: this.labelJoueur(j), joueurId: j.id,
      x: this.W / 2, y: this.H / 2,
    });
  }

  /** Un vrai joueur est-il déjà posé sur le terrain (donc indisponible dans les palettes) ? */
  estPose(j: Joueur): boolean { return this.joueursPlaces().has(j.id); }

  /** Recalcule l'ensemble des vrais joueurs présents sur le terrain (pour le grisage). */
  private majJoueursPlaces(): void {
    this.joueursPlaces.set(new Set(
      this.elements.filter(e => e.type === 'joueur' && e.joueurId).map(e => e.joueurId!)));
  }

  ngOnDestroy(): void {
    this.pause();
    if (this.onFs) document.removeEventListener('fullscreenchange', this.onFs);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    this.stage?.destroy();
  }

  // ── Palette ──
  basculer(section: string): void { this.ouvert.update(o => o === section ? null : section); }

  changerTerrain(t: Terrain): void {
    this.terrain.set(t);
    this.stage.width(this.W);
    this.dessinerTerrain();
  }

  choisirOutil(o: Outil): void { this.outil.set(o); }

  // ── Ajout d'éléments ──
  ajouterJoueur(couleur: string, numero: number): void {
    this.ajouterElement({ id: this.uid(), type: 'joueur', couleur, numero, x: this.W / 2, y: this.H / 2 });
  }
  ajouterEquipement(type: string, couleur: string): void {
    this.ajouterElement({ id: this.uid(), type, couleur, x: this.W / 2, y: this.H / 2 });
  }

  private ajouterElement(el: SchemaElement): void {
    this.elements.push(el);
    this.dessinerElement(el);
    // présent dans toutes les keyframes (à la même position au départ)
    if (this.keyframes().length === 0) this.keyframes.set([{ t: 0, positions: {} }]);
    this.keyframes.update(ks => { ks.forEach(k => k.positions[el.id] = { x: el.x, y: el.y }); return [...ks]; });
    this.majJoueursPlaces();
    this.layer.draw();
  }

  /** Place une formation (11 joueurs) pour l'équipe choisie. Adverse = côté droit en miroir. */
  appliquerFormation(f: { nom: string; positions: { x: number; y: number }[] }): void {
    if (this.terrain() !== 'complet') this.changerTerrain('complet'); // formations pensées pour le terrain complet
    const couleur = this.equipeFormation();
    const adverse = couleur === NOIR;
    // retirer les joueurs existants de cette couleur (re-cliquer = remplacer)
    this.elements.filter(e => e.type === 'joueur' && e.couleur === couleur).forEach(e => this.nodesById.get(e.id)?.destroy());
    this.elements = this.elements.filter(e => !(e.type === 'joueur' && e.couleur === couleur));
    // « Mon équipe » (violet) = vrais joueurs affectés par ligne ; Adversaire (noir) = numéros génériques
    const affectes = adverse ? [] : this.affecterJoueurs(f.positions);
    const m = 24;
    f.positions.forEach((pos, i) => {
      const nx = adverse ? 1 - pos.x : pos.x;
      const j = affectes[i];
      const el: SchemaElement = {
        id: this.uid(), type: 'joueur', couleur,
        ...(j ? { label: this.labelJoueur(j), joueurId: j.id } : { numero: i + 1 }),
        x: m + nx * (this.W - 2 * m), y: m + pos.y * (this.H - 2 * m),
      };
      this.elements.push(el);
      this.dessinerElement(el);
    });
    this.resetKeyframes();
    this.layer.draw();
  }

  appliquerFormationCustom(f: FormationCustom): void {
    try { this.appliquerFormation({ nom: f.nom, positions: JSON.parse(f.positionsJson) }); } catch { }
  }

  /** Place un coup de pied arrêté : ballon + notre équipe + l'adversaire (rôle inverse) + mur (CF). */
  placerArret(type: 'corner' | 'cf', cote: 'D' | 'G'): void {
    if (this.terrain() !== 'complet') this.changerTerrain('complet');
    const base = this.arret[type];
    const mode = this.modeArret();
    const flipX = mode === 'defensif';   // défensif = on défend le but gauche
    const flipY = cote === 'G';
    const m = 24;
    const tr = (p: { x: number; y: number }) => ({ x: flipX ? 1 - p.x : p.x, y: flipY ? 1 - p.y : p.y });
    const px = (p: { x: number; y: number }) => ({ x: m + (tr(p).x) * (this.W - 2 * m), y: m + (tr(p).y) * (this.H - 2 * m) });
    const pxN = (p: { x: number; y: number }) => ({ x: m + p.x * (this.W - 2 * m), y: m + p.y * (this.H - 2 * m) }); // p déjà orienté

    const NOUS = this.equipeEffectif.couleur, EUX = NOIR, MANN = '#64748b';
    // on remplace : nos joueurs + adverses + ballons + mannequins
    this.elements.filter(e => e.type === 'ballon' || e.type === 'mannequin'
      || (e.type === 'joueur' && (e.couleur === NOUS || e.couleur === EUX)))
      .forEach(e => this.nodesById.get(e.id)?.destroy());
    this.elements = this.elements.filter(e => !(e.type === 'ballon' || e.type === 'mannequin'
      || (e.type === 'joueur' && (e.couleur === NOUS || e.couleur === EUX))));

    const ajout = (el: SchemaElement) => { this.elements.push(el); this.dessinerElement(el); };

    // ballon dans l'angle / à l'entrée de surface
    const b = px(base.ball);
    ajout({ id: this.uid(), type: 'ballon', couleur: '#fff', x: b.x, y: b.y });

    // offensif : nous = attaquants, eux = défenseurs ; défensif : l'inverse.
    // Positions orientées une fois (tr) ; la ligne pour l'affectation se déduit de la profondeur orientée.
    const nous = (mode === 'offensif' ? base.attaquants : base.defenseurs).map(tr);
    const eux = (mode === 'offensif' ? base.defenseurs : base.attaquants).map(tr);
    const affectes = this.affecterJoueurs(nous);   // notre équipe = vrais joueurs par ligne
    nous.forEach((p, i) => {
      const q = pxN(p); const j = affectes[i];
      ajout({
        id: this.uid(), type: 'joueur', couleur: NOUS,
        ...(j ? { label: this.labelJoueur(j), joueurId: j.id } : { numero: i + 1 }),
        x: q.x, y: q.y,
      });
    });
    eux.forEach((p, i) => { const q = pxN(p); ajout({ id: this.uid(), type: 'joueur', couleur: EUX, numero: i + 1, x: q.x, y: q.y }); });

    // mur de mannequins (coups francs)
    (base.mur ?? []).forEach(p => { const q = px(p); ajout({ id: this.uid(), type: 'mannequin', couleur: MANN, x: q.x, y: q.y }); });

    this.resetKeyframes();
    this.layer.draw();
  }

  /** Enregistre la disposition actuelle de l'équipe choisie comme formation réutilisable. */
  enregistrerFormation(): void {
    const couleur = this.equipeFormation();
    const adverse = couleur === NOIR;
    const joueurs = this.elements.filter(e => e.type === 'joueur' && e.couleur === couleur);
    if (joueurs.length === 0) { this.snack.open('Place des joueurs de cette équipe avant d\'enregistrer', 'Fermer', { duration: 3000 }); return; }
    const nom = prompt('Nom de la formation ?');
    if (!nom) return;
    const m = 24;
    const positions = joueurs.map(e => {
      let nx = (e.x - m) / (this.W - 2 * m);
      if (adverse) nx = 1 - nx;                 // stocker en orientation canonique (gauche)
      return { x: nx, y: (e.y - m) / (this.H - 2 * m) };
    });
    this.service.creerFormation({ nom, couleur, positionsJson: JSON.stringify(positions) }).subscribe({
      next: () => { this.snack.open('Formation enregistrée', 'Fermer', { duration: 2000 }); this.chargerFormations(); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimerFormation(f: FormationCustom, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Supprimer la formation « ${f.nom} » ?`)) return;
    this.service.supprimerFormation(f.id).subscribe({ next: () => this.chargerFormations(), error: () => { } });
  }

  // ── Zoom ──
  zoom(delta: number): void {
    const s = Math.min(2, Math.max(0.5, this.echelle() + delta));
    this.echelle.set(s);
    this.stage.scale({ x: s, y: s });
    this.stage.width(this.W * s);
    this.stage.height(this.H * s);
    this.stage.batchDraw();
  }

  // ── Sauvegarde ──
  enregistrer(): void {
    this.pause();
    this.scrub(0);   // état de départ : positions cohérentes avec le début des flèches/keyframes
    const data = {
      terrain: this.terrain(),
      elements: this.elements,
      traces: this.traces,
      dureeSecondes: this.dureeSecondes(),
      modeAnim: this.modeAnim(),
      metriqueVitesse: this.metriqueVitesse(),
      keyframes: this.keyframes(),
    };
    this.service.sauverSchema(this.exercice.id, JSON.stringify(data)).subscribe({
      next: () => { this.snack.open('Schéma enregistré', 'Fermer', { duration: 2000 }); this.dialogRef.close(true); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  fermer(): void { this.dialogRef.close(false); }

  /** Bascule l'éditeur en plein écran (toolbar + palette + terrain + timeline). */
  pleinEcran(): void {
    const el = this.editorRoot?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => { });
  }

  /** Vide tout le terrain (éléments + tracés). Le terrain dessiné reste. */
  viderTerrain(): void {
    if (this.elements.length === 0 && this.traces.length === 0) return;
    if (!confirm('Vider tout le terrain ? (joueurs, équipement et tracés)')) return;
    this.layer.destroyChildren();
    this.elements = [];
    this.traces = [];
    this.nodesById.clear();
    this.resetKeyframes();
    this.layer.draw();
  }

  capture(): void {
    const url = this.stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = url; a.download = `schema-${this.exercice.nom}.png`; a.click();
  }

  // ══════════ Rendu ══════════
  private chargerSchema(): void {
    if (!this.exercice.schemaJson) return;
    try {
      const d = JSON.parse(this.exercice.schemaJson);
      (d.elements ?? []).forEach((el: SchemaElement) => { this.elements.push(el); this.dessinerElement(el); });
      (d.traces ?? []).forEach((t: SchemaTrace) => { this.traces.push(t); this.dessinerTrace(t); });
      if (d.modeAnim === 'temps' || d.modeAnim === 'vitesse') this.modeAnim.set(d.modeAnim);
      if (d.metriqueVitesse === 'max' || d.metriqueVitesse === 'moyenne') this.metriqueVitesse.set(d.metriqueVitesse);
      if (Array.isArray(d.keyframes) && d.keyframes.length) {
        this.keyframes.set([...d.keyframes].sort((a: Keyframe, b: Keyframe) => a.t - b.t));
        if (d.dureeSecondes) this.dureeSecondes.set(d.dureeSecondes);
      } else {
        this.resetKeyframes();
      }
      this.majJoueursPlaces();
      this.layer.draw();
    } catch { }
  }

  private dessinerTerrain(): void {
    this.fieldLayer.destroyChildren();
    const W = this.W, H = this.H, m = 24;
    const ligne = (pts: number[]) => new Konva.Line({ points: pts, stroke: '#ffffff', strokeWidth: 2 });

    this.fieldLayer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#3f8f43' }));
    this.fieldLayer.add(new Konva.Rect({ x: m, y: m, width: W - 2 * m, height: H - 2 * m, stroke: '#ffffff', strokeWidth: 2 }));

    if (this.terrain() === 'complet') {
      this.fieldLayer.add(ligne([W / 2, m, W / 2, H - m]));
      this.fieldLayer.add(new Konva.Circle({ x: W / 2, y: H / 2, radius: 68, stroke: '#ffffff', strokeWidth: 2 }));
      this.fieldLayer.add(new Konva.Circle({ x: W / 2, y: H / 2, radius: 3, fill: '#ffffff' }));
      this.surface(m, H, false);
      this.surface(W - m, H, true);
    } else {
      // demi-terrain : but en haut, ligne médiane en bas
      this.fieldLayer.add(ligne([m, H - m, W - m, H - m]));
      this.fieldLayer.add(new Konva.Arc({ x: W / 2, y: H - m, innerRadius: 0, outerRadius: 68, angle: 180, rotation: 180, stroke: '#ffffff', strokeWidth: 2 }));
      this.surfaceHaut(m, W);
    }
    this.fieldLayer.draw();
  }

  private surface(xBord: number, H: number, droite: boolean): void {
    const dir = droite ? -1 : 1;
    const gW = 110, gH = 300, bW = 44, bH = 150;
    this.fieldLayer.add(new Konva.Rect({ x: xBord, y: H / 2 - gH / 2, width: gW * dir, height: gH, stroke: '#fff', strokeWidth: 2 }));
    this.fieldLayer.add(new Konva.Rect({ x: xBord, y: H / 2 - bH / 2, width: bW * dir, height: bH, stroke: '#fff', strokeWidth: 2 }));
  }

  private surfaceHaut(m: number, W: number): void {
    const gW = 300, gH = 110, bW = 150, bH = 44;
    this.fieldLayer.add(new Konva.Rect({ x: W / 2 - gW / 2, y: m, width: gW, height: gH, stroke: '#fff', strokeWidth: 2 }));
    this.fieldLayer.add(new Konva.Rect({ x: W / 2 - bW / 2, y: m, width: bW, height: bH, stroke: '#fff', strokeWidth: 2 }));
  }

  private dessinerElement(el: SchemaElement): void {
    const g = new Konva.Group({ x: el.x, y: el.y, draggable: true });
    if (el.type === 'joueur') {
      const texte = el.label ?? String(el.numero);
      const h = 22;
      const txt = new Konva.Text({ text: texte, fontSize: 11, fontStyle: 'bold', fill: '#fff', wrap: 'none' });
      const w = Math.max(34, Math.ceil(txt.width()) + 14);   // rectangle ajusté au nom
      txt.width(w); txt.height(h); txt.offsetX(w / 2); txt.offsetY(h / 2); txt.align('center'); txt.verticalAlign('middle');
      g.add(new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, cornerRadius: 5, fill: el.couleur, stroke: '#fff', strokeWidth: 2 }));
      g.add(txt);
    } else if (el.type === 'ballon') {
      g.add(new Konva.Circle({ radius: 9, fill: '#fff', stroke: '#111', strokeWidth: 2 }));
    } else if (el.type === 'plot') {
      g.add(new Konva.RegularPolygon({ sides: 3, radius: 13, fill: el.couleur, stroke: '#00000055', strokeWidth: 1 }));
    } else if (el.type === 'but') {
      g.add(new Konva.Rect({ x: -22, y: -6, width: 44, height: 12, stroke: '#fff', strokeWidth: 3 }));
    } else if (el.type === 'cerceau') {
      g.add(new Konva.Ring({ innerRadius: 9, outerRadius: 14, fill: el.couleur }));
    } else if (el.type === 'mannequin') {
      g.add(new Konva.Rect({ x: -7, y: -16, width: 14, height: 32, cornerRadius: 4, fill: el.couleur, stroke: '#fff', strokeWidth: 1.5 }));
    }

    g.on('dragend', () => {
      el.x = g.x(); el.y = g.y();
      const kf = this.keyframeAt(this.tempsCourant(), true)!;   // crée une keyframe si on est entre deux
      kf.positions[el.id] = { x: el.x, y: el.y };
    });
    g.on('click tap', () => {
      if (this.outil() === 'supprimer') {
        this.elements = this.elements.filter(e => e.id !== el.id);
        this.nodesById.delete(el.id);
        this.keyframes.update(ks => { ks.forEach(k => delete k.positions[el.id]); return [...ks]; });
        this.traces.forEach(t => { if (t.elementId === el.id) t.elementId = undefined; if (t.ballId === el.id) t.ballId = undefined; });
        g.destroy(); this.majJoueursPlaces(); this.layer.draw();
      }
    });
    // Jetons génériques (sans vrai joueur) : double-clic pour éditer le texte (Adversaire, etc.).
    if (el.type === 'joueur' && !el.joueurId) {
      g.on('dblclick dbltap', () => this.editerLabelJeton(el));
    }
    this.nodesById.set(el.id, g);
    this.layer.add(g);
  }

  /** Édite le texte d'un jeton générique : input HTML superposé au jeton (Entrée/clic = valider). */
  private editerLabelJeton(el: SchemaElement): void {
    const g = this.nodesById.get(el.id);
    if (!g) return;
    const pos = g.getAbsolutePosition();
    const box = this.stage.container().getBoundingClientRect();
    const input = document.createElement('input');
    input.value = el.label ?? String(el.numero ?? '');
    input.maxLength = 14;
    Object.assign(input.style, {
      position: 'fixed', left: `${box.left + pos.x - 32}px`, top: `${box.top + pos.y - 12}px`,
      width: '64px', height: '24px', textAlign: 'center', font: 'bold 12px sans-serif',
      border: '2px solid #fff', borderRadius: '5px', background: el.couleur ?? NOIR,
      color: '#fff', outline: 'none', zIndex: '9999',
    } as CSSStyleDeclaration);
    document.body.appendChild(input);
    input.focus(); input.select();
    let fini = false;
    const valider = () => {
      if (fini) return; fini = true;
      const v = input.value.trim();
      el.label = v || undefined;   // vide → on retombe sur le numéro d'origine
      g.destroy(); this.nodesById.delete(el.id); this.dessinerElement(el); this.layer.draw();
      input.remove();
    };
    input.addEventListener('blur', valider);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { fini = true; input.remove(); }
    });
  }

  private dessinerTrace(t: SchemaTrace): Konva.Group {
    const grp = new Konva.Group();
    const couleur = '#fde047';
    const base = { points: t.points, stroke: couleur, strokeWidth: 3, tension: TENSION_TRACE, lineCap: 'round' as const, lineJoin: 'round' as const };
    if (t.type === 'deplacement') {
      grp.add(new Konva.Arrow({ ...base, dash: [11, 7], fill: couleur, pointerLength: 11, pointerWidth: 11 }));
    } else if (t.type === 'passe') {
      grp.add(new Konva.Arrow({ ...base, fill: couleur, pointerLength: 12, pointerWidth: 12 }));
    } else if (t.type === 'conduite') {
      grp.add(new Konva.Line({ ...base }));
    } else { // tir
      grp.add(new Konva.Line({ ...base }));
      const n = t.points.length;
      grp.add(new Konva.Circle({ x: t.points[n - 2], y: t.points[n - 1], radius: 6, fill: couleur }));
    }
    grp.on('click tap', () => {
      if (this.outil() === 'supprimer') {
        this.traces = this.traces.filter(x => x.id !== t.id);
        grp.destroy(); this.layer.draw();
      }
    });
    this.layer.add(grp);
    this.remonterElements();   // les jetons/joueurs restent visuellement au-dessus des tracés
    return grp;
  }

  /** Garde les éléments (jetons, ballon, équipement) au premier plan, au-dessus des tracés. */
  private remonterElements(): void {
    this.nodesById.forEach(g => g.moveToTop());
  }

  // ══════════ Dessin des tracés à la souris ══════════
  private estOutilTrace(o: Outil): o is TraceType {
    return o === 'deplacement' || o === 'conduite' || o === 'passe' || o === 'tir';
  }

  private readonly couleurTrace = '#fde047';

  /** Crée l'aperçu (flèche/ligne) lié à this.pointsEnCours pendant le tracé. */
  private creerApercu(o: TraceType): Konva.Line | Konva.Arrow {
    const base = { points: this.pointsEnCours, stroke: this.couleurTrace, strokeWidth: 3, tension: TENSION_TRACE, lineCap: 'round' as const, lineJoin: 'round' as const };
    return (o === 'deplacement' || o === 'passe')
      ? new Konva.Arrow({ ...base, fill: this.couleurTrace, dash: o === 'deplacement' ? [11, 7] : undefined, pointerLength: 11, pointerWidth: 11 })
      : new Konva.Line({ ...base });
  }

  /** Valide un tracé terminé : liaison + ajout, si assez long. */
  private finaliserTrace(pts: number[]): void {
    const longueurOk = pts.length >= 4 && Math.hypot(pts[pts.length - 2] - pts[0], pts[pts.length - 1] - pts[1]) > 12;
    if (longueurOk) {
      const t: SchemaTrace = { id: this.uid(), type: this.outil() as TraceType, points: pts };
      this.lierTrace(t);   // associe la flèche au jeton/ballon le plus proche de son départ
      this.traces.push(t);
      this.dessinerTrace(t);
    }
  }

  private surElement(e: Konva.KonvaEventObject<any>): boolean {
    return e.target !== this.stage && !!e.target.getParent()?.draggable();
  }

  private brancherDessin(): void {
    // ── Modes "à main libre" et "assisté" : on presse puis on relâche (drag) ──
    this.stage.on('mousedown touchstart', (e) => {
      const o = this.outil();
      if (!this.estOutilTrace(o) || this.modeDessin() === 'semi') return; // semi = clics
      if (this.surElement(e)) return;
      const p = this.stage.getRelativePointerPosition();
      if (!p) return;
      this.pointsEnCours = [p.x, p.y];
      this.dessinEnCours = this.creerApercu(o);
      this.layer.add(this.dessinEnCours);
      this.remonterElements();
    });

    this.stage.on('mousemove touchmove', () => {
      if (!this.dessinEnCours) return;
      const p = this.stage.getRelativePointerPosition();
      if (!p) return;
      if (this.modeDessin() === 'semi') {
        // aperçu élastique : points posés + segment vers le curseur
        if (this.pointsEnCours.length >= 2) { this.dessinEnCours.points([...this.pointsEnCours, p.x, p.y]); this.layer.batchDraw(); }
        return;
      }
      if (this.modeDessin() === 'assiste') {
        // ligne droite : départ -> position courante
        this.dessinEnCours.points([this.pointsEnCours[0], this.pointsEnCours[1], p.x, p.y]);
        this.layer.batchDraw();
        return;
      }
      // à main libre : on ajoute un point tous les ~20px
      const n = this.pointsEnCours.length;
      if (Math.hypot(p.x - this.pointsEnCours[n - 2], p.y - this.pointsEnCours[n - 1]) >= 20) {
        this.pointsEnCours.push(p.x, p.y);
        this.dessinEnCours.points(this.pointsEnCours);
        this.layer.batchDraw();
      }
    });

    this.stage.on('mouseup touchend', () => {
      if (this.modeDessin() === 'semi' || !this.dessinEnCours) return;
      const p = this.stage.getRelativePointerPosition();
      let pts: number[];
      if (this.modeDessin() === 'assiste') {
        pts = p ? [this.pointsEnCours[0], this.pointsEnCours[1], p.x, p.y] : this.pointsEnCours;
      } else {
        if (p) this.pointsEnCours.push(p.x, p.y);
        pts = this.pointsEnCours;
      }
      this.dessinEnCours.destroy(); this.dessinEnCours = null;
      this.finaliserTrace(pts);
      this.pointsEnCours = [];
      this.layer.draw();
    });

    // ── Mode "semi-assisté" : clic = poser un point, double-clic = terminer ──
    this.stage.on('click tap', (e) => {
      const o = this.outil();
      if (this.modeDessin() !== 'semi' || !this.estOutilTrace(o) || this.surElement(e)) return;
      const p = this.stage.getRelativePointerPosition();
      if (!p) return;
      if (!this.dessinEnCours) {
        this.pointsEnCours = [p.x, p.y];
        this.dessinEnCours = this.creerApercu(o);
        this.layer.add(this.dessinEnCours);
        this.remonterElements();
      } else {
        this.pointsEnCours.push(p.x, p.y);
      }
      this.layer.batchDraw();
    });

    this.stage.on('dblclick dbltap', () => {
      if (this.modeDessin() !== 'semi' || !this.dessinEnCours) return;
      if (this.pointsEnCours.length >= 4) this.pointsEnCours.splice(-2, 2); // retire le point en doublon du double-clic
      const pts = this.pointsEnCours;
      this.dessinEnCours.destroy(); this.dessinEnCours = null;
      this.finaliserTrace(pts);
      this.pointsEnCours = [];
      this.layer.draw();
    });
  }

  // ══════════ Animation / keyframes (Phase B) ══════════
  private resetKeyframes(): void {
    this.keyframes.set([{ t: 0, positions: Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }])) }]);
    this.tempsCourant.set(0);
    this.majJoueursPlaces();   // formations / CPA / vider reconstruisent les éléments
  }

  private posElement(el: SchemaElement, t: number, kfs: Keyframe[]): { x: number; y: number } {
    const avec = kfs.filter(k => k.positions[el.id]);
    if (avec.length === 0) return { x: el.x, y: el.y };
    if (t <= avec[0].t) return avec[0].positions[el.id];
    if (t >= avec[avec.length - 1].t) return avec[avec.length - 1].positions[el.id];
    for (let i = 0; i < avec.length - 1; i++) {
      const a = avec[i], b = avec[i + 1];
      if (t >= a.t && t <= b.t) {
        const r = (b.t - a.t) ? (t - a.t) / (b.t - a.t) : 0;
        const pa = a.positions[el.id], pb = b.positions[el.id];
        return { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r };
      }
    }
    return avec[avec.length - 1].positions[el.id];
  }

  private appliquerPositions(t: number): void {
    const kfs = this.keyframes();
    const traj = this.construireTrajectoires();   // id élément -> segments mobiles dans le temps
    for (const el of this.elements) {
      const legs = traj.get(el.id);
      const p = legs ? this.posTrajectoire(legs, t) : this.posElement(el, t, kfs);
      el.x = p.x; el.y = p.y;
      this.nodesById.get(el.id)?.position({ x: p.x, y: p.y });
    }
    this.layer.batchDraw();
  }

  // ══════════ Brique 2 : flèche = route suivie ══════════
  /** Lie une flèche au jeton (déplacement/conduite) ou ballon (passe/tir) le plus proche du départ. */
  private lierTrace(t: SchemaTrace): void {
    const x0 = t.points[0], y0 = t.points[1];
    if (t.type === 'passe' || t.type === 'tir') {
      const b = this.elementLePlusProche('ballon', x0, y0);
      if (b) { t.elementId = b.id; t.points[0] = b.x; t.points[1] = b.y; }
    } else { // déplacement / conduite -> un joueur
      const j = this.elementLePlusProche('joueur', x0, y0);
      if (j) { t.elementId = j.id; t.points[0] = j.x; t.points[1] = j.y; }
      if (t.type === 'conduite') {
        const b = this.elementLePlusProche('ballon', x0, y0);
        if (b) t.ballId = b.id;   // le ballon est conduit le long du même chemin
      }
    }
  }

  private elementLePlusProche(type: string, x: number, y: number): SchemaElement | undefined {
    let best: SchemaElement | undefined; let dMin = RAYON_LIEN;
    for (const e of this.elements) {
      if (e.type !== type) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= dMin) { dMin = d; best = e; }
    }
    return best;
  }

  // ── Trajectoires : chaque mobile (ballon, chaque joueur) suit SES propres flèches ──
  // Robuste aux branches (au bout d'une conduite : le ballon part en passe ET le joueur
  // repart en course). Minutage global : une flèche démarre quand celle qui finit à son
  // départ se termine → le ballon "attend" que son porteur arrive avant de bouger.
  private construireTrajectoires(): Map<string, { t0: number; t1: number; pts: number[] }[]> {
    const res = new Map<string, { t0: number; t1: number; pts: number[] }[]>();
    const fleches = this.traces.filter(t => t.points.length >= 4);
    if (!fleches.length) return res;

    // Le rendu Konva courbe les tracés (tension). On échantillonne la MÊME courbe pour que
    // le jeton suive la flèche dessinée, pas la polyligne droite entre les points cliqués.
    const rendu = new Map<string, number[]>();
    fleches.forEach(a => rendu.set(a.id, this.cheminRendu(a.points)));

    const debut = (a: SchemaTrace) => ({ x: a.points[0], y: a.points[1] });
    const fin = (a: SchemaTrace) => ({ x: a.points[a.points.length - 2], y: a.points[a.points.length - 1] });
    const estBallon = (a: SchemaTrace) => a.type === 'conduite' || a.type === 'passe' || a.type === 'tir';
    const estJoueur = (a: SchemaTrace) => a.type === 'conduite' || a.type === 'deplacement';

    // Positions de repos (t=0) FIGÉES (l'animation modifie el.x à chaque frame).
    const kf0 = this.keyframes()[0];
    const repos = (e: SchemaElement) => kf0?.positions[e.id] ?? { x: e.x, y: e.y };
    const plusProche = (type: string, p: { x: number; y: number }): SchemaElement | undefined => {
      let best: SchemaElement | undefined; let dMin = RAYON_LIEN;
      for (const e of this.elements) {
        if (e.type !== type) continue;
        const rp = repos(e); const d = Math.hypot(rp.x - p.x, rp.y - p.y);
        if (d <= dMin) { dMin = d; best = e; }
      }
      return best;
    };

    // Toutes les flèches qui FINISSENT au départ de a (ses "arrivants").
    const arrivants = (a: SchemaTrace) => fleches.filter(b =>
      b.id !== a.id && Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y) <= RAYON_LIEN);
    // Prédécesseur de même nature (joueur ou ballon) : le plus proche.
    const predNature = (a: SchemaTrace, estType: (x: SchemaTrace) => boolean): SchemaTrace | undefined => {
      let best: SchemaTrace | undefined; let dMin = RAYON_LIEN;
      for (const b of fleches) {
        if (b.id === a.id || !estType(b)) continue;
        const d = Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y);
        if (d <= dMin) { dMin = d; best = b; }
      }
      return best;
    };

    // Propriétaire d'une flèche : hérité du prédécesseur de même nature, sinon l'élément
    // le plus proche du départ (le ballon se prend au début d'une conduite, etc.).
    const memo = { ballon: new Map<string, SchemaElement | undefined>(), joueur: new Map<string, SchemaElement | undefined>() };
    const owner = (a: SchemaTrace, type: 'ballon' | 'joueur', estType: (x: SchemaTrace) => boolean, vu = new Set<string>()): SchemaElement | undefined => {
      const m = memo[type];
      if (m.has(a.id)) return m.get(a.id);
      if (vu.has(a.id)) return undefined;
      vu.add(a.id);
      const p = predNature(a, estType);
      const r = p ? owner(p, type, estType, vu) : plusProche(type, debut(a));
      m.set(a.id, r);
      return r;
    };

    // Vitesse (px/s) d'un segment. Mode vitesse : vitesse réelle du joueur (vmax/vmoy GPS)
    // pour course/conduite, vitesse de passe pour passe/tir. Mode temps : distance brute (1),
    // l'échelle ramène ensuite la plus longue séquence à la durée choisie.
    const vitLeg = (a: SchemaTrace): number => {
      if (this.modeAnim() !== 'vitesse') return 1;
      if (a.type === 'passe' || a.type === 'tir') return this.vitesseBallePxS();
      return this.vitesseJoueurPxS(owner(a, 'joueur', estJoueur));
    };

    // Fenêtres temporelles : une flèche démarre quand TOUS ses arrivants sont là (max)
    // → une conduite attend le joueur ET le ballon. Durée d'un segment = longueur / vitesse.
    const t0 = new Map<string, number>(), t1 = new Map<string, number>();
    const enCalcul = new Set<string>();
    const calc = (a: SchemaTrace): number => {
      if (t1.has(a.id)) return t1.get(a.id)!;
      if (enCalcul.has(a.id)) { t0.set(a.id, 0); t1.set(a.id, this.longueurChemin(rendu.get(a.id)!) / vitLeg(a)); return t1.get(a.id)!; }
      enCalcul.add(a.id);
      const inc = arrivants(a);
      const dep = inc.length ? Math.max(...inc.map(calc)) : 0;
      t0.set(a.id, dep); t1.set(a.id, dep + this.longueurChemin(rendu.get(a.id)!) / vitLeg(a));
      enCalcul.delete(a.id);
      return t1.get(a.id)!;
    };
    fleches.forEach(calc);

    // Mode vitesse : t déjà en secondes (sc=1). Mode temps : la plus longue séquence = durée.
    const maxT = Math.max(1, ...fleches.map(a => t1.get(a.id)!));
    const sc = this.modeAnim() === 'vitesse' ? 1 : this.dureeSecondes() / maxT;

    const pousser = (id: string, a: SchemaTrace) => {
      const arr = res.get(id) ?? [];
      arr.push({ t0: t0.get(a.id)! * sc, t1: t1.get(a.id)! * sc, pts: rendu.get(a.id)! });
      res.set(id, arr);
    };
    for (const a of fleches) {
      if (estJoueur(a)) { const j = owner(a, 'joueur', estJoueur); if (j) pousser(j.id, a); }
      if (estBallon(a)) { const b = owner(a, 'ballon', estBallon); if (b) pousser(b.id, a); }
    }
    for (const arr of res.values()) arr.sort((x, y) => x.t0 - y.t0);
    return res;
  }

  /** Position d'un mobile à l'instant t le long de ses segments (sinon il attend). */
  private posTrajectoire(legs: { t0: number; t1: number; pts: number[] }[], t: number): { x: number; y: number } {
    if (t <= legs[0].t0) return { x: legs[0].pts[0], y: legs[0].pts[1] };
    for (let i = 0; i < legs.length; i++) {
      const lg = legs[i];
      if (t <= lg.t1) {
        if (t < lg.t0) { const pv = legs[i - 1].pts; return { x: pv[pv.length - 2], y: pv[pv.length - 1] }; }
        const r = lg.t1 > lg.t0 ? (t - lg.t0) / (lg.t1 - lg.t0) : 1;
        return this.pointLeLongDe(lg.pts, Math.max(0, Math.min(1, r)));
      }
    }
    const last = legs[legs.length - 1].pts;
    return { x: last[last.length - 2], y: last[last.length - 1] };
  }

  /** Durée minimale (s) pour que toutes les chaînes finissent en mode vitesse. */
  private dureeMinPourTraces(): number {
    let max = 0;
    for (const legs of this.construireTrajectoires().values())
      for (const lg of legs) if (lg.t1 > max) max = lg.t1;
    return max;
  }

  /**
   * Développe une polyligne en la courbe réellement rendue par Konva (Line/Arrow avec
   * tension), pour que l'animation suive la flèche dessinée et non les segments droits.
   * Réplique l'algorithme Konva : points de contrôle cardinaux → quadratique aux extrémités
   * + cubiques au milieu, échantillonnés en une polyligne dense.
   */
  private cheminRendu(pts: number[]): number[] {
    const len = pts.length;
    if (len <= 4) return pts;   // 2 points = ligne droite, pas de courbe
    const tp = this.pointsTension(pts, TENSION_TRACE);
    const PAS = 16;
    const out = [pts[0], pts[1]];
    // 1er segment : quadratique p0 → 1er point intérieur, contrôle tp[0..1]
    this.echQuad(out, pts[0], pts[1], tp[0], tp[1], tp[2], tp[3], PAS);
    // segments intérieurs : cubiques d'un point intérieur au suivant
    for (let n = 4; n < tp.length - 2; n += 6) {
      const x0 = out[out.length - 2], y0 = out[out.length - 1];
      this.echCubic(out, x0, y0, tp[n], tp[n + 1], tp[n + 2], tp[n + 3], tp[n + 4], tp[n + 5], PAS);
    }
    // dernier segment : quadratique → dernier point, contrôle tp[len-2..len-1]
    const x0 = out[out.length - 2], y0 = out[out.length - 1];
    this.echQuad(out, x0, y0, tp[tp.length - 2], tp[tp.length - 1], pts[len - 2], pts[len - 1], PAS);
    return out;
  }

  /** Points de contrôle de la spline cardinale (équivalent Konva Util._expandPoints). */
  private pointsTension(p: number[], t: number): number[] {
    const out: number[] = [];
    for (let n = 2; n < p.length - 2; n += 2) {
      const x0 = p[n - 2], y0 = p[n - 1], x1 = p[n], y1 = p[n + 1], x2 = p[n + 2], y2 = p[n + 3];
      const d01 = Math.hypot(x1 - x0, y1 - y0), d12 = Math.hypot(x2 - x1, y2 - y1);
      const fa = (t * d01) / (d01 + d12) || 0, fb = (t * d12) / (d01 + d12) || 0;
      out.push(x1 - fa * (x2 - x0), y1 - fa * (y2 - y0), x1, y1, x1 + fb * (x2 - x0), y1 + fb * (y2 - y0));
    }
    return out;
  }

  /** Échantillonne une courbe de Bézier quadratique (hors point de départ déjà présent). */
  private echQuad(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, pas: number): void {
    for (let i = 1; i <= pas; i++) {
      const s = i / pas, u = 1 - s;
      out.push(u * u * x0 + 2 * u * s * cx + s * s * x1, u * u * y0 + 2 * u * s * cy + s * s * y1);
    }
  }

  /** Échantillonne une courbe de Bézier cubique (hors point de départ déjà présent). */
  private echCubic(out: number[], x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, pas: number): void {
    for (let i = 1; i <= pas; i++) {
      const s = i / pas, u = 1 - s;
      const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
      out.push(a * x0 + b * c1x + c * c2x + d * x1, a * y0 + b * c1y + c * c2y + d * y1);
    }
  }

  private longueurChemin(pts: number[]): number {
    let L = 0;
    for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    return L;
  }

  /** Point à la fraction p (0→1) de la polyligne. */
  private pointLeLongDe(pts: number[], p: number): { x: number; y: number } {
    if (pts.length < 4) return { x: pts[0], y: pts[1] };
    const cible = p * this.longueurChemin(pts);
    let acc = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (acc + seg >= cible) {
        const r = seg ? (cible - acc) / seg : 0;
        return { x: pts[i - 2] + (pts[i] - pts[i - 2]) * r, y: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * r };
      }
      acc += seg;
    }
    return { x: pts[pts.length - 2], y: pts[pts.length - 1] };
  }

  private aDesTracesAnimees(): boolean { return this.construireTrajectoires().size > 0; }

  /** Keyframe au temps t (création = capture des positions actuelles). */
  private keyframeAt(t: number, create = false): Keyframe | undefined {
    let kf = this.keyframes().find(k => Math.abs(k.t - t) < 0.05);
    if (!kf && create) {
      kf = { t, positions: Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }])) };
      this.keyframes.update(ks => [...ks, kf!].sort((a, b) => a.t - b.t));
    }
    return kf;
  }

  ajouterKeyframe(): void {
    const t = this.tempsCourant();
    const positions = Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }]));
    this.keyframes.update(ks => [...ks.filter(k => Math.abs(k.t - t) >= 0.05), { t, positions }].sort((a, b) => a.t - b.t));
    if (t > this.dureeSecondes()) this.dureeSecondes.set(Math.ceil(t));
  }

  supprimerKeyframeCourante(): void {
    const t = this.tempsCourant();
    if (t === 0) return; // on garde toujours la keyframe de départ
    this.keyframes.update(ks => ks.filter(k => Math.abs(k.t - t) >= 0.05));
  }

  estSurKeyframe(): boolean { return !!this.keyframes().find(k => Math.abs(k.t - this.tempsCourant()) < 0.05); }

  scrub(t: number): void {
    const tt = Math.max(0, Math.min(this.dureeSecondes(), t));
    this.tempsCourant.set(tt);
    this.appliquerPositions(tt);
  }
  scrubBarre(ev: MouseEvent): void {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.scrub(((ev.clientX - r.left) / r.width) * this.dureeSecondes());
  }
  allerKeyframe(kf: Keyframe, ev?: Event): void { ev?.stopPropagation(); this.scrub(kf.t); }
  keyframeSuivante(): void {
    const suiv = this.keyframes().find(k => k.t > this.tempsCourant() + 0.01);
    this.scrub(suiv ? suiv.t : this.dureeSecondes());
  }
  etendreDuree(d: number): void { this.dureeSecondes.set(Math.max(5, this.dureeSecondes() + d)); }
  pct(t: number): number { return this.dureeSecondes() ? (t / this.dureeSecondes()) * 100 : 0; }

  // ── Lecture ──
  basculerLecture(): void { this.enLecture() ? this.pause() : this.play(); }
  private play(): void {
    if (this.keyframes().length < 2 && !this.aDesTracesAnimees()) {
      this.snack.open('Trace une flèche depuis un joueur, ou ajoute 2 keyframes', 'Fermer', { duration: 2800 });
      return;
    }
    // En mode vitesse, étendre la durée pour que la plus longue chaîne se termine.
    if (this.modeAnim() === 'vitesse') {
      const min = this.dureeMinPourTraces();
      if (min > this.dureeSecondes()) this.dureeSecondes.set(Math.ceil(min));
    }
    if (this.tempsCourant() >= this.dureeSecondes()) this.tempsCourant.set(0);
    this.enLecture.set(true);
    let last = performance.now();
    this.anim = new Konva.Animation(() => {
      const now = performance.now();
      let t = this.tempsCourant() + (now - last) / 1000 * this.vitesse();
      last = now;
      if (t >= this.dureeSecondes()) {
        if (this.boucle()) { t = 0; }
        else { this.tempsCourant.set(this.dureeSecondes()); this.appliquerPositions(this.dureeSecondes()); this.pause(); return; }
      }
      this.tempsCourant.set(t);
      this.appliquerPositions(t);
    }, this.layer);
    this.anim.start();
  }
  private pause(): void { this.anim?.stop(); this.anim = undefined; this.enLecture.set(false); }

  private uid(): string { return Math.random().toString(36).slice(2, 10); }
  private simplifierPoints(points: number[]): number[] {

    if (points.length <= 6) return points;

    const resultat: number[] = [];

    for (let i = 0; i < points.length; i += 4) {
      resultat.push(points[i], points[i + 1]);
    }

    return resultat;
  }

}

