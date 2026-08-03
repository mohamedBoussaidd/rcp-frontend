import { BorneVie, Keyframe, MetriqueVitesse, ModeAnim, ModeTraces, Vie } from '../schema-render/schema-animation';
import { Terrain, estTerrain } from './schema-espaces';

/**
 * Format PERSISTÉ d'un schéma (colonne `schema_json`) : les types du modèle et sa lecture
 * défensive. Un même JSON est écrit par l'éditeur puis relu par l'éditeur, le lecteur, la
 * bibliothèque et les diapos — il vaut donc mieux le décrire à un seul endroit.
 *
 * Compatibilité ASCENDANTE obligatoire : des schémas enregistrés il y a des mois sont en base,
 * un champ absent doit toujours retomber sur un défaut sûr et jamais faire échouer la lecture.
 */

export type TraceType = 'deplacement' | 'conduite' | 'passe' | 'tir';
export type FormeType = 'rect' | 'ellipse' | 'losange' | 'triangle' | 'ligne';
export type TraitForme = 'plein' | 'pointille';

/**
 * Jeton, ballon ou matériel posé sur le terrain.
 * - `joueurId` : vrai joueur de l'effectif (sinon jeton générique).
 * - `slotId`   : poste du moteur tactique (posé par les formations) — le mode Dynamique
 *                ne pilote que les jetons qui en portent un.
 * - `rotation` : orientation en degrés du visuel (absente = 0) — échelle/haie en diagonale…
 * - `vie`      : fenêtre d'apparition (absente = présent d'un bout à l'autre).
 */
export interface SchemaElement {
  id: string;
  type: string;
  couleur?: string;
  numero?: number;
  label?: string;
  joueurId?: string;
  slotId?: string;
  surveille?: boolean;
  surveilleCouleur?: string;
  rotation?: number;
  vie?: Vie;
  x: number;
  y: number;
}

/** Tracé : `elementId` = jeton/ballon qui le suit, `ballId` = ballon entraîné par une conduite. */
export interface SchemaTrace {
  id: string;
  type: TraceType;
  points: number[];
  elementId?: string;
  ballId?: string;
}

/**
 * Forme d'annotation (zone à entourer / à montrer), redimensionnable et déplaçable.
 *
 * Le type `ligne` est un simple segment inscrit dans la même boîte (x, y, w, h) que les
 * autres formes — il hérite ainsi du déplacement, du redimensionnement, de la projection en
 * vue inclinée et de la fenêtre d'apparition, sans géométrie parallèle. Comme la boîte est
 * normalisée au tracé (coin haut-gauche + dimensions positives), `montante` est indispensable
 * pour distinguer une diagonale « ↗ » d'une « ↘ ».
 */
export interface SchemaForme {
  id: string;
  type: FormeType;
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
  /** Ligne uniquement : le segment va du coin bas-gauche au coin haut-droit. */
  montante?: boolean;
  /** Absent = trait plein, comme toutes les formes d'avant. */
  trait?: TraitForme;
  /** Épaisseur du trait en px (absente = 3, l'épaisseur historique des zones). */
  epaisseur?: number;
  texte?: string;
  texteTaille?: number;
  texteCouleur?: string;
  /** Fenêtre d'apparition pendant l'animation (absente = affichée en permanence). */
  vie?: Vie;
}

export type RenduGroupe = 'contour' | 'liaisons' | 'bande' | 'aucun';

/**
 * Groupe tactique : un ensemble de JETONS (ligne défensive, triangle du côté droit, bloc…).
 *
 * Ce sont les jetons qui font le groupe, pas les postes : un groupe fonctionne donc aussi
 * avec des adversaires, des jokers ou des jetons génériques. Les postes s'en déduisent
 * quand les membres portent un `slotId`, ce dont le moteur tactique se servira.
 *
 * La FORME n'est pas stockée : elle est l'enveloppe convexe des membres, recalculée à
 * chaque image. C'est ce qui fait qu'un bloc se déforme pendant l'animation — l'effet
 * pédagogique recherché — et qu'aucune donnée ne peut se désynchroniser des positions.
 */
export interface SchemaGroupe {
  id: string;
  nom?: string;
  /** Ids des éléments membres. Un groupe descendu sous 2 membres n'est plus dessiné. */
  membres: string[];
  couleur?: string;
  /** Absent = contour. */
  rendu?: RenduGroupe;
  /** Liaisons : toutes les diagonales et non le seul périmètre. */
  diagonales?: boolean;
  /** Distances en mètres le long des arêtes. */
  cotes?: boolean;
  /** Encombrement du bloc (largeur × profondeur). */
  encombrement?: boolean;
  /** Absent = affiché. Un joueur pouvant appartenir à plusieurs groupes, l'interrupteur
   *  par groupe est indispensable pour ne pas superposer trois contours sur un jeton. */
  masque?: boolean;
  /** Fenêtre d'apparition, comme les zones et les jetons (cf. lot « mise en scène »). */
  vie?: Vie;
}

/**
 * Cadrage de projection : le RECTANGLE de terrain à montrer, en coordonnées terrain.
 *
 * Un rectangle et non un couple (zoom, centre) : il ne dépend d'aucune taille d'écran, donc le
 * même cadrage vaut sur le portable du coach et sur le vidéoprojecteur de la salle.
 */
export interface Cadrage { x: number; y: number; w: number; h: number; }

/**
 * Étape-chapitre : un instant nommé de l'animation. En salle, la lecture s'arrête à chaque
 * chapitre — le coach commente, puis relance. Sans chapitre, la lecture est celle d'avant.
 */
export interface Chapitre { t: number; titre?: string; }

/** Au-delà, ce n'est plus une mise en scène mais un découpage image par image. */
export const MAX_CHAPITRES = 24;

/**
 * Contenu d'un schéma après lecture.
 * Les champs OPTIONNELS le sont volontairement : absents du JSON, ils ne doivent pas écraser
 * le réglage courant de l'éditeur (un vieux schéma sans `modeAnim` ne remet pas le mode à zéro).
 */
export interface SchemaContenu {
  terrain?: Terrain;
  elements: SchemaElement[];
  traces: SchemaTrace[];
  formes: SchemaForme[];
  /** Vide pour tout schéma antérieur aux groupes. */
  groupes: SchemaGroupe[];
  /** Trié par temps croissant ; vide si le schéma n'est pas animé par keyframes. */
  keyframes: Keyframe[];
  dureeSecondes?: number;
  modeAnim?: ModeAnim;
  metriqueVitesse?: MetriqueVitesse;
  modeTraces?: ModeTraces;
  /**
   * Vitesse de lecture voulue par l'auteur (1 = temps réel). Elle appartient au SCHÉMA :
   * une animation réglée à 2× dans l'éditeur était rejouée à 1× en diaporama, donc au ralenti
   * par rapport à ce qui avait été mis au point.
   */
  vitesseLecture?: number;
  /** Zone de terrain à montrer en projection (absente = tout le terrain, comme avant). */
  cadrage?: Cadrage;
  /** Étapes de lecture, triées par temps croissant (absentes = lecture d'une traite). */
  chapitres?: Chapitre[];
}

const tableau = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** Borne de fenêtre relue défensivement : instant fixe, ancre sur une flèche, ou rien. */
function borneVie(v: unknown): BorneVie | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o['trace'] === 'string' && (o['bord'] === 'debut' || o['bord'] === 'fin')) {
      return { trace: o['trace'], bord: o['bord'] };
    }
  }
  return undefined;
}

/** `undefined` dès qu'aucune borne n'est exploitable : l'objet reste alors visible en continu. */
export function normaliserVie(v: unknown): Vie | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const debut = borneVie(o['debut']), fin = borneVie(o['fin']);
  return debut === undefined && fin === undefined ? undefined : { debut, fin };
}

/** Objet porteur d'une fenêtre, nettoyé de la sienne si elle est illisible. */
const avecVie = <T extends { vie?: Vie }>(x: T): T => {
  const vie = normaliserVie((x as { vie?: unknown }).vie);
  return vie ? { ...x, vie } : { ...x, vie: undefined };
};

const RENDUS_GROUPE: readonly unknown[] = ['contour', 'liaisons', 'bande', 'aucun'];

/**
 * Groupe relu défensivement, ses membres restreints aux éléments RÉELLEMENT présents :
 * un jeton supprimé après coup ne doit pas laisser un groupe pointer dans le vide. En
 * dessous de deux membres survivants, le groupe n'a plus de forme et disparaît.
 */
function normaliserGroupe(v: unknown, ids: Set<string>): SchemaGroupe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const membres = tableau<unknown>(o['membres']).filter(m => typeof m === 'string' && ids.has(m)) as string[];
  if (typeof o['id'] !== 'string' || membres.length < 2) return null;
  const rendu = RENDUS_GROUPE.includes(o['rendu']) ? o['rendu'] as RenduGroupe : undefined;
  return {
    id: o['id'],
    membres: [...new Set(membres)],
    nom: typeof o['nom'] === 'string' ? o['nom'] : undefined,
    couleur: typeof o['couleur'] === 'string' ? o['couleur'] : undefined,
    rendu,
    diagonales: o['diagonales'] === true || undefined,
    cotes: o['cotes'] === true || undefined,
    encombrement: o['encombrement'] === true || undefined,
    masque: o['masque'] === true || undefined,
    vie: normaliserVie(o['vie']),
  };
}

/** Cadrage relu défensivement : un rectangle sans surface n'est pas un cadrage. */
export function normaliserCadrage(v: unknown): Cadrage | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? o[k] as number : NaN);
  const x = n('x'), y = n('y'), w = n('w'), h = n('h');
  if ([x, y, w, h].some(Number.isNaN) || w < 20 || h < 20) return undefined;
  return { x, y, w, h };
}

/** Chapitres relus défensivement : instants positifs, dédoublonnés, triés, plafonnés. */
export function normaliserChapitres(v: unknown): Chapitre[] | undefined {
  const vus = new Set<number>();
  const cs = tableau<unknown>(v)
    .map(c => (c && typeof c === 'object' ? c as Record<string, unknown> : null))
    .filter((c): c is Record<string, unknown> => !!c && typeof c['t'] === 'number' && Number.isFinite(c['t']) && (c['t'] as number) >= 0)
    .map(c => ({
      t: Math.round((c['t'] as number) * 100) / 100,
      titre: typeof c['titre'] === 'string' && c['titre'].trim() ? (c['titre'] as string).trim() : undefined,
    }))
    .filter(c => (vus.has(c.t) ? false : (vus.add(c.t), true)))
    .sort((a, b) => a.t - b.t)
    .slice(0, MAX_CHAPITRES);
  return cs.length ? cs : undefined;
}

/** Lecture défensive d'un contenu de schéma déjà désérialisé. */
export function normaliserContenu(d: unknown): SchemaContenu {
  const o = (d ?? {}) as Record<string, unknown>;
  const modeAnim = o['modeAnim'];
  const metrique = o['metriqueVitesse'];
  const modeTraces = o['modeTraces'];
  const duree = o['dureeSecondes'];
  const vit = o['vitesseLecture'];
  const elements = tableau<SchemaElement>(o['elements']).map(avecVie);
  const ids = new Set(elements.map(e => e.id));
  return {
    terrain: estTerrain(o['terrain']) ? o['terrain'] as Terrain : undefined,
    elements,
    traces: tableau<SchemaTrace>(o['traces']),
    formes: tableau<SchemaForme>(o['formes']).map(avecVie),
    groupes: tableau<unknown>(o['groupes'])
      .map(g => normaliserGroupe(g, ids))
      .filter((g): g is SchemaGroupe => g !== null),
    keyframes: tableau<Keyframe>(o['keyframes']).slice().sort((a, b) => a.t - b.t),
    dureeSecondes: typeof duree === 'number' && duree > 0 ? duree : undefined,
    modeAnim: modeAnim === 'temps' || modeAnim === 'vitesse' ? modeAnim : undefined,
    metriqueVitesse: metrique === 'max' || metrique === 'moyenne' ? metrique : undefined,
    modeTraces: modeTraces === 'toujours' || modeTraces === 'action' || modeTraces === 'aucun'
      ? modeTraces : undefined,
    // Bornée : un schéma mal formé ne doit pas pouvoir figer ou emballer une projection.
    vitesseLecture: typeof vit === 'number' && vit >= 0.25 && vit <= 4 ? vit : undefined,
    cadrage: normaliserCadrage(o['cadrage']),
    chapitres: normaliserChapitres(o['chapitres']),
  };
}

/** Lecture défensive d'un `schema_json` brut : `null` si illisible. */
export function parserContenu(json: string | null | undefined): SchemaContenu | null {
  if (!json) return null;
  try { return normaliserContenu(JSON.parse(json)); } catch { return null; }
}

/** Contenu à persister — l'ordre des champs est sans importance, leur présence non. */
export interface ContenuAEnregistrer {
  terrain: Terrain;
  elements: SchemaElement[];
  traces: SchemaTrace[];
  formes: SchemaForme[];
  groupes: SchemaGroupe[];
  dureeSecondes: number;
  modeAnim: ModeAnim;
  metriqueVitesse: MetriqueVitesse;
  modeTraces: ModeTraces;
  vitesseLecture: number;
  keyframes: Keyframe[];
  /** Absents = comportement d'avant (terrain entier, lecture d'une traite). */
  cadrage?: Cadrage;
  chapitres?: Chapitre[];
}

export function serialiserContenu(c: ContenuAEnregistrer): string {
  return JSON.stringify(c);
}
