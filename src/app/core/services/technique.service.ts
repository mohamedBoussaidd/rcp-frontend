import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Exercice {
  id: string;
  nom: string;
  categorie?: string;
  dureeMinutes?: number;
  objectif?: string;
  intensite?: number;
  description?: string;
  schemaJson?: string;
  creeParId?: string;
  creeParNom?: string;
  equipeOrigineId?: string;
  equipeOrigineNom?: string;
  modifiable: boolean;
}

export interface ExerciceRequest {
  nom: string;
  categorie?: string;
  dureeMinutes?: number | null;
  objectif?: string;
  intensite?: number | null;
  description?: string;
}

export interface ExerciceLigne {
  exerciceId: string;
  nom: string;
  categorie?: string;
  dureeMinutes?: number;
  intensite?: number;
  objectif?: string;
  ordre: number;
}

export interface SeanceTechnique {
  id: string;
  equipeId: string;
  date: string;
  heureDebut?: string;
  titre?: string;
  objectif?: string;
  description?: string;
  statut: string;
  creeParNom?: string;
  dureeTotaleMinutes: number;
  intensiteMoyenne?: number;
  exercices: ExerciceLigne[];
}

export interface SeanceTechniqueRequest {
  date: string;
  heureDebut?: string | null;
  titre?: string;
  objectif?: string;
  description?: string;
  exerciceIds: string[];
}

export const CATEGORIES_EXERCICE = [
  'echauffement', 'technique', 'tactique', 'conservation',
  'jeu_reduit', 'match_a_theme', 'finition', 'transition',
];

@Injectable({ providedIn: 'root' })
export class TechniqueService {

  constructor(private http: HttpClient) {}

  // ── Bibliotheque d'exercices ──
  listerExercices(): Observable<Exercice[]> {
    return this.http.get<Exercice[]>('/api/exercices');
  }
  creerExercice(req: ExerciceRequest): Observable<Exercice> {
    return this.http.post<Exercice>('/api/exercices', req);
  }
  modifierExercice(id: string, req: ExerciceRequest): Observable<Exercice> {
    return this.http.put<Exercice>(`/api/exercices/${id}`, req);
  }
  supprimerExercice(id: string): Observable<void> {
    return this.http.delete<void>(`/api/exercices/${id}`);
  }

  sauverSchema(exerciceId: string, schemaJson: string): Observable<Exercice> {
    return this.http.put<Exercice>(`/api/exercices/${exerciceId}/schema`, { schemaJson });
  }

  // ── Seances techniques ──
  listerSeances(debut?: string, fin?: string): Observable<SeanceTechnique[]> {
    let params = new HttpParams();
    if (debut) params = params.set('debut', debut);
    if (fin) params = params.set('fin', fin);
    return this.http.get<SeanceTechnique[]>('/api/seances-techniques', { params });
  }
  creerSeance(req: SeanceTechniqueRequest): Observable<SeanceTechnique> {
    return this.http.post<SeanceTechnique>('/api/seances-techniques', req);
  }
  modifierSeance(id: string, req: SeanceTechniqueRequest): Observable<SeanceTechnique> {
    return this.http.put<SeanceTechnique>(`/api/seances-techniques/${id}`, req);
  }
  realiserSeance(id: string): Observable<SeanceTechnique> {
    return this.http.patch<SeanceTechnique>(`/api/seances-techniques/${id}/realiser`, {});
  }
  supprimerSeance(id: string): Observable<void> {
    return this.http.delete<void>(`/api/seances-techniques/${id}`);
  }
}
