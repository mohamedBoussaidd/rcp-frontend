/**
 * Caméra perspective du rendu tactique (source unique éditeur + viewer + diaporama).
 *
 * Le terrain est un plan `z = 0` en coordonnées MONDE — exactement les coordonnées
 * logiques des schémas (x ∈ [0..W], y ∈ [0..H]), inchangées : la caméra est un
 * paramètre d'AFFICHAGE, jamais une donnée du schéma. `z` est l'altitude (vers le
 * haut) et ne sert qu'aux volumes : cages, drapeaux, épaisseur de la dalle.
 *
 * Deux angles pilotent tout :
 *  · `inclinaison` — 0° = vue de dessus (projection strictement identitaire, donc
 *    aucune régression du rendu historique), ~65° = vue rasante ;
 *  · `rotation`    — tour du terrain, 0° = depuis la ligne de touche basse,
 *    90° = depuis derrière une cage.
 *
 * La projection d'un plan est une homographie : elle est donc INVERSIBLE de façon
 * exacte (cf. {@link Camera.deprojeter}), ce qui permet de continuer à éditer
 * (déplacer un jeton, cliquer un point) quel que soit l'angle.
 */

const DEG = Math.PI / 180;

/** Distance caméra ↔ centre du terrain, en multiples de la plus grande dimension.
 *  1,7 donne une perspective franche sans déformation « grand-angle ». */
const DISTANCE = 1.7;

/** Part de la zone d'affichage réellement occupée par le terrain après cadrage. */
const REMPLISSAGE = 0.995;

/**
 * Débords pris en compte par le cadrage automatique. Ils sont ajustés au VOLUME RÉEL :
 * les cages rentrent vers l'intérieur depuis la ligne de but (elles ne dépassent donc
 * jamais latéralement du rectangle du terrain), seules l'altitude des drapeaux et
 * l'épaisseur de la dalle sortent du plan. Réserver une marge sur les quatre côtés
 * rétrécissait la vue inclinée de plus de 10 % pour rien.
 */
const DEBORD_LATERAL = 0;
const DEBORD_HAUT = 28;
const DEBORD_BAS = 22;

export interface ParamsCamera {
  /** Inclinaison en degrés : 0 = vue de dessus, 70 = quasi rasant. */
  inclinaison: number;
  /** Rotation autour du centre du terrain, en degrés (-180..180). */
  rotation: number;
}

export interface PointProjete {
  x: number;
  y: number;
  /** Facteur de taille à cette profondeur (sprites, épaisseurs de trait). */
  echelle: number;
}

export const CAMERA_DESSUS: ParamsCamera = { inclinaison: 0, rotation: 0 };

/** Angle par défaut du mode présentation (diaporama, viewer en perspective). */
export const CAMERA_PRESENTATION: ParamsCamera = { inclinaison: 52, rotation: 0 };

export interface PresetCamera {
  cle: string;
  libelle: string;
  params: ParamsCamera;
}

export const PRESETS_CAMERA: readonly PresetCamera[] = [
  { cle: 'dessus', libelle: 'Dessus', params: { inclinaison: 0, rotation: 0 } },
  { cle: 'deux_cinq', libelle: '2.5D', params: { inclinaison: 52, rotation: 0 } },
  { cle: 'trois_quarts', libelle: '3/4', params: { inclinaison: 57, rotation: 26 } },
  { cle: 'cage', libelle: 'Derrière la cage', params: { inclinaison: 60, rotation: 90 } },
];

export const INCLINAISON_MAX = 70;

/** Une inclinaison en deçà de ce seuil est traitée comme une vue de dessus. */
export const SEUIL_INCLINAISON = 0.5;

export function estInclinee(p: ParamsCamera | null | undefined): boolean {
  return !!p && p.inclinaison > SEUIL_INCLINAISON;
}

export class Camera {
  private readonly ct: number;   // cos / sin de l'inclinaison
  private readonly st: number;
  private readonly cr: number;   // cos / sin de la rotation
  private readonly sr: number;
  private readonly d: number;    // distance caméra ↔ centre
  private readonly f: number;    // focale (= d ⇒ identité à inclinaison 0)
  private ech = 1;               // cadrage automatique : échelle…
  private ox = 0;                // … et translation
  private oy = 0;

  constructor(readonly W: number, readonly H: number, readonly params: ParamsCamera) {
    const t = params.inclinaison * DEG, r = params.rotation * DEG;
    this.ct = Math.cos(t); this.st = Math.sin(t);
    this.cr = Math.cos(r); this.sr = Math.sin(r);
    this.d = DISTANCE * Math.max(W, H);
    this.f = this.d;
    this.cadrer();
  }

  /** Projection d'un point MONDE (x, y, altitude z) vers l'écran. */
  projeter(x: number, y: number, z = 0): PointProjete {
    const p = this.brut(x - this.W / 2, y - this.H / 2, z);
    return { x: this.ox + p.x * this.ech, y: this.oy + p.y * this.ech, echelle: p.echelle * this.ech };
  }

  /**
   * Inverse exacte de {@link projeter} SUR LE SOL (z = 0) : un point d'écran
   * (curseur, jeton déposé) redevient un point du terrain. C'est ce qui permet de
   * garder l'édition vivante en vue inclinée.
   */
  deprojeter(ex: number, ey: number): { x: number; y: number } {
    const px = (ex - this.ox) / this.ech, py = (ey - this.oy) / this.ech;
    // py = f·Y1·cos t / (d − Y1·sin t)  ⇒  Y1 = py·d / (f·cos t + py·sin t)
    const den = this.f * this.ct + py * this.st;
    const Y1 = Math.abs(den) < 1e-9 ? 0 : (py * this.d) / den;
    const X1 = (px * (this.d - Y1 * this.st)) / this.f;
    // Rotation inverse (yaw).
    return {
      x: X1 * this.cr - Y1 * this.sr + this.W / 2,
      y: X1 * this.sr + Y1 * this.cr + this.H / 2,
    };
  }

  /** Projette une polyligne [x0,y0,x1,y1,…] à altitude constante. */
  projeterPolyligne(pts: number[], z = 0): number[] {
    const out: number[] = [];
    for (let i = 0; i < pts.length - 1; i += 2) {
      const p = this.projeter(pts[i], pts[i + 1], z);
      out.push(p.x, p.y);
    }
    return out;
  }

  /**
   * Position de la caméra en coordonnées MONDE. Sert à décider quelles faces d'un
   * volume sont visibles (élimination des faces arrière de la dalle).
   */
  positionMonde(): { x: number; y: number; z: number } {
    const Y1 = this.d * this.st;
    return { x: this.W / 2 - Y1 * this.sr, y: this.H / 2 + Y1 * this.cr, z: this.d * this.ct };
  }

  /** Projection sans cadrage, en coordonnées centrées sur le terrain. */
  private brut(X: number, Y: number, Z: number): PointProjete {
    // 1. Rotation autour de l'axe vertical.
    const X1 = X * this.cr + Y * this.sr;
    const Y1 = -X * this.sr + Y * this.cr;
    // 2. Basculement de la caméra. L'écran a son Y vers le bas, Z est l'altitude :
    //    une altitude positive doit donc REMONTER à l'écran, d'où le signe de Z.
    const Yc = Y1 * this.ct - Z * this.st;
    const Zc = Math.max(this.d * 0.05, this.d - Y1 * this.st - Z * this.ct);
    const k = this.f / Zc;
    return { x: X1 * k, y: Yc * k, echelle: k };
  }

  /**
   * Cadrage automatique : quel que soit l'angle, le terrain et ses débords tiennent
   * dans la zone d'affichage. Sans cela, incliner ferait sortir le terrain du canvas.
   */
  private cadrer(): void {
    const { W, H } = this;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const X = sx * (W / 2 + DEBORD_LATERAL), Y = sy * (H / 2 + DEBORD_LATERAL);
        for (const Z of [-DEBORD_BAS, 0, DEBORD_HAUT]) {
          const p = this.brut(X, Y, Z);
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
          y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
      }
    }
    this.ech = Math.min(W * REMPLISSAGE / (x1 - x0), H * REMPLISSAGE / (y1 - y0));
    this.ox = W / 2 - (x0 + x1) / 2 * this.ech;
    this.oy = H / 2 - (y0 + y1) / 2 * this.ech;
  }
}
