import { Injectable } from '@angular/core';
import Konva from 'konva';
import { Camera, CAMERA_PRESENTATION } from '../schema-render/schema-camera';
import { MARGE, Marquage, Terrain, marquages } from './schema-espaces';

export type { Terrain } from './schema-espaces';

// ── Volumes du rendu incliné (unités terrain : 1040 px ≈ 105 m, soit ~9,9 px/m) ──
/** Épaisseur de la plaque de pelouse. */
const EPAISSEUR_DALLE = 22;
const TERRE_CLAIRE = '#4B3728';
const TERRE_SOMBRE = '#33241A';
/** Cage réglementaire : 2,44 m de haut, ~2 m de profondeur de filet. */
const CAGE_HAUTEUR = 24;
const CAGE_PROFONDEUR = 18;
const DRAPEAU_HAUTEUR = 26;
/** Échantillonnage des arcs : un cercle projeté devient une conique, approchée en polyligne. */
const SEGMENTS_ARC = 48;

/**
 * Dessine l'espace de jeu (gazon rayé + marquages) sur une couche Konva. Rendu pur : aucun
 * état, on lui passe la couche et les dimensions courantes.
 *
 * Les marquages viennent d'une description unique (cf. schema-espaces.ts) consommée par les
 * deux modes : vue de dessus (édition) et vue par caméra (présentation, vue inclinée).
 */
@Injectable({ providedIn: 'root' })
export class SchemaTerrainRenderer {

  private static readonly BLANC = 'rgba(255,255,255,0.85)';

  /** (Re)dessine entièrement l'espace sur `layer`, en vue de dessus. */
  dessiner(layer: Konva.Layer, terrain: Terrain, W: number, H: number): void {
    layer.destroyChildren();
    this.gazon(layer, W, H);
    for (const t of marquages(terrain, W, H)) this.marquagePlat(layer, t);
    layer.draw();
  }

  /**
   * Même espace vu par une caméra. S'y ajoutent les volumes que la vue de dessus ne peut
   * pas montrer — épaisseur de la pelouse, cages, drapeaux — dessinés en 3D puis projetés.
   */
  dessinerPerspective(layer: Konva.Layer, terrain: Terrain, W: number, H: number,
                      cam: Camera = new Camera(W, H, CAMERA_PRESENTATION)): void {
    layer.destroyChildren();
    // Fond sombre : contraste sous la dalle et ambiance présentation.
    layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#0B1220' }));
    this.dalle(layer, cam, W, H);
    this.gazon(layer, W, H, cam);
    for (const t of marquages(terrain, W, H)) this.marquageProjete(layer, cam, t);
    layer.draw();
  }

  // ══════════════════════ Gazon ══════════════════════

  /** Bandes de tonte. Projetées, chaque bande reste un quadrilatère (plan → plan). */
  private gazon(layer: Konva.Layer, W: number, H: number, cam?: Camera): void {
    const bande = 104;
    for (let x = 0, i = 0; x < W; x += bande, i++) {
      const fill = i % 2 ? '#0F7E43' : '#118A4A';
      const x1 = Math.min(x + bande, W);
      if (!cam) {
        layer.add(new Konva.Rect({ x, y: 0, width: x1 - x, height: H, fill }));
        continue;
      }
      const c1 = cam.projeter(x, 0), c2 = cam.projeter(x1, 0), c3 = cam.projeter(x1, H), c4 = cam.projeter(x, H);
      layer.add(new Konva.Line({
        points: [c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y], closed: true, fill,
      }));
    }
  }

  // ══════════════════════ Marquages ══════════════════════

  /** Points d'un arc, échantillonnés au sol (l'appelant projette ou non). */
  private pointsArc(t: Extract<Marquage, { k: 'arc' }>): number[] {
    const a0 = t.a0 ?? 0, a1 = t.a1 ?? Math.PI * 2, pts: number[] = [];
    for (let i = 0; i <= SEGMENTS_ARC; i++) {
      const a = a0 + (a1 - a0) * (i / SEGMENTS_ARC);
      pts.push(t.cx + t.r * Math.cos(a), t.cy + t.r * Math.sin(a));
    }
    return pts;
  }

  private marquagePlat(layer: Konva.Layer, t: Marquage): void {
    const blanc = SchemaTerrainRenderer.BLANC;
    const ligne = (pts: number[], ferme = false) =>
      layer.add(new Konva.Line({ points: pts, closed: ferme, stroke: blanc, strokeWidth: 2.5 }));
    if (t.k === 'poly') ligne(t.pts, t.ferme);
    else if (t.k === 'arc') ligne(this.pointsArc(t));
    else if (t.k === 'point') layer.add(new Konva.Circle({ x: t.x, y: t.y, radius: 3, fill: blanc }));
    else if (t.k === 'cage') {
      // En vue de dessus, la cage se réduit à son emprise au sol, en débord de la ligne.
      const p = 14, d = t.demi;
      const [x, y, w, h] = t.axe === 'x'
        ? [t.sens < 0 ? t.x - p : t.x, t.y - d, p, d * 2]
        : [t.x - d, t.sens < 0 ? t.y - p : t.y, d * 2, p];
      layer.add(new Konva.Rect({ x, y, width: w, height: h, stroke: blanc, strokeWidth: 2.5 }));
    }
    // 'drapeau' : volume sans emprise au sol, rien à dessiner à plat.
  }

  private marquageProjete(layer: Konva.Layer, cam: Camera, t: Marquage): void {
    const blanc = SchemaTerrainRenderer.BLANC;
    const ligne = (pts: number[], ferme = false) =>
      layer.add(new Konva.Line({ points: cam.projeterPolyligne(pts), closed: ferme, stroke: blanc, strokeWidth: 2.2 }));
    if (t.k === 'poly') ligne(t.pts, t.ferme);
    else if (t.k === 'arc') ligne(this.pointsArc(t));
    else if (t.k === 'point') {
      const p = cam.projeter(t.x, t.y);
      layer.add(new Konva.Circle({ x: p.x, y: p.y, radius: 3 * p.echelle, fill: blanc }));
    } else if (t.k === 'cage') this.cage(layer, cam, t);
    else if (t.k === 'drapeau') this.drapeau(layer, cam, t.x, t.y);
  }

  // ══════════════════════ Volumes ══════════════════════

  /**
   * Épaisseur de la pelouse : le terrain est une plaque posée. On extrude les quatre bords
   * vers le bas et on ne peint que les faces tournées VERS la caméra — sans cette
   * élimination des faces arrière, la plaque paraîtrait transparente.
   */
  private dalle(layer: Konva.Layer, cam: Camera, W: number, H: number): void {
    const e = EPAISSEUR_DALLE, oeil = cam.positionMonde();
    const face = (pts: [number, number][], fill: string) => {
      const plat: number[] = [];
      for (const [x, y] of pts) { const p = cam.projeter(x, y, 0); plat.push(p.x, p.y); }
      for (const [x, y] of [...pts].reverse()) { const p = cam.projeter(x, y, -e); plat.push(p.x, p.y); }
      layer.add(new Konva.Line({ points: plat, closed: true, fill }));
    };
    // Les faces perpendiculaires à Y prennent la teinte la plus claire (elles captent le
    // jour rasant), celles perpendiculaires à X restent dans l'ombre.
    if (oeil.y > H) face([[0, H], [W, H]], TERRE_CLAIRE);
    if (oeil.y < 0) face([[W, 0], [0, 0]], TERRE_CLAIRE);
    if (oeil.x > W) face([[W, H], [W, 0]], TERRE_SOMBRE);
    if (oeil.x < 0) face([[0, 0], [0, H]], TERRE_SOMBRE);
  }

  /**
   * Cage en volume : montants, barre, retour de filet et maillage. Repère local
   * (u le long de la ligne de but, v vers l'extérieur, z l'altitude) projeté vers le
   * monde selon l'axe de la ligne de but et le sens du débord.
   */
  private cage(layer: Konva.Layer, cam: Camera, c: Extract<Marquage, { k: 'cage' }>): void {
    const L = c.demi, Ht = CAGE_HAUTEUR * (c.demi < 30 ? 0.8 : 1), Pf = CAGE_PROFONDEUR;
    const p = (u: number, v: number, z: number) => c.axe === 'x'
      ? cam.projeter(c.x + v * c.sens, c.y + u, z)
      : cam.projeter(c.x + u, c.y + v * c.sens, z);
    const trait = (a: [number, number, number], b: [number, number, number], w: number, op = 1) => {
      const pa = p(...a), pb = p(...b);
      layer.add(new Konva.Line({ points: [pa.x, pa.y, pb.x, pb.y], stroke: '#F8FAFC', strokeWidth: w, opacity: op, lineCap: 'round' }));
    };
    const panneau = (coins: [number, number, number][]) => {
      const plat: number[] = [];
      for (const q of coins) { const r = p(...q); plat.push(r.x, r.y); }
      layer.add(new Konva.Line({ points: plat, closed: true, fill: '#E2E8F0', opacity: 0.12 }));
    };

    // Filet : voile translucide (le « fond » de la cage) puis maillage.
    panneau([[-L, Pf, 0], [L, Pf, 0], [L, Pf, Ht], [-L, Pf, Ht]]);
    panneau([[-L, 0, 0], [-L, Pf, 0], [-L, Pf, Ht], [-L, 0, Ht]]);
    panneau([[L, 0, 0], [L, Pf, 0], [L, Pf, Ht], [L, 0, Ht]]);
    const MAILLE = 9;
    for (let u = -L; u <= L + 0.01; u += MAILLE) {
      trait([u, Pf, 0], [u, Pf, Ht], 0.6, 0.5);
      trait([u, 0, Ht], [u, Pf, Ht], 0.6, 0.4);
    }
    for (let z = 0; z <= Ht + 0.01; z += MAILLE) {
      trait([-L, Pf, z], [L, Pf, z], 0.6, 0.5);
      trait([-L, 0, z], [-L, Pf, z], 0.6, 0.4);
      trait([L, 0, z], [L, Pf, z], 0.6, 0.4);
    }
    for (let v = 0; v <= Pf + 0.01; v += MAILLE) {
      trait([-L, v, 0], [-L, v, Ht], 0.6, 0.4);
      trait([L, v, 0], [L, v, Ht], 0.6, 0.4);
      trait([-L, v, Ht], [L, v, Ht], 0.6, 0.35);
    }
    // Structure : cadre arrière plus fin, montants et barre du premier plan bien marqués.
    trait([-L, Pf, 0], [-L, Pf, Ht], 1.6, 0.85);
    trait([L, Pf, 0], [L, Pf, Ht], 1.6, 0.85);
    trait([-L, Pf, Ht], [L, Pf, Ht], 1.6, 0.85);
    trait([-L, 0, Ht], [-L, Pf, Ht], 1.6, 0.85);
    trait([L, 0, Ht], [L, Pf, Ht], 1.6, 0.85);
    trait([-L, 0, 0], [-L, Pf, 0], 1.4, 0.7);
    trait([L, 0, 0], [L, Pf, 0], 1.4, 0.7);
    trait([-L, 0, 0], [-L, 0, Ht], 3.2);
    trait([L, 0, 0], [L, 0, Ht], 3.2);
    trait([-L, 0, Ht], [L, 0, Ht], 3.2);
  }

  /** Drapeau de corner : hampe + fanion, posé sur le point de corner. */
  private drapeau(layer: Konva.Layer, cam: Camera, x: number, y: number): void {
    const pied = cam.projeter(x, y, 0), tete = cam.projeter(x, y, DRAPEAU_HAUTEUR);
    layer.add(new Konva.Line({ points: [pied.x, pied.y, tete.x, tete.y], stroke: '#E2E8F0', strokeWidth: 1.8, lineCap: 'round' }));
    const c = 9 * tete.echelle;
    layer.add(new Konva.Line({
      points: [tete.x, tete.y, tete.x + c, tete.y + c * 0.45, tete.x, tete.y + c * 0.8],
      closed: true, fill: '#EF4444',
    }));
  }
}

export { MARGE };
