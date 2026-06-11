/**
 * Géométrie pure de l'éditeur de schéma : courbes (spline Konva), longueurs et
 * échantillonnage de trajectoires, test point-dans-polygone. Aucune dépendance à
 * Angular ni à Konva — fonctions pures, donc directement testables.
 */

// Tension de la spline Konva des tracés. DOIT rester identique côté rendu (Line/Arrow)
// et côté échantillonnage de trajectoire (cheminRendu), sinon le jeton ne suit pas la
// courbe dessinée.
export const TENSION_TRACE = 0.5;

export interface Point { x: number; y: number; }

/** Test point-dans-polygone (ray casting). `poly` = [x0,y0,x1,y1,…]. */
export function pointDansPolygone(x: number, y: number, poly: number[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) dedans = !dedans;
  }
  return dedans;
}

/**
 * Développe une polyligne en la courbe réellement rendue par Konva (Line/Arrow avec
 * tension), pour que l'animation suive la flèche dessinée et non les segments droits.
 * Réplique l'algorithme Konva : points de contrôle cardinaux → quadratique aux extrémités
 * + cubiques au milieu, échantillonnés en une polyligne dense.
 */
export function cheminRendu(pts: number[]): number[] {
  const len = pts.length;
  if (len <= 4) return pts;   // 2 points = ligne droite, pas de courbe
  const tp = pointsTension(pts, TENSION_TRACE);
  const PAS = 16;
  const out = [pts[0], pts[1]];
  // 1er segment : quadratique p0 → 1er point intérieur, contrôle tp[0..1]
  echQuad(out, pts[0], pts[1], tp[0], tp[1], tp[2], tp[3], PAS);
  // segments intérieurs : cubiques d'un point intérieur au suivant
  for (let n = 4; n < tp.length - 2; n += 6) {
    const x0 = out[out.length - 2], y0 = out[out.length - 1];
    echCubic(out, x0, y0, tp[n], tp[n + 1], tp[n + 2], tp[n + 3], tp[n + 4], tp[n + 5], PAS);
  }
  // dernier segment : quadratique → dernier point, contrôle tp[len-2..len-1]
  const x0 = out[out.length - 2], y0 = out[out.length - 1];
  echQuad(out, x0, y0, tp[tp.length - 2], tp[tp.length - 1], pts[len - 2], pts[len - 1], PAS);
  return out;
}

/** Points de contrôle de la spline cardinale (équivalent Konva Util._expandPoints). */
export function pointsTension(p: number[], t: number): number[] {
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
export function echQuad(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, pas: number): void {
  for (let i = 1; i <= pas; i++) {
    const s = i / pas, u = 1 - s;
    out.push(u * u * x0 + 2 * u * s * cx + s * s * x1, u * u * y0 + 2 * u * s * cy + s * s * y1);
  }
}

/** Échantillonne une courbe de Bézier cubique (hors point de départ déjà présent). */
export function echCubic(out: number[], x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, pas: number): void {
  for (let i = 1; i <= pas; i++) {
    const s = i / pas, u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    out.push(a * x0 + b * c1x + c * c2x + d * x1, a * y0 + b * c1y + c * c2y + d * y1);
  }
}

/** Longueur cumulée d'une polyligne [x0,y0,x1,y1,…]. */
export function longueurChemin(pts: number[]): number {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

/** Point à la fraction p (0→1) de la polyligne. */
export function pointLeLongDe(pts: number[], p: number): Point {
  if (pts.length < 4) return { x: pts[0], y: pts[1] };
  const cible = p * longueurChemin(pts);
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

/** Réduit la densité de points d'un tracé (1 point sur 2 paires conservé). */
export function simplifierPoints(points: number[]): number[] {
  if (points.length <= 6) return points;
  const resultat: number[] = [];
  for (let i = 0; i < points.length; i += 4) {
    resultat.push(points[i], points[i + 1]);
  }
  return resultat;
}
