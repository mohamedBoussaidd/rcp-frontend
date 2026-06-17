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

  /** Dépôt d'un document par le staff pour un joueur (multipart). */
  deposer(joueurId: string, fichier: File, categorie: string, description: string, partageRoles: string[]): Observable<DocumentMedical> {
    const fd = new FormData();
    fd.append('joueurId', joueurId);
    fd.append('fichier', fichier);
    fd.append('categorie', categorie);
    if (description) fd.append('description', description);
    for (const r of partageRoles) fd.append('partageRoles', r);
    return this.http.post<DocumentMedical>(this.base, fd);
  }

  telecharger(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/fichier`, { responseType: 'blob' });
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
