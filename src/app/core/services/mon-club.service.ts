import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Role } from './auth.service';

export interface Equipe {
  id: string;
  nom: string;
  categorie?: string;
  clubId: string;
  nbMembres: number;
}

export interface Membre {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  specialite?: string;
  equipeId?: string;
  joueurId?: string;
  actif: boolean;
}

export interface MonClub {
  clubId: string;
  clubNom?: string;
  clubLogo?: string;
  equipes: Equipe[];
  membres: Membre[];
}

export interface EquipeRequest { nom: string; categorie?: string; }

export interface MembreCreateRequest {
  email: string;
  nom: string;
  prenom: string;
  motDePasse: string;
  role: string;
  specialite?: string;
  equipeId?: string;
  joueurId?: string;
}

@Injectable({ providedIn: 'root' })
export class MonClubService {
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  getMonClub(): Observable<MonClub> {
    return this.http.get<MonClub>(`${this.base}/mon-club`);
  }

  creerEquipe(req: EquipeRequest): Observable<Equipe> {
    return this.http.post<Equipe>(`${this.base}/mon-club/equipes`, req);
  }

  modifierEquipe(id: string, req: EquipeRequest): Observable<Equipe> {
    return this.http.put<Equipe>(`${this.base}/equipes/${id}`, req);
  }

  supprimerEquipe(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/equipes/${id}`);
  }

  creerMembre(req: MembreCreateRequest): Observable<Membre> {
    return this.http.post<Membre>(`${this.base}/mon-club/membres`, req);
  }

  modifierMembre(id: string, req: Partial<MembreCreateRequest> & { actif?: boolean }): Observable<Membre> {
    return this.http.put<Membre>(`${this.base}/membres/${id}`, req);
  }

  supprimerMembre(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/membres/${id}`);
  }
}
