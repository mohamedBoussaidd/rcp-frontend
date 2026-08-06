/**
 * Textes de vulgarisation des concepts des objectifs de performance.
 *
 * <p>Même patron que `INFOBULLES` du mode avancé de séance : une ou deux phrases par concept, à
 * poser sur un `<app-info-bulle>`. Ils viennent EN PLUS des paragraphes d'explication des écrans,
 * pas à leur place — le paragraphe dit à quoi sert l'étape, l'infobulle lève le jargon d'un champ
 * précis sans allonger la page.
 */
export const INFOBULLES_OBJECTIFS = {

  // ── Référentiel ──
  referentiel: `Une NORME, pas un objectif : « pour un joueur de ce poste, à ce niveau, qu'est-ce qui est normal ? ». Elle est fournie et ne connaît ni votre saison, ni vos équipes. C'est l'objectif, lui, qui est décidé par vous.`,

  adoptionEquipe: `Chaque équipe peut suivre un référentiel différent : des séniors en National, une réserve en Régional, des U19 à part. « Suit le club » reprend simplement le référentiel choisi sur la ligne du dessus.`,

  versionEpinglee: `Votre club reste sur la version qu'il a adoptée. Si la plateforme en publie une plus récente, on vous le signale et vous migrez quand vous le décidez — vos valeurs ne changent jamais toutes seules.`,

  duplication: `Copie le référentiel chez vous pour en modifier les valeurs. On ne part jamais d'une grille vide : 6 postes × 7 métriques × 2 contextes, cela ferait environ 140 cases à remplir à la main.`,

  contexteMatchSemaine: `Deux repères seulement. « Match » = un match de 90 minutes. « Semaine » = une semaine type de compétition, MATCH COMPRIS. L'entraînement n'est donc jamais saisi : il se déduit tout seul des minutes réellement jouées.`,

  metriqueExposition: `L'exposition à la vitesse maximale est un PIC, jamais un cumul : « 32 km/h » ne veut rien dire pour un joueur qui plafonne à 30. La cible s'exprime en pourcentage de SON record personnel, atteint au moins une fois dans la semaine.`,

  postesReference: `Les référentiels du métier ne distinguent pas un latéral droit d'un latéral gauche, ni un milieu défensif d'un milieu offensif : les exigences sont les mêmes. Les postes des fiches joueurs sont donc regroupés en six familles.`,

  // ── Modèles ──
  modele: `La FORME d'une période — ses phases et leur niveau de charge — sans ses kilomètres. C'est le référentiel qui fournit l'échelle, donc le même modèle sert à toutes vos équipes, quel que soit leur niveau. Vos modèles n'appartiennent qu'à votre club.`,

  typePeriodeModele: `Détermine sur quelles périodes ce modèle sera proposé. Une période de préparation ne se voit proposer que des modèles de préparation — pour éviter d'appliquer un régime de championnat à une montée en charge.`,

  phase: `Un bloc de la période : accumulation, développement, pic, décharge… C'est la phase, et non la semaine, qui est stockée. Une phase a son propre bloc de semaines, ou elle n'existe pas — c'est ce qui empêche la décharge de se diluer quand la période s'allonge.`,

  poidsDuree: `Une part RELATIVE de la durée, jamais un nombre de semaines. Des poids 2/2/1/1 donnent 2/2/1/1 sur six semaines, 3/3/2/1 sur neuf, et 1/1/1 sur trois — l'application annonce alors la phase qu'elle supprime.`,

  pourcentages: `Le niveau de la phase, en pourcentage de la cible du référentiel. Le début et la fin bornent la phase ; les semaines qu'elle contient s'interpolent entre les deux. Une phase plate porte deux fois la même valeur.`,

  pourcentageParMetrique: `Un pourcentage PAR métrique, jamais un coefficient global : les courbes ne se ressemblent pas. Sur une préparation type, le volume monte de 67 % à 109 % pendant que la haute intensité part de 45 % et culmine à 116 %.`,

  priorite: `Ce qu'on accepte de sacrifier quand la charge doit baisser. « Secondaire » absorbe la coupe en premier, « Important » ensuite, « Intouchable » jamais. Sans cela, tout serait réduit proportionnellement — or on sacrifie du volume, jamais l'exposition à haute vitesse.`,

  simulationRepartition: `Ce que devient votre modèle selon la durée réelle de la période. Vérifiez surtout deux choses : que le pic reste atteint, et que la décharge garde une semaine pleine même sur une période longue.`,

  // ── Objectifs de période ──
  bandeauPhases: `Rappelle à quelle phase appartient chaque semaine. Sans lui, la chute de la dernière colonne ressemble à une erreur ; avec lui, on lit « décharge » et tout s'explique.`,

  caseRetouchee: `Vous avez modifié cette valeur à la main. Elle ne suit plus le modèle : recalculer depuis celui-ci l'écrasera, et l'application vous préviendra avant.`,

  trajectoireVsPostes: `Deux formes selon la période. En préparation, une trajectoire semaine par semaine au niveau de l'équipe. En compétition, une fourchette par poste, valable toute la période — car en championnat la cible est un régime, pas une montée.`,

  horsCharge: `Trêve et intersaison : le joueur n'est pas censé être en charge. Le moteur d'analyse n'émet déjà aucune alerte sur ces périodes — y fixer une cible dirait l'inverse.`,

  echelleReferentiel: `Le référentiel qui a servi à convertir les pourcentages du modèle en mètres. Il est figé au moment de la génération : publier une nouvelle version ne recalculera pas cet objectif.`,

  bascPeriode: `Le passage d'une période à l'autre est automatique : à la date prévue, l'application bascule sur les objectifs suivants sans aucune manipulation.`,
} as const;
