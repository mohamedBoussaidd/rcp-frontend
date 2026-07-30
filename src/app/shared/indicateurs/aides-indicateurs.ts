/**
 * Textes d'aide des indicateurs athlétiques — SOURCE UNIQUE.
 *
 * Réutilisés par la fiche joueur, /etat-effectif et les dashboards : un indicateur ne doit pas
 * être expliqué de deux façons différentes selon l'écran. Chaque entrée est AUTOSUFFISANTE (elle
 * se lit sans ouvrir /methodologie), parce que cette page est gardée par le module prépa physique :
 * un médecin, un entraîneur non-physique ou un joueur n'y a pas accès. L'`ancre` ne sert donc qu'à
 * l'appelant qui a le droit de proposer le lien.
 *
 * Convention respectée partout : les scores sont sur 100 (jamais « % »), et « % » est réservé aux
 * vraies proportions (probabilité à 7 jours, écart de charge).
 */
export interface AideIndicateur {
  titre: string;
  texte: string;
  /** Ancre de la carte correspondante dans /methodologie (voir methodologie.component.html). */
  ancre?: string;
}

export const AIDES_INDICATEURS: Record<string, AideIndicateur> = {

  acwr: {
    titre: 'ACWR — charge récente vs habituelle',
    texte: "Charge des 7 derniers jours divisée par la moyenne hebdomadaire des semaines "
      + "précédentes (jusqu'à 4, selon l'historique réellement disponible). Repère de MONTÉE de "
      + "charge, pas une prédiction : 0,80 à 1,30 = progression maîtrisée, au-delà de 1,50 le "
      + "risque augmente. Calculé sur la charge mesurée (GPS), la charge ressentie (sRPE), ou les "
      + "deux combinées selon les données disponibles.",
    ancre: 'acwr',
  },

  risque: {
    titre: 'Score de risque blessure',
    texte: "Score composite sur 100 : montée de charge (ACWR), blessures récentes non soldées et "
      + "écart au poids de forme. Il ordonne les joueurs à surveiller, il ne prédit personne. La "
      + "probabilité à 7 jours affichée à côté est une conversion de ce score, pas une mesure — "
      + "et elle disparaît quand les données de charge manquent.",
    ancre: 'risque',
  },

  fatigue: {
    titre: 'Fatigue estimée',
    texte: "Indice sur 100 agrégeant jusqu'à 8 signaux : charge hebdomadaire, baisse de performance "
      + "GPS, monotonie de l'entraînement, espacement des séances intenses, ressenti déclaré, "
      + "charge ressentie, blessure récente et enchaînement de matchs. Nominal sous 30, vigilance "
      + "de 30 à 59, alerte à partir de 60.",
    ancre: 'risque',
  },

  statut: {
    titre: 'Disponibilité',
    texte: "Déduite du parcours médical et des indicateurs : indisponible si une blessure est en "
      + "cours, incertain si le risque est élevé ou la fatigue en alerte, disponible sinon. Ne "
      + "remplace pas l'avis du staff médical.",
  },

  presence: {
    titre: 'Assiduité',
    texte: "Part de séances où le joueur était présent sur la saison en cours. La présence se "
      + "saisit par exception : sans déclaration d'absence, un joueur est compté présent.",
  },

  poids: {
    titre: 'Écart au poids de forme',
    texte: "Différence entre la dernière pesée et le poids de forme cible saisi sur la fiche. "
      + "Au-dessus de la cible, l'écart majore le score de risque (points plafonnés). Sans poids "
      + "de forme renseigné, aucun écart n'est calculé et le risque n'est pas majoré.",
  },

  hooper: {
    titre: 'Indice de Hooper',
    texte: "Somme des 5 items déclarés par le joueur (sommeil, fatigue, courbatures, stress, "
      + "humeur), chacun de 1 à 10. Total de 5 à 50, PLUS BAS = MIEUX : bon jusqu'à 22, vigilance "
      + "de 23 à 34, alerte au-delà. Une seule saisie par jour.",
  },

  srpe: {
    titre: 'sRPE — charge perçue',
    texte: "Intensité ressentie (RPE de 1 à 10) multipliée par la durée en minutes, en unités "
      + "arbitraires. Se saisit par séance : deux séances le même jour se CUMULENT sur la journée. "
      + "Complète le GPS, et le remplace pour les séances sans gilets.",
  },

  readiness: {
    titre: 'Bien-être déclaré',
    texte: "Composite du dernier questionnaire Hooper ramené sur 100, sens inversé : PLUS HAUT = "
      + "MIEUX. Sous 55 le ressenti est à surveiller, sous 40 il est dégradé. Calculé uniquement "
      + "sur une saisie de moins de 3 jours.",
  },

  monotonie: {
    titre: 'Monotonie de Foster',
    texte: "Moyenne des charges hebdomadaires divisée par leur écart-type sur 8 semaines. Élevée = "
      + "semaines toutes identiques, sans alternance dur/facile — un facteur de surmenage "
      + "indépendant du volume. Vigilance au-delà de 1,5, alerte au-delà de 2.",
    ancre: 'monotonie',
  },

  chargeCible: {
    titre: 'Charge cible de la semaine',
    texte: "Volume recommandé pour la semaine en cours, calculé pour maintenir la montée de charge "
      + "dans la zone maîtrisée à partir de la charge chronique du joueur. Nécessite environ "
      + "4 semaines d'historique ; en dessous, la cible est annoncée comme provisoire.",
  },

  distanceAttendue: {
    titre: 'Distance attendue',
    texte: "Projection de la baseline personnelle du joueur : sa moyenne de mètres par minute sur "
      + "ses 10 dernières séances du même type, multipliée par la durée de la séance. C'est un "
      + "repère d'intensité habituelle, pas un objectif à atteindre.",
  },
};
