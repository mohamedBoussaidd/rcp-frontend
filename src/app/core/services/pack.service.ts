import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Un module fonctionnel du catalogue (couche pack / abonnement). */
export interface ModuleCatalogue {
  code: string;
  libelle: string;
  description: string;
  socle: boolean;
  ordre: number;
}

/** Un pack commercial et ses modules. */
export interface Pack {
  code: string;
  libelle: string;
  description?: string;
  prixMensuel?: number | null;
  ordre: number;
  actif: boolean;
  predefini: boolean;
  modules: string[];
}

/** Création / édition d'un pack (prix saisi manuellement). */
export interface PackUpsert {
  libelle: string;
  description?: string;
  prixMensuel?: number | null;
  ordre?: number;
  actif?: boolean;
  modules: string[];
}

export interface ClubModuleEtat {
  code: string;
  libelle: string;
  description: string;
  socle: boolean;
  actif: boolean;
  source: 'SOCLE' | 'PACK' | 'MANUEL_ON' | 'MANUEL_OFF' | 'INACTIF';
}

export interface ClubAbonnement {
  clubId: string;
  packCode?: string | null;
  modules: ClubModuleEtat[];
}

/**
 * API d'administration commerciale (SUPER_ADMIN) : catalogue de modules, CRUD des packs et
 * affectation pack/modules par club. Miroir de {@code AbonnementAdminController} côté back.
 */
@Injectable({ providedIn: 'root' })
export class PackService {
  private http = inject(HttpClient);
  private readonly base = '/api/admin';

  modules(): Observable<ModuleCatalogue[]> {
    return this.http.get<ModuleCatalogue[]>(`${this.base}/modules`);
  }

  packs(): Observable<Pack[]> {
    return this.http.get<Pack[]>(`${this.base}/packs`);
  }

  creerPack(req: PackUpsert): Observable<Pack> {
    return this.http.post<Pack>(`${this.base}/packs`, req);
  }

  majPack(code: string, req: PackUpsert): Observable<Pack> {
    return this.http.put<Pack>(`${this.base}/packs/${code}`, req);
  }

  supprimerPack(code: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/packs/${code}`);
  }

  abonnement(clubId: string): Observable<ClubAbonnement> {
    return this.http.get<ClubAbonnement>(`${this.base}/clubs/${clubId}/abonnement`);
  }

  assignerPack(clubId: string, packCode: string): Observable<ClubAbonnement> {
    return this.http.put<ClubAbonnement>(`${this.base}/clubs/${clubId}/pack`, { packCode });
  }

  definirModule(clubId: string, moduleCode: string, actif: boolean): Observable<ClubAbonnement> {
    return this.http.put<ClubAbonnement>(`${this.base}/clubs/${clubId}/modules/${moduleCode}`, { actif });
  }
}
