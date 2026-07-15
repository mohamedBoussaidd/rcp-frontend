import { FORMATIONS } from '../schema-editor/schema-formations.data';

/**
 * Moteur tactique — maths pures, AUCUNE dépendance Angular/Konva.
 *
 * Modèle : pour chaque (phase, zone de ballon) une « posture » = position relative [0..1]
 * des 11 postes (slots) du système. Quand le ballon se déplace, la cible de chaque slot est
 * interpolée entre les postures calibrées (noyau gaussien) → le bloc coulisse en continu.
 * Le JSON produit ici est stocké opaque côté back (`regle_tactique.regles_json`).
 *
 * Coordonnées relatives terrain : x = profondeur (0 = notre but → 1 = but adverse),
 * y = largeur (0 = couloir gauche → 1 = droit). Conversion px ↔ relatif via MARGE_TERRAIN
 * (même marge que le renderer du terrain).
 */

export type PhaseKey = 'OFF' | 'DEF' | 'T_OD' | 'T_DO';

export interface SlotDef { id: string; poste: string; }
export interface PosSlot { x: number; y: number; }
/** Posture d'équipe pour une zone : slotId → position relative. */
export type Posture = Record<string, PosSlot>;
/** Décalage par slot appliqué APRÈS interpolation (ex. latéral qui monte plus haut). */
export interface Ajustement { slot: string; phase?: PhaseKey; dx: number; dy: number; }

export interface ReglesJson {
  version: 1;
  systeme: string;
  slots: SlotDef[];
  /** phase → (clé de zone `z{h}{c}` → posture). Seules les zones calibrées sont présentes. */
  phases: Record<PhaseKey, Record<string, Posture>>;
  ajustements?: Ajustement[];
  dureeTransitionS?: number;
}

// ── Constantes ──
/** Grille de zones de ballon : 4 hauteurs (vers le but adverse) × 3 couloirs. */
export const GRILLE_H = 4;
export const GRILLE_C = 3;
/** Écart-type du noyau gaussien d'interpolation, en « zones » (0.4 ≈ la posture calibrée
 *  domine à ~96 % quand le ballon est au centre de sa zone). */
export const SIGMA_MOTEUR = 0.4;
/** Marge du terrain dessiné (px scène Konva) — cf. SchemaTerrainRenderer. */
export const MARGE_TERRAIN = 24;
export const DUREE_TRANSITION_DEFAUT_S = 3;

export const PHASES: { key: PhaseKey; label: string; court: string }[] = [
  { key: 'OFF', label: 'Organisation offensive', court: 'Off.' },
  { key: 'DEF', label: 'Organisation défensive', court: 'Déf.' },
  { key: 'T_OD', label: 'Transition off → def (perte)', court: 'T. perte' },
  { key: 'T_DO', label: 'Transition def → off (récup.)', court: 'T. récup.' },
];

/** Phase jouée par l'ADVERSAIRE quand NOUS jouons la phase donnée (et réciproquement). */
export const PHASE_ADVERSE: Record<PhaseKey, PhaseKey> = {
  OFF: 'DEF', DEF: 'OFF', T_OD: 'T_DO', T_DO: 'T_OD',
};

export const SYSTEMES: string[] = FORMATIONS.map(f => f.nom);

// ── Zones ──
export function zoneKey(h: number, c: number): string { return `z${h}${c}`; }

/** Zone contenant un point relatif (clampé au terrain). */
export function zoneDuPoint(x: number, y: number): { h: number; c: number; key: string } {
  const h = Math.min(GRILLE_H - 1, Math.max(0, Math.floor(x * GRILLE_H)));
  const c = Math.min(GRILLE_C - 1, Math.max(0, Math.floor(y * GRILLE_C)));
  return { h, c, key: zoneKey(h, c) };
}

/** Centre (relatif) d'une zone. */
export function centreZone(h: number, c: number): PosSlot {
  return { x: (h + 0.5) / GRILLE_H, y: (c + 0.5) / GRILLE_C };
}

// ── Slots ──
/** Ids de slots stables pour une liste de rôles : code du poste + rang d'occurrence
 *  quand il y en a plusieurs (DC1/DC2, MC1/MC2…). Même ordre que la liste d'entrée. */
export function slotIdsPourRoles(roles: string[]): string[] {
  const compte = new Map<string, number>();
  roles.forEach(r => compte.set(r, (compte.get(r) ?? 0) + 1));
  const numero = new Map<string, number>();
  return roles.map(r => {
    if ((compte.get(r) ?? 0) <= 1) return r;
    const n = (numero.get(r) ?? 0) + 1;
    numero.set(r, n);
    return `${r}${n}`;
  });
}

/**
 * Les 11 slots d'un système, dérivés des formations de l'éditeur.
 */
export function slotsPourSysteme(systeme: string): SlotDef[] {
  const f = FORMATIONS.find(x => x.nom === systeme) ?? FORMATIONS[0];
  const roles = f.roles ?? [];
  return slotIdsPourRoles(roles).map((id, i) => ({ id, poste: roles[i] }));
}

/** Posture par défaut d'un système = les positions de la formation (point de départ de calibration). */
export function postureParDefaut(systeme: string): Posture {
  const f = FORMATIONS.find(x => x.nom === systeme) ?? FORMATIONS[0];
  const slots = slotsPourSysteme(systeme);
  const p: Posture = {};
  slots.forEach((s, i) => { p[s.id] = { ...f.positions[i] }; });
  return p;
}

/** Jeu de règles neuf (aucune zone calibrée). */
export function reglesVierges(systeme: string): ReglesJson {
  return {
    version: 1,
    systeme,
    slots: slotsPourSysteme(systeme),
    phases: { OFF: {}, DEF: {}, T_OD: {}, T_DO: {} },
    ajustements: [],
    dureeTransitionS: DUREE_TRANSITION_DEFAUT_S,
  };
}

// ── Interpolation ──
const clamp01 = (v: number) => Math.min(0.98, Math.max(0.02, v));

/**
 * Cibles de TOUS les slots pour une phase et une position de ballon : moyenne des postures
 * calibrées pondérée par un noyau gaussien sur la distance ballon↔centre de zone (distance
 * normalisée en zones). null si la phase n'a aucune zone calibrée.
 */
export function ciblesPhase(regles: ReglesJson, phase: PhaseKey, ballon: PosSlot): Posture | null {
  const zones = Object.entries(regles.phases[phase] ?? {});
  if (!zones.length) return null;
  const poids = zones.map(([key]) => {
    const h = +key[1], c = +key[2];
    const centre = centreZone(h, c);
    const dx = (ballon.x - centre.x) * GRILLE_H;   // distance en « zones »
    const dy = (ballon.y - centre.y) * GRILLE_C;
    return Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA_MOTEUR * SIGMA_MOTEUR));
  });
  const cibles: Posture = {};
  for (const slot of regles.slots) {
    let sx = 0, sy = 0, sw = 0;
    zones.forEach(([, posture], i) => {
      const p = posture[slot.id];
      if (!p) return;
      sx += p.x * poids[i]; sy += p.y * poids[i]; sw += poids[i];
    });
    if (sw <= 0) continue;
    let x = sx / sw, y = sy / sw;
    for (const a of regles.ajustements ?? []) {
      if (a.slot === slot.id && (!a.phase || a.phase === phase)) { x += a.dx; y += a.dy; }
    }
    cibles[slot.id] = { x: clamp01(x), y: clamp01(y) };
  }
  return cibles;
}

/** Nombre de zones calibrées d'une phase. */
export function nbZonesCalibrees(regles: ReglesJson, phase: PhaseKey): number {
  return Object.keys(regles.phases[phase] ?? {}).length;
}

// ── Miroir adverse ──
/**
 * Profil ADVERSAIRE dérivé de notre jeu par symétrie centrale : positions retournées
 * (1−x, 1−y) et phases échangées (leur organisation offensive = notre défensive, etc.).
 * Les ajustements sont retournés avec.
 */
export function miroir(regles: ReglesJson): ReglesJson {
  const flip = (p: Posture): Posture =>
    Object.fromEntries(Object.entries(p).map(([id, pos]) => [id, { x: 1 - pos.x, y: 1 - pos.y }]));
  const phases = { OFF: {}, DEF: {}, T_OD: {}, T_DO: {} } as ReglesJson['phases'];
  (Object.keys(regles.phases) as PhaseKey[]).forEach(ph => {
    const cible = PHASE_ADVERSE[ph];
    phases[cible] = Object.fromEntries(
      Object.entries(regles.phases[ph]).map(([zone, posture]) => {
        const h = +zone[1], c = +zone[2];
        return [zoneKey(GRILLE_H - 1 - h, GRILLE_C - 1 - c), flip(posture)];
      }));
  });
  return {
    ...regles,
    phases,
    ajustements: (regles.ajustements ?? []).map(a => ({
      ...a, phase: a.phase ? PHASE_ADVERSE[a.phase] : undefined, dx: -a.dx, dy: -a.dy,
    })),
  };
}

// ── Conversion px ↔ relatif (scène Konva, marge du terrain) ──
export function relVersPx(p: PosSlot, W: number, H: number): PosSlot {
  const m = MARGE_TERRAIN;
  return { x: m + p.x * (W - 2 * m), y: m + p.y * (H - 2 * m) };
}
export function pxVersRel(p: PosSlot, W: number, H: number): PosSlot {
  const m = MARGE_TERRAIN;
  return {
    x: Math.min(1, Math.max(0, (p.x - m) / (W - 2 * m))),
    y: Math.min(1, Math.max(0, (p.y - m) / (H - 2 * m))),
  };
}

/** Parse tolérant d'un regles_json (renvoie null si invalide). */
export function parseRegles(json: string | null | undefined): ReglesJson | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    if (!d || !Array.isArray(d.slots) || !d.phases) return null;
    d.phases = { OFF: {}, DEF: {}, T_OD: {}, T_DO: {}, ...d.phases };
    return d as ReglesJson;
  } catch { return null; }
}
