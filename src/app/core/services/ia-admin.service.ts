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
  /** Nom EFFECTIF de l'assistant pour ce club (surcharge du club, sinon nom global). */
  nomAssistant: string;
}

/** D'où vient la clé effective d'un fournisseur — le témoin affiché dans l'écran. */
export type OrigineCle = 'BASE' | 'ENVIRONNEMENT' | 'AUCUNE';

/**
 * Fournisseur IA du catalogue. `dialecte` = protocole parlé (OPENAI | ANTHROPIC) : c'est lui qui
 * choisit le client d'appel côté serveur, d'où la possibilité d'ajouter tout fournisseur compatible
 * OpenAI (Mistral, Groq, DeepSeek, OpenRouter, Ollama…) en renseignant seulement son URL de base.
 */
export interface FournisseurIa {
  code: string;
  libelle: string;
  dialecte: string;
  baseUrl: string | null;
  modeleDefaut: string | null;
  actif: boolean;
  /** Fournisseur du socle : sa clé est révocable, mais il n'est pas supprimable. */
  socle: boolean;
  origineCle: OrigineCle;
  cleMasquee: string | null;
}

export interface FournisseurIaRequest {
  libelle?: string;
  dialecte?: string;
  baseUrl?: string | null;
  modeleDefaut?: string | null;
  actif?: boolean;
  /** Vide = clé inchangée (une clé n'est jamais réaffichée, donc jamais re-soumise). */
  cleApi?: string | null;
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

  /** Nomme l'assistant pour un club (vide = le club retombe sur le nom global). */
  nommerAssistant(clubId: string, nom: string): Observable<ClubIaConfig[]> {
    return this.http.put<ClubIaConfig[]>(`${this.base}/clubs/${clubId}/nom-assistant`, { nom });
  }

  // ── Catalogue des fournisseurs ──

  fournisseurs(): Observable<FournisseurIa[]> {
    return this.http.get<FournisseurIa[]>(`${this.base}/fournisseurs`);
  }

  majFournisseur(code: string, req: FournisseurIaRequest): Observable<FournisseurIa[]> {
    return this.http.put<FournisseurIa[]>(`${this.base}/fournisseurs/${code}`, req);
  }

  /** Efface la clé saisie : retour au repli par variable d'environnement, si le serveur en a une. */
  revoquerCleFournisseur(code: string): Observable<FournisseurIa[]> {
    return this.http.delete<FournisseurIa[]>(`${this.base}/fournisseurs/${code}/cle`);
  }

  supprimerFournisseur(code: string): Observable<FournisseurIa[]> {
    return this.http.delete<FournisseurIa[]>(`${this.base}/fournisseurs/${code}`);
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
