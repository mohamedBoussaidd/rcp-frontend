import { Injectable } from '@angular/core';
import Konva from 'konva';

export type Terrain = 'complet' | 'demi';

/**
 * Dessine le terrain de foot (gazon rayé + lignes blanches translucides) sur une couche
 * Konva, en complet ou demi-terrain. Rendu pur : aucun état, on lui passe la couche et les
 * dimensions courantes.
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
}
