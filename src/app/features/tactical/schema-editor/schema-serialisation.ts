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
  /** Trié par temps croissant ; vide si le schéma n'est pas animé par keyframes. */
  keyframes: Keyframe[];
  dureeSecondes?: number;
  modeAnim?: ModeAnim;
  metriqueVitesse?: MetriqueVitesse;
  modeTraces?: ModeTraces;
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

/** Lecture défensive d'un contenu de schéma déjà désérialisé. */
export function normaliserContenu(d: unknown): SchemaContenu {
  const o = (d ?? {}) as Record<string, unknown>;
  const modeAnim = o['modeAnim'];
  const metrique = o['metriqueVitesse'];
  const modeTraces = o['modeTraces'];
  const duree = o['dureeSecondes'];
  return {
    terrain: estTerrain(o['terrain']) ? o['terrain'] as Terrain : undefined,
    elements: tableau<SchemaElement>(o['elements']).map(avecVie),
    traces: tableau<SchemaTrace>(o['traces']),
    formes: tableau<SchemaForme>(o['formes']).map(avecVie),
    keyframes: tableau<Keyframe>(o['keyframes']).slice().sort((a, b) => a.t - b.t),
    dureeSecondes: typeof duree === 'number' && duree > 0 ? duree : undefined,
    modeAnim: modeAnim === 'temps' || modeAnim === 'vitesse' ? modeAnim : undefined,
    metriqueVitesse: metrique === 'max' || metrique === 'moyenne' ? metrique : undefined,
    modeTraces: modeTraces === 'toujours' || modeTraces === 'action' || modeTraces === 'aucun'
      ? modeTraces : undefined,
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
  dureeSecondes: number;
  modeAnim: ModeAnim;
  metriqueVitesse: MetriqueVitesse;
  modeTraces: ModeTraces;
  keyframes: Keyframe[];
}

export function serialiserContenu(c: ContenuAEnregistrer): string {
  return JSON.stringify(c);
}
