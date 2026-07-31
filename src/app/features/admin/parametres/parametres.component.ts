import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfigurationService } from '@core/services/configuration.service';
import { SeanceService, TypeSeance } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { CouleursTypeService } from '@core/services/couleurs-type.service';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent, MatCardActions } from '@angular/material/card';
import { MatTooltip } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

export interface ParamMeta {
  label: string;
  description: string;
  unite: string;
  min: number;
  max: number;
  step: number;
  defaut: number;
}

export const PARAM_META: Record<string, ParamMeta> = {
  // ── Pondération de charge ──
  poids_match: {
    label: 'Match officiel',
    description: 'Coefficient appliqué à la distance GPS d\'un match officiel dans le calcul de charge hebdomadaire. Valeur maximale (1.0 = référence absolue). À réduire si votre championnat est moins exigeant physiquement que la norme de référence.',
    unite: '', min: 0.10, max: 1.00, step: 0.05, defaut: 1.00
  },
  poids_match_amical: {
    label: 'Match amical',
    description: 'Coefficient pour un match amical. Souvent identique ou légèrement inférieur au match officiel selon l\'intensité réelle des matchs préparatoires de votre équipe.',
    unite: '', min: 0.10, max: 1.00, step: 0.05, defaut: 1.00
  },
  poids_intensif: {
    label: 'Séance intensive',
    description: 'Coefficient pour une séance haute intensité (circuit, intermittent, pressing intensif). Représente environ 85% de l\'exigence d\'un match selon les données de la littérature sportive.',
    unite: '', min: 0.10, max: 1.00, step: 0.05, defaut: 0.85
  },
  poids_force: {
    label: 'Renforcement musculaire',
    description: 'Coefficient pour une séance de renforcement musculaire. La distance GPS y est faible, mais la charge musculaire et le stress métabolique sont élevés. Ce coefficient capture cette réalité.',
    unite: '', min: 0.10, max: 1.00, step: 0.05, defaut: 0.70
  },
  poids_technique: {
    label: 'Séance technique',
    description: 'Coefficient pour une séance technico-tactique à intensité modérée (possession, organisation défensive, phases de jeu). Intensité intermédiaire.',
    unite: '', min: 0.10, max: 1.00, step: 0.05, defaut: 0.60
  },
  poids_pre_match: {
    label: 'Activation pré-match',
    description: 'Coefficient pour la séance d\'activation la veille du match (J-1). Très légère — son rôle est d\'activer les muscles sans créer de fatigue. Un poids faible est normal.',
    unite: '', min: 0.05, max: 0.80, step: 0.05, defaut: 0.50
  },
  poids_reprise: {
    label: 'Séance de reprise',
    description: 'Coefficient pour une séance de reprise légère après un jour de repos. Réactivation neuromusculaire uniquement, volume minimal. La valeur la plus basse de l\'échelle.',
    unite: '', min: 0.05, max: 0.60, step: 0.05, defaut: 0.30
  },

  // ── Objectifs GPS par poste ──
  objectif_gardien: {
    label: 'Gardien',
    description: 'Distance minimale attendue par minute de jeu pour un gardien en match officiel (m/min). Le gardien parcourt naturellement moins de distance que les joueurs de champ — déplacements courts, fréquents, sans courses longues.',
    unite: 'm/min', min: 30, max: 90, step: 1, defaut: 55
  },
  objectif_defenseur_central: {
    label: 'Défenseur central',
    description: 'Objectif de distance par minute pour un défenseur central. Intensité modérée : priorité aux déplacements défensifs courts, aux duels et aux sorties de balle. Moins de courses longues que les latéraux.',
    unite: 'm/min', min: 60, max: 130, step: 1, defaut: 95
  },
  objectif_lateral_droit: {
    label: 'Latéral droit',
    description: 'Objectif pour un latéral droit. Poste très exigeant en distance : couvre toute la profondeur du couloir en attaque et en défense, avec des allers-retours constants.',
    unite: 'm/min', min: 70, max: 140, step: 1, defaut: 105
  },
  objectif_lateral_gauche: {
    label: 'Latéral gauche',
    description: 'Objectif pour un latéral gauche. Même exigence que le latéral droit — ajuster si votre dispositif utilise les deux latéraux différemment (ex: un latéral qui monte moins).',
    unite: 'm/min', min: 70, max: 140, step: 1, defaut: 105
  },
  objectif_milieu_defensif: {
    label: 'Milieu défensif',
    description: 'Objectif pour un milieu défensif / sentinelle. Couvre beaucoup de terrain en récupération de balle et dans les transitions. Exigence élevée en termes de volume de déplacement.',
    unite: 'm/min', min: 70, max: 140, step: 1, defaut: 108
  },
  objectif_milieu_central: {
    label: 'Milieu central',
    description: 'Objectif pour un milieu central. Généralement le poste avec la plus haute exigence de distance totale — box to box constant, participation aux deux phases de jeu.',
    unite: 'm/min', min: 75, max: 145, step: 1, defaut: 110
  },
  objectif_milieu_offensif: {
    label: 'Milieu offensif',
    description: 'Objectif pour un milieu offensif / meneur de jeu. Exigence un peu inférieure au milieu central selon le rôle tactique. À ajuster si votre meneur joue "bas" ou "haut".',
    unite: 'm/min', min: 70, max: 140, step: 1, defaut: 108
  },
  objectif_ailier_droit: {
    label: 'Ailier droit',
    description: 'Objectif pour un ailier droit. Exigence élevée : courses en profondeur, replis défensifs, accélérations répétées. Ajuster selon que l\'ailier est "piston" ou joue plus fixe.',
    unite: 'm/min', min: 70, max: 140, step: 1, defaut: 105
  },
  objectif_ailier_gauche: {
    label: 'Ailier gauche',
    description: 'Objectif pour un ailier gauche. Même logique que l\'ailier droit. Si votre système utilise un ailier-piston et un ailier fixe, différencier les deux valeurs.',
    unite: 'm/min', min: 70, max: 140, step: 1, defaut: 105
  },
  objectif_attaquant: {
    label: 'Attaquant',
    description: 'Objectif pour un attaquant de pointe (hors avant-centre pur). Peut inclure des profils variés — à calibrer selon le rôle réel dans votre système offensif.',
    unite: 'm/min', min: 65, max: 135, step: 1, defaut: 100
  },
  objectif_avant_centre: {
    label: 'Avant-centre',
    description: 'Objectif pour un avant-centre / pivot. Distance souvent plus faible que les ailiers (moins de courses de profondeur), mais avec davantage d\'efforts explosifs courts dans la surface.',
    unite: 'm/min', min: 65, max: 130, step: 1, defaut: 100
  },

  // ── Seuils charge (Signal 1) ──
  seuil_surcharge_probable: {
    label: 'Seuil surcharge probable',
    description: 'Ratio charge 7 jours / charge hebdomadaire habituelle au-delà duquel une alerte "surcharge probable" est déclenchée (Score +45 pts). Ex: 1.40 = la semaine en cours est 40% plus chargée que la normale. À augmenter si votre équipe travaille structurellement en surcharge planifiée (bloc préparatoire).',
    unite: '×', min: 1.10, max: 2.00, step: 0.05, defaut: 1.40
  },
  seuil_surcharge_possible: {
    label: 'Seuil surcharge possible',
    description: 'Seuil bas d\'alerte surcharge (Score +25 pts). Doit toujours être inférieur au seuil "probable". Ex: 1.20 = la semaine est 20% plus chargée que la normale. Représente une vigilance à surveiller.',
    unite: '×', min: 1.05, max: 1.80, step: 0.05, defaut: 1.20
  },

  // ── Seuils norme GPS ──
  seuil_sous_norme_pct: {
    label: 'Écart "Sous la norme"',
    description: 'Pourcentage d\'écart négatif par rapport à la baseline historique du joueur en dessous duquel une séance est classée "Sous la norme". Ex: 20 = le joueur a couru 20% moins que son habitude sur ce type de séance. Abaisser pour être plus strict.',
    unite: '%', min: 5, max: 40, step: 1, defaut: 20
  },
  seuil_sur_norme_pct: {
    label: 'Écart "Sur la norme"',
    description: 'Pourcentage d\'écart positif par rapport à la baseline historique du joueur au-delà duquel une séance est classée "Sur la norme". Un joueur en surnorme peut signifier une récupération excellente ou une sous-performance des séances précédentes.',
    unite: '%', min: 5, max: 40, step: 1, defaut: 20
  },

  // ── Signal 2 : dégradation performance ──
  seuil_mmin_probable: {
    label: 'm/min — Fatigue probable',
    description: 'Ratio m/min récent / m/min historique en dessous duquel une baisse d\'intensité globale "probable" est signalée. Ex: 0.80 = le joueur court 20% moins vite qu\'à son habitude sur les 2 dernières séances. Signal de fatigue générale.',
    unite: '×', min: 0.50, max: 0.95, step: 0.01, defaut: 0.80
  },
  seuil_mmin_possible: {
    label: 'm/min — Fatigue possible',
    description: 'Seuil bas de détection de baisse d\'intensité globale. Doit être supérieur au seuil "probable". Représente une baisse modérée à surveiller.',
    unite: '×', min: 0.60, max: 0.99, step: 0.01, defaut: 0.88
  },
  seuil_vmax_probable: {
    label: 'Vitesse max — Fatigue explosive probable',
    description: 'Ratio vitesse max récente / vitesse max historique en dessous duquel une fatigue neuromusculaire explosive "probable" est signalée. La vitesse maximale est le premier indicateur de fatigue neuromusculaire des fibres rapides.',
    unite: '×', min: 0.60, max: 0.97, step: 0.01, defaut: 0.88
  },
  seuil_vmax_possible: {
    label: 'Vitesse max — Fatigue explosive possible',
    description: 'Seuil bas de détection de fatigue neuromusculaire explosive. Une légère baisse de vitesse max peut indiquer une fatigue en cours avant qu\'elle devienne significative.',
    unite: '×', min: 0.70, max: 0.99, step: 0.01, defaut: 0.94
  },
  seuil_hi_probable: {
    label: '>19 km/h — Fatigue intensive probable',
    description: 'Ratio des efforts à plus de 19 km/h (pourcentage de la distance totale) récent vs historique, en dessous duquel une fatigue neuromusculaire intensive "probable" est signalée. Signal d\'une incapacité à soutenir les efforts à haute intensité.',
    unite: '×', min: 0.50, max: 0.90, step: 0.01, defaut: 0.75
  },
  seuil_hi_possible: {
    label: '>19 km/h — Fatigue intensive possible',
    description: 'Seuil bas de détection de fatigue sur les efforts à haute intensité (>19 km/h). Indique une réduction modérée de la capacité à produire des efforts explosifs répétés.',
    unite: '×', min: 0.60, max: 0.99, step: 0.01, defaut: 0.85
  },
  nb_seances_recentes_intensite: {
    label: 'Intensité m/min — séances récentes analysées',
    description: 'Nombre de séances les plus récentes dont la moyenne est comparée aux séances précédentes pour l\'intensité globale (m/min). Plus la valeur est basse, plus l\'alerte est réactive mais sensible au hasard d\'une séance ; plus elle est haute, plus le signal est stable mais tardif. 2 séances suffisent souvent pour l\'intensité moyenne, qui varie peu d\'une séance à l\'autre.',
    unite: 'séances', min: 1, max: 6, step: 1, defaut: 2
  },
  nb_seances_recentes_vmax: {
    label: 'Vitesse max — séances récentes analysées',
    description: 'Nombre de séances récentes moyennées pour la vitesse de pointe. C\'est l\'indicateur le plus bruité des trois : une séance où le joueur n\'a simplement pas eu l\'occasion de sprinter fait chuter la moyenne sans aucune fatigue. Passer à 3 ou 4 séances est recommandé si vous constatez des alertes de fatigue explosive qui disparaissent d\'elles-mêmes.',
    unite: 'séances', min: 1, max: 6, step: 1, defaut: 2
  },
  nb_seances_recentes_hi: {
    label: '>19 km/h — séances récentes analysées',
    description: 'Nombre de séances récentes moyennées pour la part de distance parcourue à plus de 19 km/h. Comme la vitesse max, cet indicateur dépend beaucoup du contenu de la séance : une séance technique fait naturellement chuter la part de haute intensité.',
    unite: 'séances', min: 1, max: 6, step: 1, defaut: 2
  },
  nb_seances_reference_min: {
    label: 'Séances de comparaison minimum',
    description: 'Nombre minimum de séances plus anciennes exigé pour qu\'une comparaison soit calculée. En dessous, l\'indicateur ne s\'affiche pas du tout plutôt que de comparer à une seule séance de référence. Augmenter cette valeur rend les alertes plus rares mais plus fiables en début de saison.',
    unite: 'séances', min: 1, max: 8, step: 1, defaut: 2
  },

  // ── Monotonie (Signal 3) ──
  seuil_monotonie_alerte: {
    label: 'Monotonie — Alerte (probable)',
    description: 'Indice de monotonie Foster au-delà duquel une alerte "surmenage chronique probable" est déclenchée. L\'indice = moyenne(charges hebdo sur 8 sem.) / écart-type. Plus l\'indice est élevé, plus la charge est répétitive et uniforme — un signal de monotonie dangereux à long terme.',
    unite: '', min: 1.20, max: 5.00, step: 0.10, defaut: 2.00
  },
  seuil_monotonie_vigilance: {
    label: 'Monotonie — Vigilance (possible)',
    description: 'Seuil bas de détection de monotonie d\'entraînement. Doit être inférieur au seuil "alerte". Indique un rythme répétitif à corriger en introduisant davantage de variation dans les charges hebdomadaires.',
    unite: '', min: 1.00, max: 3.00, step: 0.10, defaut: 1.50
  },

  // ── Récupération (Signal 4) ──
  delai_match_match_jours: {
    label: 'Délai minimum match → match',
    description: 'Nombre de jours minimum entre deux matchs (officiels ou amicaux) pour que la récupération soit considérée suffisante. En dessous de ce délai, +25 pts au score de fatigue. En double journée compétitive, vous pouvez réduire cette valeur.',
    unite: 'jours', min: 1, max: 7, step: 1, defaut: 3
  },
  delai_intensif_intensif_jours: {
    label: 'Délai minimum intensif → intensif',
    description: 'Nombre de jours minimum entre deux séances de type INTENSIF. En dessous, le système détecte une accumulation neuromusculaire insuffisamment récupérée (+15 pts). Lié à la cinétique de récupération des fibres rapides (48h généralement).',
    unite: 'jours', min: 1, max: 5, step: 1, defaut: 2
  },
  repos_min_14_jours: {
    label: 'Repos minimum sur 14 jours',
    description: 'Nombre de jours sans entraînement GPS requis sur une période glissante de 14 jours. En dessous de ce seuil, une alerte de manque de récupération structurelle est déclenchée (+20 pts). Essentiel pour prévenir le surentraînement.',
    unite: 'jours', min: 1, max: 8, step: 1, defaut: 4
  },

  // ── Blessures ──
  fenetre_blessure_fatigue_jours: {
    label: 'Fenêtre blessure récente',
    description: 'Durée (en jours) pendant laquelle une blessure est considérée "récente" et majore le score de fatigue. Ex: 56 jours = une blessure dans les 8 dernières semaines reste un facteur de risque de rechute. Augmenter pour les blessures musculaires longues à cicatriser.',
    unite: 'jours', min: 14, max: 120, step: 7, defaut: 56
  },
  bonus_blessure_pts: {
    label: 'Points bonus par blessure récente',
    description: 'Points ajoutés au score de fatigue par blessure récente détectée dans la fenêtre configurée. Reflète le risque de rechute lié à un tissu en cours de cicatrisation — un joueur qui reprend après blessure doit être géré avec plus de précaution.',
    unite: 'pts', min: 5, max: 40, step: 5, defaut: 20
  },

  // ── Surpoids / risque blessure ──
  correction_surpoids_pts_par_kg: {
    label: 'Risque blessure — pts par kg de surpoids',
    description: 'Points ajoutés au score de risque blessure par kilogramme de surpoids par rapport au poids de forme cible du joueur. Le surpoids augmente les contraintes articulaires (genoux, chevilles) et tendineuses, majorant le risque de blessure.',
    unite: 'pts/kg', min: 1, max: 15, step: 1, defaut: 5
  },
  correction_surpoids_plafond_pts: {
    label: 'Risque blessure — plafond surpoids',
    description: 'Plafond maximal de la pénalité de surpoids sur le score de risque blessure. Évite qu\'un joueur fortement en surpoids monopolise systématiquement les premières places du classement de risque, au détriment des autres indicateurs.',
    unite: 'pts', min: 5, max: 40, step: 5, defaut: 20
  },
  correction_surpoids_pct_par_kg: {
    label: 'Rapport séance — réduction objectif par kg',
    description: 'Réduction de l\'objectif GPS en % par kilogramme de surpoids lors d\'un match. Ex: 2% par kg = un joueur à +3 kg voit son objectif m/min réduit de 6%. Permet de ne pas pénaliser injustement un joueur plus lourd sur ses résultats de match.',
    unite: '%/kg', min: 0.5, max: 5, step: 0.5, defaut: 2
  },
  correction_surpoids_plafond_pct: {
    label: 'Rapport séance — plafond réduction objectif',
    description: 'Réduction maximale de l\'objectif GPS liée au surpoids. Évite des objectifs trop bas qui rendraient l\'analyse de performance ininterprétable pour des joueurs avec un surpoids important.',
    unite: '%', min: 5, max: 35, step: 5, defaut: 20
  },

  // ── Congestion ──
  seuil_congestion_probable: {
    label: 'Congestion — seuil probable',
    description: 'Nombre minimum de matchs (officiels + amicaux) en 15 jours pour déclencher une alerte "congestion de matchs probable" (+20 pts au score de fatigue). Une telle congestion est fréquente en période de coupes et tournois.',
    unite: 'matchs/15j', min: 3, max: 8, step: 1, defaut: 4
  },
  seuil_congestion_possible: {
    label: 'Congestion — seuil possible',
    description: 'Seuil bas de détection de congestion (+10 pts). Doit être inférieur au seuil "probable". Indique un calendrier chargé qui mérite une attention sur la gestion des charges d\'entraînement entre les matchs.',
    unite: 'matchs/15j', min: 2, max: 6, step: 1, defaut: 3
  },

  // ── Fenêtre et zones cibles de l'ACWR ──
  acwr_semaines_chronique: {
    label: 'Fenêtre de charge chronique',
    description: 'Nombre de semaines servant de référence pour calculer la charge "habituelle" d\'un joueur, à laquelle sa semaine en cours est comparée (ACWR et Signal 1). Une fenêtre courte suit mieux les changements de rythme, une fenêtre longue est plus stable. Si un joueur a moins de semaines de données que cette valeur, le calcul s\'adapte automatiquement au nombre de semaines réellement disponibles.',
    unite: 'semaines', min: 2, max: 8, step: 1, defaut: 4
  },
  acwr_cible_min: {
    label: 'ACWR — plancher de la zone optimale',
    description: 'En dessous de ce ratio, le joueur est considéré en sous-charge : il s\'entraîne moins que son habitude, ce qui érode progressivement sa capacité à encaisser les efforts. 0.80 est la borne basse communément retenue.',
    unite: '×', min: 0.50, max: 1.00, step: 0.05, defaut: 0.80
  },
  acwr_cible_ideal: {
    label: 'ACWR — valeur idéale',
    description: 'Ratio visé : la charge de la semaine en cours dépasse très légèrement l\'habitude, ce qui fait progresser le joueur sans le mettre en danger. Sert de repère visuel sur les jauges d\'ACWR.',
    unite: '×', min: 0.90, max: 1.30, step: 0.05, defaut: 1.05
  },
  acwr_cible_haute: {
    label: 'ACWR — début de zone haute',
    description: 'Ratio à partir duquel la progression de charge devient soutenue et mérite d\'être surveillée, sans être encore anormale. Zone d\'attention entre la cible idéale et le plafond.',
    unite: '×', min: 1.00, max: 1.50, step: 0.05, defaut: 1.20
  },
  acwr_cible_max: {
    label: 'ACWR — plafond',
    description: 'Au-delà de ce ratio, le joueur est en surcharge : sa semaine dépasse trop nettement ce que son organisme a l\'habitude d\'encaisser. 1.30 correspond au seuil au-delà duquel la littérature observe une hausse du risque de blessure.',
    unite: '×', min: 1.10, max: 2.00, step: 0.05, defaut: 1.30
  },

  // ── Combinaison des deux sources de charge ──
  poids_charge_gps: {
    label: 'Poids de la charge GPS',
    description: 'Importance donnée à la charge mesurée par GPS (distance réellement parcourue) lorsque le joueur dispose des deux sources. Le GPS mesure ce que le joueur a FAIT, indépendamment de ce qu\'il en a ressenti.',
    unite: '', min: 0, max: 1, step: 0.1, defaut: 0.6
  },
  poids_charge_rpe: {
    label: 'Poids de la charge ressentie',
    description: 'Importance donnée à la charge ressentie (RPE × durée, saisie par le joueur). Elle capte ce que le GPS ignore : la fatigue nerveuse, le stress, la mauvaise nuit. Augmenter ce poids si vos joueurs remplissent leur RPE avec sérieux.',
    unite: '', min: 0, max: 1, step: 0.1, defaut: 0.4
  },
  seuil_ecart_sources: {
    label: 'Écart GPS / ressenti signalé',
    description: 'Écart entre les deux ratios de charge au-delà duquel une divergence est signalée. C\'est souvent l\'information la plus utile : "il en fait autant que d\'habitude mais le vit beaucoup plus mal" est un signal d\'alerte précoce qu\'aucune des deux sources ne donne seule.',
    unite: '×', min: 0.10, max: 1.00, step: 0.05, defaut: 0.30
  },

  // ── Ressenti quotidien (Hooper) ──
  seuil_wellness_alerte: {
    label: 'Ressenti — seuil d\'alerte',
    description: 'Score de bien-être (0-100, calculé sur les 5 items du questionnaire quotidien : sommeil, fatigue, courbatures, stress, humeur) en dessous duquel le ressenti est jugé dégradé (+25 pts de fatigue). Plus le score est bas, plus le joueur se sent mal.',
    unite: '/100', min: 20, max: 60, step: 5, defaut: 40
  },
  seuil_wellness_vigilance: {
    label: 'Ressenti — seuil de vigilance',
    description: 'Seuil bas de vigilance sur le ressenti (+12 pts). Doit être supérieur au seuil d\'alerte. Un joueur dans cette plage ne va pas mal, mais ne va pas bien non plus : c\'est le bon moment pour lui parler.',
    unite: '/100', min: 35, max: 80, step: 5, defaut: 55
  },

  // ── Charge ressentie (sRPE) ──
  seuil_srpe_probable: {
    label: 'Charge ressentie — surcharge probable',
    description: 'Ratio charge ressentie de la semaine / charge ressentie habituelle au-delà duquel une surcharge subjective probable est signalée (+25 pts). Ex: 1.50 = le joueur a ressenti une semaine 50% plus dure que son habitude, indépendamment des kilomètres parcourus.',
    unite: '×', min: 1.10, max: 2.50, step: 0.05, defaut: 1.50
  },
  seuil_srpe_possible: {
    label: 'Charge ressentie — surcharge possible',
    description: 'Seuil bas de surcharge ressentie (+12 pts). Doit être inférieur au seuil "probable".',
    unite: '×', min: 1.05, max: 2.00, step: 0.05, defaut: 1.30
  },

  // ── Capacité de vitesse de pointe ──
  seuil_vmax_capacite_possible: {
    label: 'Pic de vitesse — baisse possible',
    description: 'Rapport entre la meilleure vitesse de pointe des 7 derniers jours et celle des 5 semaines précédentes, en dessous duquel une baisse de capacité est envisagée. À la différence du Signal 2 qui moyenne les séances, on compare ici des pics : un joueur capable de retoucher sa vitesse maximale n\'est pas en fatigue neuromusculaire profonde.',
    unite: '×', min: 0.80, max: 1.00, step: 0.01, defaut: 0.93
  },
  seuil_vmax_capacite_probable: {
    label: 'Pic de vitesse — baisse probable',
    description: 'Seuil en dessous duquel la perte de capacité de vitesse devient probable. Doit être inférieur au seuil "possible".',
    unite: '×', min: 0.75, max: 0.98, step: 0.01, defaut: 0.90
  },
  seuil_sprint_corroboration: {
    label: 'Corroboration par les sprints',
    description: 'Rapport de volume de course à très haute vitesse (>28 km/h) récent vs historique en dessous duquel la baisse de pic est considérée comme confirmée. Une baisse de vitesse maximale accompagnée d\'une chute du volume de sprint est un signal bien plus solide qu\'une baisse isolée.',
    unite: '×', min: 0.50, max: 1.00, step: 0.05, defaut: 0.80
  },

  // ── Fraîcheur des données et baseline ──
  jours_inactif_max: {
    label: 'Inactivité avant mise en veille',
    description: 'Nombre de jours sans aucune donnée au-delà duquel un joueur est considéré inactif : ses indicateurs de fatigue et de risque cessent d\'être évalués plutôt que d\'afficher un chiffre calculé sur des données périmées. Augmenter si vos séances sont espacées (équipes amateurs).',
    unite: 'jours', min: 3, max: 45, step: 1, defaut: 10
  },
  baseline_recence_jours: {
    label: 'Profondeur de la baseline historique',
    description: 'Ancienneté maximale des séances retenues pour établir la référence personnelle d\'un joueur (sa "normale" à lui). Une fenêtre courte colle à sa forme actuelle, une fenêtre longue résiste mieux aux variations de contenu des séances.',
    unite: 'jours', min: 30, max: 365, step: 15, defaut: 90
  },
  tendance_seuil_pts: {
    label: 'Variation minimale d\'une tendance',
    description: 'Écart de score minimum, en points, pour qu\'une évolution soit annoncée comme une hausse ou une baisse plutôt que comme stable. Évite d\'annoncer une "dégradation" pour 1 point d\'écart, qui n\'a aucune signification.',
    unite: 'pts', min: 1, max: 20, step: 1, defaut: 5
  },

  // ── Météo : réglages RETIRÉS de l'écran (2026-07-30) ──
  // Les 6 clés (temp_chaleur_forte_c, temp_chaleur_moderee_c, correcteur_chaleur_forte,
  // correcteur_chaleur_moderee, correcteur_neige, correcteur_pluie) existent toujours en base
  // avec leurs valeurs, mais AUCUN code ne les lit : ni le moteur Python, ni le back Java. Les
  // laisser éditables laissait croire qu'on agissait sur les objectifs GPS alors que les
  // modifier ne changeait strictement aucun indicateur. Les rétablir = remettre ce bloc et son
  // groupe, une fois la correction météo réellement implémentée (il faudra d'abord que la météo
  // soit saisie à la création de séance : `seance.conditions_meteo` est renseignée 4 fois sur
  // 1394, avec un vocabulaire libre qui ne correspond pas à ces clés).
};

interface GroupeParams {
  id: string;
  titre: string;
  description: string;
  cles: string[];
  expanded: boolean;
}

@Component({
  selector: 'app-parametres',
  standalone: true,
  templateUrl: './parametres.component.html',
  styleUrl:    './parametres.component.scss',
  imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, MatCardActions, MatTooltip, FormsModule, RouterLink]
})
export class ParametresComponent implements OnInit {

  valeurs: Record<string, number> = {};
  loading  = true;
  saving   = false;

  // ── Cibles d'équipe par type de séance (propres au club actif) ──
  typesSeance: TypeSeance[] = [];
  ciblesOuvert = false;
  cibleSaving: string | null = null;

  // ── Apparence & nature des types (catalogue GLOBAL, permission dédiée) ──
  apparenceSaving: string | null = null;

  readonly PROFILS: { val: string; label: string }[] = [
    { val: 'TERRAIN',             label: 'Terrain (distance, GPS)' },
    { val: 'MUSCULATION',         label: 'Musculation / renforcement' },
    { val: 'SANS_CHARGE_EXTERNE', label: 'Sans charge externe (piscine, vidéo…)' },
  ];

  profilLabel(v?: string | null): string {
    return this.PROFILS.find(p => p.val === v)?.label ?? '';
  }

  /**
   * La NATURE d'un type vaut pour toute la plateforme (catalogue global) : seul le super-admin
   * peut la changer. `typeseances:write` ne suffirait pas — quatre rôles la détiennent dans
   * chaque club, ce qui laisserait un entraîneur reconfigurer tous les autres clubs.
   * La couleur, elle, est propre au club et se règle dans le tableau des cibles.
   */
  get peutEditerTypes(): boolean { return this.auth.hasRole('SUPER_ADMIN'); }


  readonly groupes: GroupeParams[] = [
    {
      id: 'charge_poids',
      titre: 'Pondération de charge par type de séance',
      description: 'Ces coefficients définissent comment chaque type de séance contribue au calcul de charge hebdomadaire. Un match compte 1.0 (référence), toutes les autres séances y sont rapportées. Modifier ces valeurs change directement la sensibilité du Signal 1 (surcharge).',
      cles: ['poids_match', 'poids_match_amical', 'poids_intensif', 'poids_force', 'poids_technique', 'poids_pre_match', 'poids_reprise'],
      expanded: true
    },
    {
      id: 'objectifs_gps',
      titre: 'Objectifs GPS par poste (m/min en match)',
      description: 'Distance par minute de jeu attendue par poste lors d\'un match officiel. Sert à évaluer si chaque joueur atteint son niveau de performance attendu selon son rôle tactique. Ces valeurs dépendent directement du niveau de votre championnat.',
      cles: ['objectif_gardien', 'objectif_defenseur_central', 'objectif_lateral_droit', 'objectif_lateral_gauche', 'objectif_milieu_defensif', 'objectif_milieu_central', 'objectif_milieu_offensif', 'objectif_ailier_droit', 'objectif_ailier_gauche', 'objectif_attaquant', 'objectif_avant_centre'],
      expanded: true
    },

    // Les blocs sont ORDONNÉS pour se lire par lignes de 3 dans la grille : chaque ligne
    // regroupe des réglages qu'on vient ajuster ensemble. Déplacer un bloc casse cette lecture.
    // ── Ligne : la charge et la référence à laquelle on la compare ──
    {
      id: 'acwr',
      titre: 'Fenêtre et zones cibles de l\'ACWR',
      description: 'L\'ACWR compare la charge de la semaine en cours à la charge habituelle du joueur. Ces réglages définissent sur combien de semaines se calcule cette habitude, et à partir de quel ratio on parle de sous-charge, de zone optimale ou de surcharge. Ils pilotent à la fois la carte ACWR et le Signal 1 de fatigue.',
      cles: ['acwr_semaines_chronique', 'acwr_cible_min', 'acwr_cible_ideal', 'acwr_cible_haute', 'acwr_cible_max'],
      expanded: false
    },
    {
      id: 'sources_charge',
      titre: 'Sources de charge (GPS et ressenti)',
      description: 'Quand un joueur dispose à la fois de données GPS et de RPE saisis, les deux charges sont combinées. Ces réglages fixent le poids de chaque source et à partir de quand un écart entre les deux mérite d\'être signalé.',
      cles: ['poids_charge_gps', 'poids_charge_rpe', 'seuil_ecart_sources'],
      expanded: false
    },
    {
      id: 'seuils_charge',
      titre: 'Seuils de charge hebdomadaire (Signal 1)',
      description: 'Définissent quand la semaine en cours est considérée comme "surchargée" par rapport à la charge habituelle du joueur. Ces seuils contrôlent la sensibilité de la première alerte de fatigue.',
      cles: ['seuil_surcharge_probable', 'seuil_surcharge_possible'],
      expanded: false
    },

    // ── Ligne : ce que le GPS révèle d'une baisse de forme ──
    {
      id: 'seuils_performance',
      titre: 'Seuils de dégradation de performance (Signal 2)',
      description: 'Seuils de comparaison entre les dernières séances et la baseline historique sur 3 indicateurs GPS. Permettent de détecter une baisse de performance avant qu\'elle soit visible à l\'œil nu. Les 4 derniers réglages fixent sur combien de séances récentes chaque indicateur est jugé : c\'est le principal levier contre les fausses alertes, une vitesse de pointe mesurée sur 2 séances étant très sensible au contenu de ces séances.',
      cles: ['seuil_mmin_probable', 'seuil_mmin_possible', 'seuil_vmax_probable', 'seuil_vmax_possible', 'seuil_hi_probable', 'seuil_hi_possible',
             'nb_seances_recentes_intensite', 'nb_seances_recentes_vmax', 'nb_seances_recentes_hi', 'nb_seances_reference_min'],
      expanded: false
    },
    {
      id: 'capacite_vitesse',
      titre: 'Capacité de vitesse de pointe',
      description: 'Détection d\'une perte de capacité en comparant le meilleur pic de vitesse récent à celui des semaines précédentes. Un joueur qui retouche sa vitesse maximale n\'est pas en fatigue neuromusculaire profonde, quels que soient ses autres indicateurs.',
      cles: ['seuil_vmax_capacite_possible', 'seuil_vmax_capacite_probable', 'seuil_sprint_corroboration'],
      expanded: false
    },
    {
      id: 'seuils_monotonie',
      titre: 'Indice de monotonie (Signal 3)',
      description: 'Seuils de l\'indice de monotonie Foster calculé sur 8 semaines. Un indice élevé signale que le joueur s\'entraîne toujours avec la même charge sans variation — facteur de surmenage chronique même sans surcharge aiguë.',
      cles: ['seuil_monotonie_alerte', 'seuil_monotonie_vigilance'],
      expanded: false
    },

    // ── Ligne : ce que le joueur ressent, et ce que son planning lui laisse récupérer ──
    {
      id: 'seuils_wellness',
      titre: 'Ressenti quotidien (indice de Hooper)',
      description: 'Seuils appliqués au score de bien-être issu du questionnaire quotidien rempli par les joueurs. C\'est le seul signal qui capte ce qu\'aucun capteur ne mesure : la nuit blanche, le stress personnel, la douleur naissante.',
      cles: ['seuil_wellness_alerte', 'seuil_wellness_vigilance'],
      expanded: false
    },
    {
      id: 'seuils_srpe',
      titre: 'Charge ressentie (sRPE)',
      description: 'Seuils appliqués au rapport entre la charge ressentie de la semaine et la charge ressentie habituelle. Utile notamment pour les séances sans GPS (techniques, salle), invisibles autrement.',
      cles: ['seuil_srpe_probable', 'seuil_srpe_possible'],
      expanded: false
    },
    {
      id: 'recuperation',
      titre: 'Espacement entre séances (Signal 4)',
      description: 'Paramètres de détection d\'une récupération insuffisante entre séances haute intensité. Contrôlent les délais minimaux jugés nécessaires entre deux efforts de même nature.',
      cles: ['delai_match_match_jours', 'delai_intensif_intensif_jours', 'repos_min_14_jours'],
      expanded: false
    },

    // ── Ligne : le contexte propre au joueur, qui majore ses scores ──
    {
      id: 'blessures',
      titre: 'Blessures récentes (bonus de fatigue)',
      description: 'Paramètres du bonus appliqué au score de fatigue en cas de blessure récente. Un joueur qui reprend après une blessure doit être géré avec plus de précaution — ces valeurs amplifient les alertes pour ce profil.',
      cles: ['fenetre_blessure_fatigue_jours', 'bonus_blessure_pts'],
      expanded: false
    },
    {
      id: 'congestion',
      titre: 'Congestion de matchs',
      description: 'Seuils de détection d\'un calendrier de matchs trop dense. Une congestion de matchs augmente le score de fatigue même si les séances d\'entraînement sont légères.',
      cles: ['seuil_congestion_probable', 'seuil_congestion_possible'],
      expanded: false
    },
    {
      id: 'poids_risque',
      titre: 'Correction surpoids',
      description: 'Impact du surpoids sur le score de risque blessure (points) et sur l\'objectif GPS d\'un match (réduction en %). Permet d\'adapter l\'analyse à la réalité physique du joueur sans le pénaliser injustement.',
      cles: ['correction_surpoids_pts_par_kg', 'correction_surpoids_plafond_pts', 'correction_surpoids_pct_par_kg', 'correction_surpoids_plafond_pct'],
      expanded: false
    },

    // ── Ligne : les règles de calcul communes à tous les indicateurs ──
    {
      id: 'seuils_norme',
      titre: 'Seuils de norme GPS (rapport de séance)',
      description: 'Définissent l\'écart toléré par rapport à la baseline historique d\'un joueur avant qu\'une séance soit classée "sous la norme" ou "sur la norme". Impacte le rapport détaillé de chaque séance.',
      cles: ['seuil_sous_norme_pct', 'seuil_sur_norme_pct'],
      expanded: false
    },
    {
      id: 'fraicheur',
      titre: 'Fraîcheur des données et baseline',
      description: 'Règles qui déterminent quand les données d\'un joueur sont trop anciennes pour conclure, sur quelle profondeur d\'historique se construit sa référence personnelle, et à partir de quel écart une évolution est annoncée plutôt que jugée stable.',
      cles: ['jours_inactif_max', 'baseline_recence_jours', 'tendance_seuil_pts'],
      expanded: false
    },
    // Le groupe « Correcteurs météo » a été retiré ici : ses 6 coefficients n'étaient lus par
    // aucun code (cf. commentaire en fin de PARAM_META). Un réglage sans effet est pire qu'un
    // réglage absent — on croit avoir agi.
  ];

  readonly meta = PARAM_META;

  private configService = inject(ConfigurationService);
  private seanceService = inject(SeanceService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private auth = inject(AuthService);
  /** Cache partagé des couleurs de type — rafraîchi après édition. */
  private couleursType = inject(CouleursTypeService);

  ngOnInit(): void {
    this.valeurs = Object.fromEntries(
      Object.entries(PARAM_META).map(([cle, m]) => [cle, m.defaut])
    );
    this.configService.getAll().subscribe({
      next: data => { this.valeurs = { ...this.valeurs, ...data }; this.loading = false; },
      error: () => { this.loading = false; }
    });
    this.seanceService.getTypeSeances().subscribe({
      next: types => this.typesSeance = types,
      error: () => {},
    });
  }

  sauvegarderCible(type: TypeSeance): void {
    this.cibleSaving = type.id;
    this.seanceService.setCiblesType(type.id, {
      objectifDistanceM: type.objectifDistanceM ?? null,
      objectifDistanceHauteIntensiteM: type.objectifDistanceHauteIntensiteM ?? null,
      objectifIntensite: type.objectifIntensite ?? null,
      couleur: type.couleur ?? null,
    }).subscribe({
      next: maj => {
        this.cibleSaving = null;
        this.typesSeance = this.typesSeance.map(t => t.id === maj.id ? maj : t);
        // La couleur du club vient de changer : le cache partagé doit suivre immédiatement.
        this.couleursType.rafraichir();
        this.snackBar.open(`Réglages "${type.libelle}" enregistrés`, 'OK', { duration: 2500 });
      },
      error: () => {
        this.cibleSaving = null;
        this.snackBar.open('Enregistrement impossible', 'Fermer', { duration: 3500 });
      },
    });
  }

  /**
   * Nature d'un type — réglage GLOBAL réservé au super-admin. Rafraîchit le cache pour que le
   * changement soit visible tout de suite (les colonnes de distance disparaissent aussitôt
   * qu'un type passe en musculation).
   */
  sauvegarderApparence(type: TypeSeance): void {
    this.apparenceSaving = type.id;
    this.seanceService.setApparenceType(type.id, {
      profil: type.profil ?? 'TERRAIN',
    }).subscribe({
      next: maj => {
        this.apparenceSaving = null;
        this.typesSeance = this.typesSeance.map(t => t.id === maj.id ? maj : t);
        this.couleursType.rafraichir();
        this.snackBar.open(`« ${type.libelle} » mis à jour`, 'OK', { duration: 2500 });
      },
      error: err => {
        this.apparenceSaving = null;
        this.snackBar.open(err?.error?.message ?? 'Enregistrement impossible', 'Fermer', { duration: 3500 });
      },
    });
  }

  sauvegarderGroupe(groupe: GroupeParams): void {
    this.saving = true;
    const appels = groupe.cles.map(cle =>
      this.configService.update(cle, this.valeurs[cle])
    );
    forkJoin(appels).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open(`Paramètres "${groupe.titre}" enregistrés`, 'OK', { duration: 3000 });
      },
      error: () => {
        this.saving = false;
        this.snackBar.open('Erreur lors de l\'enregistrement', 'Fermer', { duration: 4000 });
      }
    });
  }

  reinitialiserTout(): void {
    if (!confirm('Réinitialiser TOUS les paramètres aux valeurs par défaut ?')) return;
    this.configService.resetAll().subscribe({
      next: () => {
        this.snackBar.open('Tous les paramètres réinitialisés', 'OK', { duration: 3000 });
        this.ngOnInit();
      },
      error: () => this.snackBar.open('Erreur lors de la réinitialisation', 'Fermer', { duration: 4000 })
    });
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
