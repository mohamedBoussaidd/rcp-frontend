import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import Konva from 'konva';
import { Exercice, TechniqueService } from '../../../core/services/technique.service';

type Terrain = 'complet' | 'demi';
type Outil = 'select' | 'deplacement' | 'conduite' | 'passe' | 'tir' | 'supprimer';
type TraceType = 'deplacement' | 'conduite' | 'passe' | 'tir';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; x: number; y: number; }
interface SchemaTrace { id: string; type: TraceType; points: number[]; }

const VIOLET = '#7c3aed', JAUNE = '#eab308', ROUGE = '#ef4444';
const BLEU = '#2563eb';

@Component({
  selector: 'app-schema-editor',
  standalone: true,
  templateUrl: './schema-editor.component.html',
  styleUrl: './schema-editor.component.scss',
})
export class SchemaEditorComponent implements AfterViewInit, OnDestroy {

  @ViewChild('stageContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  readonly exercice: Exercice;

  terrain = signal<Terrain>('complet');
  outil = signal<Outil>('select');
  echelle = signal(1);
  // Palette dépliable
  ouvert = signal<string | null>('violet');

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
    private snack: MatSnackBar,
  ) {
    this.exercice = data.exercice;
    if (this.exercice.schemaJson) {
      try { const d = JSON.parse(this.exercice.schemaJson); if (d.terrain) this.terrain.set(d.terrain); } catch {}
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
  }

  ngOnDestroy(): void { this.stage?.destroy(); }

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
    this.layer.draw();
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
    const data = {
      terrain: this.terrain(),
      elements: this.elements,
      traces: this.traces,
      keyframes: [{ t: 0, positions: Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }])) }],
    };
    this.service.sauverSchema(this.exercice.id, JSON.stringify(data)).subscribe({
      next: () => { this.snack.open('Schéma enregistré', 'Fermer', { duration: 2000 }); this.dialogRef.close(true); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  fermer(): void { this.dialogRef.close(false); }

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
      this.layer.draw();
    } catch {}
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
      g.add(new Konva.Circle({ radius: 16, fill: el.couleur, stroke: '#fff', strokeWidth: 2 }));
      g.add(new Konva.Text({ text: String(el.numero), fontSize: 15, fontStyle: 'bold', fill: '#fff', width: 32, height: 32, offsetX: 16, offsetY: 16, align: 'center', verticalAlign: 'middle' }));
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

    g.on('dragend', () => { el.x = g.x(); el.y = g.y(); });
    g.on('click tap', () => {
      if (this.outil() === 'supprimer') {
        this.elements = this.elements.filter(e => e.id !== el.id);
        this.nodesById.delete(el.id);
        g.destroy(); this.layer.draw();
      }
    });
    this.nodesById.set(el.id, g);
    this.layer.add(g);
  }

  private dessinerTrace(t: SchemaTrace): Konva.Group {
    const grp = new Konva.Group();
    const couleur = '#fde047';
    const base = { points: t.points, stroke: couleur, strokeWidth: 3, tension: 0.35, lineCap: 'round' as const, lineJoin: 'round' as const };
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
      const base = { points: this.pointsEnCours, stroke: couleur, strokeWidth: 3, tension: 0.35, lineCap: 'round' as const, lineJoin: 'round' as const };
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
      if (Math.hypot(p.x - this.pointsEnCours[n - 2], p.y - this.pointsEnCours[n - 1]) >= 8) {
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
        this.dessinerTrace(t);
      }
      this.pointsEnCours = [];
      this.layer.draw();
    });
  }

  private uid(): string { return Math.random().toString(36).slice(2, 10); }
}
