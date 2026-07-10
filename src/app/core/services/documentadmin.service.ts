import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type StatutDocument = 'MANQUANT' | 'SOUMIS' | 'VALIDE' | 'REFUSE' | 'EXPIRE';

export type CibleDocument = 'JOUEUR' | 'STAFF' | 'TOUS';

export interface TypeDocumentRequis {
  id: string;
  code: string;
  libelle: string;
  description?: string | null;
  obligatoire: boolean;
  validationManuelle: boolean;
  dureeValiditeMois?: number | null;
  categoriesAge: string[];
  cible: CibleDocument;
  ordre: number;
  actif: boolean;
}

export interface TypeDocumentRequisRequest {
  code: string;
  libelle: string;
  description?: string | null;
  obligatoire: boolean;
  validationManuelle: boolean;
  dureeValiditeMois?: number | null;
  categoriesAge?: string[] | null;
  cible?: CibleDocument | null;
  ordre?: number | null;
  actif?: boolean | null;
}

export interface StatutDocumentLigne {
  typeId: string;
  typeCode: string;
  typeLibelle: string;
  obligatoire: boolean;
  documentId?: string | null;
  statut: StatutDocument;
  dateExpiration?: string | null;
  motifRefus?: string | null;
}

export interface JoueurConformite {
  joueurId: string;
  nom: string;
  prenom: string;
  categorieAgeCode?: string | null;
  documents: StatutDocumentLigne[];
}

export interface ConformiteResponse {
  joueurs: JoueurConformite[];
  complets: number;
  incomplets: number;
  aValider: number;
  expirentSous30j: number;
}

export interface DocumentResponse {
  id: string;
  joueurId: string;
  typeDocumentRequisId: string;
  statut: StatutDocument;
  nomOriginal?: string | null;
  typeMime?: string | null;
  tailleOctets?: number | null;
  dateSoumission?: string | null;
  dateValidation?: string | null;
  motifRefus?: string | null;
  dateExpiration?: string | null;
}

/** Licences & documents administratifs — côté staff. */
@Injectable({ providedIn: 'root' })
export class DocumentAdminService {
  private http = inject(HttpClient);

  // ── Référentiel (docadmin:configure) ──
  listerTypes(): Observable<TypeDocumentRequis[]> {
    return this.http.get<TypeDocumentRequis[]>('/api/documents-admin/types');
  }
  creerType(req: TypeDocumentRequisRequest): Observable<TypeDocumentRequis> {
    return this.http.post<TypeDocumentRequis>('/api/documents-admin/types', req);
  }
  modifierType(id: string, req: TypeDocumentRequisRequest): Observable<TypeDocumentRequis> {
    return this.http.put<TypeDocumentRequis>(`/api/documents-admin/types/${id}`, req);
  }

  // ── Conformité (docadmin:read) ──
  conformite(equipeId?: string | null): Observable<ConformiteResponse> {
    let params = new HttpParams();
    if (equipeId) params = params.set('equipeId', equipeId);
    return this.http.get<ConformiteResponse>('/api/documents-admin/conformite', { params });
  }
  /** Conformité documentaire du STAFF (encadrants du club), documents cible Staff/Tous. */
  conformiteStaff(): Observable<ConformiteResponse> {
    return this.http.get<ConformiteResponse>('/api/documents-admin/conformite-staff');
  }

  // ── Upload / validation staff ──
  deposer(joueurId: string, typeId: string, fichier: File): Observable<DocumentResponse> {
    const form = new FormData();
    form.append('fichier', fichier);
    return this.http.post<DocumentResponse>(`/api/documents-admin/joueurs/${joueurId}/types/${typeId}`, form);
  }
  valider(documentId: string): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(`/api/documents-admin/${documentId}/valider`, {});
  }
  refuser(documentId: string, motif: string): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(`/api/documents-admin/${documentId}/refuser`, { motif });
  }
  telecharger(documentId: string): Observable<Blob> {
    return this.http.get(`/api/documents-admin/${documentId}/fichier`, { responseType: 'blob' });
  }
}
