import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfigurationService } from '../../core/services/configuration.service';
import { MatToolbar } from '@angular/material/toolbar';
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

  // ── Météo ──
  temp_chaleur_forte_c: {
    label: 'Température — chaleur forte',
    description: 'Température en °C à partir de laquelle une forte chaleur est détectée. Au-delà de ce seuil, l\'objectif GPS attendu du joueur est automatiquement réduit (coefficient configurable ci-dessous) pour tenir compte de l\'impact physiologique de la chaleur sur la performance.',
    unite: '°C', min: 25, max: 45, step: 1, defaut: 32
  },
  temp_chaleur_moderee_c: {
    label: 'Température — chaleur modérée',
    description: 'Température en °C pour une chaleur modérée. Doit être inférieure au seuil "chaleur forte". Une réduction légère de l\'objectif est appliquée dans cette plage.',
    unite: '°C', min: 20, max: 38, step: 1, defaut: 28
  },
  correcteur_chaleur_forte: {
    label: 'Correcteur — chaleur forte',
    description: 'Coefficient multiplicateur appliqué à la distance attendue en cas de forte chaleur. Ex: 0.90 = l\'objectif est réduit de 10%. Ajuster selon le niveau d\'acclimatation de vos joueurs à la chaleur.',
    unite: '×', min: 0.70, max: 1.00, step: 0.01, defaut: 0.90
  },
  correcteur_chaleur_moderee: {
    label: 'Correcteur — chaleur modérée',
    description: 'Coefficient pour chaleur modérée. Ex: 0.95 = l\'objectif est réduit de 5%. Impact physiologique réel mais moins marqué qu\'en forte chaleur.',
    unite: '×', min: 0.80, max: 1.00, step: 0.01, defaut: 0.95
  },
  correcteur_neige: {
    label: 'Correcteur — neige',
    description: 'Coefficient pour conditions neigeuses. La neige réduit significativement la vitesse de déplacement et augmente le coût énergétique. Un objectif GPS plus bas est donc normal.',
    unite: '×', min: 0.70, max: 1.00, step: 0.01, defaut: 0.88
  },
  correcteur_pluie: {
    label: 'Correcteur — pluie / vent',
    description: 'Coefficient pour pluie ou vent fort. Impact modéré sur la distance parcourue — principalement lié à la prudence dans les appuis et aux glissades. Peut varier selon la qualité du terrain.',
    unite: '×', min: 0.85, max: 1.00, step: 0.01, defaut: 0.97
  },
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
  imports: [MatToolbar, MatCard, MatCardHeader, MatCardTitle, MatCardContent, MatCardActions, MatTooltip, FormsModule, RouterLink]
})
export class ParametresComponent implements OnInit {

  valeurs: Record<string, number> = {};
  loading  = true;
  saving   = false;

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
    {
      id: 'seuils_charge',
      titre: 'Seuils de charge hebdomadaire (Signal 1)',
      description: 'Définissent quand la semaine en cours est considérée comme "surchargée" par rapport à la charge habituelle du joueur. Ces seuils contrôlent la sensibilité de la première alerte de fatigue.',
      cles: ['seuil_surcharge_probable', 'seuil_surcharge_possible'],
      expanded: false
    },
    {
      id: 'seuils_norme',
      titre: 'Seuils de norme GPS (rapport de séance)',
      description: 'Définissent l\'écart toléré par rapport à la baseline historique d\'un joueur avant qu\'une séance soit classée "sous la norme" ou "sur la norme". Impacte le rapport détaillé de chaque séance.',
      cles: ['seuil_sous_norme_pct', 'seuil_sur_norme_pct'],
      expanded: false
    },
    {
      id: 'seuils_performance',
      titre: 'Seuils de dégradation de performance (Signal 2)',
      description: 'Seuils de comparaison entre les dernières séances et la baseline historique sur 3 indicateurs GPS. Permettent de détecter une baisse de performance avant qu\'elle soit visible à l\'œil nu.',
      cles: ['seuil_mmin_probable', 'seuil_mmin_possible', 'seuil_vmax_probable', 'seuil_vmax_possible', 'seuil_hi_probable', 'seuil_hi_possible'],
      expanded: false
    },
    {
      id: 'seuils_monotonie',
      titre: 'Indice de monotonie (Signal 3)',
      description: 'Seuils de l\'indice de monotonie Foster calculé sur 8 semaines. Un indice élevé signale que le joueur s\'entraîne toujours avec la même charge sans variation — facteur de surmenage chronique même sans surcharge aiguë.',
      cles: ['seuil_monotonie_alerte', 'seuil_monotonie_vigilance'],
      expanded: false
    },
    {
      id: 'recuperation',
      titre: 'Espacement entre séances (Signal 4)',
      description: 'Paramètres de détection d\'une récupération insuffisante entre séances haute intensité. Contrôlent les délais minimaux jugés nécessaires entre deux efforts de même nature.',
      cles: ['delai_match_match_jours', 'delai_intensif_intensif_jours', 'repos_min_14_jours'],
      expanded: false
    },
    {
      id: 'blessures',
      titre: 'Blessures récentes (bonus de fatigue)',
      description: 'Paramètres du bonus appliqué au score de fatigue en cas de blessure récente. Un joueur qui reprend après une blessure doit être géré avec plus de précaution — ces valeurs amplifient les alertes pour ce profil.',
      cles: ['fenetre_blessure_fatigue_jours', 'bonus_blessure_pts'],
      expanded: false
    },
    {
      id: 'poids_risque',
      titre: 'Correction surpoids',
      description: 'Impact du surpoids sur le score de risque blessure (points) et sur l\'objectif GPS d\'un match (réduction en %). Permet d\'adapter l\'analyse à la réalité physique du joueur sans le pénaliser injustement.',
      cles: ['correction_surpoids_pts_par_kg', 'correction_surpoids_plafond_pts', 'correction_surpoids_pct_par_kg', 'correction_surpoids_plafond_pct'],
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
      id: 'meteo',
      titre: 'Correcteurs météo et température',
      description: 'Coefficients appliqués aux objectifs GPS en fonction des conditions climatiques. Permettent d\'éviter de pénaliser un joueur qui a produit un effort normal dans des conditions difficiles (forte chaleur, neige, pluie).',
      cles: ['temp_chaleur_forte_c', 'temp_chaleur_moderee_c', 'correcteur_chaleur_forte', 'correcteur_chaleur_moderee', 'correcteur_neige', 'correcteur_pluie'],
      expanded: false
    },
  ];

  readonly meta = PARAM_META;

  constructor(
    private configService: ConfigurationService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.valeurs = Object.fromEntries(
      Object.entries(PARAM_META).map(([cle, m]) => [cle, m.defaut])
    );
    this.configService.getAll().subscribe({
      next: data => { this.valeurs = { ...this.valeurs, ...data }; this.loading = false; },
      error: () => { this.loading = false; }
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
