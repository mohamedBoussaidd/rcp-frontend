import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BlocSeanceDto, ExerciceLigneSeance, LigneExerciceRequest } from './seance.service';

/** Séance-modèle (gabarit réutilisable de l'espace Coaching) — ligne de liste. */
export interface SeanceModele {
  id: string;
  nom: string;
  typeSeanceId?: string;
  typeSeanceLibelle?: string;
  objectif?: string;
  dureeMinutes?: number;
  objectifDistanceM?: number;
  objectifIntensite?: number;
  objectifDistanceHauteIntensiteM?: number;
  description?: string;
  nbExercices: number;
  creeParId?: string;
  creeParNom?: string;
  equipeOrigineId?: string;
  equipeOrigineNom?: string;
  modifiable: boolean;
  // V68 : dosage 0-5 des cinq axes, recopié tel quel par `planifier()`.
  dominanteTactiqueOrgIntensite?: number | null;
  dominanteTactiqueFoncIntensite?: number | null;
  dominanteMentalIntensite?: number | null;
  dominanteTechniqueIntensite?: number | null;
  dominanteAthletiqueIntensite?: number | null;
  objTactiqueOrg?: string | null;
  objTactiqueFonc?: string | null;
  objMental?: string | null;
  objTechnique?: string | null;
  objAthletique?: string | null;
}

/** Détail d'un modèle : son cadre + les exercices (valeurs effectives) + totaux + mode avancé. */
export interface SeanceModeleDetail {
  modele: SeanceModele;
  exercices: ExerciceLigneSeance[];
  dureeTotaleMinutes: number;
  intensiteMoyenne?: number;
  distanceTotaleAttendueM?: number;
  distanceHauteIntensiteTotaleM?: number;
  nbSprintsTotal?: number;
  blocs: BlocSeanceDto[];
  dominanteIds: string[];
  sousPrincipeIds: string[];
}

/** Création / édition du cadre d'un modèle (champs `obj*` = mode avancé, tous optionnels). */
export interface SeanceModeleRequest {
  nom: string;
  typeSeanceId: string;
  objectif?: string | null;
  dureeMinutes?: number | null;
  objectifDistanceM?: number | null;
  objectifIntensite?: number | null;
  objectifDistanceHauteIntensiteM?: number | null;
  description?: string | null;
  // V68 : dosage 0-5 des cinq axes, recopié tel quel par `planifier()`.
  dominanteTactiqueOrgIntensite?: number | null;
  dominanteTactiqueFoncIntensite?: number | null;
  dominanteMentalIntensite?: number | null;
  dominanteTechniqueIntensite?: number | null;
  dominanteAthletiqueIntensite?: number | null;
  objTactiqueOrg?: string | null;
  objTactiqueFonc?: string | null;
  objMental?: string | null;
  objTechnique?: string | null;
  objAthletique?: string | null;
}

/** Contenu avancé d'un modèle : blocs + rattachement des exercices + référentiels.
 *  Pas de groupes : un gabarit n'a ni date ni effectif. */
export interface ContenuAvanceModeleRequest {
  blocs: { libelle: string; sequencage?: string | null; dureeMinutes?: number | null;
           zoneTerrain?: string | null; staffIds: string[] }[];
  exercices: LigneExerciceRequest[];
  dominanteIds: string[];
  sousPrincipeIds: string[];
}

/** Résultat de l'instanciation : la séance créée dans le calendrier. */
export interface PlanifieResponse {
  seanceId: string;
  date: string;
}

@Injectable({ providedIn: 'root' })
export class SeanceModeleService {

  private readonly base = '/api/seances-modeles';
  private http = inject(HttpClient);

  lister(): Observable<SeanceModele[]> {
    return this.http.get<SeanceModele[]>(this.base);
  }

  detail(id: string): Observable<SeanceModeleDetail> {
    return this.http.get<SeanceModeleDetail>(`${this.base}/${id}`);
  }

  creer(req: SeanceModeleRequest): Observable<SeanceModele> {
    return this.http.post<SeanceModele>(this.base, req);
  }

  modifier(id: string, req: SeanceModeleRequest): Observable<SeanceModele> {
    return this.http.put<SeanceModele>(`${this.base}/${id}`, req);
  }

  remplacerExercices(id: string, exercices: LigneExerciceRequest[]): Observable<SeanceModeleDetail> {
    return this.http.put<SeanceModeleDetail>(`${this.base}/${id}/exercices`, { exercices });
  }

  /** Contenu avancé (blocs, rattachement, dominantes, sous-principes). */
  remplacerContenuAvance(id: string, req: ContenuAvanceModeleRequest): Observable<SeanceModeleDetail> {
    return this.http.put<SeanceModeleDetail>(`${this.base}/${id}/contenu-avance`, req);
  }

  dupliquer(id: string): Observable<SeanceModele> {
    return this.http.post<SeanceModele>(`${this.base}/${id}/dupliquer`, {});
  }

  planifier(id: string, req: { date: string; heureDebut?: string }): Observable<PlanifieResponse> {
    return this.http.post<PlanifieResponse>(`${this.base}/${id}/planifier`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
