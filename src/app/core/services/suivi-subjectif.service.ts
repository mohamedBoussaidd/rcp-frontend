import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Wellness {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  date: string;
  sommeil: number;
  fatigue: number;
  douleur: number;
  stress: number;
  humeur: number;
  scoreBienEtre: number;
  commentaire?: string;
  geneZone?: string;
  geneIntensite?: number;
  geneMoment?: string;
  geneTraitee?: boolean;
  /** Type de résolution une fois traitée : ARCHIVEE | CONVERTIE. */
  geneResolution?: 'ARCHIVEE' | 'CONVERTIE';
  geneTraiteeLe?: string;
}

export interface Rpe {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  seanceId: string;
  seanceType: 'PHYSIQUE' | 'TECHNIQUE';
  date: string;
  rpe: number;
  dureeMinutes?: number;
  charge?: number;
  commentaire?: string;
}

/** Suivi subjectif (wellness + RPE) côté staff — lecture filtrée par équipe. */
@Injectable({ providedIn: 'root' })
export class SuiviSubjectifService {

  private http = inject(HttpClient);

  getWellness(joueurId?: string): Observable<Wellness[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<Wellness[]>('/api/wellness', { params });
  }

  getRpe(joueurId?: string): Observable<Rpe[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<Rpe[]>('/api/rpe', { params });
  }

  /**
   * Marque la gêne d'une saisie comme traitée (staff médical / préparateur).
   * `resolution` = ARCHIVEE (archivage) ou CONVERTIE (convertie en blessure).
   */
  traiterGene(wellnessId: string, resolution: 'ARCHIVEE' | 'CONVERTIE' = 'ARCHIVEE'): Observable<Wellness> {
    const params = new HttpParams().set('resolution', resolution);
    return this.http.patch<Wellness>(`/api/wellness/${wellnessId}/gene-traitee`, {}, { params });
  }

  /** Rouvre une gêne traitée (médical) : elle redevient active dans les alertes. */
  rouvrirGene(wellnessId: string): Observable<Wellness> {
    return this.http.patch<Wellness>(`/api/wellness/${wellnessId}/gene-rouvrir`, {});
  }
}
