import { Injectable } from '@angular/core';
import Konva from 'konva';
import { projeter } from '../schema-render/schema-render';

export type Terrain = 'complet' | 'demi';

/**
 * Dessine le terrain de foot (gazon rayé + lignes blanches translucides) sur une couche
 * Konva, en complet ou demi-terrain. Rendu pur : aucun état, on lui passe la couche et les
 * dimensions courantes. Deux modes : vue de dessus (édition, historique) et perspective
 * « tribune » (présentation/diaporama, cf. dessinerPerspective).
 */
@Injectable({ providedIn: 'root' })
export class SchemaTerrainRenderer {

  private static readonly BLANC = 'rgba(255,255,255,0.85)';

  /** (Re)dessine entièrement le terrain sur `layer`. */
  dessiner(layer: Konva.Layer, terrain: Terrain, W: number, H: number): void {
    layer.destroyChildren();
    const m = 24, blanc = SchemaTerrainRenderer.BLANC;
    const ligne = (pts: number[]) => new Konva.Line({ points: pts, stroke: blanc, strokeWidth: 2.5 });
    const arc = (d: string) => new Konva.Path({ data: d, stroke: blanc, strokeWidth: 2.5 });

    // Gazon rayé (bandes verticales dans le sens de la longueur)
    const bande = 104;
    for (let x = 0, i = 0; x < W; x += bande, i++) {
      layer.add(new Konva.Rect({ x, y: 0, width: Math.min(bande, W - x), height: H, fill: i % 2 ? '#0F7E43' : '#118A4A' }));
    }
    // Contour
    layer.add(new Konva.Rect({ x: m, y: m, width: W - 2 * m, height: H - 2 * m, stroke: blanc, strokeWidth: 2.5 }));

    if (terrain === 'complet') {
      layer.add(ligne([W / 2, m, W / 2, H - m]));
      layer.add(new Konva.Circle({ x: W / 2, y: H / 2, radius: 80, stroke: blanc, strokeWidth: 2.5 }));
      layer.add(new Konva.Circle({ x: W / 2, y: H / 2, radius: 3, fill: blanc }));
      this.surface(layer, m, H, false);
      this.surface(layer, W - m, H, true);
      // Buts (en débord de la ligne de but)
      layer.add(new Konva.Rect({ x: m - 14, y: H / 2 - 33, width: 14, height: 66, stroke: blanc, strokeWidth: 2.5 }));
      layer.add(new Konva.Rect({ x: W - m, y: H / 2 - 33, width: 14, height: 66, stroke: blanc, strokeWidth: 2.5 }));
      // Corners
      layer.add(arc(`M ${m} ${m + 10} A 10 10 0 0 1 ${m + 10} ${m}`));
      layer.add(arc(`M ${W - m - 10} ${m} A 10 10 0 0 1 ${W - m} ${m + 10}`));
      layer.add(arc(`M ${m} ${H - m - 10} A 10 10 0 0 0 ${m + 10} ${H - m}`));
      layer.add(arc(`M ${W - m - 10} ${H - m} A 10 10 0 0 0 ${W - m} ${H - m - 10}`));
    } else {
      // demi-terrain : but en haut, ligne médiane en bas
      layer.add(ligne([m, H - m, W - m, H - m]));
      layer.add(new Konva.Arc({ x: W / 2, y: H - m, innerRadius: 0, outerRadius: 80, angle: 180, rotation: 180, stroke: blanc, strokeWidth: 2.5 }));
      this.surfaceHaut(layer, m, W);
      layer.add(new Konva.Rect({ x: W / 2 - 33, y: m - 14, width: 66, height: 14, stroke: blanc, strokeWidth: 2.5 }));
    }
    layer.draw();
  }

  private surface(layer: Konva.Layer, xBord: number, H: number, droite: boolean): void {
    const dir = droite ? -1 : 1, blanc = SchemaTerrainRenderer.BLANC;
    const gW = 110, gH = 300, bW = 44, bH = 150;
    layer.add(new Konva.Rect({ x: xBord, y: H / 2 - gH / 2, width: gW * dir, height: gH, stroke: blanc, strokeWidth: 2.5 }));
    layer.add(new Konva.Rect({ x: xBord, y: H / 2 - bH / 2, width: bW * dir, height: bH, stroke: blanc, strokeWidth: 2.5 }));
    // Point de penalty + arc en « D » (partie hors surface)
    const psx = xBord + 80 * dir, xe = xBord + gW * dir;
    const dy = Math.sqrt(80 * 80 - 30 * 30);   // intersection de l'arc r=80 avec le bord de surface
    layer.add(new Konva.Circle({ x: psx, y: H / 2, radius: 3, fill: blanc }));
    layer.add(new Konva.Path({
      data: `M ${xe} ${H / 2 - dy} A 80 80 0 0 ${droite ? 0 : 1} ${xe} ${H / 2 + dy}`,
      stroke: blanc, strokeWidth: 2.5,
    }));
  }

  private surfaceHaut(layer: Konva.Layer, m: number, W: number): void {
    const blanc = SchemaTerrainRenderer.BLANC;
    const gW = 300, gH = 110, bW = 150, bH = 44;
    layer.add(new Konva.Rect({ x: W / 2 - gW / 2, y: m, width: gW, height: gH, stroke: blanc, strokeWidth: 2.5 }));
    layer.add(new Konva.Rect({ x: W / 2 - bW / 2, y: m, width: bW, height: bH, stroke: blanc, strokeWidth: 2.5 }));
    // Point de penalty + arc en « D »
    const psy = m + 80, ye = m + gH;
    const dx = Math.sqrt(80 * 80 - 30 * 30);
    layer.add(new Konva.Circle({ x: W / 2, y: psy, radius: 3, fill: blanc }));
    layer.add(new Konva.Path({
      data: `M ${W / 2 - dx} ${ye} A 80 80 0 0 1 ${W / 2 + dx} ${ye}`,
      stroke: blanc, strokeWidth: 2.5,
    }));
  }

  // ═══════════════ Perspective « tribune » (présentation / diaporama) ═══════════════

  /**
   * Terrain en trapèze perspective : mêmes tracés que la vue de dessus, chaque point
   * passant par {@link projeter}. Les cercles/arcs sont échantillonnés en polylignes
   * projetées. Réservé au RENDU présentation — l'édition reste en vue de dessus.
   */
  dessinerPerspective(layer: Konva.Layer, terrain: Terrain, W: number, H: number): void {
    layer.destroyChildren();
    const m = 24, blanc = SchemaTerrainRenderer.BLANC;
    const P = (x: number, y: number) => projeter(x, y, W, H);

    const polyProj = (pts: number[], closed = false, fill?: string, opacity = 1) => {
      const out: number[] = [];
      for (let i = 0; i < pts.length - 1; i += 2) { const p = P(pts[i], pts[i + 1]); out.push(p.x, p.y); }
      return new Konva.Line({ points: out, closed, fill, opacity, ...(fill ? {} : { stroke: blanc, strokeWidth: 2 }) });
    };
    const ligneProj = (pts: number[]) => layer.add(polyProj(pts));
    const cercleProj = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
      const pts: number[] = [];
      const n = 48;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n);
        pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ligneProj(pts);
    };
    /** Pastille pleine (point central, points de penalty) : rayon réduit avec la profondeur. */
    const pointProj = (x: number, y: number, r = 3) => {
      const p = P(x, y);
      layer.add(new Konva.Circle({ x: p.x, y: p.y, radius: r * p.echelle, fill: blanc }));
    };
    /** Rectangle projeté fermé (cages en débord de la ligne de but). */
    const rectProj = (x: number, y: number, w: number, h: number) =>
      ligneProj([x, y, x + w, y, x + w, y + h, x, y + h, x, y]);

    // Ciel/fond sombre derrière la ligne d'horizon (ambiance présentation).
    layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#0B1220' }));
    // Gazon rayé projeté : chaque bande devient un trapèze.
    const bande = 104;
    for (let x = 0, i = 0; x < W; x += bande, i++) {
      const x1 = Math.min(x + bande, W);
      const c1 = P(x, 0), c2 = P(x1, 0), c3 = P(x1, H), c4 = P(x, H);
      layer.add(new Konva.Line({
        points: [c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y], closed: true,
        fill: i % 2 ? '#0F7E43' : '#118A4A',
      }));
    }
    // Contour du terrain.
    ligneProj([m, m, W - m, m, W - m, H - m, m, H - m, m, m]);

    if (terrain === 'complet') {
      ligneProj([W / 2, m, W / 2, H - m]);
      cercleProj(W / 2, H / 2, 80);
      pointProj(W / 2, H / 2);
      // Surfaces gauche/droite (grande + petite), point de penalty, arc de « D » et cage.
      for (const droite of [false, true]) {
        const xB = droite ? W - m : m, dir = droite ? -1 : 1;
        const gW = 110, gH = 300, bW = 44, bH = 150;
        ligneProj([xB, H / 2 - gH / 2, xB + gW * dir, H / 2 - gH / 2, xB + gW * dir, H / 2 + gH / 2, xB, H / 2 + gH / 2]);
        ligneProj([xB, H / 2 - bH / 2, xB + bW * dir, H / 2 - bH / 2, xB + bW * dir, H / 2 + bH / 2, xB, H / 2 + bH / 2]);
        // Le « D » = portion du cercle (r=80, centré sur le penalty) située HORS de la surface.
        // Le bord de surface est à |gW - 80| = 30 du centre, d'où un demi-angle acos(30/80),
        // orienté vers l'intérieur du terrain (0 à gauche, π à droite).
        const demi = Math.acos((gW - 80) / 80);
        const axe = droite ? Math.PI : 0;
        cercleProj(xB + 80 * dir, H / 2, 80, axe - demi, axe + demi);
        pointProj(xB + 80 * dir, H / 2);
        rectProj(droite ? xB : xB - 14, H / 2 - 33, 14, 66);
      }
      // Arcs de corner (quart de cercle r=10 tourné vers l'intérieur).
      cercleProj(m, m, 10, 0, Math.PI / 2);
      cercleProj(W - m, m, 10, Math.PI / 2, Math.PI);
      cercleProj(W - m, H - m, 10, Math.PI, Math.PI * 1.5);
      cercleProj(m, H - m, 10, Math.PI * 1.5, Math.PI * 2);
    } else {
      ligneProj([m, H - m, W - m, H - m]);
      cercleProj(W / 2, H - m, 80, Math.PI, Math.PI * 2);
      const gW = 300, gH = 110, bW = 150, bH = 44;
      ligneProj([W / 2 - gW / 2, m, W / 2 - gW / 2, m + gH, W / 2 + gW / 2, m + gH, W / 2 + gW / 2, m]);
      ligneProj([W / 2 - bW / 2, m, W / 2 - bW / 2, m + bH, W / 2 + bW / 2, m + bH, W / 2 + bW / 2, m]);
      cercleProj(W / 2, m + 80, 80, Math.asin(30 / 80), Math.PI - Math.asin(30 / 80));
      pointProj(W / 2, m + 80);
      rectProj(W / 2 - 33, m - 14, 66, 14);
    }
    layer.draw();
  }
}
