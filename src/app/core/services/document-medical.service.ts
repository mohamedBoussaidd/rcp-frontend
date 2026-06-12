import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DocumentMedical {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  nomOriginal: string;
  typeMime: string;
  tailleOctets: number;
  categorie: string;
  description?: string;
  partageRoles: string[];
  dateDepot: string;
}

/** Documents médicaux côté staff (lecture filtrée par visibilité, suppression MEDICAL). */
@Injectable({ providedIn: 'root' })
export class DocumentMedicalService {
  private http = inject(HttpClient);
  private readonly base = '/api/documents-medicaux';

  lister(joueurId?: string): Observable<DocumentMedical[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<DocumentMedical[]>(this.base, { params });
  }

  telecharger(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/fichier`, { responseType: 'blob' });
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
