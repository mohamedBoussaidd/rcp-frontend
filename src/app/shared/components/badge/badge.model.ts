/**
 * Modèle du système de badges unifié (cf. composant `<app-badge>` et `BadgeRegistryService`).
 *
 * Trois axes indépendants :
 *  - `type` (clé) : l'identité sémantique, résolue depuis la registry (badge système ou tag).
 *  - `ton`        : la famille de couleur ({fond, texte}) — un type en a un par défaut.
 *  - `mode`       : la présentation, `INLINE` (dans le flux) ou `CORNER` (pastille coin haut-droit).
 *
 * Couleur : les badges SYSTÈME sont colorés par leur ton (classe CSS `.badge--ton-*`, donc
 * réajustables par un club) ; les TAGS plateforme portent une couleur explicite fixe
 * (`couleurBg`/`couleurFg`, appliquée en style inline).
 */
export type BadgeTon = 'NEUTRAL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER' | 'BRAND';
export type BadgeMode = 'INLINE' | 'CORNER';
export type BadgePortee = 'SYSTEME' | 'PLATEFORME';

export interface BadgeDef {
  id?: string;
  cle: string;
  label: string;
  icone?: string | null;
  ton: BadgeTon;
  mode: BadgeMode;
  portee?: BadgePortee;
  couleurBg?: string | null;
  couleurFg?: string | null;
  tooltip?: string | null;
  ordre?: number;
}

export interface BadgeTonDef {
  ton: BadgeTon;
  libelle: string;
  couleurBg: string;
  couleurFg: string;
}

/** Surcharge de couleur d'un ton par un club (endpoint `/api/badges/couleurs-club`). */
export interface ClubTonCouleur {
  ton: BadgeTon;
  couleurBg: string;
  couleurFg: string;
}

export interface BadgeRegistry {
  badges: BadgeDef[];
  tons: BadgeTonDef[];
}

/**
 * Repli statique des badges système : garantit un rendu correct de `<app-badge type="…">` même
 * avant l'hydratation de la registry (ou si l'API n'a pas répondu). Doit rester aligné sur le seed
 * de la migration V79. La registry serveur, une fois chargée, a la priorité.
 */
export const BADGE_FALLBACK: Record<string, BadgeDef> = {
  ia:       { cle: 'ia',       label: 'IA',      icone: 'auto_awesome', ton: 'BRAND',   mode: 'CORNER', tooltip: "Proposé / généré par l'IA" },
  schema:   { cle: 'schema',   label: 'Schéma',  icone: 'schema',       ton: 'SUCCESS', mode: 'INLINE', tooltip: 'Contenu doté d’un schéma tactique' },
  global:   { cle: 'global',   label: 'Global',  icone: 'public',       ton: 'INFO',    mode: 'INLINE', tooltip: 'Contenu global, commun à tous les clubs' },
  blessure: { cle: 'blessure', label: 'Blessé',  icone: 'healing',      ton: 'DANGER',  mode: 'INLINE', tooltip: 'Joueur blessé' },
  gene:     { cle: 'gene',     label: 'Gêne',    icone: 'warning',      ton: 'WARNING', mode: 'INLINE', tooltip: 'Joueur avec une gêne signalée' },
  present:  { cle: 'present',  label: 'Présent', icone: 'check',        ton: 'SUCCESS', mode: 'INLINE', tooltip: 'Présent' },
  absent:   { cle: 'absent',   label: 'Absent',  icone: 'block',        ton: 'DANGER',  mode: 'INLINE', tooltip: 'Absent' },
};
