import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type StatutBlessure = 'INDISPONIBLE' | 'EN_REPRISE' | 'RETABLI';

export interface Blessure {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  dateBlessure: string;
  dateRetourEffectif?: string;
  dateRetourPrevue?: string;
  statut: StatutBlessure;
  typeBlessure?: string;
  zoneCorporelle?: string;
  cote?: string;
  gravite?: string;
  causeProbable?: string;
  recidive: boolean;
  commentaire?: string;
  enCours: boolean;
}

export interface BlessureRequest {
  joueurId: string;
  dateBlessure: string;
  dateRetourEffectif?: string | null;
  dateRetourPrevue?: string | null;
  statut?: StatutBlessure;
  typeBlessure?: string;
  zoneCorporelle?: string;
  cote?: string;
  gravite?: string;
  causeProbable?: string;
  recidive?: boolean;
  commentaire?: string;
}

@Injectable({ providedIn: 'root' })
export class BlessureService {
  private readonly base = '/api/blessures';

  constructor(private http: HttpClient) {}

  lister(joueurId?: string): Observable<Blessure[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<Blessure[]>(this.base, { params });
  }

  creer(req: BlessureRequest): Observable<Blessure> {
    return this.http.post<Blessure>(this.base, req);
  }

  modifier(id: string, req: BlessureRequest): Observable<Blessure> {
    return this.http.put<Blessure>(`${this.base}/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
