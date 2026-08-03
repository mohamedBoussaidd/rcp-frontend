import Konva from 'konva';
import { Point, enveloppeConvexe } from '../schema-editor/schema-geometrie';

/**
 * GROUPES TACTIQUES : géométrie et rendu, partagés par l'éditeur et le lecteur.
 *
 * Un groupe ne stocke que la LISTE DE SES MEMBRES. Sa forme est déduite de leurs positions
 * à l'instant considéré et recalculée à chaque image : c'est ainsi qu'un bloc se déforme
 * pendant l'animation, et qu'aucune forme enregistrée ne peut se désynchroniser des jetons.
 *
 * Tout est en coordonnées TERRAIN jusqu'au dernier moment (la projection est fournie par
 * l'appelant), de sorte que les distances en mètres restent justes quel que soit l'angle
 * de caméra : mesurer sur des coordonnées d'écran donnerait des mètres faux en perspective.
 */

export type ModeForme = 'segment' | 'bande' | 'polygone';

export interface FormeGroupe {
  /** Contour en coordonnées terrain [x0,y0,x1,y1,…]. */
  contour: number[];
  mode: ModeForme;
  /** Les deux extrémités de l'axe principal (segment et bande). */
  axe: [Point, Point];
  /**
   * TOUS les membres, ordonnés le long de l'axe principal — la chaîne de la ligne.
   * C'est elle que suit une bande : relier seulement les deux extrémités sauterait les
   * joueurs du milieu, et une ligne défensive dont les latéraux sont avancés doit se lire
   * en U, pas en trait droit.
   */
  chaine: Point[];
}

/** Distance d'un point à la droite (a, b). */
function distanceDroite(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  return L < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y)
    : Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / L;
}

/** Les deux points les plus éloignés d'un nuage : l'axe naturel d'une ligne de joueurs. */
function diametre(pts: Point[]): [Point, Point] {
  let a = pts[0], b = pts[1] ?? pts[0], max = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d > max) { max = d; a = pts[i]; b = pts[j]; }
    }
  }
  return [a, b];
}

/**
 * Forme d'un groupe à partir des positions de ses membres.
 *
 * Le piège que ça traite : quatre joueurs quasi alignés (une ligne défensive, le cas le
 * plus fréquent !) donnent une enveloppe convexe aplatie, illisible et visuellement fausse.
 * Dès que l'épaisseur du nuage passe sous `epaisseurMin`, on bascule donc en BANDE, tracée
 * le long de l'axe principal.
 */
export function formeGroupe(positions: Point[], epaisseurMin: number): FormeGroupe {
  const axe = diametre(positions);
  const chaine = ordonnerSurAxe(positions, axe[0], axe[1]);
  const plat = (mode: ModeForme): FormeGroupe => ({
    contour: [axe[0].x, axe[0].y, axe[1].x, axe[1].y], mode, axe, chaine,
  });
  if (positions.length === 2) return plat('segment');

  const brut: number[] = [];
  for (const p of positions) brut.push(p.x, p.y);
  const contour = enveloppeConvexe(brut);
  const n = contour.length / 2;
  if (n < 3) return plat('bande');

  // Largeur minimale d'un convexe = la plus petite des hauteurs prises sur ses arêtes.
  const som: Point[] = [];
  for (let i = 0; i < contour.length; i += 2) som.push({ x: contour[i], y: contour[i + 1] });
  let largeurMin = Infinity;
  for (let i = 0; i < som.length; i++) {
    const a = som[i], b = som[(i + 1) % som.length];
    let h = 0;
    for (const s of som) h = Math.max(h, distanceDroite(s, a, b));
    largeurMin = Math.min(largeurMin, h);
  }
  return largeurMin < epaisseurMin ? plat('bande') : { contour, mode: 'polygone', axe, chaine };
}

/** Membres triés selon leur avancement le long de l'axe (a → b). */
function ordonnerSurAxe(pts: Point[], a: Point, b: Point): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const abscisse = (p: Point) => (p.x - a.x) * dx + (p.y - a.y) * dy;
  return [...pts].sort((p, q) => abscisse(p) - abscisse(q));
}

/**
 * Segments à coter et à relier : le périmètre pour un bloc, la CHAÎNE pour une ligne.
 * Sur une ligne, coter les voisins successifs donne l'écartement entre joueurs — la
 * mesure qu'un entraîneur cherche réellement.
 */
export function aretesGroupe(f: FormeGroupe): [Point, Point][] {
  if (f.mode !== 'polygone') {
    return f.chaine.slice(0, -1).map((p, i) => [p, f.chaine[i + 1]] as [Point, Point]);
  }
  const pts: Point[] = [];
  for (let i = 0; i < f.contour.length; i += 2) pts.push({ x: f.contour[i], y: f.contour[i + 1] });
  if (pts.length < 2) return [];
  if (pts.length === 2) return [[pts[0], pts[1]]];
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as [Point, Point]);
}

/** Toutes les paires de membres — le rendu « liaisons » avec diagonales. */
export function pairesGroupe(pts: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) out.push([pts[i], pts[j]]);
  }
  return out;
}

// ══════════════════════ Rendu ══════════════════════

/** Sous-ensemble d'un groupe nécessaire au rendu (cf. `SchemaGroupe`). */
export interface GroupeRendu {
  id: string;
  nom?: string;
  membres: string[];
  couleur?: string;
  rendu?: string;
  diagonales?: boolean;
  cotes?: boolean;
  encombrement?: boolean;
  masque?: boolean;
}

export interface OptionsGroupes {
  /** Position TERRAIN d'un membre, ou `undefined` s'il n'est pas en scène à cet instant. */
  position: (id: string) => Point | undefined;
  /** Projection terrain → écran (identité en vue de dessus). */
  projeter: (pts: number[]) => number[];
  /** Conversion des distances : pixels terrain par mètre. */
  pxParMetre: number;
  /** Opacité du groupe (fenêtre d'apparition, estompage d'édition) ; 0 = non dessiné. */
  opacite?: (id: string) => number;
}

export const COULEUR_GROUPE = '#38bdf8';

/** En dessous de 2 m d'épaisseur, un groupe est lu comme une ligne et non comme un bloc. */
const EPAISSEUR_BANDE_M = 2;

/**
 * (Re)dessine TOUS les groupes dans `dest`, entièrement reconstruits à chaque appel.
 * Reconstruire plutôt que muter est ici le choix le plus sûr : les positions changent à
 * chaque image et un groupe n'a aucun état propre à préserver.
 */
export function dessinerGroupes(dest: Konva.Group, groupes: readonly GroupeRendu[],
                                o: OptionsGroupes): void {
  dest.destroyChildren();
  for (const g of groupes) {
    if (g.masque) continue;
    const op = o.opacite ? o.opacite(g.id) : 1;
    if (op <= 0.01) continue;
    // Seuls les membres EN SCÈNE comptent : un groupe dont les jetons n'apparaissent qu'à
    // 4 s ne doit pas dessiner un contour dans le vide avant eux.
    const pts = g.membres.map(o.position).filter((p): p is Point => !!p);
    if (pts.length < 2) continue;
    dessinerUnGroupe(dest, g, pts, o, op);
  }
}

function dessinerUnGroupe(dest: Konva.Group, g: GroupeRendu, pts: Point[],
                          o: OptionsGroupes, opacite: number): void {
  const couleur = g.couleur || COULEUR_GROUPE;
  const f = formeGroupe(pts, EPAISSEUR_BANDE_M * o.pxParMetre);
  const mode = g.rendu ?? 'contour';
  const proj = (p: Point[]): number[] => {
    const plats: number[] = [];
    for (const q of p) plats.push(q.x, q.y);
    return o.projeter(plats);
  };
  const grp = new Konva.Group({ opacity: opacite, listening: false });
  dest.add(grp);

  if (mode === 'liaisons') {
    const liens = g.diagonales ? pairesGroupe(pts) : aretesGroupe(f);
    for (const [a, b] of liens) {
      grp.add(new Konva.Line({ points: proj([a, b]), stroke: couleur, strokeWidth: 2, opacity: 0.85 }));
    }
  } else if (mode === 'bande' || f.mode !== 'polygone') {
    // Bande : ruban qui suit la CHAÎNE des joueurs, pas un segment entre les deux extrêmes.
    // Latéraux avancés = la bande se plie en U et passe par tout le monde.
    if (mode !== 'aucun') {
      const trace = proj(f.chaine);
      grp.add(new Konva.Line({
        points: trace, stroke: couleur, strokeWidth: 17, opacity: 0.25,
        lineCap: 'round', lineJoin: 'round',
      }));
      grp.add(new Konva.Line({
        points: trace, stroke: couleur, strokeWidth: 2, opacity: 0.9,
        lineCap: 'round', lineJoin: 'round',
      }));
    }
  } else if (mode !== 'aucun') {
    // Contour : le remplissage reste très discret — un groupe souligne une organisation, il
    // ne doit masquer ni le gazon ni les flèches qui passent dessous.
    grp.add(new Konva.Line({
      points: o.projeter(f.contour), closed: true,
      stroke: couleur, strokeWidth: 2.5, fill: `${couleur}22`,
    }));
  }

  if (g.cotes) {
    for (const [a, b] of aretesGroupe(f)) cote(grp, a, b, couleur, o);
  }
  if (g.encombrement) encombrement(grp, pts, couleur, o);
  if (g.nom) etiquetteNom(grp, g.nom, pts, couleur, o);
}

/** Étiquette de distance au milieu d'une arête. */
function cote(grp: Konva.Group, a: Point, b: Point, couleur: string, o: OptionsGroupes): void {
  const d = Math.hypot(b.x - a.x, b.y - a.y) / o.pxParMetre;
  if (d < 0.5) return;
  const m = o.projeter([(a.x + b.x) / 2, (a.y + b.y) / 2]);
  pastille(grp, `${d.toFixed(d < 10 ? 1 : 0)} m`, m[0], m[1], couleur, 10);
}

/**
 * Encombrement du bloc, mesuré sur les AXES DU TERRAIN et non sur l'axe principal du nuage :
 * « 32 × 14 m » se lit tout de suite sur un terrain, une mesure oblique non.
 */
function encombrement(grp: Konva.Group, pts: Point[], couleur: string, o: OptionsGroupes): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const L = (x1 - x0) / o.pxParMetre, P = (y1 - y0) / o.pxParMetre;
  const c = o.projeter([(x0 + x1) / 2, (y0 + y1) / 2]);
  pastille(grp, `${L.toFixed(0)} × ${P.toFixed(0)} m`, c[0], c[1], couleur, 11);
}

/** Nom du groupe, posé au-dessus du bloc. */
function etiquetteNom(grp: Konva.Group, nom: string, pts: Point[], couleur: string,
                      o: OptionsGroupes): void {
  let x = 0, yMin = Infinity;
  for (const p of pts) { x += p.x; yMin = Math.min(yMin, p.y); }
  const p = o.projeter([x / pts.length, yMin]);
  pastille(grp, nom, p[0], p[1] - 26, couleur, 11, true);
}

/** Petite étiquette lisible sur gazon : fond sombre, texte à la couleur du groupe. */
function pastille(grp: Konva.Group, texte: string, x: number, y: number, couleur: string,
                  taille: number, gras = false): void {
  const t = new Konva.Text({
    text: texte, fontSize: taille, fontStyle: gras ? 'bold' : 'normal', fill: couleur, wrap: 'none',
  });
  const w = t.width() + 8, h = taille + 6;
  t.position({ x: x - w / 2 + 4, y: y - h / 2 + 3 });
  grp.add(new Konva.Rect({
    x: x - w / 2, y: y - h / 2, width: w, height: h, cornerRadius: 4,
    fill: '#0f172a', opacity: 0.72, stroke: couleur, strokeWidth: 1,
  }));
  grp.add(t);
}
