import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProtocoleModeleEtape {
  id?: string;
  ordre?: number;
  libelle: string;
  jDebut?: number | null;
  jFin?: number | null;
  description?: string | null;
}

export interface ProtocoleModele {
  id: string;
  nom: string;
  description?: string;
  actif: boolean;
  ordre: number;
  typesBlessure: string[];
  zonesCorporelles: string[];
  gravites: string[];
  etapes: ProtocoleModeleEtape[];
  createdAt?: string;
}

export interface ProtocoleModeleRequest {
  nom: string;
  description?: string | null;
  actif?: boolean;
  typesBlessure: string[];
  zonesCorporelles: string[];
  gravites: string[];
  etapes: ProtocoleModeleEtape[];
}

/** Bibliothèque des protocoles de reprise (RTP) du club — lecture blessures:read, écriture blessures:write. */
@Injectable({ providedIn: 'root' })
export class ProtocoleModeleService {
  private http = inject(HttpClient);
  private readonly base = '/api/protocoles-modeles';

  lister(): Observable<ProtocoleModele[]> {
    return this.http.get<ProtocoleModele[]>(this.base);
  }

  creer(req: ProtocoleModeleRequest): Observable<ProtocoleModele> {
    return this.http.post<ProtocoleModele>(this.base, req);
  }

  modifier(id: string, req: ProtocoleModeleRequest): Observable<ProtocoleModele> {
    return this.http.put<ProtocoleModele>(`${this.base}/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  dupliquer(id: string): Observable<ProtocoleModele> {
    return this.http.post<ProtocoleModele>(`${this.base}/${id}/dupliquer`, {});
  }
}
