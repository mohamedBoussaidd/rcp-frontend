/**
 * Données tactiques de l'éditeur de schéma : formations préréglées et coups de pied
 * arrêtés. Positions normalisées (x = profondeur 0=notre but → 1=but adverse ; y = largeur
 * 0→1). Aucune logique, uniquement des constantes.
 */

export interface Formation { nom: string; positions: { x: number; y: number }[]; }

export interface CoupDePiedArrete {
  ball: { x: number; y: number };
  attaquants: { x: number; y: number }[];
  defenseurs: { x: number; y: number }[];
  mur?: { x: number; y: number }[];
}

export const FORMATIONS: Formation[] = [
  {
    nom: '4-3-3', positions: [
      { x: .06, y: .5 }, { x: .20, y: .16 }, { x: .20, y: .39 }, { x: .20, y: .61 }, { x: .20, y: .84 },
      { x: .35, y: .27 }, { x: .35, y: .5 }, { x: .35, y: .73 }, { x: .47, y: .22 }, { x: .47, y: .5 }, { x: .47, y: .78 }]
  },
  {
    nom: '4-4-2', positions: [
      { x: .06, y: .5 }, { x: .20, y: .16 }, { x: .20, y: .39 }, { x: .20, y: .61 }, { x: .20, y: .84 },
      { x: .35, y: .16 }, { x: .35, y: .39 }, { x: .35, y: .61 }, { x: .35, y: .84 }, { x: .47, y: .4 }, { x: .47, y: .6 }]
  },
  {
    nom: '4-2-3-1', positions: [
      { x: .06, y: .5 }, { x: .20, y: .16 }, { x: .20, y: .39 }, { x: .20, y: .61 }, { x: .20, y: .84 },
      { x: .30, y: .38 }, { x: .30, y: .62 }, { x: .42, y: .22 }, { x: .42, y: .5 }, { x: .42, y: .78 }, { x: .5, y: .5 }]
  },
  {
    nom: '3-5-2', positions: [
      { x: .06, y: .5 }, { x: .20, y: .27 }, { x: .20, y: .5 }, { x: .20, y: .73 },
      { x: .34, y: .1 }, { x: .34, y: .32 }, { x: .34, y: .5 }, { x: .34, y: .68 }, { x: .34, y: .9 }, { x: .47, y: .4 }, { x: .47, y: .6 }]
  },
  {
    nom: '3-4-3', positions: [
      { x: .06, y: .5 }, { x: .20, y: .27 }, { x: .20, y: .5 }, { x: .20, y: .73 },
      { x: .35, y: .16 }, { x: .35, y: .39 }, { x: .35, y: .61 }, { x: .35, y: .84 }, { x: .47, y: .22 }, { x: .47, y: .5 }, { x: .47, y: .78 }]
  },
  {
    nom: '5-3-2', positions: [
      { x: .06, y: .5 }, { x: .20, y: .1 }, { x: .20, y: .3 }, { x: .20, y: .5 }, { x: .20, y: .7 }, { x: .20, y: .9 },
      { x: .35, y: .27 }, { x: .35, y: .5 }, { x: .35, y: .73 }, { x: .47, y: .4 }, { x: .47, y: .6 }]
  },
];

// Base : on attaque le but DROIT, corner/CF côté "D" (y haut). Le ballon est dans l'angle.
// Pour défensif, on retourne x (on défend le but gauche) ; pour le côté G, on retourne y.
export const COUPS_DE_PIED_ARRETES: Record<'corner' | 'cf', CoupDePiedArrete> = {
  corner: {
    ball: { x: .992, y: .965 },              // dans l'angle
    attaquants: [
      { x: .96, y: .92 },                    // tireur du corner
      { x: .93, y: .85 }, { x: .9, y: .7 }, { x: .92, y: .5 }, { x: .9, y: .3 },
      { x: .84, y: .5 }, { x: .77, y: .4 }, { x: .77, y: .6 }, { x: .55, y: .45 }, { x: .55, y: .6 }, { x: .07, y: .5 }],
    defenseurs: [
      { x: .965, y: .5 },                    // gardien adverse
      { x: .93, y: .44 }, { x: .93, y: .56 }, { x: .88, y: .38 }, { x: .88, y: .5 }, { x: .88, y: .62 },
      { x: .85, y: .46 }, { x: .85, y: .58 }, { x: .78, y: .5 }, { x: .9, y: .82 }, { x: .6, y: .5 }],
  },
  cf: {
    ball: { x: .72, y: .6 },                 // entrée de la surface, côté droit
    attaquants: [
      { x: .71, y: .57 }, { x: .69, y: .66 },           // tireurs
      { x: .86, y: .4 }, { x: .86, y: .5 }, { x: .86, y: .6 }, { x: .82, y: .32 }, { x: .82, y: .68 },
      { x: .6, y: .45 }, { x: .6, y: .6 }, { x: .42, y: .5 }, { x: .07, y: .5 }],
    defenseurs: [
      { x: .965, y: .5 },                    // gardien adverse
      { x: .9, y: .4 }, { x: .9, y: .6 }, { x: .87, y: .45 }, { x: .87, y: .5 }, { x: .87, y: .55 },
      { x: .7, y: .42 }, { x: .7, y: .58 }, { x: .55, y: .5 }, { x: .5, y: .4 }, { x: .5, y: .6 }],
    mur: [{ x: .8, y: .47 }, { x: .8, y: .51 }, { x: .8, y: .55 }, { x: .8, y: .59 }],  // mannequins
  },
};
