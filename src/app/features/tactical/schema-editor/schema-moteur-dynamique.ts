import {
  DUREE_TRANSITION_DEFAUT_S, PHASE_ADVERSE, PhaseKey, PosSlot, Posture, ReglesJson,
  ciblesPhase, pxVersRel, relVersPx,
} from '../moteur/moteur-tactique';
import { RAYON_LIEN } from '../schema-render/schema-animation';

/**
 * Décisions du mode Dynamique : qui porte le ballon, où chaque jeton doit aller, à qui est la
 * possession. Fonctions PURES — aucune dépendance Angular ni Konva : l'éditeur garde le
 * pilotage des nœuds (déplacement à la vitesse GPS, halo, REC), ce module décide seulement.
 *
 * Le camp adverse est passé en prédicat plutôt qu'en couleur : le noir des jetons adverses est
 * une affaire de palette, pas de moteur tactique.
 */

/** Jeton vu par le moteur (l'élément de l'éditeur en est un sur-ensemble). */
export interface JetonMoteur {
  id: string;
  type: string;
  /** Poste du système (posé par les formations) — sans lui, le jeton n'est pas piloté. */
  slotId?: string;
  x: number;
  y: number;
}

/** Décalage (px) du porteur par rapport au ballon, côté son propre but : il le protège. */
export const OFFSET_PORTEUR = 16;

export interface ContexteMoteur {
  readonly elements: readonly JetonMoteur[];
  readonly ballon: JetonMoteur;
  readonly W: number;
  readonly H: number;
  readonly phaseNous: PhaseKey;
  readonly reglesNous: ReglesJson | null;
  /** Règles adverses EFFECTIVES : le profil enregistré, sinon le miroir auto de notre jeu. */
  readonly reglesAdverse: ReglesJson | null;
  /** Jeton piloté : porteur d'un slot ET sans flèche dessinée (les flèches priment). */
  estPilote(el: JetonMoteur): boolean;
  estAdverse(el: JetonMoteur): boolean;
  /** Porteur désigné au clic ; absent = désignation automatique. */
  readonly porteurManuel: JetonMoteur | undefined;
  readonly phaseAuto: boolean;
  readonly possessionNous: boolean;
}

export interface PlanMoteur {
  /** Jeton qui conduit le ballon (halo jaune), s'il y en a un. */
  porteur: JetonMoteur | undefined;
  /** Cible (px terrain) de chaque jeton piloté — les autres n'y figurent pas. */
  cibles: Map<string, PosSlot>;
}

/**
 * Où doit aller chaque jeton piloté pour la position courante du ballon.
 * Le porteur vient AU ballon ; tous les autres rejoignent la posture interpolée de leur slot.
 */
export function planifierMoteur(ctx: ContexteMoteur): PlanMoteur {
  const rel = pxVersRel({ x: ctx.ballon.x, y: ctx.ballon.y }, ctx.W, ctx.H);
  const ciblesNous = ctx.reglesNous ? ciblesPhase(ctx.reglesNous, ctx.phaseNous, rel) : null;
  const ciblesAdv = ctx.reglesAdverse
    ? ciblesPhase(ctx.reglesAdverse, PHASE_ADVERSE[ctx.phaseNous], rel)
    : null;

  const postureDe = (el: JetonMoteur): Posture | null => (ctx.estAdverse(el) ? ciblesAdv : ciblesNous);
  const porteur = choisirPorteur(ctx, postureDe);

  const cibles = new Map<string, PosSlot>();
  for (const el of ctx.elements) {
    if (!ctx.estPilote(el)) continue;
    if (porteur?.id === el.id) {
      // Le porteur colle au ballon, décalé côté son propre but.
      cibles.set(el.id, {
        x: ctx.ballon.x + (ctx.estAdverse(el) ? OFFSET_PORTEUR : -OFFSET_PORTEUR),
        y: ctx.ballon.y,
      });
      continue;
    }
    const c = postureDe(el)?.[el.slotId!];
    if (c) cibles.set(el.id, relVersPx(c, ctx.W, ctx.H));
  }
  return { porteur, cibles };
}

/**
 * Porteur du ballon : le jeton désigné à la main s'il est encore pilotable, sinon — dans le camp
 * en possession — celui dont la CIBLE est la plus proche du ballon. On compare les cibles et non
 * les positions courantes : sinon deux joueurs qui se croisent se disputent le ballon à chaque
 * frame et le halo clignote.
 */
export function choisirPorteur(
  ctx: ContexteMoteur,
  postureDe: (el: JetonMoteur) => Posture | null,
): JetonMoteur | undefined {
  const manuel = ctx.porteurManuel;
  if (manuel && ctx.estPilote(manuel)) return manuel;

  // Camp en possession : imposé par le porteur manuel s'il existe (même non pilotable),
  // sinon la possession courante en mode Auto, sinon déduit de la phase choisie.
  const campNousPossede = manuel
    ? !ctx.estAdverse(manuel)
    : (ctx.phaseAuto ? ctx.possessionNous : (ctx.phaseNous === 'OFF' || ctx.phaseNous === 'T_DO'));

  let porteur: JetonMoteur | undefined;
  let dMin = Infinity;
  for (const el of ctx.elements) {
    if (!ctx.estPilote(el)) continue;
    if (!ctx.estAdverse(el) !== campNousPossede) continue;
    const c = postureDe(el)?.[el.slotId!];
    if (!c) continue;
    const p = relVersPx(c, ctx.W, ctx.H);
    const d = Math.hypot(p.x - ctx.ballon.x, p.y - ctx.ballon.y);
    if (d < dMin) { dMin = d; porteur = el; }
  }
  return porteur;
}

export interface EtatPossession {
  possessionNous: boolean;
  /** Phase à appliquer, ou `null` si elle ne change pas à cette frame. */
  phase: PhaseKey | null;
  /** Fin de la phase transitoire (s, horloge perf) ; 0 = pas de transition en cours. */
  transitionJusqua: number;
}

/**
 * Possession déduite du jeton le plus proche du ballon (ou imposée par le porteur manuel).
 * Un changement de camp ouvre une phase transitoire (T_DO / T_OD) qui dure `dureeTransitionS`,
 * puis retombe sur l'organisation correspondante (OFF / DEF).
 */
export function evaluerPossession(
  ctx: ContexteMoteur,
  tNow: number,
  transitionJusqua: number,
): EtatPossession {
  let camp: boolean | null = null;
  if (ctx.porteurManuel) {
    camp = !ctx.estAdverse(ctx.porteurManuel);   // le porteur désigné IMPOSE la possession
  } else {
    let dMin = RAYON_LIEN;
    for (const e of ctx.elements) {
      if (e.type !== 'joueur') continue;
      const d = Math.hypot(e.x - ctx.ballon.x, e.y - ctx.ballon.y);
      if (d <= dMin) { dMin = d; camp = !ctx.estAdverse(e); }
    }
  }

  const res: EtatPossession = {
    possessionNous: ctx.possessionNous,
    phase: null,
    transitionJusqua,
  };
  if (camp !== null && camp !== ctx.possessionNous) {
    res.possessionNous = camp;
    res.phase = camp ? 'T_DO' : 'T_OD';
    res.transitionJusqua = tNow + (ctx.reglesNous?.dureeTransitionS ?? DUREE_TRANSITION_DEFAUT_S);
  }
  if (res.transitionJusqua && tNow >= res.transitionJusqua) {
    res.transitionJusqua = 0;
    res.phase = res.possessionNous ? 'OFF' : 'DEF';
  }
  return res;
}

/**
 * Posture d'un camp construite depuis les positions ACTUELLES de ses jetons — c'est ce qu'on
 * écrit dans les règles quand le coach corrige un placement, l'ancienne posture servant de base
 * pour les slots absents du terrain.
 */
export function posturePourCamp(
  base: Posture | undefined,
  elements: readonly JetonMoteur[],
  adverse: boolean,
  estAdverse: (el: JetonMoteur) => boolean,
  W: number,
  H: number,
): Posture {
  const posture: Posture = { ...(base ?? {}) };
  for (const e of elements) {
    if (e.type !== 'joueur' || !e.slotId) continue;
    if (estAdverse(e) !== adverse) continue;
    posture[e.slotId] = pxVersRel({ x: e.x, y: e.y }, W, H);
  }
  return posture;
}
