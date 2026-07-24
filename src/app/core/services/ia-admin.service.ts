import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ClubIaConfig {
  clubId: string;
  clubNom: string;
  provider: string | null;
  modele: string | null;
  actif: boolean;
  aCle: boolean;
  cleMasquee: string | null;
}

export interface IaConfigRequest {
  provider?: string;
  cleApi?: string | null;
  modele?: string;
  actif?: boolean;
}

/** Console IA super-admin : config (provider + clé + modèle) par club et quotas par feature. */
@Injectable({ providedIn: 'root' })
export class IaAdminService {

  private http = inject(HttpClient);
  private base = '/api/admin/ia';

  clubs(): Observable<ClubIaConfig[]> {
    return this.http.get<ClubIaConfig[]>(`${this.base}/clubs`);
  }

  configurer(clubId: string, req: IaConfigRequest): Observable<ClubIaConfig> {
    return this.http.put<ClubIaConfig>(`${this.base}/clubs/${clubId}`, req);
  }

  revoquer(clubId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/clubs/${clubId}`);
  }

  quotas(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.base}/quotas`);
  }

  majQuotas(valeurs: Record<string, number>): Observable<Record<string, number>> {
    return this.http.put<Record<string, number>>(`${this.base}/quotas`, valeurs);
  }
}
