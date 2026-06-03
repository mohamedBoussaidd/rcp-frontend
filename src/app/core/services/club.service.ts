import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
