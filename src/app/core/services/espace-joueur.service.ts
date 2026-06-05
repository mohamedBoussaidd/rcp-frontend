import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Joueur, GpsPoint } from './joueur.service';
import { Blessure } from './blessure.service';
import { Seance } from './seance.service';
import { SeanceTechnique } from './technique.service';

export interface MaPesee {
  date: string;
  poids: number;
  commentaire?: string;
}

@Injectable({ providedIn: 'root' })
export class EspaceJoueurService {
  private readonly base = '/api/moi';

  constructor(private http: HttpClient) {}

  getProfil(): Observable<Joueur> {
    return this.http.get<Joueur>(`${this.base}/profil`);
  }

  getPesees(): Observable<MaPesee[]> {
    return this.http.get<MaPesee[]>(`${this.base}/pesees`);
  }

  getBlessures(): Observable<Blessure[]> {
    return this.http.get<Blessure[]>(`${this.base}/blessures`);
  }

  getGps(): Observable<GpsPoint[]> {
    return this.http.get<GpsPoint[]>(`${this.base}/gps`);
  }

  /** Séances de mon équipe (lecture seule). Avec période : vue calendrier. */
  getSeances(debut?: string, fin?: string): Observable<Seance[]> {
    const q = debut && fin ? `?debut=${debut}&fin=${fin}` : '';
    return this.http.get<Seance[]>(`${this.base}/seances${q}`);
  }

  /** Séances techniques de mon équipe (lecture seule). */
  getSeancesTechniques(debut?: string, fin?: string): Observable<SeanceTechnique[]> {
    const q = debut && fin ? `?debut=${debut}&fin=${fin}` : '';
    return this.http.get<SeanceTechnique[]>(`${this.base}/seances-techniques${q}`);
  }
}
