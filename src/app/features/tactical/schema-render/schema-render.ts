import Konva from 'konva';

/**
 * Rendu PARTAGÉ des éléments de schéma tactique (source unique éditeur + viewer +
 * calibration — même philosophie que moteur-tactique.ts : fonctions pures, aucun état).
 *
 * Deux styles :
 *  · 'tableau'  : formes historiques (chip joueur, triangle plot…) — pixel-identique à
 *    l'ancien rendu dupliqué, AUCUNE régression du mode actuel ;
 *  · 'realiste' : sprites vectoriels 2.5D recolorables (couleur d'équipe appliquée par
 *    code — contrainte multi-tenant), ancrés PAR LES PIEDS sur (x, y), ombre elliptique,
 *    nom/numéro sous les pieds, superposition par y croissant (ordonnerParProfondeur).
 *
 * Le JSON stocké des schémas reste strictement identique : le style est un paramètre
 * d'affichage (préférence utilisateur), jamais une donnée du schéma.
 */

export type StyleRendu = 'tableau' | 'realiste';

/** Sous-ensemble structurel d'un élément de schéma nécessaire au rendu. */
export interface ElementRendu {
  id: string;
  /** joueur | ballon | plot | but | cerceau | mannequin | echelle | haie | piquet | coupelle */
  type: string;
  couleur?: string;
  numero?: number;
  label?: string;
  /** Orientation en degrés (0 = horizontale). Absente ou 0 : rendu strictement inchangé. */
  rotation?: number;
}

/** Ordre de superposition 2.5D : les sprites les plus bas (y grand) passent devant. */
export function ordonnerParProfondeur(nodes: Iterable<Konva.Group>): void {
  [...nodes].sort((a, b) => a.y() - b.y()).forEach(n => n.moveToTop());
}

/** Assombrit une couleur hex (#RRGGBB) d'un facteur 0..1 (shorts, dégradés de sprites). */
export function assombrir(hex: string | undefined, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#334155';
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.round(v * (1 - f)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Chip « joueur » du mode tableau (rectangle ajusté au texte) — réutilisé par la calibration. */
export function jetonChip(g: Konva.Group, texte: string, couleur?: string): void {
  const h = 22;
  const txt = new Konva.Text({ text: texte, fontSize: 11, fontStyle: 'bold', fill: '#fff', wrap: 'none' });
  const w = Math.max(34, Math.ceil(txt.width()) + 14);
  txt.width(w); txt.height(h); txt.offsetX(w / 2); txt.offsetY(h / 2); txt.align('center'); txt.verticalAlign('middle');
  g.add(new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, cornerRadius: 5, fill: couleur, stroke: '#fff', strokeWidth: 2 }));
  g.add(txt);
}

/**
 * Remplit `g` (groupe positionné en el.x/el.y par l'appelant) avec le VISUEL de base de
 * l'élément. Les décorations d'éditeur (halo surveillé, badge, surbrillance de sélection,
 * drag) restent à la charge de l'appelant, par-dessus ce rendu.
 */
export function dessinerCorpsElement(g: Konva.Group, el: ElementRendu, style: StyleRendu): void {
  // La rotation n'affecte QUE le visuel : elle s'applique à un sous-groupe, si bien que les
  // décorations d'éditeur et l'étiquette du joueur (ajoutées à `g`) restent droites et lisibles.
  // Sans rotation, aucun sous-groupe n'est créé — le rendu existant est strictement préservé.
  const rot = el.rotation ?? 0;
  const c = rot ? new Konva.Group({ rotation: rot }) : g;
  if (c !== g) g.add(c);

  if (style === 'realiste') { corpsRealiste(c, el, g); return; }
  // ── Style tableau : formes historiques, à l'identique ──
  if (el.type === 'joueur') {
    jetonChip(c, el.label ?? String(el.numero), el.couleur);
  } else if (el.type === 'ballon') {
    c.add(new Konva.Circle({ radius: 9, fill: '#fff', stroke: '#111', strokeWidth: 2 }));
  } else if (el.type === 'plot') {
    c.add(new Konva.RegularPolygon({ sides: 3, radius: 13, fill: el.couleur, stroke: '#00000055', strokeWidth: 1 }));
  } else if (el.type === 'but') {
    c.add(new Konva.Rect({ x: -22, y: -6, width: 44, height: 12, stroke: '#fff', strokeWidth: 3 }));
  } else if (el.type === 'cerceau') {
    c.add(new Konva.Ring({ innerRadius: 9, outerRadius: 14, fill: el.couleur }));
  } else if (el.type === 'mannequin') {
    c.add(new Konva.Rect({ x: -7, y: -16, width: 14, height: 32, cornerRadius: 4, fill: el.couleur, stroke: '#fff', strokeWidth: 1.5 }));
  } else if (el.type === 'echelle') {
    echelleTableau(c, el.couleur);
  } else if (el.type === 'haie') {
    haieTableau(c, el.couleur);
  } else if (el.type === 'piquet') {
    piquetTableau(c, el.couleur);
  } else if (el.type === 'coupelle') {
    coupelleTableau(c, el.couleur);
  }
}

// ── Matériel de préparation physique, style tableau (vue de dessus, centré sur 0,0) ──

const ECHELLE_L = 96, ECHELLE_H = 26, ECHELLE_BARREAUX = 6;

function echelleTableau(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#eab308';
  g.add(new Konva.Rect({ x: -ECHELLE_L / 2, y: -ECHELLE_H / 2, width: ECHELLE_L, height: ECHELLE_H, stroke: c, strokeWidth: 2.5 }));
  for (let i = 1; i < ECHELLE_BARREAUX; i++) {
    const x = -ECHELLE_L / 2 + (ECHELLE_L / ECHELLE_BARREAUX) * i;
    g.add(new Konva.Line({ points: [x, -ECHELLE_H / 2, x, ECHELLE_H / 2], stroke: c, strokeWidth: 2 }));
  }
}

function haieTableau(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#f97316';
  g.add(new Konva.Line({ points: [-20, 0, 20, 0], stroke: c, strokeWidth: 4, lineCap: 'round' }));
  g.add(new Konva.Line({ points: [-20, -7, -20, 7], stroke: c, strokeWidth: 2.5, lineCap: 'round' }));
  g.add(new Konva.Line({ points: [20, -7, 20, 7], stroke: c, strokeWidth: 2.5, lineCap: 'round' }));
}

function piquetTableau(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#22c55e';
  g.add(new Konva.Circle({ radius: 7, fill: c, stroke: '#fff', strokeWidth: 1.5 }));
  g.add(new Konva.Circle({ radius: 2.5, fill: assombrir(c, 0.45) }));
}

function coupelleTableau(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#f59e0b';
  g.add(new Konva.Circle({ radius: 11, fill: c, stroke: assombrir(c, 0.35), strokeWidth: 1.5 }));
  g.add(new Konva.Circle({ radius: 5, fill: assombrir(c, 0.18) }));
}

/** Position du badge/halo d'éditeur selon le style (centre visuel du jeton). */
export function centreVisuel(style: StyleRendu): { x: number; y: number } {
  return style === 'realiste' ? { x: 10, y: -34 } : { x: 13, y: -13 };
}

// ═══════════════════ Sprites réalistes (silhouettes cohérentes) ═══════════════════

const PEAU = '#E8B48E';
const OMBRE = { fill: '#000', opacity: 0.22 };

function ombreSol(g: Konva.Group, rx = 13, ry = 4.5): void {
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: rx, radiusY: ry, ...OMBRE }));
}

function etiquette(g: Konva.Group, texte: string | undefined): void {
  if (!texte) return;
  const t = new Konva.Text({
    text: texte, fontSize: 10, fontStyle: 'bold', fill: '#fff',
    stroke: '#0B1220', strokeWidth: 2, fillAfterStrokeEnabled: true, wrap: 'none',
  });
  t.offsetX(t.width() / 2);
  t.y(5);
  g.add(t);
}

/** Silhouette joueur ~38 px, pieds en (0,0). Maillot = couleur d'équipe, short assombri.
 *  Deux poses (statique / course) pour casser l'uniformité, choisies par l'appelant. */
function spriteJoueur(g: Konva.Group, couleur: string | undefined, pose: 0 | 1): void {
  const maillot = couleur || '#3B82F6';
  const short = assombrir(maillot, 0.45);
  ombreSol(g);
  if (pose === 0) {
    // Pose statique : jambes légèrement écartées.
    g.add(new Konva.Line({ points: [-4, 0, -3, -10], stroke: PEAU, strokeWidth: 3.6, lineCap: 'round' }));
    g.add(new Konva.Line({ points: [4, 0, 3, -10], stroke: PEAU, strokeWidth: 3.6, lineCap: 'round' }));
  } else {
    // Pose course : une jambe en avant, une repliée derrière.
    g.add(new Konva.Line({ points: [-6, -1, -2, -10], stroke: PEAU, strokeWidth: 3.6, lineCap: 'round' }));
    g.add(new Konva.Line({ points: [6, -2, 3, -10], stroke: PEAU, strokeWidth: 3.6, lineCap: 'round' }));
  }
  // Short puis torse (maillot) — trapèze léger pour donner du volume.
  g.add(new Konva.Rect({ x: -5.5, y: -16, width: 11, height: 7, cornerRadius: 2, fill: short }));
  g.add(new Konva.Line({
    points: [-6, -16, -5, -29, 5, -29, 6, -16], closed: true,
    fill: maillot, stroke: assombrir(maillot, 0.25), strokeWidth: 1,
  }));
  // Bras (manches couleur maillot).
  if (pose === 0) {
    g.add(new Konva.Line({ points: [-6, -27, -8, -19], stroke: maillot, strokeWidth: 3, lineCap: 'round' }));
    g.add(new Konva.Line({ points: [6, -27, 8, -19], stroke: maillot, strokeWidth: 3, lineCap: 'round' }));
  } else {
    g.add(new Konva.Line({ points: [-6, -27, -9, -21], stroke: maillot, strokeWidth: 3, lineCap: 'round' }));
    g.add(new Konva.Line({ points: [6, -27, 9, -26], stroke: maillot, strokeWidth: 3, lineCap: 'round' }));
  }
  // Tête.
  g.add(new Konva.Circle({ x: 0, y: -33.5, radius: 4.6, fill: PEAU, stroke: assombrir(PEAU, 0.3), strokeWidth: 0.8 }));
}

/** Cône d'entraînement (plot) : base + cône avec bande, recolorable. */
function spritePlot(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#F97316';
  ombreSol(g, 10, 3.5);
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: 9, radiusY: 3.2, fill: assombrir(c, 0.3) }));
  g.add(new Konva.Line({ points: [-7, -1, 0, -16, 7, -1], closed: true, fill: c, stroke: assombrir(c, 0.35), strokeWidth: 1 }));
  g.add(new Konva.Line({ points: [-4.4, -7, 4.4, -7], stroke: '#fff', strokeWidth: 2.2, opacity: 0.9 }));
}

/** Ballon : sphère blanche + motif, petite ombre. */
function spriteBallon(g: Konva.Group): void {
  ombreSol(g, 7, 2.6);
  g.add(new Konva.Circle({ x: 0, y: -6, radius: 6.5, fill: '#fff', stroke: '#111', strokeWidth: 1.4 }));
  g.add(new Konva.RegularPolygon({ x: 0, y: -6.5, sides: 5, radius: 2.6, fill: '#111' }));
  g.add(new Konva.Arc({ x: 0, y: -6, innerRadius: 5.2, outerRadius: 6.4, angle: 90, rotation: 300, fill: '#11111133' }));
}

/** Mini-but : cadre blanc vu de trois-quarts avec retour de filet. */
function spriteBut(g: Konva.Group): void {
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: 26, radiusY: 5, ...OMBRE }));
  const blanc = '#F8FAFC';
  // Montants + barre (face avant).
  g.add(new Konva.Line({ points: [-22, 0, -22, -18, 22, -18, 22, 0], stroke: blanc, strokeWidth: 3, lineCap: 'round' }));
  // Retour du filet (profondeur).
  g.add(new Konva.Line({ points: [-22, -18, -16, -12, -16, 0], stroke: blanc, strokeWidth: 1.6, opacity: 0.8 }));
  g.add(new Konva.Line({ points: [22, -18, 16, -12, 16, 0], stroke: blanc, strokeWidth: 1.6, opacity: 0.8 }));
  g.add(new Konva.Line({ points: [-16, -12, 16, -12], stroke: blanc, strokeWidth: 1.2, opacity: 0.6 }));
  // Maillage léger.
  for (let x = -14; x <= 14; x += 7) {
    g.add(new Konva.Line({ points: [x, -12, x, 0], stroke: blanc, strokeWidth: 0.7, opacity: 0.45 }));
  }
}

/** Cerceau : anneau posé au sol (ellipse écrasée), recolorable. */
function spriteCerceau(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#EAB308';
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: 13, radiusY: 5, stroke: assombrir(c, 0.25), strokeWidth: 4.5 }));
  g.add(new Konva.Ellipse({ x: 0, y: -0.8, radiusX: 13, radiusY: 5, stroke: c, strokeWidth: 3 }));
}

/** Mannequin d'entraînement : panneau silhouette sur pied, recolorable. */
function spriteMannequin(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#F59E0B';
  ombreSol(g, 10, 3.5);
  g.add(new Konva.Line({ points: [-6, 0, 6, 0], stroke: assombrir(c, 0.5), strokeWidth: 2.5, lineCap: 'round' }));
  g.add(new Konva.Line({ points: [0, 0, 0, -4], stroke: assombrir(c, 0.5), strokeWidth: 3 }));
  // Corps du mannequin (panneau arrondi) + tête intégrée.
  g.add(new Konva.Rect({ x: -6.5, y: -26, width: 13, height: 22, cornerRadius: 6, fill: c, stroke: assombrir(c, 0.35), strokeWidth: 1.2 }));
  g.add(new Konva.Circle({ x: 0, y: -29, radius: 4.2, fill: c, stroke: assombrir(c, 0.35), strokeWidth: 1.2 }));
}

/** Échelle de rythme : deux longerons + barreaux, posée à plat (centrée sur 0,0). */
function spriteEchelle(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#eab308';
  const L = ECHELLE_L, h = 22;
  g.add(new Konva.Rect({ x: -L / 2, y: -h / 2, width: L, height: h, fill: '#000', opacity: 0.12 }));
  g.add(new Konva.Line({ points: [-L / 2, -h / 2, L / 2, -h / 2], stroke: c, strokeWidth: 3, lineCap: 'round' }));
  g.add(new Konva.Line({ points: [-L / 2, h / 2, L / 2, h / 2], stroke: c, strokeWidth: 3, lineCap: 'round' }));
  for (let i = 0; i <= ECHELLE_BARREAUX; i++) {
    const x = -L / 2 + (L / ECHELLE_BARREAUX) * i;
    g.add(new Konva.Line({ points: [x, -h / 2, x, h / 2], stroke: c, strokeWidth: 2.2, opacity: 0.9 }));
  }
}

/** Haie de franchissement : barre sur deux pieds inclinés, debout (pieds en 0,0). */
function spriteHaie(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#f97316';
  ombreSol(g, 16, 4);
  const pied = assombrir(c, 0.4);
  g.add(new Konva.Line({ points: [-15, 0, -10, -15], stroke: pied, strokeWidth: 2.6, lineCap: 'round' }));
  g.add(new Konva.Line({ points: [15, 0, 10, -15], stroke: pied, strokeWidth: 2.6, lineCap: 'round' }));
  g.add(new Konva.Rect({ x: -14, y: -19, width: 28, height: 5, cornerRadius: 2, fill: c, stroke: assombrir(c, 0.35), strokeWidth: 1 }));
}

/** Jalon de slalom : tige verticale bicolore sur socle, debout (pieds en 0,0). */
function spritePiquet(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#22c55e';
  ombreSol(g, 6, 2.5);
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: 5.5, radiusY: 2.2, fill: assombrir(c, 0.45) }));
  g.add(new Konva.Line({ points: [0, -1, 0, -30], stroke: c, strokeWidth: 3, lineCap: 'round' }));
  g.add(new Konva.Line({ points: [0, -11, 0, -15], stroke: '#f8fafc', strokeWidth: 3 }));
  g.add(new Konva.Line({ points: [0, -23, 0, -27], stroke: '#f8fafc', strokeWidth: 3 }));
}

/** Coupelle plate : soucoupe bombée au ras du sol — volontairement distincte du plot-cône. */
function spriteCoupelle(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#f59e0b';
  ombreSol(g, 11, 3.5);
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: 11, radiusY: 4, fill: assombrir(c, 0.32) }));
  g.add(new Konva.Ellipse({ x: 0, y: -2, radiusX: 9, radiusY: 3.2, fill: c }));
  g.add(new Konva.Ellipse({ x: 0, y: -3, radiusX: 4, radiusY: 1.4, fill: assombrir(c, 0.15) }));
}

/** `hors` reçoit ce qui ne doit jamais tourner avec l'élément (étiquette du joueur). */
function corpsRealiste(g: Konva.Group, el: ElementRendu, hors: Konva.Group): void {
  if (el.type === 'joueur') {
    // Pose stable par élément (hash simple de l'id) : variété sans aléa au re-rendu.
    const pose = ((el.id.charCodeAt(el.id.length - 1) ?? 0) % 2) as 0 | 1;
    spriteJoueur(g, el.couleur, pose);
    etiquette(hors, el.label ?? (el.numero != null ? String(el.numero) : undefined));
  } else if (el.type === 'ballon') {
    spriteBallon(g);
  } else if (el.type === 'plot') {
    spritePlot(g, el.couleur);
  } else if (el.type === 'but') {
    spriteBut(g);
  } else if (el.type === 'cerceau') {
    spriteCerceau(g, el.couleur);
  } else if (el.type === 'mannequin') {
    spriteMannequin(g, el.couleur);
  } else if (el.type === 'echelle') {
    spriteEchelle(g, el.couleur);
  } else if (el.type === 'haie') {
    spriteHaie(g, el.couleur);
  } else if (el.type === 'piquet') {
    spritePiquet(g, el.couleur);
  } else if (el.type === 'coupelle') {
    spriteCoupelle(g, el.couleur);
  }
}

// ═══════════════════ Perspective (mode présentation / diaporama) ═══════════════════

/**
 * Projection « caméra tribune » d'un point vue-de-dessus (x, y) ∈ [0..W]×[0..H] vers le
 * trapèze perspective : la ligne du haut est rétrécie (RATIO_HAUT) et l'axe vertical est
 * compressé au loin (projective). `echelle` sert à dimensionner les sprites selon la
 * profondeur. L'édition reste en vue de dessus : cette projection n'est appliquée qu'au
 * RENDU (viewer/diaporama), jamais aux données.
 */
export const PERSPECTIVE = {
  RATIO_HAUT: 0.72,   // largeur relative de la ligne de fond (haut de l'écran)
  HORIZON: 0.06,      // marge haute (part de H)
  PROFONDEUR: 1.0,    // coefficient projectif de compression verticale
};

export function projeter(x: number, y: number, W: number, H: number): { x: number; y: number; echelle: number } {
  const { RATIO_HAUT, HORIZON, PROFONDEUR } = PERSPECTIVE;
  const t = Math.max(0, Math.min(1, y / H));
  // Compression projective : le fond (t=0) est tassé, le premier plan (t=1) est étiré.
  const tp = t * (1 + PROFONDEUR) / (1 + PROFONDEUR * t);
  const yP = H * (HORIZON + (1 - HORIZON) * tp);
  const s = RATIO_HAUT + (1 - RATIO_HAUT) * tp;
  const xP = W / 2 + (x - W / 2) * s;
  return { x: xP, y: yP, echelle: s };
}

/** Projette une polyligne [x0,y0,x1,y1,…] (tracés passe/déplacement…). */
export function projeterPoints(pts: number[], W: number, H: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length - 1; i += 2) {
    const p = projeter(pts[i], pts[i + 1], W, H);
    out.push(p.x, p.y);
  }
  return out;
}
