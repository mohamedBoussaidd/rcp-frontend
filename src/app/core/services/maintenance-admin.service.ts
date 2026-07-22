import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TacheVue {
  code: string;
  libelle: string;
  description: string;
  nettoyage: boolean;
  apercu: number | null;
  dernierStatut: string | null;
  derniereExecution: string | null;
  dernierMessage: string | null;
}

export interface Retention { lues: number; nonLues: number; }

export type CibleBroadcast = 'TOUS' | 'CLUB' | 'ROLE';

export interface BroadcastRequest {
  cible: CibleBroadcast;
  clubId?: string | null;
  role?: string | null;
  titre: string;
  corps?: string | null;
  lien?: string | null;
  priorite?: 'NORMALE' | 'URGENTE';
}

/** Console d'exploitation plateforme (SUPER_ADMIN) : tâches de maintenance, rétention, broadcast. */
@Injectable({ providedIn: 'root' })
export class MaintenanceAdminService {

  private http = inject(HttpClient);
  private base = '/api/admin/maintenance';

  taches(): Observable<TacheVue[]> {
    return this.http.get<TacheVue[]>(`${this.base}/taches`);
  }

  executer(code: string): Observable<TacheVue> {
    return this.http.post<TacheVue>(`${this.base}/taches/${code}/executer`, {});
  }

  retention(): Observable<Retention> {
    return this.http.get<Retention>(`${this.base}/retention`);
  }

  majRetention(r: Retention): Observable<Retention> {
    return this.http.put<Retention>(`${this.base}/retention`, r);
  }

  broadcast(req: BroadcastRequest): Observable<{ destinataires: number }> {
    return this.http.post<{ destinataires: number }>(`${this.base}/broadcast`, req);
  }
}
