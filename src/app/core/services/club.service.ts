import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EquipeContexte } from './contexte.service';

export interface Club {
  id: string;
  nom: string;
  logo?: string;
  dateCreation: string;
  presidentId?: string;
  presidentEmail?: string;
  presidentNom?: string;
  presidentPrenom?: string;
  nbEquipes: number;
  nbJoueurs: number;
  actif: boolean;
}

export interface ClubCreateRequest {
  nom: string;
  logo?: string;
  president: { email: string; nom: string; prenom: string; motDePasse: string };
}

@Injectable({ providedIn: 'root' })
export class ClubService {
  private readonly base = '/api/clubs';

  constructor(private http: HttpClient) {}

  lister(): Observable<Club[]> {
    return this.http.get<Club[]>(this.base);
  }

  creer(req: ClubCreateRequest): Observable<Club> {
    return this.http.post<Club>(this.base, req);
  }

  modifier(id: string, req: { nom: string; logo?: string | null }): Observable<Club> {
    return this.http.put<Club>(`${this.base}/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** Active ou archive un club. */
  definirActif(id: string, actif: boolean): Observable<Club> {
    return this.http.patch<Club>(`${this.base}/${id}/actif`, null, { params: { actif } });
  }

  /** Équipes d'un club (pour entrer dans son contexte). */
  getEquipes(id: string): Observable<EquipeContexte[]> {
    return this.http.get<EquipeContexte[]>(`${this.base}/${id}/equipes`);
  }
}
