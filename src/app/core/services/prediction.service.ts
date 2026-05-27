import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ResumeJoueur {
  joueur_id: string;
  nom: string;
  prenom: string;
  poste?: string;
  score_risque: number;
  score_fatigue: number;
  niveau_risque: 'FAIBLE' | 'MODERE' | 'ELEVE';
  niveau_fatigue: 'FRAIS' | 'FATIGUE' | 'EPUISE';
}

export interface RisqueBlessure {
  joueur_id: string;
  nom: string;
  prenom: string;
  score_risque: number;
  niveau: 'FAIBLE' | 'MODERE' | 'ELEVE';
}

export interface NiveauFatigue {
  joueur_id: string;
  nom: string;
  prenom: string;
  score_fatigue: number;
  niveau: 'FRAIS' | 'FATIGUE' | 'EPUISE';
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
  atteint_objectif: boolean | null;
}

export interface RapportSeance {
  seance_id: string;
  date: string;
  type_code: string;
  type_libelle: string;
  nb_joueurs: number;
  lignes: LigneRapport[];
}

@Injectable({
  providedIn: 'root'
})
export class PredictionService {

  private readonly base = '/api/predictions';

  constructor(private http: HttpClient) {}

  getResumeEquipe(): Observable<ResumeJoueur[]> {
    return this.http.get<ResumeJoueur[]>(`${this.base}/equipe`);
  }

  getRisque(joueurId: string): Observable<RisqueBlessure> {
    return this.http.get<RisqueBlessure>(`${this.base}/risque/${joueurId}`);
  }

  getFatigue(joueurId: string): Observable<NiveauFatigue> {
    return this.http.get<NiveauFatigue>(`${this.base}/fatigue/${joueurId}`);
  }

  getChargeCollective(): Observable<ChargeCollective> {
    return this.http.get<ChargeCollective>(`${this.base}/charge-collective`);
  }

  getRapportSeance(seanceId: string): Observable<RapportSeance> {
    return this.http.get<RapportSeance>(`${this.base}/seance/${seanceId}/rapport`);
  }
}
