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

/**
 * Mes documents administratifs — endpoints self-scope. Deux montages backend identiques :
 * /api/moi (rôle JOUEUR, PWA joueur) et /api/membre (tout compte relié à une fiche — espace
 * staff, V58). Les méthodes *Membre servent aux écrans staff.
 */
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

  // ── Variante staff (compte relié à une fiche, tout rôle) ──

  mesDocumentsMembre(): Observable<MonDocumentAdmin[]> {
    return this.http.get<MonDocumentAdmin[]>('/api/membre/documents-administratifs');
  }

  deposerMembre(typeId: string, fichier: File): Observable<MonDocumentAdmin> {
    const form = new FormData();
    form.append('fichier', fichier);
    return this.http.post<MonDocumentAdmin>(`/api/membre/documents-administratifs/${typeId}`, form);
  }

  telechargerMembre(documentId: string): Observable<Blob> {
    return this.http.get(`/api/membre/documents-administratifs/${documentId}/fichier`, { responseType: 'blob' });
  }
}
