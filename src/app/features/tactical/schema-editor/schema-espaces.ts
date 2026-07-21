/**
 * Espaces de jeu disponibles dans l'éditeur, et DESCRIPTION GÉOMÉTRIQUE de leurs marquages.
 *
 * Les tracés sont décrits une seule fois, sous forme de primitives neutres, puis consommés
 * par les deux rendus (vue de dessus et vue inclinée — cf. schema-terrain.renderer.ts).
 * Avant, chaque marquage était écrit deux fois : ajouter un espace coûtait deux blocs de
 * dessin à garder synchronisés.
 *
 * Toutes les coordonnées sont en pixels terrain, origine en haut à gauche.
 */

export type Terrain = 'complet' | 'demi' | 'demi_large' | 'quart' | 'tiers' | 'zone';

/** Marge entre le bord du canvas et la ligne de touche. */
export const MARGE = 24;

export interface EspaceTerrain {
  cle: Terrain;
  libelle: string;
  /** Précision affichée sous la vignette du sélecteur. */
  detail: string;
  W: number;
  H: number;
  /** Longueur réelle (m) représentée par la LARGEUR du rendu (conversion km/h → px/s). */
  metres: number;
}

/**
 * `complet` et `demi` gardent EXACTEMENT leurs dimensions historiques : les schémas déjà
 * enregistrés sont en coordonnées absolues, les changer les déformerait.
 */
export const ESPACES: readonly EspaceTerrain[] = [
  { cle: 'complet', libelle: 'Terrain complet', detail: '105 × 68 m', W: 1040, H: 680, metres: 105 },
  { cle: 'demi', libelle: 'Demi-terrain', detail: 'cage en haut', W: 600, H: 680, metres: 52.5 },
  { cle: 'demi_large', libelle: 'Demi-terrain', detail: 'cage à gauche', W: 520, H: 680, metres: 52.5 },
  { cle: 'tiers', libelle: 'Tiers de terrain', detail: 'zone de finition', W: 360, H: 680, metres: 36 },
  { cle: 'quart', libelle: 'Quart de terrain', detail: 'jeu réduit, petits buts', W: 520, H: 340, metres: 52.5 },
  { cle: 'zone', libelle: 'Zone libre', detail: '40 × 40 m, sans marquage', W: 600, H: 600, metres: 40 },
];

const PAR_CLE = new Map(ESPACES.map(e => [e.cle, e]));

/** Espace correspondant à une clé, avec repli sur le terrain complet (valeur inconnue en base). */
export function espace(cle: string | undefined | null): EspaceTerrain {
  return PAR_CLE.get(cle as Terrain) ?? ESPACES[0];
}

export function estTerrain(v: unknown): v is Terrain {
  return typeof v === 'string' && PAR_CLE.has(v as Terrain);
}

// ══════════════════════ Primitives de marquage ══════════════════════

export type Marquage =
  /** Polyligne au sol (lignes droites, rectangles de surface…). */
  | { k: 'poly'; pts: number[]; ferme?: boolean }
  /** Arc de cercle au sol, angles en radians (cercle entier par défaut). */
  | { k: 'arc'; cx: number; cy: number; r: number; a0?: number; a1?: number }
  /** Pastille pleine (point central, points de penalty). */
  | { k: 'point'; x: number; y: number }
  /** Cage : volume en vue inclinée, simple rectangle en débord en vue de dessus. */
  | { k: 'cage'; x: number; y: number; axe: 'x' | 'y'; sens: 1 | -1; demi: number }
  /** Drapeau de corner (ignoré en vue de dessus). */
  | { k: 'drapeau'; x: number; y: number };

// ══════════════════════ Vignettes du sélecteur ══════════════════════

export interface FormeApercu {
  /** Polyligne « x,y x,y … » prête pour l'attribut `points` d'un <polyline>. */
  points?: string;
  cercle?: { cx: number; cy: number; r: number };
}

/**
 * Aperçu d'un espace pour le sélecteur, dérivé des MÊMES marquages que le rendu réel :
 * une vignette ne peut donc pas montrer autre chose que ce qu'on obtiendra à l'écran.
 */
export function apercuEspace(cle: Terrain): { W: number; H: number; formes: FormeApercu[] } {
  const e = espace(cle), formes: FormeApercu[] = [];
  const poly = (pts: number[], ferme = false) => {
    const p = [...pts];
    if (ferme && p.length >= 2) p.push(p[0], p[1]);
    formes.push({ points: p.reduce<string[]>((acc, v, i) => (i % 2 ? acc : [...acc, `${v},${p[i + 1]}`]), []).join(' ') });
  };
  for (const t of marquages(cle, e.W, e.H)) {
    if (t.k === 'poly') poly(t.pts, t.ferme);
    else if (t.k === 'arc') {
      const a0 = t.a0 ?? 0, a1 = t.a1 ?? Math.PI * 2, pts: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = a0 + (a1 - a0) * (i / 24);
        pts.push(Math.round(t.cx + t.r * Math.cos(a)), Math.round(t.cy + t.r * Math.sin(a)));
      }
      poly(pts);
    } else if (t.k === 'point') formes.push({ cercle: { cx: t.x, cy: t.y, r: 4 } });
    else if (t.k === 'cage') {
      const p = 14, d = t.demi;
      const [x, y, w, h] = t.axe === 'x'
        ? [t.sens < 0 ? t.x - p : t.x, t.y - d, p, d * 2]
        : [t.x - d, t.sens < 0 ? t.y - p : t.y, d * 2, p];
      poly([x, y, x + w, y, x + w, y + h, x, y + h], true);
    }
  }
  return { W: e.W, H: e.H, formes };
}

/** Demi-largeur d'une cage réglementaire (7,32 m à ~9,9 px/m). */
export const CAGE_DEMI = 36;
/** Cage de jeu réduit (~5 m). */
export const CAGE_DEMI_PETITE = 25;

const R_ROND = 80;          // rayon du rond central et de l'arc de « D »
const SURF_L = 110;         // profondeur de la surface de réparation
const SURF_H = 300;         // largeur de la surface de réparation
const PETITE_L = 44;
const PETITE_H = 150;
const PENALTY = 80;
const R_CORNER = 10;

/**
 * Surface de réparation adossée à une ligne de but VERTICALE (à gauche ou à droite),
 * avec sa petite surface, son point de penalty et l'arc de « D ».
 */
function surfaceVerticale(out: Marquage[], xBord: number, H: number, dir: 1 | -1,
                          sL = SURF_L, sH = SURF_H, pL = PETITE_L, pH = PETITE_H, pen = PENALTY, r = R_ROND): void {
  const cy = H / 2;
  out.push({ k: 'poly', pts: [xBord, cy - sH / 2, xBord + sL * dir, cy - sH / 2, xBord + sL * dir, cy + sH / 2, xBord, cy + sH / 2] });
  out.push({ k: 'poly', pts: [xBord, cy - pH / 2, xBord + pL * dir, cy - pH / 2, xBord + pL * dir, cy + pH / 2, xBord, cy + pH / 2] });
  out.push({ k: 'point', x: xBord + pen * dir, y: cy });
  // Le « D » : portion du cercle de rayon r centré sur le penalty, située HORS de la surface.
  // Le bord de surface est à |sL − pen| du centre, d'où un demi-angle acos de ce rapport.
  if (r > Math.abs(sL - pen)) {
    const demi = Math.acos((sL - pen) / r);
    const axe = dir === -1 ? Math.PI : 0;
    out.push({ k: 'arc', cx: xBord + pen * dir, cy, r, a0: axe - demi, a1: axe + demi });
  }
}

/** Même chose pour une ligne de but HORIZONTALE (en haut). */
function surfaceHaute(out: Marquage[], yBord: number, W: number): void {
  const cx = W / 2;
  out.push({ k: 'poly', pts: [cx - SURF_H / 2, yBord, cx - SURF_H / 2, yBord + SURF_L, cx + SURF_H / 2, yBord + SURF_L, cx + SURF_H / 2, yBord] });
  out.push({ k: 'poly', pts: [cx - PETITE_H / 2, yBord, cx - PETITE_H / 2, yBord + PETITE_L, cx + PETITE_H / 2, yBord + PETITE_L, cx + PETITE_H / 2, yBord] });
  out.push({ k: 'point', x: cx, y: yBord + PENALTY });
  const demi = Math.acos((SURF_L - PENALTY) / R_ROND);
  out.push({ k: 'arc', cx, cy: yBord + PENALTY, r: R_ROND, a0: Math.PI / 2 - demi, a1: Math.PI / 2 + demi });
}

function coins(out: Marquage[], pts: [number, number][], quarts: [number, number][]): void {
  pts.forEach(([x, y], i) => {
    out.push({ k: 'arc', cx: x, cy: y, r: R_CORNER, a0: quarts[i][0], a1: quarts[i][1] });
    out.push({ k: 'drapeau', x, y });
  });
}

const Q = Math.PI / 2;

/** Tous les marquages d'un espace, prêts à être rendus à plat ou en perspective. */
export function marquages(t: Terrain, W: number, H: number): Marquage[] {
  const m = MARGE, out: Marquage[] = [];
  if (t === 'zone') {
    // Aire de jeu nue : un simple contour, aucun tracé de football.
    out.push({ k: 'poly', pts: [m, m, W - m, m, W - m, H - m, m, H - m], ferme: true });
    return out;
  }
  out.push({ k: 'poly', pts: [m, m, W - m, m, W - m, H - m, m, H - m], ferme: true });

  if (t === 'complet') {
    out.push({ k: 'poly', pts: [W / 2, m, W / 2, H - m] });
    out.push({ k: 'arc', cx: W / 2, cy: H / 2, r: R_ROND });
    out.push({ k: 'point', x: W / 2, y: H / 2 });
    surfaceVerticale(out, m, H, 1);
    surfaceVerticale(out, W - m, H, -1);
    out.push({ k: 'cage', x: m, y: H / 2, axe: 'x', sens: -1, demi: CAGE_DEMI });
    out.push({ k: 'cage', x: W - m, y: H / 2, axe: 'x', sens: 1, demi: CAGE_DEMI });
    coins(out, [[m, m], [W - m, m], [W - m, H - m], [m, H - m]],
      [[0, Q], [Q, 2 * Q], [2 * Q, 3 * Q], [3 * Q, 4 * Q]]);
  } else if (t === 'demi') {
    // Demi-terrain « portrait » : cage en haut, ligne médiane en bas.
    out.push({ k: 'poly', pts: [m, H - m, W - m, H - m] });
    out.push({ k: 'arc', cx: W / 2, cy: H - m, r: R_ROND, a0: Math.PI, a1: 2 * Math.PI });
    surfaceHaute(out, m, W);
    out.push({ k: 'cage', x: W / 2, y: m, axe: 'y', sens: -1, demi: CAGE_DEMI });
    coins(out, [[m, m], [W - m, m]], [[0, Q], [Q, 2 * Q]]);
  } else if (t === 'demi_large') {
    // Demi-terrain « paysage » : cage à gauche, ligne médiane à droite.
    out.push({ k: 'poly', pts: [W - m, m, W - m, H - m] });
    out.push({ k: 'arc', cx: W - m, cy: H / 2, r: R_ROND, a0: Q, a1: 3 * Q });
    surfaceVerticale(out, m, H, 1);
    out.push({ k: 'cage', x: m, y: H / 2, axe: 'x', sens: -1, demi: CAGE_DEMI });
    coins(out, [[m, m], [m, H - m]], [[0, Q], [3 * Q, 4 * Q]]);
  } else if (t === 'tiers') {
    // Zone de finition : la surface entière, sans rond central.
    surfaceVerticale(out, m, H, 1);
    out.push({ k: 'cage', x: m, y: H / 2, axe: 'x', sens: -1, demi: CAGE_DEMI });
    coins(out, [[m, m], [m, H - m]], [[0, Q], [3 * Q, 4 * Q]]);
  } else {
    // Quart : terrain de jeu réduit, surface et buts à l'échelle du format.
    out.push({ k: 'poly', pts: [W - m, m, W - m, H - m] });
    surfaceVerticale(out, m, H, 1, 60, 180, 24, 90, 46, 0);
    out.push({ k: 'cage', x: m, y: H / 2, axe: 'x', sens: -1, demi: CAGE_DEMI_PETITE });
    out.push({ k: 'cage', x: W - m, y: H / 2, axe: 'x', sens: 1, demi: CAGE_DEMI_PETITE });
  }
  return out;
}
