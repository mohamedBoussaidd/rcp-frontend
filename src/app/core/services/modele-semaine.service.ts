import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Créneau-jour d'un modèle de semaine (1 = lundi … 7 = dimanche). */
export interface CreneauModele {
  id?: string;
  jourSemaine: number;
  heureDebut?: string | null;
  dureeMinutes?: number | null;
  terrain?: string | null;
  typeSeanceId: string;
  typeSeanceLibelle?: string | null;
  titre?: string | null;
  objectif?: string | null;
  objectifDistanceM?: number | null;
  objectifIntensite?: number | null;
  ordre: number;
}

export interface ModeleSemaine {
  id: string;
  equipeId: string;
  nom: string;
  description?: string | null;
  creneaux: CreneauModele[];
}

export interface ModeleRequest {
  nom: string;
  description?: string | null;
  creneaux: CreneauModele[];
}

export interface InstancierRequest {
  debut: string;        // ISO yyyy-MM-dd
  fin: string;          // ISO yyyy-MM-dd
  remplacer: boolean;
}

export interface InstancierResult {
  creees: number;
  ignorees: number;
  remplacees: number;
}

@Injectable({ providedIn: 'root' })
export class ModeleSemaineService {

  private readonly base = '/api/modeles-semaine';
  private http = inject(HttpClient);

  getAll(): Observable<ModeleSemaine[]> {
    return this.http.get<ModeleSemaine[]>(this.base);
  }

  get(id: string): Observable<ModeleSemaine> {
    return this.http.get<ModeleSemaine>(`${this.base}/${id}`);
  }

  create(req: ModeleRequest): Observable<ModeleSemaine> {
    return this.http.post<ModeleSemaine>(this.base, req);
  }

  update(id: string, req: ModeleRequest): Observable<ModeleSemaine> {
    return this.http.put<ModeleSemaine>(`${this.base}/${id}`, req);
  }

  dupliquer(id: string): Observable<ModeleSemaine> {
    return this.http.post<ModeleSemaine>(`${this.base}/${id}/dupliquer`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  instancier(id: string, req: InstancierRequest): Observable<InstancierResult> {
    return this.http.post<InstancierResult>(`${this.base}/${id}/instancier`, req);
  }
}
