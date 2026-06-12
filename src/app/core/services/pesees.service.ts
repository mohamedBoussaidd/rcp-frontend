import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Pesee {
  id: number;
  joueurId: string;
  date: string;
  poids: number;
  commentaire?: string;
}

export interface PoidsFicheJoueur {
  joueurId: string;
  nom: string;
  prenom: string;
  postePrincipal?: string;
  poidsFormeCible?: number;
  dernierePeseeDate?: string;
  dernierPoids?: number;
  ecartKg?: number;
}

@Injectable({ providedIn: 'root' })
export class PeseesService {
  private http = inject(HttpClient);
  private readonly base = '/api/pesees';

  getByJoueur(joueurId: string): Observable<Pesee[]> {
    return this.http.get<Pesee[]>(this.base, { params: { joueurId } });
  }

  getEquipe(): Observable<PoidsFicheJoueur[]> {
    return this.http.get<PoidsFicheJoueur[]>(`${this.base}/equipe`);
  }

  upsert(pesee: { joueurId: string; date: string; poids: number; commentaire?: string }): Observable<Pesee> {
    return this.http.post<Pesee>(this.base, pesee);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
