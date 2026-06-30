import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PermissionCat { code: string; module: string; libelle: string; }

export interface RoleDef {
  id: string;
  code: string;
  libelle: string;
  systeme: boolean;
  /** Rôle sans club (prédéfini système OU global custom) — non éditable par un président. */
  global: boolean;
  permissions: string[];
  nbAffectations: number;
}

export interface RoleUpsert { libelle: string; permissions: string[]; }

export interface Affectation {
  id: string;
  roleId: string;
  roleLibelle: string;
  systeme: boolean;
  equipeId?: string;
  equipeNom?: string;
}

export interface AffectationItem { roleId: string; equipeId?: string; }

/** Administration des rôles & accès du club actif (réservé à club:manage). */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private http = inject(HttpClient);
  private readonly base = '/api/roles';

  catalogue(): Observable<PermissionCat[]> {
    return this.http.get<PermissionCat[]>(`${this.base}/catalogue`);
  }

  lister(): Observable<RoleDef[]> {
    return this.http.get<RoleDef[]>(this.base);
  }

  creer(req: RoleUpsert): Observable<RoleDef> {
    return this.http.post<RoleDef>(this.base, req);
  }

  modifier(id: string, req: RoleUpsert): Observable<RoleDef> {
    return this.http.put<RoleDef>(`${this.base}/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  affectations(membreId: string): Observable<Affectation[]> {
    return this.http.get<Affectation[]>(`${this.base}/membres/${membreId}`);
  }

  definirRoles(membreId: string, roles: AffectationItem[]): Observable<Affectation[]> {
    return this.http.put<Affectation[]>(`${this.base}/membres/${membreId}`, { roles });
  }

  // ── Rôles GLOBAUX (super-admin) : prédéfinis + globaux custom, hors de tout club ──
  private readonly baseGlobal = '/api/admin/roles-globaux';

  catalogueGlobal(): Observable<PermissionCat[]> {
    return this.http.get<PermissionCat[]>(`${this.baseGlobal}/catalogue`);
  }

  listerGlobaux(): Observable<RoleDef[]> {
    return this.http.get<RoleDef[]>(this.baseGlobal);
  }

  creerGlobal(req: RoleUpsert): Observable<RoleDef> {
    return this.http.post<RoleDef>(this.baseGlobal, req);
  }

  modifierGlobal(id: string, req: RoleUpsert): Observable<RoleDef> {
    return this.http.put<RoleDef>(`${this.baseGlobal}/${id}`, req);
  }

  supprimerGlobal(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseGlobal}/${id}`);
  }
}
