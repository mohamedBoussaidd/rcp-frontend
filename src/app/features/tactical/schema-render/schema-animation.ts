import { Point, cheminRendu, longueurChemin, pointLeLongDe } from '../schema-editor/schema-geometrie';

/**
 * Moteur d'animation des schémas : minutage des flèches et position des mobiles dans le temps.
 * Aucune dépendance Angular ni Konva — fonctions pures, donc testables et surtout PARTAGÉES
 * entre l'éditeur (schema-editor) et le lecteur (schema-viewer, utilisé par le diaporama).
 *
 * Cette logique était auparavant écrite deux fois, à charge de les garder alignées à la main.
 * Elles avaient divergé : la tension de spline valait 0,5 côté éditeur et 0,8 côté lecteur, si
 * bien qu'un jeton ne suivait pas la même courbe selon qu'on dessinait le schéma ou qu'on le
 * projetait à l'équipe. Une seule implémentation supprime la classe de bug entière.
 *
 * Modèle : chaque mobile (le ballon, chaque joueur) suit SES propres flèches ; minutage global,
 * une flèche démarre quand toutes celles qui finissent à son départ sont arrivées — donc le
 * ballon attend son porteur avant de partir en conduite.
 */

// ── Types du modèle animé ──
// Volontairement minimaux : l'éditeur et le lecteur ont chacun leur propre type d'élément
// (l'éditeur porte en plus slotId, surveille…), tous deux compatibles avec ceux-ci.

export interface ElementAnime {
  id: string;
  type: string;
  joueurId?: string;
  x: number;
  y: number;
}

export interface TraceAnimee {
  id: string;
  type: string;
  points: number[];
  /** Jeton (déplacement/conduite) ou ballon (passe/tir) lié au dessin de la flèche. */
  elementId?: string;
  /** Ballon entraîné par une conduite. */
  ballId?: string;
}

export interface Keyframe {
  t: number;
  positions: Record<string, Point>;
}

/** Portion de trajectoire d'un mobile : sa flèche, parcourue entre t0 et t1 (secondes). */
export interface Segment {
  t0: number;
  t1: number;
  pts: number[];
}

/** Vitesses GPS d'un joueur (km/h), telles qu'exposées par GET /api/joueurs/vitesses. */
export interface VitesseGps {
  vmax: number | null;
  vmoy: number | null;
}

export type ModeAnim = 'temps' | 'vitesse';
export type MetriqueVitesse = 'max' | 'moyenne';

// ── Mise en scène : QUAND chaque chose est visible ──

/**
 * Affichage des flèches :
 *  · 'toujours' — tout le tracé en permanence (comportement historique, défaut) ;
 *  · 'action'   — chaque flèche se dessine au passage de son mobile puis s'efface ;
 *  · 'aucun'    — aucune flèche (on ne montre que le mouvement).
 */
export type ModeTraces = 'toujours' | 'action' | 'aucun';

/** Instants (s) où une flèche est parcourue par son mobile. */
export interface FenetreTrace { t0: number; t1: number; }

/**
 * Borne d'une fenêtre de visibilité : un instant fixe, ou l'ancrage à une flèche.
 * L'ancre survit aux changements de durée et de mode d'animation — le minutage est
 * recalculé, la borne suit ; un nombre en secondes, lui, reste où il est.
 */
export interface AncreTrace { trace: string; bord: 'debut' | 'fin'; }
export type BorneVie = number | AncreTrace;

/** Fenêtre de visibilité d'une forme ou d'un jeton. Bornes absentes = présent d'un bout à l'autre. */
export interface Vie { debut?: BorneVie; fin?: BorneVie; }

/** Effacement d'une flèche après la fin de son action (s). */
export const FONDU_TRACE = 0.4;
/** Entrée et sortie d'une forme ou d'un jeton (s). */
export const FONDU_VIE = 0.25;

// ── Constantes ──
/** Joueur sans donnée GPS : course modérée. */
export const VITESSE_DEFAUT_KMH = 24;
/** Une passe va plus vite qu'une course. */
export const BALLE_KMH = 60;
/** Rayon (px) de rattachement d'une flèche au jeton/ballon le plus proche de son départ. */
export const RAYON_LIEN = 60;

// ── Vitesses ──
export function kmhEnPxS(kmh: number, pxParMetre: number): number {
  return (kmh / 3.6) * pxParMetre;
}

export function vitesseBallePxS(pxParMetre: number): number {
  return kmhEnPxS(BALLE_KMH, pxParMetre);
}

/** Vitesse (px/s) d'un joueur : sa donnée GPS (vmax ou vmoy) sinon la vitesse par défaut. */
export function vitesseJoueurPxS(
  joueur: ElementAnime | undefined,
  vitesses: Map<string, VitesseGps>,
  metrique: MetriqueVitesse,
  pxParMetre: number,
): number {
  const v = joueur?.joueurId ? vitesses.get(joueur.joueurId) : undefined;
  const kmh = v ? (metrique === 'max' ? v.vmax : v.vmoy) : null;
  return kmhEnPxS(kmh && kmh > 0 ? kmh : VITESSE_DEFAUT_KMH, pxParMetre);
}

/**
 * Ce dont le calcul de trajectoires a besoin, fourni par l'appelant.
 * L'éditeur et le lecteur n'exposent pas leur état de la même façon (signaux contre champs),
 * d'où cette interface plutôt qu'un objet de données.
 */
export interface SourceAnimation {
  readonly elements: readonly ElementAnime[];
  readonly traces: readonly TraceAnimee[];
  readonly modeAnim: ModeAnim;
  readonly dureeSecondes: number;
  /**
   * Position de repos d'un élément — celle qui sert à décider quelle flèche appartient à qui.
   * L'éditeur mute `el.x/el.y` à chaque frame de lecture : il doit renvoyer ici la keyframe 0,
   * sinon le propriétaire d'une flèche changerait en cours d'animation. Le lecteur, qui ne mute
   * que les nœuds Konva, renvoie simplement `el.x/el.y`.
   */
  repos(e: ElementAnime): Point;
  vitesseBallePxS(): number;
  vitesseJoueurPxS(joueur?: ElementAnime): number;
}

/**
 * Tout ce que le minutage produit, en un seul calcul :
 *  · `mobiles`  — id d'élément → ses segments ordonnés dans le temps (qui va où, quand) ;
 *  · `fenetres` — id de flèche → quand elle est parcourue (mise en scène, ancres) ;
 *  · `chemins`  — id de flèche → sa courbe développée (tracé progressif).
 * Les trois sortaient déjà du même calcul ; seule la première était rendue.
 */
export interface Minutage {
  mobiles: Map<string, Segment[]>;
  fenetres: Map<string, FenetreTrace>;
  chemins: Map<string, number[]>;
}

/**
 * Trajectoires de tous les mobiles : id d'élément → segments ordonnés dans le temps.
 * Robuste aux branches (au bout d'une conduite, le ballon part en passe ET le joueur repart
 * en course).
 */
export function construireTrajectoires(src: SourceAnimation): Map<string, Segment[]> {
  return minuter(src).mobiles;
}

/** Minutage complet (cf. `Minutage`). */
export function minuter(src: SourceAnimation): Minutage {
  const res = new Map<string, Segment[]>();
  const fenetres = new Map<string, FenetreTrace>();
  const fleches = src.traces.filter(t => t.points.length >= 4);
  if (!fleches.length) return { mobiles: res, fenetres, chemins: new Map() };

  // Le rendu Konva courbe les tracés (tension). On échantillonne la MÊME courbe pour que le
  // jeton suive la flèche dessinée, pas la polyligne droite entre les points cliqués.
  const rendu = new Map<string, number[]>();
  fleches.forEach(a => rendu.set(a.id, cheminRendu(a.points)));

  const debut = (a: TraceAnimee): Point => ({ x: a.points[0], y: a.points[1] });
  const fin = (a: TraceAnimee): Point => ({ x: a.points[a.points.length - 2], y: a.points[a.points.length - 1] });
  const estBallon = (a: TraceAnimee) => a.type === 'conduite' || a.type === 'passe' || a.type === 'tir';
  const estJoueur = (a: TraceAnimee) => a.type === 'conduite' || a.type === 'deplacement';

  const plusProche = (type: string, p: Point): ElementAnime | undefined => {
    let best: ElementAnime | undefined; let dMin = RAYON_LIEN;
    for (const e of src.elements) {
      if (e.type !== type) continue;
      const rp = src.repos(e);
      const d = Math.hypot(rp.x - p.x, rp.y - p.y);
      if (d <= dMin) { dMin = d; best = e; }
    }
    return best;
  };

  // Prédécesseur de même nature (joueur ou ballon) : le plus proche.
  const predNature = (a: TraceAnimee, estType: (x: TraceAnimee) => boolean): TraceAnimee | undefined => {
    let best: TraceAnimee | undefined; let dMin = RAYON_LIEN;
    for (const b of fleches) {
      if (b.id === a.id || !estType(b)) continue;
      const d = Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y);
      if (d <= dMin) { dMin = d; best = b; }
    }
    return best;
  };

  // Lien EXPLICITE posé au dessin (lierTrace) : une flèche dessinée sur un jeton/ballon lui est
  // réservée — prioritaire sur toute déduction géométrique (deux flèches proches ou qui se
  // croisent ne se volent plus leur mobile).
  const explicite = (a: TraceAnimee, type: 'ballon' | 'joueur'): ElementAnime | undefined => {
    const id = type === 'joueur'
      ? (estJoueur(a) ? a.elementId : undefined)
      : (a.type === 'conduite' ? a.ballId : (estBallon(a) ? a.elementId : undefined));
    return id ? src.elements.find(e => e.id === id && e.type === type) : undefined;
  };

  // Propriétaire d'une flèche : le lien explicite, sinon hérité du prédécesseur de même nature,
  // sinon l'élément le plus proche du départ (le ballon se prend au début d'une conduite, etc.).
  const memo = {
    ballon: new Map<string, ElementAnime | undefined>(),
    joueur: new Map<string, ElementAnime | undefined>(),
  };
  const owner = (
    a: TraceAnimee,
    type: 'ballon' | 'joueur',
    estType: (x: TraceAnimee) => boolean,
    vu = new Set<string>(),
  ): ElementAnime | undefined => {
    const m = memo[type];
    if (m.has(a.id)) return m.get(a.id);
    const ex = explicite(a, type);
    if (ex) { m.set(a.id, ex); return ex; }
    if (vu.has(a.id)) return undefined;
    vu.add(a.id);
    const p = predNature(a, estType);
    const r = p ? owner(p, type, estType, vu) : plusProche(type, debut(a));
    m.set(a.id, r);
    return r;
  };

  // Toutes les flèches qui FINISSENT au départ de a (ses « arrivants »). Les chaînes de deux
  // joueurs DIFFÉRENTS ne se synchronisent pas entre elles (une course qui se termine près du
  // départ de la flèche d'un autre joueur ne doit pas la retarder) — sauf remise/relais où le
  // MÊME ballon passe de l'un à l'autre.
  const arrivants = (a: TraceAnimee) => fleches.filter(b => {
    if (b.id === a.id || Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y) > RAYON_LIEN) return false;
    const ja = estJoueur(a) ? owner(a, 'joueur', estJoueur) : undefined;
    const jb = estJoueur(b) ? owner(b, 'joueur', estJoueur) : undefined;
    if (ja && jb && ja.id !== jb.id) {
      const ba = estBallon(a) ? owner(a, 'ballon', estBallon) : undefined;
      const bb = estBallon(b) ? owner(b, 'ballon', estBallon) : undefined;
      return !!ba && !!bb && ba.id === bb.id;
    }
    return true;
  });

  // Vitesse (px/s) d'un segment. Mode vitesse : vitesse réelle du joueur (vmax/vmoy GPS) pour
  // course/conduite, vitesse de passe pour passe/tir. Mode temps : distance brute (1), l'échelle
  // ramène ensuite la plus longue séquence à la durée choisie.
  const vitLeg = (a: TraceAnimee): number => {
    if (src.modeAnim !== 'vitesse') return 1;
    if (a.type === 'passe' || a.type === 'tir') return src.vitesseBallePxS();
    return src.vitesseJoueurPxS(owner(a, 'joueur', estJoueur));
  };

  // Fenêtres temporelles : une flèche démarre quand TOUS ses arrivants sont là (max) → une
  // conduite attend le joueur ET le ballon. Durée d'un segment = longueur / vitesse.
  const t0 = new Map<string, number>(), t1 = new Map<string, number>();
  const enCalcul = new Set<string>();
  const calc = (a: TraceAnimee): number => {
    if (t1.has(a.id)) return t1.get(a.id)!;
    // Cycle de flèches : on coupe en traitant celle-ci comme un départ à t=0.
    if (enCalcul.has(a.id)) {
      t0.set(a.id, 0);
      t1.set(a.id, longueurChemin(rendu.get(a.id)!) / vitLeg(a));
      return t1.get(a.id)!;
    }
    enCalcul.add(a.id);
    const inc = arrivants(a);
    const dep = inc.length ? Math.max(...inc.map(calc)) : 0;
    t0.set(a.id, dep);
    t1.set(a.id, dep + longueurChemin(rendu.get(a.id)!) / vitLeg(a));
    enCalcul.delete(a.id);
    return t1.get(a.id)!;
  };
  fleches.forEach(calc);

  // Mode vitesse : t déjà en secondes (sc=1). Mode temps : la plus longue séquence = durée.
  const maxT = Math.max(1, ...fleches.map(a => t1.get(a.id)!));
  const sc = src.modeAnim === 'vitesse' ? 1 : src.dureeSecondes / maxT;

  const pousser = (id: string, a: TraceAnimee) => {
    const arr = res.get(id) ?? [];
    arr.push({ t0: t0.get(a.id)! * sc, t1: t1.get(a.id)! * sc, pts: rendu.get(a.id)! });
    res.set(id, arr);
  };
  for (const a of fleches) {
    fenetres.set(a.id, { t0: t0.get(a.id)! * sc, t1: t1.get(a.id)! * sc });
    if (estJoueur(a)) { const j = owner(a, 'joueur', estJoueur); if (j) pousser(j.id, a); }
    if (estBallon(a)) { const b = owner(a, 'ballon', estBallon); if (b) pousser(b.id, a); }
  }
  for (const arr of res.values()) arr.sort((x, y) => x.t0 - y.t0);
  return { mobiles: res, fenetres, chemins: rendu };
}

// ── Résolution de la mise en scène ──

/** Instant (s) d'une borne : la valeur si elle est fixe, sinon le bord de la flèche ancrée. */
export function resoudreBorne(
  b: BorneVie | undefined,
  fenetres: Map<string, FenetreTrace>,
  defaut: number,
): number {
  if (typeof b === 'number') return b;
  const f = b ? fenetres.get(b.trace) : undefined;
  if (!f) return defaut;             // ancre orpheline (flèche supprimée) : borne neutre
  return b!.bord === 'fin' ? f.t1 : f.t0;
}

/** Fenêtre en secondes. Fin absente = jamais retiré, y compris si la durée s'allonge. */
export function resoudreVie(vie: Vie | undefined, fenetres: Map<string, FenetreTrace>): FenetreTrace {
  return {
    t0: resoudreBorne(vie?.debut, fenetres, 0),
    t1: resoudreBorne(vie?.fin, fenetres, Number.POSITIVE_INFINITY),
  };
}

/** Vrai si l'objet porte une contrainte de temps (sinon : toujours là, aucun calcul). */
export function aUneVie(vie: Vie | undefined): boolean {
  return !!vie && (vie.debut !== undefined || vie.fin !== undefined);
}

/** Opacité d'une forme ou d'un jeton à l'instant t (0 = absent), fondus compris. */
export function opaciteVie(vie: Vie | undefined, fenetres: Map<string, FenetreTrace>, t: number): number {
  if (!aUneVie(vie)) return 1;
  const { t0, t1 } = resoudreVie(vie, fenetres);
  if (t < t0 || t > t1 + FONDU_VIE) return 0;
  if (t < t0 + FONDU_VIE) return (t - t0) / FONDU_VIE;
  if (t > t1) return 1 - (t - t1) / FONDU_VIE;
  return 1;
}

/** Ce qu'il faut afficher d'une flèche à l'instant t : `fraction` = part déjà tracée. */
export interface EtatTrace { opacite: number; fraction: number; }

export function etatTrace(f: FenetreTrace | undefined, t: number, mode: ModeTraces): EtatTrace {
  if (mode === 'aucun') return { opacite: 0, fraction: 1 };
  // Flèche sans minutage (rattachée à aucun mobile) : elle n'a pas d'action à suivre, on la
  // laisse au tableau plutôt que de la faire disparaître sans raison.
  if (mode === 'toujours' || !f) return { opacite: 1, fraction: 1 };
  if (t < f.t0) return { opacite: 0, fraction: 0 };
  if (t <= f.t1) {
    const d = f.t1 - f.t0;
    return { opacite: 1, fraction: d > 0 ? (t - f.t0) / d : 1 };
  }
  if (t <= f.t1 + FONDU_TRACE) return { opacite: 1 - (t - f.t1) / FONDU_TRACE, fraction: 1 };
  return { opacite: 0, fraction: 1 };
}

/** Position d'un mobile à l'instant t le long de ses segments (entre deux segments : il attend). */
export function posTrajectoire(legs: Segment[], t: number): Point {
  if (t <= legs[0].t0) return { x: legs[0].pts[0], y: legs[0].pts[1] };
  for (let i = 0; i < legs.length; i++) {
    const lg = legs[i];
    if (t <= lg.t1) {
      if (t < lg.t0) { const pv = legs[i - 1].pts; return { x: pv[pv.length - 2], y: pv[pv.length - 1] }; }
      const r = lg.t1 > lg.t0 ? (t - lg.t0) / (lg.t1 - lg.t0) : 1;
      return pointLeLongDe(lg.pts, Math.max(0, Math.min(1, r)));
    }
  }
  const last = legs[legs.length - 1].pts;
  return { x: last[last.length - 2], y: last[last.length - 1] };
}

/**
 * Distance parcourue le long d'une trajectoire depuis son début, en unités terrain.
 *
 * Symétrique de {@link posTrajectoire} : une FONCTION de t, jamais un cumul image par image.
 * C'est ce qui permet de faire rouler le ballon sans que reculer la timeline, sauter à un
 * instant ou changer de vitesse ne dérègle son orientation.
 */
export function distanceParcourue(legs: Segment[], t: number): number {
  let d = 0;
  for (const lg of legs) {
    if (t <= lg.t0) break;
    const L = longueurChemin(lg.pts);
    if (t >= lg.t1) { d += L; continue; }
    const r = lg.t1 > lg.t0 ? (t - lg.t0) / (lg.t1 - lg.t0) : 1;
    d += L * Math.max(0, Math.min(1, r));
    break;
  }
  return d;
}

/**
 * Distance parcourue depuis le début d'après les KEYFRAMES — pendant de
 * {@link distanceParcourue} pour les éléments qui n'ont pas de flèche.
 */
export function distanceKeyframes(el: ElementAnime, t: number, keyframes: readonly Keyframe[]): number {
  const avec = keyframes.filter(k => k.positions[el.id]);
  let d = 0;
  for (let i = 0; i < avec.length - 1; i++) {
    const a = avec[i], b = avec[i + 1];
    if (t <= a.t) break;
    const pa = a.positions[el.id], pb = b.positions[el.id];
    const L = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (t >= b.t) { d += L; continue; }
    d += L * (b.t > a.t ? (t - a.t) / (b.t - a.t) : 1);
    break;
  }
  return d;
}

/**
 * Joueurs en train de frapper à l'instant t, avec l'intensité du geste (0→1).
 *
 * Une flèche de passe ou de tir est liée au BALLON, jamais au tireur : on retrouve donc
 * celui-ci comme le joueur le plus proche du point de départ, et seulement s'il est à portée
 * de frappe — sinon un ballon lancé au milieu du terrain ferait armer un joueur à 30 m.
 */
export function frappes(traces: readonly TraceAnimee[], fenetres: Map<string, FenetreTrace>,
                        joueurs: readonly { id: string; x: number; y: number }[],
                        t: number, duree = 0.35, portee = 45): Map<string, number> {
  const out = new Map<string, number>();
  for (const tr of traces) {
    if (tr.type !== 'passe' && tr.type !== 'tir') continue;
    const f = fenetres.get(tr.id);
    if (!f) continue;
    const ecart = Math.abs(t - f.t0);
    if (ecart > duree) continue;
    const x = tr.points[0], y = tr.points[1];
    let best: string | undefined, dMin = portee;
    for (const j of joueurs) {
      const d = Math.hypot(j.x - x, j.y - y);
      if (d <= dMin) { dMin = d; best = j.id; }
    }
    if (!best) continue;
    // Montée puis retombée du geste autour de l'instant du départ du ballon.
    const intensite = 1 - ecart / duree;
    out.set(best, Math.max(out.get(best) ?? 0, intensite));
  }
  return out;
}

/** Position d'un élément à l'instant t d'après les keyframes (interpolation linéaire). */
export function posKeyframes(el: ElementAnime, t: number, keyframes: readonly Keyframe[]): Point {
  const avec = keyframes.filter(k => k.positions[el.id]);
  if (avec.length === 0) return { x: el.x, y: el.y };
  if (t <= avec[0].t) return avec[0].positions[el.id];
  for (let i = 0; i < avec.length - 1; i++) {
    const a = avec[i], b = avec[i + 1];
    if (t >= a.t && t <= b.t) {
      const r = (b.t - a.t) ? (t - a.t) / (b.t - a.t) : 0;
      const pa = a.positions[el.id], pb = b.positions[el.id];
      return { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r };
    }
  }
  return avec[avec.length - 1].positions[el.id];
}

/** Instant (s) où la dernière chaîne de flèches se termine — durée minimale en mode vitesse. */
export function dureeMaxTrajectoires(traj: Map<string, Segment[]>): number {
  let max = 0;
  for (const legs of traj.values()) for (const lg of legs) if (lg.t1 > max) max = lg.t1;
  return max;
}
