import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Un facteur du score de risque, avec son poids : sert à expliquer le chiffre affiché. */
export interface Contribution {
  facteur: string;      // charge | blessure | poids
  points: number;
  libelle: string;      // fait mesuré, prêt à afficher
}

/**
 * Un signal du score de fatigue. `fait` est la mesure, `type_suggere` l'étiquette physiologique —
 * séparés volontairement : l'interface montre la mesure, l'étiquette reste au second rang.
 */
export interface SignalFatigue {
  facteur: string;
  points: number;
  fait: string;
  type_suggere?: string | null;
}

/** Divergence entre charge mesurée (GPS) et charge ressentie (sRPE) — annulée par l'ACWR mixte. */
export interface EcartSources {
  ecart: number;        // acwr_rpe − acwr_gps (signé)
  sens: 'COHERENT' | 'RESSENTI_SUP' | 'MESURE_SUP';
  libelle: string;
}

export interface ResumeJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste?: string;
  score_risque: number;
  score_fatigue: number;
  niveau_risque: 'FAIBLE' | 'MODERE' | 'ELEVE';
  niveau_fatigue: 'NOMINAL' | 'VIGILANCE' | 'ALERTE';
  // Composition des deux scores (sinon /etat-effectif affiche un chiffre inexplicable)
  contributions?: Contribution[];
  signaux?: SignalFatigue[];
  acwr_gps?: number | null;
  acwr_rpe?: number | null;
  semaines_gps?: number | null;
  semaines_rpe?: number | null;
  ecart_sources?: EcartSources | null;
  provisoire?: boolean | null;
  // Indicateurs préparateur (bruts, optionnels)
  acwr?: number | null;
  charge_aigue_km?: number | null;
  charge_chronique_km?: number | null;
  readiness?: number | null;       // composite bien-être 0-100
  readiness_date?: string | null;
  monotonie?: number | null;       // indice de Foster (8 sem.)
  sprint_niveau?: 'POSSIBLE' | 'PROBABLE' | null;  // fatigue neuromusculaire (orientation)
  sprint_message?: string | null;
  // Contexte temporel (saison / période / fraîcheur)
  etat?: EtatJoueur | null;
  periode_type?: PeriodeType | null;
  periode_libelle?: string | null;
  jours_inactif?: number | null;
  blessure_jours_restants?: number | null;
}

export type EtatJoueur = 'EN_CHARGE' | 'REPRISE' | 'INACTIF' | 'HORS_CHARGE' | 'HORS_SAISON' | 'BLESSE';
export type PeriodeType = 'PREPARATION' | 'COMPETITION' | 'TREVE' | 'REPRISE' | 'INTERSAISON';

export interface RisqueBlessure {
  joueur_id: string;
  nom: string;
  prenom: string;
  score_risque: number;
  niveau: 'FAIBLE' | 'MODERE' | 'ELEVE';
  // Sortie probabiliste explicable (sans ML)
  probabilite?: number | null;        // risque estimé à 7 jours (%)
  phrase?: string | null;             // phrase explicative prête à afficher
  facteur_dominant?: string | null;
  tendance?: 'HAUSSE' | 'BAISSE' | 'STABLE' | null;
  source?: 'GPS' | 'RPE' | 'MIXTE' | null;
  // Contexte temporel
  etat?: EtatJoueur | null;
  periode_type?: PeriodeType | null;
  periode_libelle?: string | null;
  jours_inactif?: number | null;
  // Explicabilité + les 3 lectures de l'ACWR (mixte retenu, mesuré seul, ressenti seul)
  contributions?: Contribution[];
  acwr?: number | null;
  acwr_gps?: number | null;
  acwr_rpe?: number | null;
  semaines_gps?: number | null;
  semaines_rpe?: number | null;
  ecart_sources?: EcartSources | null;
  provisoire?: boolean | null;
}

export interface ChargeCible {
  joueur_id: string;
  disponible: boolean;
  source?: 'GPS' | 'RPE' | 'MIXTE' | null;
  unite?: 'km' | 'sRPE' | null;
  chronique?: number | null;
  acwr_actuel?: number | null;
  cible_min?: number | null;
  cible_ideal?: number | null;
  cible_haute?: number | null;
  plafond?: number | null;
  semaines?: number | null;            // semaines de données réellement disponibles
  semaines_requises?: number | null;   // seuil de fiabilité (fenêtre chronique)
  provisoire?: boolean | null;         // true tant que semaines < semaines_requises
  phrase: string;
}

export interface NiveauFatigue {
  joueur_id: string;
  nom: string;
  prenom: string;
  score_fatigue: number;
  niveau: 'NOMINAL' | 'VIGILANCE' | 'ALERTE';
  raison: string;
  /** Signaux triés par poids décroissant : les 2 premiers sont les causes principales. */
  signaux?: SignalFatigue[];
  /** Sous-signaux GPS informatifs (sans points) : Vmax, part >19 km/h, m/min. */
  indicatifs?: string[];
  donnees?: boolean | null;
}

export interface ChargeCollective {
  labels: string[];
  data: number[];
}

export interface LigneRapport {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste: string;
  duree_minutes: number | null;
  distance_reelle: number | null;
  distance_attendue: number | null;
  baseline_n: number;                        // nb de séances de la baseline (même type)
  distance_attendue_globale: number | null;  // repli « toutes séances confondues »
  baseline_n_globale: number;
  ratio_reel: number | null;
  delta_m: number | null;
  delta_pct: number | null;
  statut: 'SOUS_NORME' | 'DANS_NORME' | 'SUR_NORME' | 'SANS_BASELINE';
  vitesse_max: number | null;
  nb_sprints: number | null;
  objectif_m: number | null;
  ratio_objectif: number | null;
  ratio_objectif_original: number | null;
  correction_poids_pct: number | null;
  ecart_poids_kg: number | null;
  atteint_objectif: boolean | null;
  // Objectif d'équipe au prorata du temps joué (tous types)
  objectif_seance_m: number | null;
  atteint_objectif_seance: boolean | null;
  // ── Contexte d'appel : de quoi expliquer une ligne sans kilomètres (lot 4) ──
  statut_appel: 'PRESENT' | 'RETARD' | 'ADAPTE' | 'SOIN' | 'EXCUSE' | 'ABSENT';
  /** Présent à l'appel mais aucune donnée GPS : la ligne est vide par manque de capteur. */
  sans_capteur: boolean;
  /** Déclaré non participant ALORS QU'il a des données : erreur d'appel ou mauvais nom apparié. */
  contradiction: boolean;
  /** Charge sRPE (RPE × durée), seule charge disponible pour un joueur sans capteur. */
  charge_rpe: number | null;
  intensite_rpe: number | null;
}

export interface RapportSeance {
  seance_id: string;
  date: string;
  type_code: string;
  type_libelle: string;
  nb_joueurs: number;
  // Objectif d'équipe de la séance (préparation)
  objectif: string | null;
  objectif_distance_m: number | null;
  objectif_intensite: number | null;
  objectif_distance_haute_intensite_m: number | null;
  duree_reference_minutes: number | null;
  lignes: LigneRapport[];
}

export interface ChargeSeance {
  seance_id: string;
  date: string;
  type_code: string;
  type_libelle: string;
  nb_joueurs: number;
  distance_totale_m: number;
  distance_attendue_m: number | null;
  duree_minutes: number;
  distance_19kmh_m: number;
  distance_28kmh_m: number;
  nb_sprints: number;
  nb_accelerations: number;
  nb_freinages: number;
  vitesse_max: number | null;
  ratio_reel: number | null;
  statut: 'SOUS_NORME' | 'DANS_NORME' | 'SUR_NORME' | 'SANS_BASELINE';
  delta_pct: number | null;
}

export interface ChargeJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste: string;
  rang: number;
  nb_seances: number;
  distance_totale_m: number;
  distance_attendue_m: number | null;
  duree_minutes: number;
  distance_19kmh_m: number;
  distance_28kmh_m: number;
  nb_sprints: number;
  vitesse_max: number | null;
  ratio_reel: number | null;
  statut: 'SOUS_NORME' | 'DANS_NORME' | 'SUR_NORME' | 'SANS_BASELINE';
  delta_pct: number | null;
}

export interface ChargeEquipe {
  seances: ChargeSeance[];
  joueurs: ChargeJoueur[];
}

/** Cumul, norme et priorité d'une métrique secondaire (>15, 24-28, >28, sprints…). */
export interface MetriqueSuivi {
  cumul: number;
  attendu_min: number | null;
  attendu_max: number | null;
  retenu: number | null;
  priorite: 'SECONDAIRE' | 'IMPORTANT' | 'INTOUCHABLE' | null;
}

export interface ObjectifHebdoJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste: string;
  poste_reference?: string | null;
  cumul_m: number;
  cible_ideal_m: number | null;   // suggestion intelligente (A.5)
  cible_min_m: number | null;
  cible_haute_m: number | null;
  plafond_m: number | null;
  objectif_m: number | null;      // objectif retenu, après plafonnement ACWR
  source: 'PRESCRIT' | 'MANUEL' | 'INTELLIGENT' | null;
  atteint: boolean | null;
  reste_m: number | null;

  // ── Habituel / Attendu / Retenu ──
  // Habituel = sa charge chronique (son propre passé) ; Attendu = la norme de son poste au
  // niveau de l'équipe ; Retenu = ce qu'on lui demande CETTE semaine, entre les deux.
  habituel_m?: number | null;
  attendu_m?: number | null;
  attendu_min_m?: number | null;
  attendu_max_m?: number | null;
  retenu_m?: number | null;
  /** Part d'entraînement = cible moins les matchs de la semaine. Null hors semaine de match. */
  entrainement_m?: number | null;
  /** Vrai si l'objectif a dû être ramené sous le plafond d'ACWR : d'où la trajectoire. */
  bride_acwr?: boolean;
  ecart_attendu_pct?: number | null;
  rattrapage_semaines?: number;
  rattrapage?: number[];
  phase?: string | null;

  metriques?: Record<string, MetriqueSuivi>;
  /** Pic de vitesse de la semaine, en % du record personnel (jamais un cumul). */
  expo_vmax_pct?: number | null;
  expo_vmax_cible?: number | null;
  vitesse_max_semaine?: number | null;
  vitesse_max_record?: number | null;
}

/** Corps d'une simulation « une séance ». D'autres scénarios auront leur propre requête. */
export interface SimulationRequete {
  typeSeanceId: string | null;   // null = baseline « toutes séances confondues »
  dureeMinutes: number;
}

export interface SimulationJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste: string;
  km_attendu: number | null;
  baseline_n: number;
  baseline_origine: 'TYPE' | 'GLOBALE' | null;
  acwr_avant: number | null;
  acwr_apres: number | null;
  aigue_avant_km?: number | null;
  aigue_apres_km?: number | null;
  chronique_km?: number | null;
  zone_avant: ZoneAcwr | null;
  zone_apres: ZoneAcwr | null;
  bascule: boolean;
  statut: 'OK' | 'PEU_FIABLE' | 'SANS_BASELINE';
}

export type ZoneAcwr = 'SOUS_CHARGE' | 'OPTIMALE' | 'SURCHARGE';

export interface Simulation {
  seance: { type_seance_id: string | null; type_libelle: string | null; duree_minutes: number };
  synthese: {
    nb_evalues: number;
    nb_sans_baseline: number;
    nb_surcharge_avant: number;
    nb_surcharge_apres: number;
    nb_bascule: number;
    km_attendu_moyen: number | null;
    nb_peu_fiable: number;
  };
  joueurs: SimulationJoueur[];
}

/** Un message du fil de discussion avec l'assistant. */
export interface MessageChat {
  role: 'user' | 'assistant';
  contenu: string;
}

/** Raccourci proposé dans le widget : déclenche une carte IA déjà existante. */
export interface ActionRapide {
  code: string;
  libelle: string;
  endpoint: string;
  methode: string;
}

/**
 * État du chat. `disponible=false` → le widget s'affiche mais la saisie est bloquée avec `message`
 * (le chat est LLM-obligatoire : sans clé ni quota, il n'a aucun repli à proposer).
 */
export interface EtatChat {
  disponible: boolean;
  raison: 'PAS_DE_CLE' | 'QUOTA_EPUISE' | null;
  message: string | null;
  nom: string;
  actions: ActionRapide[];
}

export interface ObjectifHebdo {
  objectif_distance_m: number | null;   // objectif manuel d'équipe (null = non défini)
  suggestion_moyenne_m: number | null;  // moyenne d'équipe des cibles A.5
  suggestion_semaines?: number | null;  // semaines de données disponibles (fiabilité)
  suggestion_provisoire?: boolean;      // true tant que < 4 semaines de données
  multi_equipes: boolean;               // contexte multi-équipes → écriture impossible
  nb_atteint: number;
  nb_concernes: number;
  meilleur: { joueur_id: string; nom: string; prenom: string; cumul_m: number } | null;
  /** Un référentiel est adopté → la colonne « Attendu » a du sens. Sinon elle reste masquée. */
  referentiel_actif?: boolean;
  /** Un objectif de période s'applique cette semaine (trajectoire ou cibles par poste). */
  prescrit_actif?: boolean;
  phase?: string | null;
  nb_sous_attendu?: number;
  nb_rattrapage?: number;
  /** État « double match » de la semaine lue (add-on). */
  semaine?: SemaineDoubleMatch;
  joueurs: ObjectifHebdoJoueur[];
}

/** D'où vient un delta porté par la semaine — un ajustement inexpliqué n'est pas exploitable. */
export interface OrigineReport {
  semaine_source: string;
  choix: 'ALLEGER' | 'ASSUMER' | 'RELISSER';
  delta: number;
}

/**
 * Semaine à plusieurs matchs. `arbitre` distingue « pas encore décidé » de « décidé d'alléger » :
 * la première situation appelle une action du préparateur, la seconde non.
 */
export interface SemaineDoubleMatch {
  date_lundi: string;
  nb_matchs: number;
  dates_matchs: string[];
  /** Charge d'un match selon le référentiel — null si aucun référentiel adopté. */
  cout_match_m: number | null;
  arbitre: boolean;
  choix: 'ALLEGER' | 'ASSUMER' | 'RELISSER' | null;
  note: string | null;
  /** Le calendrier a bougé depuis la décision : le report ne correspond plus. */
  calendrier_change: boolean;
  deltas: Record<string, number>;
  origines: OrigineReport[];
}

/** Une semaine de la trajectoire d'un joueur (onglet « Objectif de charge » de sa fiche). */
export interface SemaineTrajectoire {
  date_lundi: string;
  no_semaine: number;
  phase: string | null;
  habituel_m: number | null;
  attendu_m: number | null;
  attendu_min_m: number | null;
  attendu_max_m: number | null;
  retenu_m: number | null;
  realise_m: number;
  nb_matchs: number;
  /** Semaine révolue : au-delà, la courbe du réalisé doit s'arrêter, pas retomber à zéro. */
  passee: boolean;
  metriques: Record<string, { realise: number; attendu: number | null; retenu: number | null }>;
}

export interface TrajectoireJoueur {
  disponible: boolean;
  erreur?: string;
  joueur?: { id: string; nom: string; prenom: string; poste: string; poste_reference: string | null };
  periode?: { id: string; libelle: string; type: string; date_debut: string; date_fin: string };
  referentiel_actif?: boolean;
  nb_semaines?: number;
  nb_semaines_tenues?: number;
  nb_semaines_evaluees?: number;
  semaines: SemaineTrajectoire[];
}

export interface BilanSemaine {
  date_lundi: string;
  no_semaine: number;
  phase: string | null;
  prescrit_m: number | null;
  realise_moyen_m: number;
  ecart_pct: number | null;
  nb_joueurs: number;
  nb_atteint: number;
  nb_matchs: number;
}

export interface BilanPeriode {
  disponible: boolean;
  erreur?: string;
  periode?: { id: string; libelle: string; type: string; date_debut: string; date_fin: string };
  terminee?: boolean;
  referentiel_actif?: boolean;
  objectif_defini?: boolean;
  nb_semaines?: number;
  nb_semaines_evaluees?: number;
  nb_semaines_tenues?: number;
  semaines: BilanSemaine[];
  metriques: { metrique: string; prescrit: number | null; realise: number; ecart_pct: number | null }[];
  joueurs?: { joueur_id: string; nom: string; prenom: string; poste: string;
              realise_m: number; prescrit_m: number | null; ecart_pct: number | null;
              nb_semaines: number }[];
}

/** Carte briefing IA du préparateur : texte rendu + origine (LLM ou gabarit de repli). */
export interface Briefing {
  source: 'IA' | 'GABARIT';
  texte: string;
}

/**
 * Un joueur en dérive sur un axe (variation % 14j récents vs 14j précédents).
 * `valeur_recente` / `valeur_reference` sont les deux valeurs comparées, dans l'unité de l'axe :
 * un pourcentage seul n'est pas interprétable (« +30 % » de quoi, à partir de quoi ?).
 */
export interface DeriveJoueur {
  joueur_id: string;
  nom: string;
  drift_pct: number;
  valeur_recente?: number;
  valeur_reference?: number;
}

/** Un axe de dérive (volume, intensité, ressenti) avec ses joueurs en hausse / baisse. */
export interface DeriveAxe {
  code: string;
  libelle: string;
  sens_hausse: string;   // ce que signifie une hausse sur cet axe (ex. « fatigue en hausse »)
  unite?: string;        // 'km' | '%' | '/100' — unité de valeur_recente / valeur_reference
  /** Joueurs écartés faute de données suffisantes (≠ stable) : comptés, jamais masqués. */
  nb_ecartes?: number;
  nb_hausse: number;
  nb_baisse: number;
  hausse: DeriveJoueur[];
  baisse: DeriveJoueur[];
}

/** Dérives lentes de l'effectif sur 4 semaines, en 3 axes séparés. */
export interface Derives {
  fenetre_jours: number;
  seuil_pct: number;
  /** Séances exigées dans CHAQUE fenêtre pour qu'un joueur soit comparé (garde-fou). */
  min_seances?: number;
  /** Date de fin de fenêtre réellement utilisée (suit la date simulée). */
  date_reference?: string;
  effectif: { nb_joueurs: number };
  axes: DeriveAxe[];
}

@Injectable({
  providedIn: 'root'
})
export class PredictionService {

  private readonly base = '/api/predictions';

  private http = inject(HttpClient);

  getResumeEquipe(): Observable<ResumeJoueur[]> {
    return this.http.get<ResumeJoueur[]>(`${this.base}/equipe`);
  }

  getRisque(joueurId: string): Observable<RisqueBlessure> {
    return this.http.get<RisqueBlessure>(`${this.base}/risque/${joueurId}`);
  }

  getFatigue(joueurId: string): Observable<NiveauFatigue> {
    return this.http.get<NiveauFatigue>(`${this.base}/fatigue/${joueurId}`);
  }

  getChargeCible(joueurId: string): Observable<ChargeCible> {
    return this.http.get<ChargeCible>(`${this.base}/charge-cible/${joueurId}`);
  }

  getChargeCollective(semaines: 4 | 8 | 12 = 4): Observable<ChargeCollective> {
    const params = new HttpParams().set('semaines', semaines);
    return this.http.get<ChargeCollective>(`${this.base}/charge-collective`, { params });
  }

  getRapportSeance(seanceId: string): Observable<RapportSeance> {
    return this.http.get<RapportSeance>(`${this.base}/seance/${seanceId}/rapport`);
  }

  getChargeEquipe(debut?: string, fin?: string, types?: string[]): Observable<ChargeEquipe> {
    let params = new HttpParams();
    if (debut) params = params.set('debut', debut);
    if (fin)   params = params.set('fin', fin);
    if (types && types.length) params = params.set('types', types.join(','));
    return this.http.get<ChargeEquipe>(`${this.base}/equipe/charge`, { params });
  }

  /** Panneau « Objectif de la semaine » (semaine en cours, indépendant du filtre de dates). */
  getObjectifHebdo(): Observable<ObjectifHebdo> {
    return this.http.get<ObjectifHebdo>(`${this.base}/equipe/objectif-hebdo`);
  }

  /**
   * Trajectoire d'un joueur sur une période (onglet « Objectif de charge » de sa fiche).
   * `periodeId` omis → la période qui couvre aujourd'hui.
   */
  getTrajectoireJoueur(joueurId: string, periodeId?: string | null): Observable<TrajectoireJoueur> {
    let params = new HttpParams();
    if (periodeId) params = params.set('periodeId', periodeId);
    return this.http.get<TrajectoireJoueur>(
      `${this.base}/joueur/${joueurId}/objectif-trajectoire`, { params });
  }

  /** Bilan d'une période : prescrit contre réalisé. Recalculé à chaque appel. */
  getBilanPeriode(periodeId: string): Observable<BilanPeriode> {
    return this.http.get<BilanPeriode>(`${this.base}/equipe/bilan-periode`,
      { params: new HttpParams().set('periodeId', periodeId) });
  }

  /** Définit (ou efface si null) l'objectif hebdo de l'équipe active. Distance en mètres. */
  setObjectifHebdo(objectifDistanceM: number | null): Observable<{ equipeId: string; objectifDistanceM: number | null }> {
    return this.http.put<{ equipeId: string; objectifDistanceM: number | null }>(
      `${this.base}/objectif-hebdo`, { objectifDistanceM });
  }

  /**
   * Génère le briefing du préparateur (note de l'équipe sur la semaine). POST : la génération peut
   * consommer du quota IA → déclenchée à la demande. Renvoie le texte + son origine (IA / gabarit).
   */
  genererBriefing(): Observable<Briefing> {
    return this.http.post<Briefing>('/api/assistant-ia/briefing', {});
  }

  /** Génère le debrief IA d'une séance réalisée (prévu vs réalisé, écarts). POST : consomme du quota. */
  genererDebrief(seanceId: string): Observable<Briefing> {
    return this.http.post<Briefing>(`/api/assistant-ia/debrief/${seanceId}`, {});
  }

  /** Dérives structurées de l'effectif (3 axes). GET : aucun coût IA, affiché tel quel. */
  getDerives(): Observable<Derives> {
    return this.http.get<Derives>('/api/assistant-ia/derives');
  }

  /** Synthèse textuelle de surveillance des dérives. POST : consomme du quota IA. */
  genererDeriveNote(): Observable<Briefing> {
    return this.http.post<Briefing>('/api/assistant-ia/derives/note', {});
  }

  /**
   * Simulation « et si… » — scénario « une séance ». POST parce qu'il y a un corps, mais c'est une
   * projection en LECTURE SEULE : aucune séance n'est créée. Aucun coût IA sur cet appel.
   */
  simulerSeance(req: SimulationRequete): Observable<Simulation> {
    return this.http.post<Simulation>('/api/assistant-ia/simulation', req);
  }

  /** Mise en mots de la simulation (IA ou gabarit). POST : consomme du quota IA. */
  genererSimulationNote(req: SimulationRequete): Observable<Briefing> {
    return this.http.post<Briefing>('/api/assistant-ia/simulation/note', req);
  }

  // ── Chat de l'assistant ──

  /** État du chat : disponibilité (clé + quota), nom de l'assistant, actions rapides. Aucun coût IA. */
  getEtatChat(): Observable<EtatChat> {
    return this.http.get<EtatChat>('/api/assistant-ia/chat/etat');
  }

  /** Envoie le fil et récupère la réponse. POST : consomme du quota IA (LLM obligatoire). */
  envoyerChat(messages: MessageChat[]): Observable<MessageChat> {
    return this.http.post<MessageChat>('/api/assistant-ia/chat', { messages });
  }
}
