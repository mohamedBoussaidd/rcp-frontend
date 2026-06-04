import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import Konva from 'konva';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; x: number; y: number; }
interface SchemaTrace { id: string; type: string; points: number[]; }

/** Rendu en lecture seule d'un schéma tactique (terrain + éléments + tracés). */
@Component({
  selector: 'app-schema-viewer',
  standalone: true,
  template: `<div #c class="sv-container"></div>`,
  styles: [`.sv-container { display:inline-block; border-radius:6px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,.25); }`],
})
export class SchemaViewerComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() schemaJson?: string | null;
  @Input() largeur = 460;

  @ViewChild('c', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage?: Konva.Stage;
  private pret = false;

  ngAfterViewInit(): void { this.pret = true; this.rendre(); }
  ngOnChanges(): void { if (this.pret) this.rendre(); }
  ngOnDestroy(): void { this.stage?.destroy(); }

  /** PNG du schéma (pour l'impression). */
  toDataURL(): string | null {
    return this.stage ? this.stage.toDataURL({ pixelRatio: 2 }) : null;
  }

  private rendre(): void {
    this.stage?.destroy();
    if (!this.schemaJson) return;
    let data: { terrain: string; elements: SchemaElement[]; traces: SchemaTrace[] };
    try { data = JSON.parse(this.schemaJson); } catch { return; }

    const W = data.terrain === 'demi' ? 600 : 1040;
    const H = 680;
    const s = this.largeur / W;

    this.stage = new Konva.Stage({ container: this.containerRef.nativeElement, width: W * s, height: H * s, scaleX: s, scaleY: s });
    const fond = new Konva.Layer();
    const couche = new Konva.Layer();
    this.stage.add(fond); this.stage.add(couche);
    this.dessinerTerrain(fond, data.terrain, W, H);
    (data.elements ?? []).forEach(el => this.dessinerElement(couche, el));
    (data.traces ?? []).forEach(t => this.dessinerTrace(couche, t));
    fond.draw(); couche.draw();
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
