import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import Konva from 'konva';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; x: number; y: number; }
interface SchemaTrace { id: string; type: string; points: number[]; }
interface Keyframe { t: number; positions: Record<string, { x: number; y: number }>; }

/** Rendu en lecture seule d'un schéma tactique (terrain + éléments + tracés) + lecture animée. */
@Component({
  selector: 'app-schema-viewer',
  standalone: true,
  template: `
    <div class="sv-wrap">
      <div #c class="sv-container"></div>
      @if (animable) {
        <button type="button" class="sv-play" (click)="basculerLecture()" [title]="enLecture ? 'Pause' : 'Lire l\\'animation'">
          {{ enLecture ? '⏸' : '▶' }}
        </button>
      }
    </div>
  `,
  styles: [`
    .sv-wrap { display:inline-block; position:relative; }
    .sv-container { display:block; border-radius:6px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,.25); }
    .sv-play {
      position:absolute; left:8px; bottom:8px;
      width:34px; height:34px; border-radius:50%;
      border:1px solid #ffffff66; background:rgba(20,24,40,.78); color:#fff;
      font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:background .12s;
    }
    .sv-play:hover { background:rgba(20,24,40,.95); }
  `],
})
export class SchemaViewerComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() schemaJson?: string | null;
  @Input() largeur = 460;

  @ViewChild('c', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage?: Konva.Stage;
  private pret = false;

  private nodesById = new Map<string, Konva.Group>();
  private elements: SchemaElement[] = [];
  private keyframes: Keyframe[] = [];
  private dureeSecondes = 10;
  private anim?: Konva.Animation;

  animable = false;
  enLecture = false;

  ngAfterViewInit(): void { this.pret = true; this.rendre(); }
  ngOnChanges(): void { if (this.pret) this.rendre(); }
  ngOnDestroy(): void { this.anim?.stop(); this.stage?.destroy(); }

  /** PNG du schéma (pour l'impression). */
  toDataURL(): string | null {
    return this.stage ? this.stage.toDataURL({ pixelRatio: 2 }) : null;
  }

  private rendre(): void {
    this.anim?.stop(); this.anim = undefined; this.enLecture = false;
    this.stage?.destroy();
    this.nodesById.clear();
    this.elements = []; this.keyframes = []; this.animable = false;
    if (!this.schemaJson) return;
    let data: { terrain: string; elements: SchemaElement[]; traces: SchemaTrace[]; keyframes?: Keyframe[]; dureeSecondes?: number };
    try { data = JSON.parse(this.schemaJson); } catch { return; }

    const W = data.terrain === 'demi' ? 600 : 1040;
    const H = 680;
    const s = this.largeur / W;

    this.stage = new Konva.Stage({ container: this.containerRef.nativeElement, width: W * s, height: H * s, scaleX: s, scaleY: s });
    const fond = new Konva.Layer();
    const couche = new Konva.Layer();
    this.stage.add(fond); this.stage.add(couche);
    this.dessinerTerrain(fond, data.terrain, W, H);
    this.elements = data.elements ?? [];
    this.elements.forEach(el => this.dessinerElement(couche, el));
    (data.traces ?? []).forEach(t => this.dessinerTrace(couche, t));
    fond.draw(); couche.draw();

    // Animation disponible seulement si plusieurs keyframes décrivent un mouvement.
    this.keyframes = (data.keyframes ?? []).slice().sort((a, b) => a.t - b.t);
    this.dureeSecondes = data.dureeSecondes ?? 10;
    this.animable = this.keyframes.length > 1;
  }

  // ── Lecture animée ──
  basculerLecture(): void { this.enLecture ? this.pause() : this.play(); }

  private play(): void {
    if (!this.animable || !this.stage) return;
    const couche = this.stage.getLayers()[1];
    const debut = Date.now();
    this.enLecture = true;
    this.anim = new Konva.Animation(() => {
      const t = (Date.now() - debut) / 1000;
      if (t >= this.dureeSecondes) { this.appliquerPositions(this.dureeSecondes); this.pause(); return false; }
      this.appliquerPositions(t);
      return undefined;
    }, couche);
    this.anim.start();
  }

  private pause(): void { this.anim?.stop(); this.anim = undefined; this.enLecture = false; }

  private appliquerPositions(t: number): void {
    this.elements.forEach(el => {
      const p = this.posElement(el, t);
      this.nodesById.get(el.id)?.position(p);
    });
  }

  private posElement(el: SchemaElement, t: number): { x: number; y: number } {
    const kfs = this.keyframes.filter(k => k.positions[el.id]);
    if (kfs.length === 0) return { x: el.x, y: el.y };
    if (t <= kfs[0].t) return kfs[0].positions[el.id];
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (t >= a.t && t <= b.t) {
        const r = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        const pa = a.positions[el.id], pb = b.positions[el.id];
        return { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r };
      }
    }
    return kfs[kfs.length - 1].positions[el.id];
  }

  private dessinerTerrain(layer: Konva.Layer, terrain: string, W: number, H: number): void {
    const m = 24;
    layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#3f8f43' }));
    layer.add(new Konva.Rect({ x: m, y: m, width: W - 2 * m, height: H - 2 * m, stroke: '#fff', strokeWidth: 2 }));
    if (terrain !== 'demi') {
      layer.add(new Konva.Line({ points: [W / 2, m, W / 2, H - m], stroke: '#fff', strokeWidth: 2 }));
      layer.add(new Konva.Circle({ x: W / 2, y: H / 2, radius: 68, stroke: '#fff', strokeWidth: 2 }));
      layer.add(new Konva.Circle({ x: W / 2, y: H / 2, radius: 3, fill: '#fff' }));
      this.surface(layer, m, H, false);
      this.surface(layer, W - m, H, true);
    } else {
      layer.add(new Konva.Line({ points: [m, H - m, W - m, H - m], stroke: '#fff', strokeWidth: 2 }));
      layer.add(new Konva.Arc({ x: W / 2, y: H - m, innerRadius: 0, outerRadius: 68, angle: 180, rotation: 180, stroke: '#fff', strokeWidth: 2 }));
      const gW = 300, gH = 110, bW = 150, bH = 44;
      layer.add(new Konva.Rect({ x: W / 2 - gW / 2, y: m, width: gW, height: gH, stroke: '#fff', strokeWidth: 2 }));
      layer.add(new Konva.Rect({ x: W / 2 - bW / 2, y: m, width: bW, height: bH, stroke: '#fff', strokeWidth: 2 }));
    }
  }

  private surface(layer: Konva.Layer, xBord: number, H: number, droite: boolean): void {
    const dir = droite ? -1 : 1;
    layer.add(new Konva.Rect({ x: xBord, y: H / 2 - 150, width: 110 * dir, height: 300, stroke: '#fff', strokeWidth: 2 }));
    layer.add(new Konva.Rect({ x: xBord, y: H / 2 - 75, width: 44 * dir, height: 150, stroke: '#fff', strokeWidth: 2 }));
  }

  private dessinerElement(layer: Konva.Layer, el: SchemaElement): void {
    const g = new Konva.Group({ x: el.x, y: el.y });
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
    this.nodesById.set(el.id, g);
    layer.add(g);
  }

  private dessinerTrace(layer: Konva.Layer, t: SchemaTrace): void {
    const couleur = '#fde047';
    const base = { points: t.points, stroke: couleur, strokeWidth: 3, tension: 0.35, lineCap: 'round' as const, lineJoin: 'round' as const };
    if (t.type === 'deplacement') {
      layer.add(new Konva.Arrow({ ...base, dash: [11, 7], fill: couleur, pointerLength: 11, pointerWidth: 11 }));
    } else if (t.type === 'passe') {
      layer.add(new Konva.Arrow({ ...base, fill: couleur, pointerLength: 12, pointerWidth: 12 }));
    } else if (t.type === 'conduite') {
      layer.add(new Konva.Line({ ...base }));
    } else {
      layer.add(new Konva.Line({ ...base }));
      const n = t.points.length;
      layer.add(new Konva.Circle({ x: t.points[n - 2], y: t.points[n - 1], radius: 6, fill: couleur }));
    }
  }
}
