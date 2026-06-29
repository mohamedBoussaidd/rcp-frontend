import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ResumeJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste?: string;
  score_risque: number;
  score_fatigue: number;
  niveau_risque: 'FAIBLE' | 'MODERE' | 'ELEVE';
  niveau_fatigue: 'NOMINAL' | 'VIGILANCE' | 'ALERTE';
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
  phrase: string;
}

export interface NiveauFatigue {
  joueur_id: string;
  nom: string;
  prenom: string;
  score_fatigue: number;
  niveau: 'NOMINAL' | 'VIGILANCE' | 'ALERTE';
  raison: string;
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
}
