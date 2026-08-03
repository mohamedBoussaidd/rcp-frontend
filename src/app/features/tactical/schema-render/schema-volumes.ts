import Konva from 'konva';
import { enveloppeConvexe } from '../schema-editor/schema-geometrie';
import { Camera } from './schema-camera';

/**
 * VOLUMES projetés : la géométrie 3D partagée par le terrain (cages, drapeaux) et par le
 * matériel posé (buts, plots, jalons, haies, mannequins, cerceaux…).
 *
 * Jusqu'ici la seule vraie 3D du rendu était la cage du terrain, écrite en dur dans
 * schema-terrain.renderer ; tout le matériel était un dessin plat posé au point projeté,
 * d'où l'écart de qualité visible dès qu'on inclinait la vue — un cerceau restait un
 * anneau bien rond là où la perspective l'aurait écrasé.
 *
 * Le principe tient en une fonction : un objet est décrit dans SON repère
 * (u = largeur, v = profondeur, z = altitude), et un `Projeter` l'amène à l'écran. Deux
 * projecteurs suffisent alors à servir les deux mondes :
 *  · {@link projecteurEcran} — coordonnées écran absolues, pour la couche du terrain ;
 *  · {@link projecteurLocal} — coordonnées relatives au groupe Konva d'un élément, tel que
 *    l'éditeur et le lecteur le posent (au point projeté, à l'échelle de ce point).
 *
 * Convention d'orientation : `angle` en degrés, 0 = l'objet est vu de face, sa largeur
 * horizontale et sa profondeur vers le HAUT de l'écran — c'est exactement l'allure
 * qu'avait le mini-but dessiné à la main, donc les schémas déjà enregistrés gardent leur
 * orientation.
 */

const DEG = Math.PI / 180;

/** Cage réglementaire : 2,44 m de haut, ~2 m de profondeur de filet (unités terrain). */
export const CAGE_HAUTEUR = 24;
export const CAGE_PROFONDEUR = 18;

export interface PointProjete2D {
  x: number;
  y: number;
  /** Facteur de taille à cette profondeur (épaisseurs de trait). */
  echelle: number;
}

/** Projette un point du repère de l'objet (u, v, z) vers le plan de dessin. */
export type Projeter = (u: number, v: number, z: number) => PointProjete2D;

/** Point du repère de l'objet. */
export type P3 = [u: number, v: number, z: number];

/** Position monde d'un point de l'objet, avant projection. */
function monde(x: number, y: number, angle: number, u: number, v: number): { x: number; y: number } {
  const t = angle * DEG, cos = Math.cos(t), sin = Math.sin(t);
  // u suit l'orientation, v lui est perpendiculaire et part vers le haut de l'écran à 0°.
  return { x: x + u * cos + v * sin, y: y + u * sin - v * cos };
}

/** Projecteur en coordonnées ÉCRAN : le terrain dessine directement sur sa couche. */
export function projecteurEcran(cam: Camera, x: number, y: number, angle = 0): Projeter {
  return (u, v, z) => {
    const m = monde(x, y, angle, u, v);
    return cam.projeter(m.x, m.y, z);
  };
}

/**
 * Projecteur en coordonnées LOCALES d'un groupe Konva positionné au point projeté (x, y)
 * et mis à l'échelle de ce point — la façon dont l'éditeur et le lecteur posent tous
 * leurs éléments. On projette donc en monde puis on ramène dans le repère du groupe, ce
 * qui donne un vrai volume là où un dessin plat ne pouvait que le suggérer.
 */
export function projecteurLocal(cam: Camera, x: number, y: number, angle = 0): Projeter {
  const ancre = cam.projeter(x, y, 0), k = ancre.echelle || 1;
  return (u, v, z) => {
    const m = monde(x, y, angle, u, v);
    const p = cam.projeter(m.x, m.y, z);
    return { x: (p.x - ancre.x) / k, y: (p.y - ancre.y) / k, echelle: p.echelle / k };
  };
}

/**
 * Projecteur DÉGÉNÉRÉ, pour la vue de dessus (aucune caméra) : la profondeur et l'altitude
 * s'écrasent sur le plan. Les volumes restent donc dessinables sans condition, ils
 * s'aplatissent simplement — un objet vu de dessus EST plat.
 *
 * `raccourci` (< 1) simule l'écrasement d'un objet debout vu du dessus, `hauteurVersHaut`
 * remonte l'altitude à l'écran pour garder les objets debout lisibles à plat.
 */
export function projecteurPlat(angle = 0, hauteurVersHaut = 0): Projeter {
  const t = angle * DEG, cos = Math.cos(t), sin = Math.sin(t);
  return (u, v, z) => ({
    x: u * cos + v * sin,
    y: u * sin - v * cos - z * hauteurVersHaut,
    echelle: 1,
  });
}

// ══════════════════════ Primitives ══════════════════════

type Cible = Konva.Group | Konva.Layer;

// Les primitives ÉCOUTENT les événements : un but ou un plot doit rester attrapable à la
// souris. (Les avoir posées en `listening: false` rendait tout le matériel insélectionnable.)

/** Segment 3D projeté. */
export function trait(dest: Cible, p: Projeter, a: P3, b: P3,
                      w: number, couleur = '#F8FAFC', opacite = 1): void {
  const pa = p(...a), pb = p(...b);
  dest.add(new Konva.Line({
    points: [pa.x, pa.y, pb.x, pb.y], stroke: couleur, strokeWidth: w,
    opacity: opacite, lineCap: 'round',
    // Un montant de cage fait 3 px de large : sans zone d'accroche élargie, l'attraper
    // relèverait de l'adresse.
    hitStrokeWidth: Math.max(w, 10),
  }));
}

/** Face plane fermée, définie par ses sommets dans le repère de l'objet. */
export function face(dest: Cible, p: Projeter, coins: P3[], fill: string,
                     opacite = 1, stroke?: string, strokeWidth = 0): void {
  const pts: number[] = [];
  for (const c of coins) { const q = p(...c); pts.push(q.x, q.y); }
  dest.add(new Konva.Line({
    points: pts, closed: true, fill, opacity: opacite, stroke, strokeWidth,
  }));
}

/** Sommets d'un cercle horizontal (rayon r, altitude z) échantillonné en polygone. */
export function cercle(r: number, z = 0, segments = 24): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
}

/**
 * Disque posé au sol (coupelle, socle, ombre) : un cercle projeté n'est pas une ellipse
 * de Konva mais une conique, d'où l'échantillonnage.
 */
export function disqueSol(dest: Cible, p: Projeter, r: number, fill: string,
                          opacite = 1, z = 0): void {
  face(dest, p, cercle(r, z), fill, opacite);
}

/** Anneau posé au sol (cerceau) : deux cercles concentriques en contour épais. */
export function anneauSol(dest: Cible, p: Projeter, r: number, epaisseur: number,
                          couleur: string, z = 0): void {
  const pts: number[] = [];
  for (const c of cercle(r, z, 28)) { const q = p(...c); pts.push(q.x, q.y); }
  dest.add(new Konva.Line({
    points: pts, closed: true, stroke: couleur, strokeWidth: epaisseur,
    hitStrokeWidth: Math.max(epaisseur, 12),
  }));
}

/**
 * Emprise au sol servant à la fois d'ombre et de ZONE D'ACCROCHE : un volume n'est fait que
 * de traits fins et de filets ajourés, on ne peut pas demander de viser un montant de cage
 * pour déplacer un but.
 */
export function semelle(dest: Cible, p: Projeter, r: number, aplatissement = 1): void {
  const pts: P3[] = cercle(r, 0, 20).map(([u, v]) => [u, v * aplatissement, 0] as P3);
  face(dest, p, pts, '#000', 0.16);
}

/**
 * Cône debout (plot). Rendu par SILHOUETTE plutôt que par facettes : l'enveloppe convexe
 * de l'apex et de la base projetée donne le contour exact sous n'importe quel angle, en
 * deux nœuds Konva au lieu d'une vingtaine — un exercice peut compter trente plots.
 * Le volume vient du dégradé (l'apex capte la lumière, l'assise reste dans l'ombre).
 */
export function cone(dest: Cible, p: Projeter, r: number, h: number,
                     clair: string, sombre: string): void {
  disqueSol(dest, p, r, sombre);
  const bruts: number[] = [];
  for (const c of cercle(r, 0, 16)) { const q = p(...c); bruts.push(q.x, q.y); }
  const apex = p(0, 0, h);
  bruts.push(apex.x, apex.y);
  const sil = enveloppeConvexe(bruts);
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 1; i < sil.length; i += 2) { yMin = Math.min(yMin, sil[i]); yMax = Math.max(yMax, sil[i]); }
  dest.add(new Konva.Line({
    points: sil, closed: true,
    fillLinearGradientStartPoint: { x: 0, y: yMin },
    fillLinearGradientEndPoint: { x: 0, y: yMax },
    fillLinearGradientColorStops: [0, clair, 1, sombre],
  }));
}

/** Tige verticale (jalon, hampe) posée en (u, v). */
export function tige(dest: Cible, p: Projeter, u: number, v: number, h: number,
                     w: number, couleur: string): void {
  trait(dest, p, [u, v, 0], [u, v, h], w, couleur);
}

/** Parallélépipède debout, décrit par son emprise au sol et ses altitudes. */
export function boite(dest: Cible, p: Projeter, du: number, dv: number, z0: number, z1: number,
                      dessus: string, avant: string, cote: string): void {
  face(dest, p, [[-du, -dv, z1], [du, -dv, z1], [du, dv, z1], [-du, dv, z1]], dessus);
  face(dest, p, [[-du, -dv, z0], [du, -dv, z0], [du, -dv, z1], [-du, -dv, z1]], avant);
  face(dest, p, [[du, -dv, z0], [du, dv, z0], [du, dv, z1], [du, -dv, z1]], cote);
  face(dest, p, [[-du, -dv, z0], [-du, dv, z0], [-du, dv, z1], [-du, -dv, z1]], cote);
}

// ══════════════════════ Cage ══════════════════════

export interface OptionsCage {
  /** Demi-largeur (la cage va de −demi à +demi le long de u). */
  demi: number;
  hauteur: number;
  profondeur: number;
  /** Pas du maillage du filet. */
  maille?: number;
  couleur?: string;
}

/**
 * Cage en volume : montants, barre, retour de filet et maillage.
 *
 * Extraite du renderer de terrain, où elle était écrite en dur pour les seules cages des
 * marquages. C'est la même géométrie qui sert désormais au mini-but et au but mobile —
 * un but posé sur le terrain a exactement la qualité de la cage du terrain.
 */
export function dessinerCage(dest: Cible, p: Projeter, o: OptionsCage): void {
  const L = o.demi, Ht = o.hauteur, Pf = o.profondeur;
  const MAILLE = o.maille ?? 9, blanc = o.couleur ?? '#F8FAFC';
  const t = (a: P3, b: P3, w: number, op = 1) => trait(dest, p, a, b, w, blanc, op);
  const panneau = (coins: P3[]) => face(dest, p, coins, '#E2E8F0', 0.12);

  // Filet : voile translucide (le « fond » de la cage) puis maillage.
  panneau([[-L, Pf, 0], [L, Pf, 0], [L, Pf, Ht], [-L, Pf, Ht]]);
  panneau([[-L, 0, 0], [-L, Pf, 0], [-L, Pf, Ht], [-L, 0, Ht]]);
  panneau([[L, 0, 0], [L, Pf, 0], [L, Pf, Ht], [L, 0, Ht]]);
  for (let u = -L; u <= L + 0.01; u += MAILLE) {
    t([u, Pf, 0], [u, Pf, Ht], 0.6, 0.5);
    t([u, 0, Ht], [u, Pf, Ht], 0.6, 0.4);
  }
  for (let z = 0; z <= Ht + 0.01; z += MAILLE) {
    t([-L, Pf, z], [L, Pf, z], 0.6, 0.5);
    t([-L, 0, z], [-L, Pf, z], 0.6, 0.4);
    t([L, 0, z], [L, Pf, z], 0.6, 0.4);
  }
  for (let v = 0; v <= Pf + 0.01; v += MAILLE) {
    t([-L, v, 0], [-L, v, Ht], 0.6, 0.4);
    t([L, v, 0], [L, v, Ht], 0.6, 0.4);
    t([-L, v, Ht], [L, v, Ht], 0.6, 0.35);
  }
  // Structure : cadre arrière plus fin, montants et barre du premier plan bien marqués.
  t([-L, Pf, 0], [-L, Pf, Ht], 1.6, 0.85);
  t([L, Pf, 0], [L, Pf, Ht], 1.6, 0.85);
  t([-L, Pf, Ht], [L, Pf, Ht], 1.6, 0.85);
  t([-L, 0, Ht], [-L, Pf, Ht], 1.6, 0.85);
  t([L, 0, Ht], [L, Pf, Ht], 1.6, 0.85);
  t([-L, 0, 0], [-L, Pf, 0], 1.4, 0.7);
  t([L, 0, 0], [L, Pf, 0], 1.4, 0.7);
  t([-L, 0, 0], [-L, 0, Ht], 3.2);
  t([L, 0, 0], [L, 0, Ht], 3.2);
  t([-L, 0, Ht], [L, 0, Ht], 3.2);
}

/**
 * Orientation d'une cage de MARQUAGE (décrite par un axe et un sens de débord) dans la
 * convention d'angle de ce module. La cage étant symétrique le long de u, seul le sens de
 * la profondeur compte réellement.
 */
export function angleCage(axe: 'x' | 'y', sens: 1 | -1): number {
  if (axe === 'x') return sens < 0 ? -90 : 90;
  return sens < 0 ? 0 : 180;
}
