import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GpsPoint {
  seanceId: string;
  date: string;
  typeCode: string;
  typeLibelle: string;
  dureeMinutes: number | null;
  distanceTotaleM: number | null;
  distance15kmhM: number | null;
  distance19kmhM: number | null;
  distanceSprint24kmhM: number | null;
  distanceSprint28kmhM: number | null;
  nbSprints24kmh: number | null;
  vitesseMaxKmh: number | null;
  nbAccelerations: number | null;
  nbFreinages: number | null;
  ratioDistanceMin: number | null;
  conditionsMeteo: string | null;
  temperature: number | null;
}

export interface Joueur {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance?: string;
  sexe?: string;
  poidsActuel?: number;
  poidsFormeCible?: number;
  taille?: number;
  piedFort?: string;
  postePrincipal?: string;
  posteSecondaire?: string;
  profilAthletique?: string;
  statut: string;
  dateArriveeClub?: string;
}

@Injectable({
  providedIn: 'root'
})
export class JoueurService {

  private readonly base = '/api/joueurs';

  constructor(private http: HttpClient) {}

  getAll(): Observable<Joueur[]> {
    return this.http.get<Joueur[]>(this.base);
  }

  getById(id: string): Observable<Joueur> {
    return this.http.get<Joueur>(`${this.base}/${id}`);
  }

  create(joueur: Partial<Joueur>): Observable<Joueur> {
    return this.http.post<Joueur>(this.base, joueur);
  }

  update(id: string, joueur: Partial<Joueur>): Observable<Joueur> {
    return this.http.put<Joueur>(`${this.base}/${id}`, joueur);
  }

  getAllPourSuppression(): Observable<Joueur[]> {
    return this.http.get<Joueur[]>(`${this.base}/tous`);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getHistoriqueGps(id: string): Observable<GpsPoint[]> {
    return this.http.get<GpsPoint[]>(`${this.base}/${id}/gps`);
  }
}
