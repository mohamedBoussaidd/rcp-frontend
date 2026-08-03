import Konva from 'konva';
import { CAGE_DEMI, CAGE_DEMI_PETITE } from '../schema-editor/schema-espaces';
import { Camera, CAMERA_PRESENTATION } from './schema-camera';
import {
  CAGE_HAUTEUR, CAGE_PROFONDEUR, Projeter, anneauSol, boite, cone, dessinerCage, disqueSol,
  face, projecteurLocal, semelle, tige, trait,
} from './schema-volumes';

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
  /** Vrai joueur de l'effectif. Sert d'ancre à l'apparence (coupe, teinte) : elle reste la
   *  même d'un schéma à l'autre, là où l'id du jeton, lui, change à chaque placement. */
  joueurId?: string;
  /** Orientation en degrés (0 = horizontale). Absente ou 0 : rendu strictement inchangé. */
  rotation?: number;
}

/** Ordre de superposition 2.5D : les sprites les plus bas (y grand) passent devant. */
export function ordonnerParProfondeur(nodes: Iterable<Konva.Group>): void {
  [...nodes].sort((a, b) => a.y() - b.y()).forEach(n => n.moveToTop());
}

/** Assombrit une couleur hex (#RRGGBB) d'un facteur 0..1 (shorts, dégradés de sprites). */
export function assombrir(hex: string | undefined, f: number): string {
  return melanger(hex, f, 0);
}

/** Éclaircit une couleur hex (#RRGGBB) d'un facteur 0..1 (faces éclairées des sprites). */
export function eclaircir(hex: string | undefined, f: number): string {
  return melanger(hex, f, 255);
}

function melanger(hex: string | undefined, f: number, vers: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#334155';
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + (vers - v) * f)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─────────────── Crochet sprites image (remplacement des silhouettes vectorielles) ───────────────

/**
 * Source d'image pour un type d'élément. Enregistrer une source SUFFIT à remplacer le
 * dessin vectoriel — aucun appelant à modifier. Prévu pour brancher un jour des sprites
 * pré-rendus (cf. plan_vue_25d_camera) : ils s'affichent en « billboard », face caméra,
 * ancrés par les pieds, exactement comme les silhouettes actuelles.
 *
 * La teinte du maillot par club est à la charge de la source (elle reçoit la couleur et
 * rend l'image correspondante, à elle de la mettre en cache).
 */
export interface SourceSprite {
  image: (couleur: string | undefined) => CanvasImageSource | null;
  /** Hauteur de rendu en px terrain ; la largeur suit le ratio naturel de l'image. */
  hauteur: number;
  /** Largeur de rendu en px terrain. */
  largeur: number;
}

const sourcesSprite = new Map<string, SourceSprite>();

export function definirSourceSprite(type: string, source: SourceSprite | null): void {
  if (source) sourcesSprite.set(type, source);
  else sourcesSprite.delete(type);
}

/** Pose le sprite image d'un type s'il en existe un. Retourne faux sinon (rendu vectoriel). */
function spriteImage(g: Konva.Group, type: string, couleur: string | undefined): boolean {
  const src = sourcesSprite.get(type);
  const img = src?.image(couleur);
  if (!src || !img) return false;
  ombreSol(g, src.largeur * 0.34, src.largeur * 0.12);
  g.add(new Konva.Image({
    image: img as CanvasImageSource & { width: number; height: number },
    x: -src.largeur / 2, y: -src.hauteur, width: src.largeur, height: src.hauteur,
  }));
  return true;
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
export function dessinerCorpsElement(g: Konva.Group, el: ElementRendu, style: StyleRendu,
                                     vol?: ContexteVolume | null): void {
  // La rotation n'affecte QUE le visuel : elle s'applique à un sous-groupe, si bien que les
  // décorations d'éditeur et l'étiquette du joueur (ajoutées à `g`) restent droites et lisibles.
  // Sans rotation, aucun sous-groupe n'est créé — le rendu existant est strictement préservé.
  const rot = el.rotation ?? 0;

  // Vue inclinée : le matériel devient un VRAI volume projeté. Sa rotation est alors un angle
  // de terrain consommé par la projection, surtout pas une rotation de groupe Konva — celle-ci
  // ferait pivoter l'image d'une cage au lieu de la faire tourner sur le gazon.
  if (style === 'realiste' && vol && estVolumeProjete(el.type)) {
    corpsVolume(g, el, projecteurLocal(vol.cam, vol.x, vol.y, rot));
    return;
  }

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
  } else if (el.type === 'but_mobile') {
    // Même figure que le mini-but, à l'échelle d'une cage réglementaire (7,32 m).
    c.add(new Konva.Rect({ x: -36, y: -8, width: 72, height: 16, stroke: '#fff', strokeWidth: 3 }));
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

// ═══════════════════ Matériel en VOLUME (vue inclinée) ═══════════════════

/**
 * Ce qu'il faut pour projeter un volume : la caméra et la position TERRAIN de l'élément.
 * La position ne peut pas être lue sur le groupe Konva, qui porte déjà, lui, des
 * coordonnées d'écran.
 */
export interface ContexteVolume {
  cam: Camera;
  x: number;
  y: number;
}

/**
 * Types dont le rendu incliné est un vrai volume. Les autres (joueur, ballon) restent des
 * sprites : une silhouette humaine face caméra est plus lisible qu'un volume, et une sphère
 * est la même sous tous les angles.
 */
export function estVolumeProjete(type: string): boolean {
  return type === 'but' || type === 'but_mobile' || type === 'plot' || type === 'piquet'
    || type === 'coupelle' || type === 'cerceau' || type === 'echelle' || type === 'haie'
    || type === 'mannequin';
}

/** Dimensions des deux buts posables : le mini-but de jeu réduit et la cage mobile. */
const BUTS: Record<string, { demi: number; hauteur: number; profondeur: number }> = {
  but: { demi: CAGE_DEMI_PETITE, hauteur: CAGE_HAUTEUR * 0.8, profondeur: CAGE_PROFONDEUR * 0.55 },
  but_mobile: { demi: CAGE_DEMI, hauteur: CAGE_HAUTEUR, profondeur: CAGE_PROFONDEUR * 0.7 },
};

/**
 * Rendu volumétrique du matériel. Les dimensions reprennent celles des sprites plats
 * qu'elles remplacent : le matériel garde son encombrement à l'écran, il gagne son épaisseur.
 */
function corpsVolume(g: Konva.Group, el: ElementRendu, p: Projeter): void {
  const c = el.couleur;
  if (el.type === 'but' || el.type === 'but_mobile') {
    const b = BUTS[el.type];
    // Emprise au sol de la cage : sans elle, déplacer un but supposerait de viser un montant.
    face(g, p, [[-b.demi, 0, 0], [b.demi, 0, 0], [b.demi, b.profondeur, 0], [-b.demi, b.profondeur, 0]],
      '#000', 0.14);
    dessinerCage(g, p, b);
    return;
  }
  if (el.type === 'plot') {
    semelle(g, p, 10);
    cone(g, p, 9, 16, eclaircir(c || '#F97316', 0.25), assombrir(c || '#F97316', 0.35));
    // Bande blanche réfléchissante, à mi-hauteur du cône.
    trait(g, p, [-4.4, 0, 7], [4.4, 0, 7], 2.2, '#fff', 0.9);
    return;
  }
  if (el.type === 'piquet') {
    const v = c || '#22c55e';
    semelle(g, p, 9);   // une tige de 3 px de large ne s'attrape pas : c'est le socle qu'on vise
    disqueSol(g, p, 5.5, assombrir(v, 0.45));
    tige(g, p, 0, 0, 30, 3, v);
    // Deux bagues blanches : elles donnent l'échelle verticale et la lisibilité de loin.
    trait(g, p, [0, 0, 11], [0, 0, 15], 3, '#f8fafc');
    trait(g, p, [0, 0, 23], [0, 0, 27], 3, '#f8fafc');
    return;
  }
  if (el.type === 'coupelle') {
    const v = c || '#f59e0b';
    disqueSol(g, p, 11, assombrir(v, 0.32));
    disqueSol(g, p, 9, v, 1, 2);
    disqueSol(g, p, 4, assombrir(v, 0.15), 1, 3);
    return;
  }
  if (el.type === 'cerceau') {
    const v = c || '#EAB308';
    anneauSol(g, p, 13, 4.5, assombrir(v, 0.25));
    anneauSol(g, p, 13, 3, v, 1.2);
    return;
  }
  if (el.type === 'echelle') {
    // Posée à plat : c'est l'objet qui trahissait le plus la perspective, un rectangle
    // parfaitement rectangulaire quel que soit l'angle.
    const v = c || '#eab308', L = ECHELLE_L / 2, h = 11;
    face(g, p, [[-L, -h, 0], [L, -h, 0], [L, h, 0], [-L, h, 0]], '#000', 0.14);
    trait(g, p, [-L, -h, 0], [L, -h, 0], 3, v);
    trait(g, p, [-L, h, 0], [L, h, 0], 3, v);
    for (let i = 0; i <= ECHELLE_BARREAUX; i++) {
      const u = -L + (ECHELLE_L / ECHELLE_BARREAUX) * i;
      trait(g, p, [u, -h, 0], [u, h, 0], 2.2, v, 0.9);
    }
    return;
  }
  if (el.type === 'haie') {
    const v = c || '#f97316', pied = assombrir(v, 0.4);
    face(g, p, [[-16, -6, 0], [16, -6, 0], [16, 4, 0], [-16, 4, 0]], '#000', 0.14);
    trait(g, p, [-15, 0, 0], [-10, 0, 15], 2.6, pied);
    trait(g, p, [15, 0, 0], [10, 0, 15], 2.6, pied);
    trait(g, p, [-15, -5, 0], [-10, 0, 15], 2.6, pied, 0.7);
    trait(g, p, [15, -5, 0], [10, 0, 15], 2.6, pied, 0.7);
    boite(g, p, 14, 1.6, 14, 19, eclaircir(v, 0.25), v, assombrir(v, 0.3));
    return;
  }
  if (el.type === 'mannequin') {
    const v = c || '#F59E0B';
    semelle(g, p, 10);
    disqueSol(g, p, 7, assombrir(v, 0.5));
    // Panneau avec une vraie épaisseur : de profil, un panneau plat disparaîtrait.
    boite(g, p, 6.5, 1.8, 4, 26, eclaircir(v, 0.3), v, assombrir(v, 0.32));
    trait(g, p, [0, 0, 26], [0, 0, 33], 8, v);
    trait(g, p, [0, 0, 29], [0, 0, 30], 8.6, eclaircir(v, 0.18));
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

/**
 * Silhouette joueur ~38 px, pieds en (0,0). Maillot = couleur d'équipe (dégradé haut clair /
 * bas sombre, comme un éclairage de stade), short et chaussettes dérivés. Deux poses
 * (statique / course) pour casser l'uniformité.
 *
 * `vue` décide de quel côté on le voit : un joueur qui s'éloigne de la caméra doit montrer
 * son DOS et son numéro, pas son visage. Sans elle, tous les joueurs regardaient le
 * spectateur même vus de derrière la cage — ce qui trahissait le dessin plat.
 *
 * L'ombre au sol n'est PAS dessinée ici : elle est commune aux trois vues et posée par
 * l'appelant, sinon elle se dédoublerait à chaque changement d'orientation.
 *
 * Reste du dessin vectoriel : recolorable par code, net à toutes les échelles et à
 * l'impression. Pour un rendu photo, brancher {@link definirSourceSprite}.
 */
function spriteJoueur(g: Konva.Group, couleur: string | undefined, pose: 0 | 1,
                      numero?: number, vue: VueJoueur = 'face', look: Look = LOOK_DEFAUT): void {
  const maillot = couleur || '#3B82F6';
  const clair = eclaircir(maillot, 0.3), sombre = assombrir(maillot, 0.32);
  const short = assombrir(maillot, 0.55), chaussette = assombrir(maillot, 0.2);
  const dos = vue === 'dos';
  const peau = look.peau;
  // De trois-quarts, le corps se présente de biais : il se resserre horizontalement.
  const L = vue === 'trois_quarts' ? 0.78 : 1;
  // Mémorisés sur la vue : l'animation de foulée en a besoin sans avoir à tout redessiner.
  g.setAttrs({ pose, largeur: L });

  // ── Jambes : cuisse (peau) puis chaussette, pour donner l'articulation du genou ──
  // Elles vivent dans un sous-groupe à l'ORDRE FIXE : l'animation de course ne recrée rien,
  // elle réécrit les points de ces traits (mutation bien plus légère qu'un redessin).
  // Deux groupes distincts car l'ordre de dessin porte du sens : les jambes passent SOUS le
  // short, les bras PAR-DESSUS le torse.
  const jambes = new Konva.Group({ name: NOEUD_JAMBES, listening: false });
  const jambe = () => {
    jambes.add(new Konva.Line({ stroke: peau, strokeWidth: 3.8, lineCap: 'round' }));
    jambes.add(new Konva.Line({ stroke: chaussette, strokeWidth: 3.4, lineCap: 'round' }));
    jambes.add(new Konva.Ellipse({ radiusX: 2.6, radiusY: 1.4, fill: '#F1F5F9' }));
  };
  jambe(); jambe();
  g.add(jambes);

  // ── Short ──
  g.add(new Konva.Line({
    points: [-6 * L, -17, 6 * L, -17, 5.2 * L, -9, 0.6 * L, -10, 0, -13, -0.6 * L, -10, -5.2 * L, -9],
    closed: true, fill: short,
  }));

  // ── Torse : trapèze épaules > taille, dégradé vertical ──
  g.add(new Konva.Line({
    points: [-5.8 * L, -16.5, -6.6 * L, -29, 6.6 * L, -29, 5.8 * L, -16.5], closed: true,
    fillLinearGradientStartPoint: { x: 0, y: -29 },
    fillLinearGradientEndPoint: { x: 0, y: -16.5 },
    fillLinearGradientColorStops: [0, clair, 1, maillot],
    stroke: sombre, strokeWidth: 0.9,
  }));
  // Ombre portée du bras droit sur le flanc : c'est elle qui donne le volume. De dos, la
  // lumière tombe sur les omoplates : le pli se lit au milieu et non sur un flanc.
  g.add(dos
    ? new Konva.Line({ points: [0, -28.4, 0, -18], stroke: sombre, strokeWidth: 1.4, opacity: 0.35, lineCap: 'round' })
    : new Konva.Line({ points: [4.4 * L, -28.4, 3.8 * L, -17], stroke: sombre, strokeWidth: 1.6, opacity: 0.45, lineCap: 'round' }));

  // ── Bras : manche courte (maillot) puis avant-bras (peau) ──
  const bras = new Konva.Group({ name: NOEUD_BRAS, listening: false });
  const membre = () => {
    bras.add(new Konva.Line({ stroke: maillot, strokeWidth: 3.2, lineCap: 'round' }));
    bras.add(new Konva.Line({ stroke: peau, strokeWidth: 2.6, lineCap: 'round' }));
  };
  membre(); membre();
  g.add(bras);
  poserMembres(jambes, bras, null, pose, L);

  // ── Numéro de maillot ── (dans un sous-groupe : le miroir de l'orientation lui est annulé,
  // sinon un joueur courant vers la gauche porterait un « 01 » à l'envers.)
  // De dos, c'est LE moment où le numéro se lit vraiment : on le grossit.
  if (numero != null) {
    const num = new Konva.Group({ name: NOEUD_NUMERO, listening: false });
    const t = new Konva.Text({
      text: String(numero), fontSize: dos ? 10 : 7.5, fontStyle: 'bold', wrap: 'none',
      fill: eclaircir(maillot, 0.85), listening: false,
    });
    t.offsetX(t.width() / 2);
    t.y(dos ? -27.5 : -26.5);
    num.add(t);
    g.add(num);
  }

  // ── Cou, tête, cheveux et regard ──
  const TETE_Y = -34.6, R = 4.7;
  g.add(new Konva.Line({ points: [0, -29.5, 0, -32], stroke: assombrir(peau, 0.22), strokeWidth: 3 }));
  g.add(new Konva.Circle({ x: 0, y: TETE_Y, radius: R, fill: peau, stroke: assombrir(peau, 0.34), strokeWidth: 0.8 }));
  cheveux(g, look, vue, TETE_Y, R);
  // Le regard n'existe que si on voit le visage — c'est LUI qui rend le face/dos lisible
  // d'un coup d'œil, bien plus que la coiffure ou le numéro.
  if (!dos) {
    const dx = vue === 'trois_quarts' ? 1.5 : 0;      // de biais, les yeux se décalent
    const ecart = vue === 'trois_quarts' ? 1.5 : 1.9;
    for (const s of [-1, 1]) {
      g.add(new Konva.Circle({
        x: dx + s * ecart, y: TETE_Y + 0.6, radius: 0.75, fill: '#25201C', listening: false,
      }));
    }
  }
}

// ── Apparences : chaque joueur garde la sienne d'une ouverture à l'autre ──

export type Coupe = 'courts' | 'rase' | 'volume' | 'mi_longs' | 'queue';

export interface Look {
  coupe: Coupe;
  cheveux: string;
  peau: string;
}

const COUPES: readonly Coupe[] = ['courts', 'rase', 'volume', 'mi_longs', 'queue'];
const COULEURS_CHEVEUX = ['#3A2A20', '#171310', '#7B5230', '#C9A227', '#8A3B12'];
const TEINTES_PEAU = ['#E8B48E', '#D19A6E', '#A9714A', '#7A4A2B'];
const LOOK_DEFAUT: Look = { coupe: 'courts', cheveux: COULEURS_CHEVEUX[0], peau: TEINTES_PEAU[0] };

/** Entier stable tiré d'une chaîne : même id ⇒ même apparence à chaque ouverture. */
function empreinte(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Apparence d'un joueur, déduite de son identifiant. Un effectif cesse d'être onze copies du
 * même bonhomme, et personne ne change de tête entre deux ouvertures du schéma.
 */
export function look(el: ElementRendu): Look {
  const h = empreinte(el.joueurId || el.id);
  // ⚠ Décalages NON SIGNÉS obligatoires : `>>` traite l'empreinte comme un entier signé, donc
  // une empreinte au-delà de 2³¹ (une fois sur deux) donnait un index NÉGATIF, une couleur
  // `undefined`, et un joueur transparent — tête verte, bras invisibles.
  return {
    coupe: COUPES[h % COUPES.length],
    cheveux: COULEURS_CHEVEUX[(h >>> 3) % COULEURS_CHEVEUX.length] ?? LOOK_DEFAUT.cheveux,
    peau: TEINTES_PEAU[(h >>> 7) % TEINTES_PEAU.length] ?? LOOK_DEFAUT.peau,
  };
}

/** Chevelure : la coupe est la même sous tous les angles, seule sa découpe change. */
function cheveux(g: Konva.Group, look: Look, vue: VueJoueur, y: number, R: number): void {
  const c = look.cheveux, dos = vue === 'dos', trois = vue === 'trois_quarts';
  if (look.coupe === 'rase') {
    // Calotte très basse : le crâne reste visible, seule une ombre de cheveux le couvre.
    g.add(new Konva.Arc({
      x: 0, y, innerRadius: 0, outerRadius: R * 0.96,
      angle: dos ? 360 : 150, rotation: trois ? 185 : 195, fill: c, opacity: dos ? 0.9 : 0.75,
    }));
    return;
  }
  if (look.coupe === 'volume') {
    g.add(new Konva.Circle({ x: 0, y: y - 0.8, radius: R * 1.24, fill: c }));
    if (!dos) g.add(new Konva.Arc({ x: 0, y, innerRadius: 0, outerRadius: R, angle: 190, rotation: trois ? 160 : 175, fill: c }));
    return;
  }
  // Base commune aux coupes « à cheveux » : calotte, complète de dos.
  g.add(dos
    ? new Konva.Circle({ x: 0, y, radius: R, fill: c })
    : new Konva.Arc({
      x: 0, y, innerRadius: 0, outerRadius: R,
      angle: trois ? 225 : 190, rotation: trois ? 160 : 175, fill: c,
    }));
  if (look.coupe === 'mi_longs') {
    // Deux mèches qui descendent sur la nuque et les tempes.
    for (const s of [-1, 1]) {
      g.add(new Konva.Line({
        points: [s * R * 0.9, y - 1, s * R * 1.05, y + 3.2, s * R * 0.5, y + 3],
        closed: true, fill: c,
      }));
    }
  } else if (look.coupe === 'queue') {
    // Catogan : visible surtout de dos et de trois-quarts, comme dans la réalité.
    g.add(new Konva.Circle({ x: dos ? 0 : -R * 0.95, y: y + 1.2, radius: 2.1, fill: c }));
  }
}

// ═══════════════════ Foulée ═══════════════════

/** Sous-groupes animés : ordre des enfants FIXE, l'animation ne fait que réécrire des points. */
const NOEUD_JAMBES = 'jambes';
const NOEUD_BRAS = 'bras';

/** Longueur d'une foulée en unités terrain (~1,7 m à ~9,9 px/m). */
export const FOULEE = 17;

/**
 * Place jambes et bras.
 *
 * `phase` en radians : `null` = joueur à l'arrêt, on repose alors EXACTEMENT les deux poses
 * historiques (aucune régression sur un schéma non animé). Sinon les membres oscillent, les
 * bras en opposition aux jambes.
 *
 * `frappe` (0→1) écrase la foulée par un geste de frappe : jambe d'appui fléchie, jambe
 * libre tendue vers l'avant, bras opposé ouvert pour l'équilibre.
 */
function poserMembres(jambes: Konva.Group, bras: Konva.Group, phase: number | null,
                      pose: 0 | 1, L: number, frappe = 0): void {
  const j = jambes.getChildren(), b = bras.getChildren();
  if (j.length < 6 || b.length < 4) return;
  const cuisse = (i: number, xh: number, xg: number, yg: number) =>
    (j[i * 3] as Konva.Line).points([xg, yg, xh * L, -16]);
  const mollet = (i: number, xg: number, yg: number, xp: number, yp: number) => {
    (j[i * 3 + 1] as Konva.Line).points([xp, yp - 0.5, xg, yg]);
    (j[i * 3 + 2] as Konva.Ellipse).position({ x: xp, y: yp });
  };
  const membre = (i: number, xe: number, xc: number, yc: number, xm: number, ym: number) => {
    (b[i * 2] as Konva.Line).points([xe * L, -28, xc * L, yc]);
    (b[i * 2 + 1] as Konva.Line).points([xc * L, yc, xm * L, ym]);
  };

  if (phase === null && frappe <= 0) {
    // Poses historiques, au pixel près.
    if (pose === 0) {
      cuisse(0, -2.4, -3.2 * L, -9.5); mollet(0, -3.2 * L, -9.5, -3.6 * L, 0);
      cuisse(1, 2.4, 3.2 * L, -9.5); mollet(1, 3.2 * L, -9.5, 3.6 * L, 0);
      membre(0, -6, -7.6, -23, -8.4, -18); membre(1, 6, 7.6, -23, 8.4, -18);
    } else {
      cuisse(0, -2.4, -4 * L, -9.5); mollet(0, -4 * L, -9.5, -6.2 * L, 0);
      cuisse(1, 2.4, 3.4 * L, -9.5); mollet(1, 3.4 * L, -9.5, 5.6 * L, 0);
      membre(0, -6, -8.6, -24, -9.6, -19.5); membre(1, 6, 8.6, -25.5, 9.4, -29);
    }
    return;
  }

  const a = phase ?? 0;
  for (const i of [0, 1] as const) {
    const s = i === 0 ? -1 : 1;
    const av = Math.sin(a + (i ? Math.PI : 0));          // avancée de la jambe
    const lev = Math.max(0, Math.cos(a + (i ? Math.PI : 0)));   // hauteur du pied
    let xp = (3.4 * s + 5.2 * av) * L, yp = -3.4 * lev;
    let xg = (2.9 * s + 3 * av) * L, yg = -9.5 - 1.2 * lev;
    if (frappe > 0) {
      // Jambe droite = jambe de frappe : elle se tend vers l'avant, la gauche encaisse.
      const cible = i === 1
        ? { xp: 11 * L, yp: -6.5, xg: 6 * L, yg: -11 }
        : { xp: -3 * L, yp: 0, xg: -3.4 * L, yg: -9.2 };
      xp += (cible.xp - xp) * frappe; yp += (cible.yp - yp) * frappe;
      xg += (cible.xg - xg) * frappe; yg += (cible.yg - yg) * frappe;
    }
    cuisse(i, 2.4 * s, xg, yg);
    mollet(i, xg, yg, xp, yp);
    // Bras : opposition aux jambes, et ouverture du bras opposé pendant la frappe.
    const ab = -av;
    let xm = (7.6 * s + 3.4 * ab) * L, ym = -21 - 3 * Math.abs(ab);
    if (frappe > 0 && i === 0) { xm += (-12 * L - xm) * frappe; ym += (-27 - ym) * frappe; }
    membre(i, 6 * s, 7.4 * s + 2.2 * ab, -23 - 1.5 * Math.abs(ab), xm, ym);
  }
}

// ═══════════════════ Orientation des joueurs ═══════════════════

/** De quel côté on voit un joueur, selon l'endroit d'où on le regarde. */
export type VueJoueur = 'face' | 'trois_quarts' | 'dos';

/** Sous-groupe portant les trois vues et le miroir gauche/droite. */
export const NOEUD_CORPS = 'corps';
/** Sous-groupe du numéro : le miroir lui est annulé pour qu'il reste lisible. */
const NOEUD_NUMERO = 'num';

/** Pose stable par joueur (hash de l'id) : de la variété, sans changer au re-rendu. */
function poseDe(el: ElementRendu): 0 | 1 {
  return ((el.id.charCodeAt(el.id.length - 1) ?? 0) % 2) as 0 | 1;
}

/** Seuils d'angle (radians) entre le regard du joueur et la direction de la caméra. */
const SEUIL_FACE = Math.PI / 3;        // < 60° : il vient vers nous
const SEUIL_DOS = 2 * Math.PI / 3;     // > 120° : il s'éloigne

/**
 * Oriente un joueur d'après sa direction de course.
 *
 * `dir` est un angle de TERRAIN (radians, `null` = immobile ou inconnu → vue de face, soit
 * exactement le rendu d'avant). La vue est choisie par l'angle entre son regard et la
 * direction de la caméra : il court vers nous → face, il s'éloigne → dos, entre les deux →
 * trois-quarts. Le miroir se décide, lui, sur la direction PROJETÉE à l'écran, seule
 * lecture juste en perspective.
 *
 * Les vues sont construites paresseusement et conservées : changer d'orientation ne coûte
 * ensuite qu'un basculement de visibilité, ce qui la rend gratuite à 60 images/seconde.
 */
export function orienterJoueur(g: Konva.Group, o: {
  el: ElementRendu; style: StyleRendu; dir: number | null;
  cam: Camera | null; x: number; y: number;
}): void {
  if (o.style !== 'realiste') return;                 // le mode tableau reste figé
  const corps = g.findOne<Konva.Group>(`.${NOEUD_CORPS}`);
  if (!corps) return;

  let vue: VueJoueur = 'face';
  let miroir = false;
  if (o.dir !== null) {
    const dx = Math.cos(o.dir) * 12, dy = Math.sin(o.dir) * 12;
    const a = o.cam ? o.cam.projeter(o.x, o.y) : { x: o.x, y: o.y };
    const b = o.cam ? o.cam.projeter(o.x + dx, o.y + dy) : { x: o.x + dx, y: o.y + dy };
    miroir = b.x < a.x - 0.05;
    if (o.cam) {
      const oeil = o.cam.positionMonde();
      const versCam = Math.atan2(oeil.y - o.y, oeil.x - o.x);
      // Écart d'angle ramené dans [0, π] : seule son AMPLEUR distingue face, profil et dos.
      let ecart = Math.abs(o.dir - versCam) % (Math.PI * 2);
      if (ecart > Math.PI) ecart = Math.PI * 2 - ecart;
      vue = ecart < SEUIL_FACE ? 'face' : ecart > SEUIL_DOS ? 'dos' : 'trois_quarts';
    }
    // Vue de dessus : aucune notion de face ou de dos, seul le sens gauche/droite se lit.
  }

  if (corps.getAttr('vueActive') === vue && corps.getAttr('miroirActif') === miroir) return;
  corps.setAttrs({ vueActive: vue, miroirActif: miroir });

  const nom = `vue-${vue}`;
  let cible = corps.findOne<Konva.Group>(`.${nom}`);
  if (!cible) {
    cible = new Konva.Group({ name: nom });
    spriteJoueur(cible, o.el.couleur, poseDe(o.el), o.el.numero, vue, look(o.el));
    corps.add(cible);
  }
  corps.getChildren().forEach(c => c.visible(c === cible));
  corps.scaleX(miroir ? -1 : 1);
  // Double négation : le numéro reste dans le bon sens quel que soit le miroir du corps.
  cible.findOne<Konva.Group>(`.${NOEUD_NUMERO}`)?.scaleX(miroir ? -1 : 1);
}

/**
 * Anime la foulée du joueur : `phase` en radians (`null` = à l'arrêt), `frappe` 0→1 pour le
 * geste de tir ou de passe.
 *
 * Seule la vue actuellement visible est mise à jour, et rien n'est fait si la pose n'a pas
 * bougé d'un douzième de radian — à 60 images/seconde, c'est ce qui rend l'animation
 * gratuite. Aucun nœud n'est créé ni détruit : seuls des points sont réécrits.
 */
export function animerJoueur(g: Konva.Group, o: {
  style: StyleRendu; phase: number | null; frappe?: number;
}): void {
  if (o.style !== 'realiste') return;
  const corps = g.findOne<Konva.Group>(`.${NOEUD_CORPS}`);
  const vue = corps?.getChildren().find(c => c.visible()) as Konva.Group | undefined;
  if (!vue) return;
  const jambes = vue.findOne<Konva.Group>(`.${NOEUD_JAMBES}`);
  const bras = vue.findOne<Konva.Group>(`.${NOEUD_BRAS}`);
  if (!jambes || !bras) return;
  const frappe = o.frappe ?? 0;
  const cle = `${o.phase === null ? 'x' : Math.round(o.phase * 12)}|${Math.round(frappe * 10)}`;
  if (vue.getAttr('poseCle') === cle) return;
  vue.setAttr('poseCle', cle);
  poserMembres(jambes, bras, o.phase, vue.getAttr('pose') ?? 0, vue.getAttr('largeur') ?? 1, frappe);
}

/** Cône d'entraînement (plot) : base + cône avec bande, recolorable. */
function spritePlot(g: Konva.Group, couleur: string | undefined): void {
  const c = couleur || '#F97316';
  ombreSol(g, 10, 3.5);
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: 9, radiusY: 3.2, fill: assombrir(c, 0.3) }));
  g.add(new Konva.Line({ points: [-7, -1, 0, -16, 7, -1], closed: true, fill: c, stroke: assombrir(c, 0.35), strokeWidth: 1 }));
  g.add(new Konva.Line({ points: [-4.4, -7, 4.4, -7], stroke: '#fff', strokeWidth: 2.2, opacity: 0.9 }));
}

/** Nom du sous-groupe qui porte le motif du ballon : c'est lui, et lui seul, qui tourne. */
export const NOEUD_ROULEMENT = 'roulement';

/** Rayon du ballon en unités terrain. Sert aussi à convertir une distance en angle. */
export const RAYON_BALLON = 10.4;

/**
 * Ballon : sphère éclairée + panneaux cousus, sur une ombre au sol. Volontairement généreux :
 * c'est le repère que l'œil cherche en premier sur un schéma projeté en salle.
 *
 * Le motif vit dans un sous-groupe nommé, centré sur la sphère, pour que
 * {@link orienterBallon} puisse le faire rouler sans toucher ni à l'ombre ni au contour.
 */
function spriteBallon(g: Konva.Group): void {
  const R = RAYON_BALLON, cy = -R + 0.9;
  ombreSol(g, 11, 3.8);
  g.add(new Konva.Circle({
    x: 0, y: cy, radius: R, stroke: '#0f172a', strokeWidth: 1.4,
    fillRadialGradientStartPoint: { x: -R * 0.35, y: -R * 0.4 },
    fillRadialGradientStartRadius: R * 0.1,
    fillRadialGradientEndPoint: { x: 0, y: 0 },
    fillRadialGradientEndRadius: R * 1.25,
    fillRadialGradientColorStops: [0, '#ffffff', 0.55, '#f1f5f9', 1, '#b9c2cf'],
  }));

  // Panneaux : un pentagone central et cinq hexagones amorcés au bord — le motif d'un
  // ballon se reconnaît à ses coutures bien plus qu'à ses formes complètes.
  const motif = new Konva.Group({ name: NOEUD_ROULEMENT, x: 0, y: cy });
  const penta = (r: number, rot: number) => {
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      pts.push(r * Math.cos(a), r * Math.sin(a));
    }
    return pts;
  };
  const centre = penta(4.1, -Math.PI / 2);
  motif.add(new Konva.Line({ points: centre, closed: true, fill: '#1e293b' }));
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2 + Math.PI / 5;
    // Couture partant du pentagone vers le bord : elle sort du disque, le clip la coupe.
    motif.add(new Konva.Line({
      points: [4.6 * Math.cos(a), 4.6 * Math.sin(a), R * 1.15 * Math.cos(a), R * 1.15 * Math.sin(a)],
      stroke: '#1e293b', strokeWidth: 1.3, lineCap: 'round',
    }));
  }
  // Trois amorces de panneaux au bord, pour que la rotation se voie même de loin.
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2 + 0.62;
    motif.add(new Konva.Circle({
      x: R * 0.86 * Math.cos(a), y: R * 0.86 * Math.sin(a), radius: 2.6, fill: '#1e293b', opacity: 0.9,
    }));
  }
  // Le motif est découpé au disque : les coutures ne débordent jamais de la sphère.
  motif.clipFunc(ctx => { ctx.arc(0, 0, R - 0.7, 0, Math.PI * 2, false); });
  g.add(motif);

  // Ombrage du bas de la sphère, posé APRÈS le motif : il enfonce le ballon dans le gazon.
  g.add(new Konva.Arc({
    x: 0, y: cy, innerRadius: R * 0.72, outerRadius: R, angle: 150, rotation: 20,
    fill: '#0f172a', opacity: 0.16, listening: false,
  }));
}

/**
 * Fait rouler le ballon. `distance` est le chemin PARCOURU DEPUIS LE DÉBUT (en unités
 * terrain), jamais un incrément : l'angle reste ainsi une fonction du temps, si bien que
 * reculer la timeline ou sauter à un instant donne toujours la même image — un cumul
 * image par image aurait dérivé au moindre retour en arrière.
 */
export function orienterBallon(g: Konva.Group, distance: number): void {
  const motif = g.findOne<Konva.Group>(`.${NOEUD_ROULEMENT}`);
  if (motif) motif.rotation((distance / RAYON_BALLON) * (180 / Math.PI));
}

/**
 * But vu de trois-quarts, pour la vue de DESSUS uniquement : dès que la vue est inclinée,
 * c'est la vraie cage en volume qui prend le relais (cf. corpsVolume). `demi` distingue le
 * mini-but de la cage mobile.
 */
function spriteBut(g: Konva.Group, demi: number): void {
  const L = demi, Ht = demi * 0.78, Pf = demi * 0.5;
  g.add(new Konva.Ellipse({ x: 0, y: 0, radiusX: L * 1.18, radiusY: L * 0.22, ...OMBRE }));
  const blanc = '#F8FAFC';
  // Voile de filet, puis maillage — le remplissage évite le « cadre vide » d'avant.
  g.add(new Konva.Line({
    points: [-L, 0, -L, -Ht, L, -Ht, L, 0], closed: true, fill: '#E2E8F0', opacity: 0.1,
  }));
  for (let x = -L + 6; x < L; x += 7) {
    g.add(new Konva.Line({ points: [x, -Ht + 2, x, 0], stroke: blanc, strokeWidth: 0.6, opacity: 0.4 }));
  }
  for (let y = -Ht + 5; y < 0; y += 6) {
    g.add(new Konva.Line({ points: [-L, y, L, y], stroke: blanc, strokeWidth: 0.6, opacity: 0.35 }));
  }
  // Retour du filet (profondeur), puis montants et barre bien marqués.
  g.add(new Konva.Line({ points: [-L, -Ht, -L + Pf * 0.6, -Ht + Pf * 0.6, -L + Pf * 0.6, 0], stroke: blanc, strokeWidth: 1.6, opacity: 0.8 }));
  g.add(new Konva.Line({ points: [L, -Ht, L - Pf * 0.6, -Ht + Pf * 0.6, L - Pf * 0.6, 0], stroke: blanc, strokeWidth: 1.6, opacity: 0.8 }));
  g.add(new Konva.Line({ points: [-L + Pf * 0.6, -Ht + Pf * 0.6, L - Pf * 0.6, -Ht + Pf * 0.6], stroke: blanc, strokeWidth: 1.2, opacity: 0.6 }));
  g.add(new Konva.Line({ points: [-L, 0, -L, -Ht, L, -Ht, L, 0], stroke: blanc, strokeWidth: 3, lineCap: 'round' }));
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
  // Un sprite image enregistré pour ce type prend le pas sur le dessin vectoriel.
  if (spriteImage(g, el.type, el.couleur)) {
    if (el.type === 'joueur') etiquette(hors, el.label ?? (el.numero != null ? String(el.numero) : undefined));
    return;
  }
  if (el.type === 'joueur') {
    // L'ombre est commune aux trois vues : elle vit hors du groupe qui porte l'orientation,
    // sinon elle se dédoublerait à chaque changement de côté.
    ombreSol(g, 11, 3.8);
    const corps = new Konva.Group({ name: NOEUD_CORPS });
    const face = new Konva.Group({ name: 'vue-face' });
    spriteJoueur(face, el.couleur, poseDe(el), el.numero, 'face', look(el));
    corps.add(face);
    corps.setAttrs({ vueActive: 'face', miroirActif: false });
    g.add(corps);
    etiquette(hors, el.label ?? (el.numero != null ? String(el.numero) : undefined));
  } else if (el.type === 'ballon') {
    spriteBallon(g);
  } else if (el.type === 'plot') {
    spritePlot(g, el.couleur);
  } else if (el.type === 'but') {
    spriteBut(g, CAGE_DEMI_PETITE);
  } else if (el.type === 'but_mobile') {
    spriteBut(g, CAGE_DEMI);
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

// ═══════════════════ Formes d'annotation (zones, textes) ═══════════════════

/**
 * Sous-ensemble d'une zone d'annotation nécessaire au rendu (cf. `SchemaForme`).
 * `type` : rect | ellipse | losange | triangle | ligne.
 */
export interface FormeRendue {
  type: string;
  x: number; y: number; w: number; h: number;
  couleur: string;
  /** Ligne : segment du coin bas-gauche au coin haut-droit plutôt que l'inverse. */
  montante?: boolean;
  /** 'pointille' = tirets ; absent ou 'plein' = trait continu. */
  trait?: string;
  epaisseur?: number;
  texte?: string;
  texteTaille?: number;
  texteCouleur?: string;
}

/** Épaisseur de trait par défaut : celle de toutes les zones dessinées avant ce réglage. */
const EPAISSEUR_FORME = 3;

const epaisseur = (f: FormeRendue) => f.epaisseur ?? EPAISSEUR_FORME;
/** Tirets proportionnels à l'épaisseur : un pointillé fin reste lisible, un gros ne bave pas. */
const tirets = (f: FormeRendue) => f.trait === 'pointille' ? [epaisseur(f) * 3, epaisseur(f) * 2.2] : undefined;
/** Une ligne est un trait, pas une surface : rien à remplir, rien à refermer. */
export const estLigne = (f: FormeRendue) => f.type === 'ligne';

/**
 * Contour d'une zone en coordonnées LOCALES (0..w, 0..h). Une seule géométrie sert aux
 * deux rendus : formes Konva à plat, polygone projeté en vue inclinée.
 */
export function contourForme(f: FormeRendue): number[] {
  if (f.type === 'ligne') return f.montante ? [0, f.h, f.w, 0] : [0, 0, f.w, f.h];
  if (f.type === 'rect') return [0, 0, f.w, 0, f.w, f.h, 0, f.h];
  if (f.type === 'triangle') return [f.w / 2, 0, f.w, f.h, 0, f.h];
  if (f.type === 'losange') return [f.w / 2, 0, f.w, f.h / 2, f.w / 2, f.h, 0, f.h / 2];
  const pts: number[] = [];   // ellipse échantillonnée (une ellipse projetée reste une conique)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pts.push(f.w / 2 * (1 + Math.cos(a)), f.h / 2 * (1 + Math.sin(a)));
  }
  return pts;
}

function formeShape(f: FormeRendue): Konva.Shape {
  const fill = f.couleur + '22', stroke = f.couleur;
  const strokeWidth = epaisseur(f), dash = tirets(f);
  if (f.type === 'ligne') {
    return new Konva.Line({
      points: contourForme(f), stroke, strokeWidth, dash, lineCap: 'round',
      // Un trait fin est presque impossible à viser : on élargit sa zone de clic sans
      // toucher à son épaisseur visible.
      hitStrokeWidth: Math.max(16, strokeWidth + 12),
    });
  }
  if (f.type === 'rect') return new Konva.Rect({ width: f.w, height: f.h, fill, stroke, strokeWidth, dash });
  if (f.type === 'ellipse') return new Konva.Ellipse({ x: f.w / 2, y: f.h / 2, radiusX: f.w / 2, radiusY: f.h / 2, fill, stroke, strokeWidth, dash });
  if (f.type === 'triangle') return new Konva.Line({ points: [f.w / 2, 0, f.w, f.h, 0, f.h], closed: true, fill, stroke, strokeWidth, dash });
  return new Konva.Line({ points: [f.w / 2, 0, f.w, f.h / 2, f.w / 2, f.h, 0, f.h / 2], closed: true, fill, stroke, strokeWidth, dash });
}

/**
 * (Re)construit le contenu d'une zone : sa géométrie et son texte centré éventuel.
 * PARTAGÉ éditeur ↔ lecteur : le lecteur ne dessinait aucune zone, un schéma projeté en
 * diaporama perdait donc toutes ses annotations.
 */
export function dessinerContenuForme(g: Konva.Group, f: FormeRendue, cam?: Camera | null): void {
  g.destroyChildren();
  const fill = f.couleur + '22', stroke = f.couleur;
  if (cam) {
    // Plan incliné : la zone devient un polygone projeté, décrit en absolu — un groupe
    // positionné plus une forme locale ne suffirait pas, la projection n'est pas affine.
    const loc = contourForme(f), abs: number[] = [];
    for (let i = 0; i < loc.length; i += 2) abs.push(f.x + loc[i], f.y + loc[i + 1]);
    g.position({ x: 0, y: 0 });
    g.add(new Konva.Line({
      points: cam.projeterPolyligne(abs),
      closed: !estLigne(f), fill: estLigne(f) ? undefined : fill,
      stroke, strokeWidth: epaisseur(f), dash: tirets(f),
      lineCap: 'round', hitStrokeWidth: estLigne(f) ? Math.max(16, epaisseur(f) + 12) : undefined,
    }));
    if (f.texte && !estLigne(f)) {
      const c = cam.projeter(f.x + f.w / 2, f.y + f.h / 2);
      const t = new Konva.Text({
        text: f.texte, align: 'center', wrap: 'none',
        fontSize: (f.texteTaille ?? 20) * c.echelle, fontStyle: 'bold',
        fill: f.texteCouleur || f.couleur, listening: false,
      });
      t.position({ x: c.x - t.width() / 2, y: c.y - t.height() / 2 });
      g.add(t);
    }
    return;
  }
  g.position({ x: f.x, y: f.y });
  g.add(formeShape(f));
  // Pas de texte dans un trait : on n'écrit pas au milieu d'une ligne.
  if (f.texte && !estLigne(f)) {
    g.add(new Konva.Text({
      text: f.texte, width: f.w, height: f.h,
      align: 'center', verticalAlign: 'middle', wrap: 'word', padding: 4,
      fontSize: f.texteTaille ?? 20, fontStyle: 'bold',
      fill: f.texteCouleur || f.couleur, listening: false,
    }));
  }
}

// ═══════════════════ Perspective (mode présentation / diaporama) ═══════════════════

/**
 * Façade historique sur la caméra perspective (cf. schema-camera.ts), conservée pour les
 * appelants qui n'ont pas d'angle à piloter : ils obtiennent l'angle de présentation par
 * défaut. Les appelants qui règlent l'angle (éditeur) instancient une {@link Camera}.
 *
 * Les caméras sont mémorisées par dimensions : la construction fait un cadrage
 * automatique, inutile de le refaire à chaque point projeté.
 */
const camerasParDefaut = new Map<string, Camera>();

function cameraDefaut(W: number, H: number): Camera {
  const cle = `${W}x${H}`;
  let c = camerasParDefaut.get(cle);
  if (!c) { c = new Camera(W, H, CAMERA_PRESENTATION); camerasParDefaut.set(cle, c); }
  return c;
}

export function projeter(x: number, y: number, W: number, H: number): { x: number; y: number; echelle: number } {
  return cameraDefaut(W, H).projeter(x, y);
}

/** Projette une polyligne [x0,y0,x1,y1,…] (tracés passe/déplacement…). */
export function projeterPoints(pts: number[], W: number, H: number): number[] {
  return cameraDefaut(W, H).projeterPolyligne(pts);
}
