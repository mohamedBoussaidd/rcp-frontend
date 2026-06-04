import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import Konva from 'konva';
import { Exercice, FormationCustom, TechniqueService } from '../../../core/services/technique.service';
import { Joueur, JoueurService } from '../../../core/services/joueur.service';
import { MatIcon } from "@angular/material/icon";

type Terrain = 'complet' | 'demi';
type Outil = 'select' | 'deplacement' | 'conduite' | 'passe' | 'tir' | 'supprimer';
type TraceType = 'deplacement' | 'conduite' | 'passe' | 'tir';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; label?: string; joueurId?: string; x: number; y: number; }
interface SchemaTrace { id: string; type: TraceType; points: number[]; }
interface Keyframe { t: number; positions: Record<string, { x: number; y: number }>; }

const VIOLET = '#7c3aed', JAUNE = '#eab308', ROUGE = '#ef4444';
const BLEU = '#2563eb';

@Component({
  selector: 'app-schema-editor',
  standalone: true,
  templateUrl: './schema-editor.component.html',
  styleUrl: './schema-editor.component.scss',
  imports: [MatIcon],
})
export class SchemaEditorComponent implements AfterViewInit, OnDestroy {

  @ViewChild('stageContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  readonly exercice: Exercice;

  terrain = signal<Terrain>('complet');
  outil = signal<Outil>('select');
  echelle = signal(1);

  // ── Animation (Phase B) ──
  tempsCourant = signal(0);
  dureeSecondes = signal(10);
  enLecture = signal(false);
  boucle = signal(false);
  vitesse = signal(1);
  keyframes = signal<Keyframe[]>([]);
  private anim?: Konva.Animation;
  // Palette dépliable
  ouvert = signal<string | null>('formations');

  // équipes / jokers
  readonly equipeViolet = { couleur: VIOLET, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly equipeJaune = { couleur: JAUNE, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly jokers = { couleur: ROUGE, nums: [1, 2, 3, 4] };
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
    if (this.keyframes().length === 0) this.resetKeyframes();
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

  /** Étiquette portée par le jeton : nom de famille, ou initiales si trop long. */
  private labelJoueur(j: Joueur): string {
    const nom = (j.nom || '').trim();
    if (nom && nom.length <= 6) return nom.toUpperCase();
    const ini = ((j.prenom?.[0] ?? '') + (nom[0] ?? '')).toUpperCase();
    return ini || nom.slice(0, 3).toUpperCase() || '?';
  }

  /** Ajoute un jeton lié à un vrai joueur (équipe "Nous" = violet). */
  ajouterJoueurReel(j: Joueur): void {
    this.ajouterElement({
      id: this.uid(), type: 'joueur', couleur: VIOLET,
      label: this.labelJoueur(j), joueurId: j.id,
      x: this.W / 2, y: this.H / 2,
    });
  }

  ngOnDestroy(): void { this.pause(); this.stage?.destroy(); }

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
    this.layer.draw();
  }

  /** Place une formation (11 joueurs) pour l'équipe choisie. Adverse = côté droit en miroir. */
  appliquerFormation(f: { nom: string; positions: { x: number; y: number }[] }): void {
    if (this.terrain() !== 'complet') this.changerTerrain('complet'); // formations pensées pour le terrain complet
    const couleur = this.equipeFormation();
    const adverse = couleur === JAUNE;
    // retirer les joueurs existants de cette couleur (re-cliquer = remplacer)
    this.elements.filter(e => e.type === 'joueur' && e.couleur === couleur).forEach(e => this.nodesById.get(e.id)?.destroy());
    this.elements = this.elements.filter(e => !(e.type === 'joueur' && e.couleur === couleur));
    const m = 24;
    f.positions.forEach((pos, i) => {
      const nx = adverse ? 1 - pos.x : pos.x;
      const el: SchemaElement = {
        id: this.uid(), type: 'joueur', couleur, numero: i + 1,
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

    const NOUS = this.equipeViolet.couleur, EUX = this.equipeJaune.couleur, MANN = '#64748b';
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

    // offensif : nous = attaquants, eux = défenseurs ; défensif : l'inverse
    const nous = mode === 'offensif' ? base.attaquants : base.defenseurs;
    const eux = mode === 'offensif' ? base.defenseurs : base.attaquants;
    nous.forEach((p, i) => { const q = px(p); ajout({ id: this.uid(), type: 'joueur', couleur: NOUS, numero: i + 1, x: q.x, y: q.y }); });
    eux.forEach((p, i) => { const q = px(p); ajout({ id: this.uid(), type: 'joueur', couleur: EUX, numero: i + 1, x: q.x, y: q.y }); });

    // mur de mannequins (coups francs)
    (base.mur ?? []).forEach(p => { const q = px(p); ajout({ id: this.uid(), type: 'mannequin', couleur: MANN, x: q.x, y: q.y }); });

    this.resetKeyframes();
    this.layer.draw();
  }

  /** Enregistre la disposition actuelle de l'équipe choisie comme formation réutilisable. */
  enregistrerFormation(): void {
    const couleur = this.equipeFormation();
    const adverse = couleur === JAUNE;
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
    const data = {
      terrain: this.terrain(),
      elements: this.elements,
      traces: this.traces,
      dureeSecondes: this.dureeSecondes(),
      keyframes: this.keyframes(),
    };
    this.service.sauverSchema(this.exercice.id, JSON.stringify(data)).subscribe({
      next: () => { this.snack.open('Schéma enregistré', 'Fermer', { duration: 2000 }); this.dialogRef.close(true); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  fermer(): void { this.dialogRef.close(false); }

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
      if (Array.isArray(d.keyframes) && d.keyframes.length) {
        this.keyframes.set([...d.keyframes].sort((a: Keyframe, b: Keyframe) => a.t - b.t));
        if (d.dureeSecondes) this.dureeSecondes.set(d.dureeSecondes);
      } else {
        this.resetKeyframes();
      }
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
      const fontSize = texte.length <= 2 ? 14 : texte.length <= 4 ? 11 : texte.length <= 5 ? 9 : 8;
      g.add(new Konva.Circle({ radius: 16, fill: el.couleur, stroke: '#fff', strokeWidth: 2 }));
      g.add(new Konva.Text({ text: texte, fontSize, fontStyle: 'bold', fill: '#fff', width: 32, height: 32, offsetX: 16, offsetY: 16, align: 'center', verticalAlign: 'middle' }));
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
        g.destroy(); this.layer.draw();
      }
    });
    this.nodesById.set(el.id, g);
    this.layer.add(g);
  }

  private dessinerTrace(t: SchemaTrace): Konva.Group {
    const grp = new Konva.Group();
    const couleur = '#fde047';
    const base = { points: t.points, stroke: couleur, strokeWidth: 3, tension: 0.8, lineCap: 'round' as const, lineJoin: 'round' as const };
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
    return grp;
  }

  // ══════════ Dessin des tracés à la souris ══════════
  private estOutilTrace(o: Outil): o is TraceType {
    return o === 'deplacement' || o === 'conduite' || o === 'passe' || o === 'tir';
  }

  private brancherDessin(): void {
    const couleur = '#fde047';

    this.stage.on('mousedown touchstart', (e) => {
      const o = this.outil();
      if (!this.estOutilTrace(o)) return;
      if (e.target !== this.stage && e.target.getParent()?.draggable()) return; // pas sur un élément
      const p = this.stage.getRelativePointerPosition();
      if (!p) return;
      this.pointsEnCours = [p.x, p.y];
      const base = { points: this.pointsEnCours, stroke: couleur, strokeWidth: 3, tension: 0.8, lineCap: 'round' as const, lineJoin: 'round' as const };
      this.dessinEnCours = (o === 'deplacement' || o === 'passe')
        ? new Konva.Arrow({ ...base, fill: couleur, dash: o === 'deplacement' ? [11, 7] : undefined, pointerLength: 11, pointerWidth: 11 })
        : new Konva.Line({ ...base });
      this.layer.add(this.dessinEnCours);
    });

    this.stage.on('mousemove touchmove', () => {
      if (!this.dessinEnCours) return;
      const p = this.stage.getRelativePointerPosition();
      if (!p) return;
      const n = this.pointsEnCours.length;
      // n'ajoute un point que si on a bougé d'au moins 8px (lisse + limite le nombre de points)
      if (Math.hypot(p.x - this.pointsEnCours[n - 2], p.y - this.pointsEnCours[n - 1]) >= 20) {
        this.pointsEnCours.push(p.x, p.y);
        this.dessinEnCours.points(this.pointsEnCours);
        this.layer.batchDraw();
      }
    });

    this.stage.on('mouseup touchend', () => {
      if (!this.dessinEnCours) return;
      const p = this.stage.getRelativePointerPosition();
      if (p) this.pointsEnCours.push(p.x, p.y);
      this.dessinEnCours.destroy();
      this.dessinEnCours = null;
      const pts = this.pointsEnCours;
      const longueurOk = pts.length >= 4 && Math.hypot(pts[pts.length - 2] - pts[0], pts[pts.length - 1] - pts[1]) > 12;
      if (longueurOk) {
        const t: SchemaTrace = { id: this.uid(), type: this.outil() as TraceType, points: pts };
        this.traces.push(t);
        // const pointsSimplifies = this.simplifierPoints(this.pointsEnCours);
        this.dessinerTrace(t);
      }
      this.pointsEnCours = [];
      this.layer.draw();
    });
  }

  // ══════════ Animation / keyframes (Phase B) ══════════
  private resetKeyframes(): void {
    this.keyframes.set([{ t: 0, positions: Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }])) }]);
    this.tempsCourant.set(0);
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
    for (const el of this.elements) {
      const p = this.posElement(el, t, kfs);
      el.x = p.x; el.y = p.y;
      this.nodesById.get(el.id)?.position({ x: p.x, y: p.y });
    }
    this.layer.batchDraw();
  }

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
    if (this.keyframes().length < 2) { this.snack.open('Ajoutez au moins 2 keyframes', 'Fermer', { duration: 2500 }); return; }
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

