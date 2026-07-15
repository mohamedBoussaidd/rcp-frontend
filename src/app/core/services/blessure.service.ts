import { Injectable, inject } from '@angular/core';
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
  typePrecision?: string;
  zoneCorporelle?: string;
  zonePrecision?: string;
  cote?: string;
  gravite?: string;
  causeProbable?: string;
  recidive: boolean;
  commentaire?: string;
  notesMedicales?: string;
  qualificationAdministrative?: QualificationAdministrative;
  enCours: boolean;
}

export type QualificationAdministrative = 'AUCUNE' | 'ARRET_MALADIE' | 'ACCIDENT_TRAVAIL';

export interface BlessureRequest {
  joueurId: string;
  dateBlessure: string;
  dateRetourEffectif?: string | null;
  dateRetourPrevue?: string | null;
  statut?: StatutBlessure;
  typeBlessure?: string;
  typePrecision?: string;
  zoneCorporelle?: string;
  zonePrecision?: string;
  cote?: string;
  gravite?: string;
  causeProbable?: string;
  recidive?: boolean;
  commentaire?: string;
  notesMedicales?: string;
  qualificationAdministrative?: QualificationAdministrative;
}

@Injectable({ providedIn: 'root' })
export class BlessureService {
  private http = inject(HttpClient);
  private readonly base = '/api/blessures';

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

  /** Qualification administrative seule (blessures:qualify : médical, président, administratif). */
  qualifier(id: string, qualification: QualificationAdministrative): Observable<Blessure> {
    return this.http.patch<Blessure>(`${this.base}/${id}/qualification`, { qualification });
  }
}
