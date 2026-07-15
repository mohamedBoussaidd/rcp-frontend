import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Jeux de règles du moteur tactique (équipe active). `reglesJson` est opaque pour le back ;
 * sa sémantique (postures, interpolation, miroir) vit dans features/tactical/moteur.
 */
export interface RegleTactiqueResume {
  id: string;
  type: 'NOUS' | 'ADVERSAIRE';
  nom: string;
  systeme: string;
  updatedAt: string;
}

export interface RegleTactiqueDetail extends RegleTactiqueResume {
  reglesJson: string;
}

export interface RegleTactiqueRequest {
  type: 'NOUS' | 'ADVERSAIRE';
  nom: string;
  systeme: string;
  reglesJson: string;
}

@Injectable({ providedIn: 'root' })
export class ReglesTactiquesService {

  private http = inject(HttpClient);
  private readonly base = '/api/regles-tactiques';

  lister(filtre?: { type?: 'NOUS' | 'ADVERSAIRE'; systeme?: string }): Observable<RegleTactiqueResume[]> {
    let params = new HttpParams();
    if (filtre?.type) params = params.set('type', filtre.type);
    if (filtre?.systeme) params = params.set('systeme', filtre.systeme);
    return this.http.get<RegleTactiqueResume[]>(this.base, { params });
  }

  detail(id: string): Observable<RegleTactiqueDetail> {
    return this.http.get<RegleTactiqueDetail>(`${this.base}/${id}`);
  }

  creer(req: RegleTactiqueRequest): Observable<RegleTactiqueDetail> {
    return this.http.post<RegleTactiqueDetail>(this.base, req);
  }

  modifier(id: string, req: RegleTactiqueRequest): Observable<RegleTactiqueDetail> {
    return this.http.put<RegleTactiqueDetail>(`${this.base}/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
