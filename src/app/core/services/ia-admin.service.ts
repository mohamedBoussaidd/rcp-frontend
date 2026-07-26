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

/** Catalogue d'une feature IA (drive les onglets Prompts & Quotas). */
export interface IaFeatureDto {
  code: string;
  libelle: string;
  prompt: boolean;
  toggle: boolean;
  clePrompt: string | null;
  cleToggle: string | null;
}

export interface QuotaClubLigne {
  clubId: string;
  clubNom: string;
  surcharge: number | null;
  effectif: number;
  consomme: number;
}

export interface QuotaFeatureDto {
  feature: string;
  libelle: string;
  defautGlobal: number;
  clubs: QuotaClubLigne[];
}

/** Console IA super-admin : catalogue des features, config (provider + clé + modèle) par club et quotas unifiés. */
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

  /** Catalogue des features IA. */
  features(): Observable<IaFeatureDto[]> {
    return this.http.get<IaFeatureDto[]>(`${this.base}/features`);
  }

  /** Quotas unifiés : une entrée par feature (défaut global + lignes par club). */
  quotas(): Observable<QuotaFeatureDto[]> {
    return this.http.get<QuotaFeatureDto[]>(`${this.base}/quotas`);
  }

  /** Fixe le quota global par défaut d'une feature (clé plateforme). */
  majQuotaDefaut(feature: string, valeur: number): Observable<QuotaFeatureDto[]> {
    return this.http.put<QuotaFeatureDto[]>(`${this.base}/quotas/defaut/${feature}`, { valeur });
  }

  /** Fixe (ou retire, valeur null) la surcharge de quota d'un club pour une feature. */
  majQuotaClub(clubId: string, feature: string, valeur: number | null): Observable<QuotaFeatureDto[]> {
    return this.http.put<QuotaFeatureDto[]>(`${this.base}/quotas/club/${clubId}/${feature}`, { valeur });
  }
}
