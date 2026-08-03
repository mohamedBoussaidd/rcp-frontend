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

/** Vitesse (px/s) à laquelle le ballon rejoint un porteur désigné en mode « ballon à lui ». */
export const VITESSE_PASSE = 420;

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
  /**
   * `true` : c'est le BALLON qui va au porteur désigné (2e geste), au lieu du porteur qui court
   * au ballon. Le placement de tout le monde est alors calculé sur la position du porteur —
   * sans ça, le bloc suivrait le ballon en vol et se replacerait deux fois.
   */
  readonly ballonAuPorteur: boolean;
  readonly phaseAuto: boolean;
  readonly possessionNous: boolean;
}

export interface PlanMoteur {
  /** Jeton qui conduit le ballon (halo jaune), s'il y en a un. */
  porteur: JetonMoteur | undefined;
  /** Cible (px terrain) de chaque jeton piloté — les autres n'y figurent pas. */
  cibles: Map<string, PosSlot>;
  /** Où le ballon doit se rendre (mode « le ballon vient à lui »), sinon absent. */
  cibleBallon?: PosSlot;
}

/**
 * Où doit aller chaque jeton piloté pour la position courante du ballon.
 *
 * Mode normal : le porteur vient AU ballon, les autres rejoignent la posture interpolée de leur
 * slot. Mode « ballon au porteur » : le ballon part vers le porteur et c'est la position du
 * PORTEUR qui sert de référence à l'interpolation — donc la zone change vraiment et tout le
 * bloc se replace, ce que la simple désignation d'un porteur ne faisait pas.
 */
export function planifierMoteur(ctx: ContexteMoteur): PlanMoteur {
  const relBallon = pxVersRel({ x: ctx.ballon.x, y: ctx.ballon.y }, ctx.W, ctx.H);
  // 1er jet (sans porteur connu) : sert uniquement à désigner le porteur.
  const postures = (ref: PosSlot, porteurSlot?: string | null, porteurAdverse = false) => {
    const nous = ctx.reglesNous
      ? ciblesPhase(ctx.reglesNous, ctx.phaseNous, ref, porteurAdverse ? null : porteurSlot) : null;
    const adv = ctx.reglesAdverse
      ? ciblesPhase(ctx.reglesAdverse, PHASE_ADVERSE[ctx.phaseNous], ref, porteurAdverse ? porteurSlot : null)
      : null;
    return (el: JetonMoteur): Posture | null => (ctx.estAdverse(el) ? adv : nous);
  };

  const porteur = choisirPorteur(ctx, postures(relBallon));

  // 2e jet : la référence et le porteur sont connus, les postures peuvent être les bonnes.
  const suitLePorteur = ctx.ballonAuPorteur && !!porteur;
  const ref = suitLePorteur
    ? pxVersRel({ x: porteur!.x, y: porteur!.y }, ctx.W, ctx.H)
    : relBallon;
  const postureDe = postures(ref, porteur?.slotId, !!porteur && ctx.estAdverse(porteur));

  const cibles = new Map<string, PosSlot>();
  for (const el of ctx.elements) {
    if (!ctx.estPilote(el)) continue;
    if (porteur?.id === el.id) {
      cibles.set(el.id, suitLePorteur
        // Le ballon vient à LUI : il ne bouge pas, il attend et regarde venir. C'est aussi ce
        // qui rend la scène stable — un porteur mobile déplacerait la référence à chaque image.
        ? { x: el.x, y: el.y }
        // Sinon il colle au ballon, décalé côté son propre but : il le protège.
        : {
          x: ctx.ballon.x + (ctx.estAdverse(el) ? OFFSET_PORTEUR : -OFFSET_PORTEUR),
          y: ctx.ballon.y,
        });
      continue;
    }
    const c = postureDe(el)?.[el.slotId!];
    if (c) cibles.set(el.id, relVersPx(c, ctx.W, ctx.H));
  }

  const plan: PlanMoteur = { porteur, cibles };
  if (suitLePorteur) {
    // Le ballon se pose au pied du porteur, côté but adverse : devant lui, pas dedans.
    plan.cibleBallon = {
      x: porteur!.x + (ctx.estAdverse(porteur!) ? -OFFSET_PORTEUR : OFFSET_PORTEUR),
      y: porteur!.y,
    };
  }
  return plan;
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
