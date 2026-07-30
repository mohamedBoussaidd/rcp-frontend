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

export interface ObjectifHebdoJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste: string;
  cumul_m: number;
  cible_ideal_m: number | null;   // suggestion intelligente (A.5)
  cible_min_m: number | null;
  cible_haute_m: number | null;
  plafond_m: number | null;
  objectif_m: number | null;      // objectif retenu (manuel si défini, sinon la suggestion)
  source: 'MANUEL' | 'INTELLIGENT' | null;
  atteint: boolean | null;
  reste_m: number | null;
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
  joueurs: ObjectifHebdoJoueur[];
}

/** Carte briefing IA du préparateur : texte rendu + origine (LLM ou gabarit de repli). */
export interface Briefing {
  source: 'IA' | 'GABARIT';
  texte: string;
}

/** Un joueur en dérive sur un axe (variation % 14j récents vs 14j précédents). */
export interface DeriveJoueur { joueur_id: string; nom: string; drift_pct: number; }

/** Un axe de dérive (volume, haute intensité, ressenti) avec ses joueurs en hausse / baisse. */
export interface DeriveAxe {
  code: string;
  libelle: string;
  sens_hausse: string;   // ce que signifie une hausse sur cet axe (ex. « fatigue en hausse »)
  nb_hausse: number;
  nb_baisse: number;
  hausse: DeriveJoueur[];
  baisse: DeriveJoueur[];
}

/** Dérives lentes de l'effectif sur 4 semaines, en 3 axes séparés. */
export interface Derives {
  fenetre_jours: number;
  seuil_pct: number;
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
