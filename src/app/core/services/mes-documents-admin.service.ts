import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { StatutDocument } from './documentadmin.service';

export interface MonDocumentAdmin {
  typeId: string;
  typeLibelle: string;
  typeDescription?: string | null;
  obligatoire: boolean;
  documentId?: string | null;
  statut: StatutDocument;
  nomOriginal?: string | null;
  dateExpiration?: string | null;
  motifRefus?: string | null;
}

/** Mes documents administratifs (PWA joueur) — endpoints self-scope sous /api/moi. */
@Injectable({ providedIn: 'root' })
export class MesDocumentsAdminService {
  private http = inject(HttpClient);

  mesDocuments(): Observable<MonDocumentAdmin[]> {
    return this.http.get<MonDocumentAdmin[]>('/api/moi/documents-administratifs');
  }

  deposer(typeId: string, fichier: File): Observable<MonDocumentAdmin> {
    const form = new FormData();
    form.append('fichier', fichier);
    return this.http.post<MonDocumentAdmin>(`/api/moi/documents-administratifs/${typeId}`, form);
  }

  telecharger(documentId: string): Observable<Blob> {
    return this.http.get(`/api/moi/documents-administratifs/${documentId}/fichier`, { responseType: 'blob' });
  }
}
