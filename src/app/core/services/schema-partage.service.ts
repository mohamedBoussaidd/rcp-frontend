import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Un partage tel que le staff le relit (qui a reçu quoi, et quand). */
export interface SchemaPartage {
  id: string;
  schemaId: string;
  schemaNom?: string;
  equipeId?: string;
  joueurId?: string;
  destinataire: string;
  titre?: string;
  message?: string;
  parNom?: string;
  createdAt: string;
}

export interface PartageRequest {
  schemaId: string;
  /** Toute l'équipe active. Combinable avec des joueurs nommés. */
  equipe: boolean;
  joueurIds?: string[];
  titre?: string;
  message?: string;
}

/** Un schéma reçu, tel que le joueur le voit (contenu inclus : le lecteur en a besoin). */
export interface MonSchema {
  id: string;
  schemaId: string;
  titre: string;
  message?: string;
  schemaJson: string;
  apercu?: string;
  /** Partagé nominativement (et non à toute l'équipe). */
  pourMoiSeul: boolean;
  partageLe: string;
}

/**
 * Partage de schémas aux joueurs (V100).
 * Côté staff : `/api/schemas/partages` (permission `schemas:partager`).
 * Côté joueur : `/api/moi/schemas` (self-scope par le token).
 */
@Injectable({ providedIn: 'root' })
export class SchemaPartageService {

  private http = inject(HttpClient);

  lister(schemaId?: string): Observable<SchemaPartage[]> {
    const params = schemaId ? { params: { schemaId } } : {};
    return this.http.get<SchemaPartage[]>('/api/schemas/partages', params);
  }

  partager(req: PartageRequest): Observable<SchemaPartage[]> {
    return this.http.post<SchemaPartage[]>('/api/schemas/partages', req);
  }

  retirer(id: string): Observable<void> {
    return this.http.delete<void>(`/api/schemas/partages/${id}`);
  }

  /** PWA joueur : les schémas que le staff m'a partagés. */
  mesSchemas(): Observable<MonSchema[]> {
    return this.http.get<MonSchema[]>('/api/moi/schemas');
  }
}
