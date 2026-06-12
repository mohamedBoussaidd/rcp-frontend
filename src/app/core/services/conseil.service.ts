import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Conseil du staff (médical / préparateur) affiché au joueur dans son suivi subjectif. */
export interface Conseil {
  id: string;
  equipeId: string;
  joueurId?: string | null;
  joueurNom?: string;
  joueurPrenom?: string;
  titre: string;
  texte: string;
  icone?: string | null;
  /** true = conseil commun à l'équipe ; false = conseil personnel. */
  equipe: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConseilRequest {
  /** null/absent = conseil d'équipe ; sinon conseil personnel à ce joueur. */
  joueurId?: string | null;
  titre: string;
  texte: string;
  icone?: string | null;
}

/** Conseils du staff au joueur — gestion staff (CRUD), scopée à l'équipe côté serveur. */
@Injectable({ providedIn: 'root' })
export class ConseilService {

  private http = inject(HttpClient);
  private readonly base = '/api/conseils';

  /** Conseils d'équipe ; avec joueurId : + les conseils personnels du joueur. */
  getConseils(joueurId?: string): Observable<Conseil[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<Conseil[]>(this.base, { params });
  }

  creer(req: ConseilRequest): Observable<Conseil> {
    return this.http.post<Conseil>(this.base, req);
  }

  modifier(id: string, req: ConseilRequest): Observable<Conseil> {
    return this.http.put<Conseil>(`${this.base}/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
