import { Keyframe, MetriqueVitesse, ModeAnim } from '../schema-render/schema-animation';
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
export type FormeType = 'rect' | 'ellipse' | 'losange' | 'triangle';

/**
 * Jeton, ballon ou matériel posé sur le terrain.
 * - `joueurId` : vrai joueur de l'effectif (sinon jeton générique).
 * - `slotId`   : poste du moteur tactique (posé par les formations) — le mode Dynamique
 *                ne pilote que les jetons qui en portent un.
 * - `rotation` : orientation en degrés du visuel (absente = 0) — échelle/haie en diagonale…
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

/** Forme d'annotation (zone à entourer / à montrer), redimensionnable et déplaçable. */
export interface SchemaForme {
  id: string;
  type: FormeType;
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
  texte?: string;
  texteTaille?: number;
  texteCouleur?: string;
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
}

const tableau = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** Lecture défensive d'un contenu de schéma déjà désérialisé. */
export function normaliserContenu(d: unknown): SchemaContenu {
  const o = (d ?? {}) as Record<string, unknown>;
  const modeAnim = o['modeAnim'];
  const metrique = o['metriqueVitesse'];
  const duree = o['dureeSecondes'];
  return {
    terrain: estTerrain(o['terrain']) ? o['terrain'] as Terrain : undefined,
    elements: tableau<SchemaElement>(o['elements']),
    traces: tableau<SchemaTrace>(o['traces']),
    formes: tableau<SchemaForme>(o['formes']),
    keyframes: tableau<Keyframe>(o['keyframes']).slice().sort((a, b) => a.t - b.t),
    dureeSecondes: typeof duree === 'number' && duree > 0 ? duree : undefined,
    modeAnim: modeAnim === 'temps' || modeAnim === 'vitesse' ? modeAnim : undefined,
    metriqueVitesse: metrique === 'max' || metrique === 'moyenne' ? metrique : undefined,
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
  keyframes: Keyframe[];
}

export function serialiserContenu(c: ContenuAEnregistrer): string {
  return JSON.stringify(c);
}
