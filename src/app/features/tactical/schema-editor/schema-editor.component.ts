import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import Konva from 'konva';
import { FormationCustom, SchemaTactique, TechniqueService } from '@core/services/technique.service';
import { Joueur, JoueurService, VitesseJoueur } from '@core/services/joueur.service';
import { SchemaPickerDialogComponent } from '../schema-picker-dialog/schema-picker-dialog.component';
import { MatIcon } from "@angular/material/icon";
import {
  TENSION_TRACE, cheminRendu, longueurChemin, pointLeLongDe, pointDansPolygone,
} from './schema-geometrie';
import { FORMATIONS, COUPS_DE_PIED_ARRETES } from './schema-formations.data';
import { SchemaTerrainRenderer } from './schema-terrain.renderer';

/**
 * Données du dialog : éditeur de schéma générique, agnostique de la source.
 * - `titre`       : libellé affiché (nom d'exercice ou de schéma).
 * - `schemaJson`  : contenu initial à charger (vide = terrain neuf).
 * - `enregistrer` : action de sauvegarde fournie par l'appelant (exercice ou bibliothèque).
 *                   Reçoit le JSON sérialisé, renvoie l'observable de persistance.
 */
export interface SchemaEditorData {
  titre: string;
  schemaJson?: string;
  /** `apercu` = miniature PNG (data URL) du terrain, pour la grille de la bibliothèque. */
  enregistrer: (schemaJson: string, apercu: string) => Observable<unknown>;
}

type Terrain = 'complet' | 'demi';
type Outil = 'select' | 'deplacement' | 'conduite' | 'passe' | 'tir' | 'surveiller' | 'forme' | 'supprimer';
type TraceType = 'deplacement' | 'conduite' | 'passe' | 'tir';
type FormeType = 'rect' | 'ellipse' | 'losange' | 'triangle';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; label?: string; joueurId?: string; surveille?: boolean; surveilleCouleur?: string; x: number; y: number; }
// elementId = jeton/ballon qui suit le tracé ; ballId = ballon entraîné par une conduite.
interface SchemaTrace { id: string; type: TraceType; points: number[]; elementId?: string; ballId?: string; }
// Forme d'annotation (zone à entourer/montrer), redimensionnable et déplaçable.
interface SchemaForme { id: string; type: FormeType; x: number; y: number; w: number; h: number; couleur: string; texte?: string; texteTaille?: number; texteCouleur?: string; }
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
// TENSION_TRACE est importé de ./schema-geometrie (partagé rendu + échantillonnage).

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

  readonly data: SchemaEditorData;
  get titre(): string { return this.data.titre; }

  // utiliser pour le trace en cours : points, type, élément lié (jeton/ballon), etc. ; mis à jour au fur et à mesure du dessin. utilise pour activer et desactiver le trace du dessin 
  tracesVisibles = signal(true);

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
  // Positions normalisées (cf. ./schema-formations.data).
  readonly formations = FORMATIONS;
  formationsCustom = signal<FormationCustom[]>([]);

  // ── Effectif réel (Brique 1) : joueurs de l'équipe de l'utilisateur connecté ──
  effectif = signal<Joueur[]>([]);

  // ── Coups de pied arrêtés ── (données : ./schema-formations.data)
  modeArret = signal<'offensif' | 'defensif'>('offensif');
  private readonly arret = COUPS_DE_PIED_ARRETES;

  private stage!: Konva.Stage;
  private fieldLayer!: Konva.Layer;
  private layer!: Konva.Layer;          // éléments + tracés
  private elements: SchemaElement[] = [];
  private traces: SchemaTrace[] = [];
  private nodesById = new Map<string, Konva.Group>();

  private dessinEnCours: Konva.Line | null = null;
  private pointsEnCours: number[] = [];

  // ── Formes d'annotation (zones) ──
  formeType = signal<FormeType>('rect');
  readonly palette = [
    { nom: 'Rouge', val: '#ef4444' },
    { nom: 'Jaune', val: '#eab308' },
    { nom: 'Bleu', val: '#2563eb' },
  ];
  couleurAnnot = signal<string>('#ef4444');
  texteTaille = signal<number>(20);   // taille du texte écrit dans une forme (S=14 / M=20 / L=30)
  couleurTexteAnnot = signal<string>('#ffffff');
  readonly paletteTexte = [
    { nom: 'Blanc',  val: '#ffffff' },
    { nom: 'Noir',   val: '#1f2937' },
    { nom: 'Rouge',  val: '#ef4444' },
    { nom: 'Jaune',  val: '#eab308' },
    { nom: 'Bleu',   val: '#2563eb' },
  ];
  private formes: SchemaForme[] = [];
  private formeNodes = new Map<string, Konva.Group>();
  private trForme!: Konva.Transformer;          // poignées de redimensionnement de la forme sélectionnée
  private formeEnCours: Konva.Group | null = null;
  private formeEnCoursModel: SchemaForme | null = null;
  private formeStart: { x: number; y: number } | null = null;

  // ── Sélection multiple (cadre / lasso) ──
  modeSelection = signal<'cadre' | 'lasso'>('cadre');
  private selection = new Set<string>();
  private selShape: Konva.Rect | Konva.Line | null = null;   // tracé de la zone de sélection
  private selStart: { x: number; y: number } | null = null;
  private selLassoPts: number[] = [];
  private dragBase = new Map<string, { x: number; y: number }>();

  private get W() { return this.terrain() === 'complet' ? 1040 : 600; }
  private get H() { return 680; }

  dialogRef = inject<MatDialogRef<SchemaEditorComponent>>(MatDialogRef);
  private service = inject(TechniqueService);
  private joueurService = inject(JoueurService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private terrainRenderer = inject(SchemaTerrainRenderer);

  constructor() {
    const data = inject<SchemaEditorData>(MAT_DIALOG_DATA);
    this.data = data;
    if (this.data.schemaJson) {
      try { const d = JSON.parse(this.data.schemaJson); if (d.terrain) this.terrain.set(d.terrain); } catch { }
    }
  }

  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({ container: this.containerRef.nativeElement, width: this.W, height: this.H });
    this.fieldLayer = new Konva.Layer();
    this.layer = new Konva.Layer();
    this.stage.add(this.fieldLayer);
    this.stage.add(this.layer);
    // Transformer (poignées) pour redimensionner la forme d'annotation sélectionnée.
    this.trForme = new Konva.Transformer({ rotateEnabled: false, ignoreStroke: true, padding: 4 });
    this.layer.add(this.trForme);
    this.dessinerTerrain();
    this.chargerSchema();
    this.brancherDessin();
    this.chargerFormations();
    this.chargerEffectif();
    this.chargerVitesses();
    if (this.keyframes().length === 0) this.resetKeyframes();
    this.onFs = () => { this.estPleinEcran.set(!!document.fullscreenElement); setTimeout(() => this.ajusterAuConteneur(), 60); };
    document.addEventListener('fullscreenchange', this.onFs);
    // Met le terrain à l'échelle du conteneur (tout visible, sans scroll) + suit les redimensionnements.
    window.addEventListener('resize', this.onResize);
    setTimeout(() => this.ajusterAuConteneur(), 0);
  }

  private onFs?: () => void;
  private readonly onResize = () => this.ajusterAuConteneur();

  /** Ajuste l'échelle de la scène pour que tout le terrain tienne dans la zone d'affichage. */
  private ajusterAuConteneur(): void {
    const body = this.containerRef.nativeElement.closest('.editor__pitch-body') as HTMLElement | null;
    if (!body) return;
    const dispoW = body.clientWidth - 32, dispoH = body.clientHeight - 32;   // padding 16px de chaque côté
    if (dispoW <= 0 || dispoH <= 0) return;
    this.appliquerEchelle(Math.max(0.2, Math.min(dispoW / this.W, dispoH / this.H)));
  }

  /** Applique une échelle à la scène et redimensionne le canvas en conséquence. */
  private appliquerEchelle(s: number): void {
    this.echelle.set(s);
    this.stage.scale({ x: s, y: s });
    this.stage.width(this.W * s);
    this.stage.height(this.H * s);
    this.stage.batchDraw();
  }

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
    window.removeEventListener('resize', this.onResize);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    this.stage?.destroy();
  }

  // ── Palette ──
  basculer(section: string): void { this.ouvert.update(o => o === section ? null : section); }

  changerTerrain(t: Terrain): void {
    this.terrain.set(t);
    this.dessinerTerrain();
    this.ajusterAuConteneur();
  }

  choisirOutil(o: Outil): void {
    this.outil.set(o);
    if (o !== 'select') this.clearSelection();
    if (o !== 'select' && o !== 'forme') this.detacherForme();
  }
  choisirForme(t: FormeType): void { this.formeType.set(t); this.outil.set('forme'); }
  choisirCouleur(c: string): void { this.couleurAnnot.set(c); }

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

  // ── Zoom ── (manuel, par-dessus l'ajustement auto au conteneur)
  zoom(delta: number): void {
    this.appliquerEchelle(Math.min(3, Math.max(0.2, this.echelle() + delta)));
  }

  // ── Sauvegarde ──
  enregistrer(): void {
    this.pause();
    this.detacherForme();   // retire les poignées de l'aperçu
    this.scrub(0);   // état de départ : positions cohérentes avec le début des flèches/keyframes
    const data = {
      terrain: this.terrain(),
      elements: this.elements,
      traces: this.traces,
      formes: this.formes,
      dureeSecondes: this.dureeSecondes(),
      modeAnim: this.modeAnim(),
      metriqueVitesse: this.metriqueVitesse(),
      keyframes: this.keyframes(),
    };
    // Miniature pour la grille de la bibliothèque (pixelRatio réduit = data URL légère).
    const apercu = this.stage.toDataURL({ pixelRatio: 0.35 });
    this.data.enregistrer(JSON.stringify(data), apercu).subscribe({
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
    if (this.elements.length === 0 && this.traces.length === 0 && this.formes.length === 0) return;
    if (!confirm('Vider tout le terrain ? (joueurs, équipement, tracés et formes)')) return;
    this.layer.destroyChildren();   // détruit aussi le transformer → on le recrée
    this.elements = [];
    this.traces = [];
    this.formes = [];
    this.nodesById.clear();
    this.formeNodes.clear();
    this.selection.clear();
    this.trForme = new Konva.Transformer({ rotateEnabled: false, ignoreStroke: true, padding: 4 });
    this.layer.add(this.trForme);
    this.resetKeyframes();
    this.layer.draw();
  }

  capture(): void {
    const url = this.stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = url; a.download = `schema-${this.data.titre}.png`; a.click();
  }

  // ══════════ Rendu ══════════
  private chargerSchema(): void {
    if (!this.data.schemaJson) return;
    try { this.chargerContenu(JSON.parse(this.data.schemaJson)); } catch { }
  }

  /** Charge le contenu d'un schéma (éléments, tracés, animation) sur le terrain courant. */
  private chargerContenu(d: any): void {
    (d.formes ?? []).forEach((f: SchemaForme) => { this.formes.push(f); this.dessinerForme(f); });
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
  }

  /** Importe un schéma de la bibliothèque : COPIE son contenu dans l'éditeur (copy-on-attach).
   *  Le schéma de base n'est jamais modifié ; seul l'enregistrement écrit dans la cible courante. */
  importerDepuisBiblio(): void {
    const ref = this.dialog.open(SchemaPickerDialogComponent, {
      panelClass: 'dark-dialog', width: '760px', maxWidth: '95vw', autoFocus: false,
    });
    ref.afterClosed().subscribe((schema?: SchemaTactique) => {
      if (!schema) return;
      const occupe = this.elements.length > 0 || this.traces.length > 0;
      if (occupe && !confirm('Remplacer le contenu actuel du terrain par ce schéma ?')) return;
      this.pause();
      // Vider le terrain courant (sans la confirmation de viderTerrain).
      this.layer.destroyChildren();
      this.elements = [];
      this.traces = [];
      this.nodesById.clear();
      try {
        const d = JSON.parse(schema.schemaJson);
        if (d.terrain === 'complet' || d.terrain === 'demi') { this.terrain.set(d.terrain); this.dessinerTerrain(); }
        this.chargerContenu(d);
      } catch {
        this.resetKeyframes();
      }
      this.ajusterAuConteneur();
      this.snack.open(`Schéma « ${schema.nom} » importé`, 'Fermer', { duration: 2000 });
    });
  }

  // Rendu du terrain délégué à SchemaTerrainRenderer (./schema-terrain.renderer).
  private dessinerTerrain(): void {
    this.terrainRenderer.dessiner(this.fieldLayer, this.terrain(), this.W, this.H);
  }

  private dessinerElement(el: SchemaElement): void {
    const g = new Konva.Group({ x: el.x, y: el.y, draggable: true });
    // Halo lumineux « joueur à surveiller » (dessiné en premier = derrière le jeton).
    if (el.surveille) {
      const c = el.surveilleCouleur || '#ef4444';
      g.add(new Konva.Circle({   // disque flou = effet projecteur
        radius: 24, fill: c, opacity: 0.28,
        shadowColor: c, shadowBlur: 22, shadowOpacity: 1,
      }));
      g.add(new Konva.Circle({ radius: 22, stroke: c, strokeWidth: 3 }));
    }
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

    // Badge d'alerte « à surveiller » (au-dessus du jeton, coin haut-droit).
    if (el.surveille) {
      const badge = new Konva.Group({ x: 13, y: -13 });
      badge.add(new Konva.Circle({ radius: 8, fill: '#ef4444', stroke: '#fff', strokeWidth: 1.5 }));
      const bt = new Konva.Text({ text: '!', fontSize: 12, fontStyle: 'bold', fill: '#fff', width: 16, height: 16, align: 'center', verticalAlign: 'middle' });
      bt.offsetX(8); bt.offsetY(8);
      badge.add(bt);
      g.add(badge);
    }

    // Surbrillance de sélection multiple : enfant nommé (suit le déplacement du groupe).
    if (this.selection.has(el.id)) {
      g.add(new Konva.Rect({ name: 'sel-hi', x: -22, y: -18, width: 44, height: 36, cornerRadius: 6, stroke: '#38bdf8', strokeWidth: 2, dash: [4, 3], listening: false }));
    }

    g.on('dragstart', () => {
      if (this.selection.has(el.id) && this.selection.size > 1) {
        this.dragBase.clear();
        this.dragBase.set('_anchor', { x: g.x(), y: g.y() });
        this.selection.forEach(id => { const n = this.nodesById.get(id); if (n) this.dragBase.set(id, { x: n.x(), y: n.y() }); });
      }
    });
    g.on('dragmove', () => {
      const anchor = this.dragBase.get('_anchor');
      if (!anchor || !this.selection.has(el.id)) return;
      const dx = g.x() - anchor.x, dy = g.y() - anchor.y;
      this.selection.forEach(id => {
        if (id === el.id) return;
        const n = this.nodesById.get(id); const base = this.dragBase.get(id);
        if (n && base) { n.x(base.x + dx); n.y(base.y + dy); }
      });
      this.layer.batchDraw();
    });
    g.on('dragend', () => {
      const kf = this.keyframeAt(this.tempsCourant(), true)!;   // crée une keyframe si on est entre deux
      const maj = (id: string) => {
        const n = this.nodesById.get(id); const e = this.elements.find(x => x.id === id);
        if (n && e) { e.x = n.x(); e.y = n.y(); kf.positions[id] = { x: e.x, y: e.y }; }
      };
      if (this.selection.has(el.id) && this.selection.size > 1) { this.selection.forEach(maj); }
      else { maj(el.id); }
      this.dragBase.clear();
    });
    g.on('click tap', () => {
      const o = this.outil();
      if (o === 'supprimer') {
        this.elements = this.elements.filter(e => e.id !== el.id);
        this.nodesById.delete(el.id);
        this.keyframes.update(ks => { ks.forEach(k => delete k.positions[el.id]); return [...ks]; });
        this.traces.forEach(t => { if (t.elementId === el.id) t.elementId = undefined; if (t.ballId === el.id) t.ballId = undefined; });
        g.destroy(); this.majJoueursPlaces(); this.layer.draw();
      } else if (o === 'surveiller') {
        el.surveille = !el.surveille;  // marque/démarque le jeton à surveiller
        el.surveilleCouleur = el.surveille ? this.couleurAnnot() : undefined;
        g.destroy(); this.nodesById.delete(el.id); this.dessinerElement(el); this.layer.draw();
      } else if (o === 'select') {  // eslint pas de redraw lourd : sélection ciblée
        this.definirSelection([el.id]);   // clic simple = sélectionner ce seul jeton
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
    grp.name('trace');

    grp.visible(this.tracesVisibles());

    this.layer.add(grp);
    this.remonterElements();   // les jetons/joueurs restent visuellement au-dessus des tracés
    return grp;
  }


  /** Garde les éléments (jetons, ballon, équipement) au premier plan, au-dessus des tracés. */
  private remonterElements(): void {
    this.nodesById.forEach(g => g.moveToTop());
    this.trForme?.moveToTop();
  }

  // ══════════ Sélection multiple (cadre / lasso) ══════════
  /** Vrai si le clic est sur un élément/forme déplaçable ou sur une poignée du transformer. */
  private surInteractif(e: Konva.KonvaEventObject<any>): boolean {
    if (this.surElement(e)) return true;
    let p: Konva.Node | null = e.target.getParent();
    while (p) { if (p === this.trForme) return true; p = p.getParent(); }
    return false;
  }

  private definirSelection(ids: string[]): void {
    this.selection = new Set(ids);
    this.detacherForme();
    this.majSurbrillance();
  }
  private clearSelection(): void {
    if (this.selection.size) { this.selection.clear(); this.majSurbrillance(); }
  }
  /** Ajoute/retire le liseré de sélection (enfant nommé) sur chaque jeton. */
  private majSurbrillance(): void {
    this.nodesById.forEach((g, id) => {
      const hi = g.findOne('.sel-hi');
      if (this.selection.has(id) && !hi) {
        const r = new Konva.Rect({ name: 'sel-hi', x: -22, y: -18, width: 44, height: 36, cornerRadius: 6, stroke: '#38bdf8', strokeWidth: 2, dash: [4, 3], listening: false });
        g.add(r); r.moveToBottom();
      } else if (!this.selection.has(id) && hi) {
        hi.destroy();
      }
    });
    this.layer.batchDraw();
  }

  // ══════════ Formes d'annotation ══════════
  private formeShape(f: SchemaForme): Konva.Shape {
    const fill = f.couleur + '22', stroke = f.couleur;
    if (f.type === 'rect') return new Konva.Rect({ width: f.w, height: f.h, fill, stroke, strokeWidth: 3 });
    if (f.type === 'ellipse') return new Konva.Ellipse({ x: f.w / 2, y: f.h / 2, radiusX: f.w / 2, radiusY: f.h / 2, fill, stroke, strokeWidth: 3 });
    if (f.type === 'triangle') return new Konva.Line({ points: [f.w / 2, 0, f.w, f.h, 0, f.h], closed: true, fill, stroke, strokeWidth: 3 });
    return new Konva.Line({ points: [f.w / 2, 0, f.w, f.h / 2, f.w / 2, f.h, 0, f.h / 2], closed: true, fill, stroke, strokeWidth: 3 });
  }

  /** (Re)construit le contenu d'une forme : la géométrie + le texte centré éventuel. */
  private dessinerContenuForme(g: Konva.Group, f: SchemaForme): void {
    g.destroyChildren();
    g.add(this.formeShape(f));
    if (f.texte) {
      const t = new Konva.Text({
        text: f.texte, width: f.w, height: f.h,
        align: 'center', verticalAlign: 'middle', wrap: 'word', padding: 4,
        fontSize: f.texteTaille ?? 20, fontStyle: 'bold',
        fill: f.texteCouleur || f.couleur, listening: false,
      });
      g.add(t);
    }
  }

  private dessinerForme(f: SchemaForme): Konva.Group {
    const g = new Konva.Group({ x: f.x, y: f.y, draggable: true, name: 'forme' });
    this.dessinerContenuForme(g, f);
    g.on('dragend', () => { f.x = g.x(); f.y = g.y(); });
    g.on('dblclick dbltap', (e) => { e.cancelBubble = true; this.editerTexteForme(f, g); });
    g.on('click tap', (e) => {
      const o = this.outil();
      if (o === 'supprimer') {
        e.cancelBubble = true;
        this.formes = this.formes.filter(x => x.id !== f.id);
        this.formeNodes.delete(f.id);
        this.detacherForme();
        g.destroy(); this.layer.draw();
      } else if (o === 'select' || o === 'forme') {
        e.cancelBubble = true;
        this.selectionnerForme(g);
      }
    });
    // Le Transformer agit par mise à l'échelle : on la « cuit » dans w/h au relâcher.
    g.on('transformend', () => {
      f.w = Math.max(12, f.w * g.scaleX());
      f.h = Math.max(12, f.h * g.scaleY());
      f.x = g.x(); f.y = g.y();
      g.scale({ x: 1, y: 1 });
      this.dessinerContenuForme(g, f);
      this.layer.batchDraw();
    });
    this.formeNodes.set(f.id, g);
    this.layer.add(g);
    return g;
  }

  private selectionnerForme(g: Konva.Group): void {
    this.clearSelection();
    this.trForme.nodes([g]);
    this.trForme.moveToTop();
    this.layer.draw();
  }
  private detacherForme(): void {
    if (this.trForme && this.trForme.nodes().length) { this.trForme.nodes([]); this.layer.batchDraw(); }
  }

  /** Édite le texte d'une forme : textarea HTML superposé (Entrée = valider, Maj+Entrée = saut de ligne). */
  private editerTexteForme(f: SchemaForme, g: Konva.Group): void {
    const pos = g.getAbsolutePosition();
    const box = this.stage.container().getBoundingClientRect();
    const s = this.echelle();
    const ta = document.createElement('textarea');
    ta.value = f.texte ?? '';
    Object.assign(ta.style, {
      position: 'fixed',
      left: `${box.left + pos.x}px`, top: `${box.top + pos.y}px`,
      width: `${Math.max(60, f.w * s)}px`, height: `${Math.max(28, f.h * s)}px`,
      textAlign: 'center', font: `bold ${(f.texteTaille ?? this.texteTaille()) * s}px sans-serif`,
      color: f.couleur, background: 'rgba(255,255,255,0.92)',
      border: `2px solid ${f.couleur}`, borderRadius: '6px', outline: 'none',
      resize: 'none', zIndex: '9999', padding: '2px', boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let fini = false;
    const valider = () => {
      if (fini) return; fini = true;
      const v = ta.value.trim();
      f.texte = v || undefined;
      f.texteTaille = this.texteTaille();
      f.texteCouleur = this.couleurTexteAnnot();
      this.dessinerContenuForme(g, f);
      this.layer.draw();
      ta.remove();
    };
    ta.addEventListener('blur', valider);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
      else if (e.key === 'Escape') { fini = true; ta.remove(); }
    });
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

      // Outil Formes : dessiner une zone (rect/ellipse/losange) par glisser sur le vide.
      if (o === 'forme' && !this.surInteractif(e)) {
        const p = this.stage.getRelativePointerPosition();
        if (!p) return;
        this.formeStart = { x: p.x, y: p.y };
        const f: SchemaForme = { id: this.uid(), type: this.formeType(), x: p.x, y: p.y, w: 1, h: 1, couleur: this.couleurAnnot() };
        this.formeEnCoursModel = f;
        this.formeEnCours = this.dessinerForme(f);
        this.remonterElements();
        return;
      }

      // Outil Sélection : tracer un cadre / lasso sur le vide pour sélectionner un groupe.
      if (o === 'select' && !this.surInteractif(e)) {
        const p = this.stage.getRelativePointerPosition();
        if (!p) return;
        this.clearSelection(); this.detacherForme();
        this.selStart = { x: p.x, y: p.y };
        if (this.modeSelection() === 'cadre') {
          this.selShape = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, stroke: '#38bdf8', strokeWidth: 1.5, dash: [6, 4], fill: '#38bdf822' });
        } else {
          this.selLassoPts = [p.x, p.y];
          this.selShape = new Konva.Line({ points: this.selLassoPts, stroke: '#38bdf8', strokeWidth: 1.5, dash: [6, 4], closed: false, fill: '#38bdf822' });
        }
        this.layer.add(this.selShape);
        return;
      }

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
      // Forme en cours de tracé
      if (this.formeEnCours && this.formeEnCoursModel && this.formeStart) {
        const p = this.stage.getRelativePointerPosition();
        if (!p) return;
        const f = this.formeEnCoursModel, x0 = this.formeStart.x, y0 = this.formeStart.y;
        f.x = Math.min(x0, p.x); f.y = Math.min(y0, p.y);
        f.w = Math.max(1, Math.abs(p.x - x0)); f.h = Math.max(1, Math.abs(p.y - y0));
        this.formeEnCours.position({ x: f.x, y: f.y });
        this.dessinerContenuForme(this.formeEnCours, f);
        this.layer.batchDraw();
        return;
      }
      // Zone de sélection en cours
      if (this.selShape && this.selStart) {
        const p = this.stage.getRelativePointerPosition();
        if (!p) return;
        if (this.modeSelection() === 'cadre') {
          const r = this.selShape as Konva.Rect;
          r.position({ x: Math.min(this.selStart.x, p.x), y: Math.min(this.selStart.y, p.y) });
          r.width(Math.abs(p.x - this.selStart.x)); r.height(Math.abs(p.y - this.selStart.y));
        } else {
          this.selLassoPts.push(p.x, p.y);
          (this.selShape as Konva.Line).points(this.selLassoPts);
        }
        this.layer.batchDraw();
        return;
      }

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
      // Fin de tracé d'une forme
      if (this.formeEnCours && this.formeEnCoursModel) {
        const f = this.formeEnCoursModel;
        if (f.w < 12 || f.h < 12) { this.formeEnCours.destroy(); this.formeNodes.delete(f.id); }
        else { this.formes.push(f); this.selectionnerForme(this.formeEnCours); }
        this.formeEnCours = null; this.formeEnCoursModel = null; this.formeStart = null;
        this.remonterElements();
        this.layer.draw();
        return;
      }
      // Fin de zone de sélection
      if (this.selShape && this.selStart) {
        const ids: string[] = [];
        if (this.modeSelection() === 'cadre') {
          const r = this.selShape as Konva.Rect;
          const x1 = r.x(), y1 = r.y(), x2 = x1 + r.width(), y2 = y1 + r.height();
          this.elements.forEach(el => { const n = this.nodesById.get(el.id); if (n) { const cx = n.x(), cy = n.y(); if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) ids.push(el.id); } });
        } else {
          const poly = this.selLassoPts;
          this.elements.forEach(el => { const n = this.nodesById.get(el.id); if (n && pointDansPolygone(n.x(), n.y(), poly)) ids.push(el.id); });
        }
        this.selShape.destroy(); this.selShape = null; this.selStart = null; this.selLassoPts = [];
        this.definirSelection(ids);
        return;
      }

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
    fleches.forEach(a => rendu.set(a.id, cheminRendu(a.points)));

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

    // Lien EXPLICITE posé au dessin (lierTrace) : une flèche dessinée sur un jeton/ballon lui
    // est réservée — prioritaire sur toute déduction géométrique (deux flèches proches ou qui
    // se croisent ne se volent plus leur mobile).
    const explicite = (a: SchemaTrace, type: 'ballon' | 'joueur'): SchemaElement | undefined => {
      const id = type === 'joueur'
        ? (estJoueur(a) ? a.elementId : undefined)
        : (a.type === 'conduite' ? a.ballId : (estBallon(a) ? a.elementId : undefined));
      return id ? this.elements.find(e => e.id === id && e.type === type) : undefined;
    };

    // Propriétaire d'une flèche : le lien explicite, sinon hérité du prédécesseur de même
    // nature, sinon l'élément le plus proche du départ (le ballon se prend au début d'une
    // conduite, etc.).
    const memo = { ballon: new Map<string, SchemaElement | undefined>(), joueur: new Map<string, SchemaElement | undefined>() };
    const owner = (a: SchemaTrace, type: 'ballon' | 'joueur', estType: (x: SchemaTrace) => boolean, vu = new Set<string>()): SchemaElement | undefined => {
      const m = memo[type];
      if (m.has(a.id)) return m.get(a.id);
      const ex = explicite(a, type);
      if (ex) { m.set(a.id, ex); return ex; }
      if (vu.has(a.id)) return undefined;
      vu.add(a.id);
      const p = predNature(a, estType);
      const r = p ? owner(p, type, estType, vu) : plusProche(type, debut(a));
      m.set(a.id, r);
      return r;
    };

    // Toutes les flèches qui FINISSENT au départ de a (ses "arrivants"). Les chaînes de deux
    // joueurs DIFFÉRENTS ne se synchronisent pas entre elles (une course qui se termine près
    // du départ de la flèche d'un autre joueur ne doit pas la retarder) — sauf remise/relais
    // où le MÊME ballon passe de l'un à l'autre.
    const arrivants = (a: SchemaTrace) => fleches.filter(b => {
      if (b.id === a.id || Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y) > RAYON_LIEN) return false;
      const ja = estJoueur(a) ? owner(a, 'joueur', estJoueur) : undefined;
      const jb = estJoueur(b) ? owner(b, 'joueur', estJoueur) : undefined;
      if (ja && jb && ja.id !== jb.id) {
        const ba = estBallon(a) ? owner(a, 'ballon', estBallon) : undefined;
        const bb = estBallon(b) ? owner(b, 'ballon', estBallon) : undefined;
        return !!ba && !!bb && ba.id === bb.id;
      }
      return true;
    });

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
      if (enCalcul.has(a.id)) { t0.set(a.id, 0); t1.set(a.id, longueurChemin(rendu.get(a.id)!) / vitLeg(a)); return t1.get(a.id)!; }
      enCalcul.add(a.id);
      const inc = arrivants(a);
      const dep = inc.length ? Math.max(...inc.map(calc)) : 0;
      t0.set(a.id, dep); t1.set(a.id, dep + longueurChemin(rendu.get(a.id)!) / vitLeg(a));
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
        return pointLeLongDe(lg.pts, Math.max(0, Math.min(1, r)));
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

  // Géométrie (cheminRendu, pointsTension, echQuad, echCubic, longueurChemin,
  // pointLeLongDe) importée de ./schema-geometrie.

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
    this.tracesVisibles.set(false);
    this.updateTracesVisibility();
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
  private pause(): void {
    this.tracesVisibles.set(this.tracesVisibles()); this.updateTracesVisibility();
    this.anim?.stop(); this.anim = undefined; this.enLecture.set(false);
  }

  private uid(): string { return Math.random().toString(36).slice(2, 10); }
  // Affiche ou masque tous les tracés selon l'état de la palette (case à cocher). Les éléments restent visibles.
  private updateTracesVisibility(): void {
    this.layer.find('.trace').forEach((node: any) => {
      node.visible(this.tracesVisibles());
    });
    this.layer.batchDraw();
  }
  // ══════════ Palette : afficher/masquer les tracés (sans les supprimer) ══════════
   visibiliteTraces(): void {
    this.tracesVisibles.update(v => !v);
    this.updateTracesVisibility();
  }
}

