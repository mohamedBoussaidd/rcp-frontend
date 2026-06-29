import { Injectable, inject, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ContexteService } from './contexte.service';

export type Role =
  | 'SUPER_ADMIN' | 'PRESIDENT' | 'ENTRAINEUR'
  | 'PREPARATEUR' | 'MEDICAL' | 'ADMINISTRATIF' | 'JOUEUR';

export interface AuthUser {
  id: string;
  email: string;
  nom?: string;
  prenom?: string;
  role: Role;
  specialite?: string;
  clubId?: string;
  equipeId?: string;
  joueurId?: string;
}

interface LoginResponse extends AuthUser {
  token: string;
  type: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private http = inject(HttpClient);
  private router = inject(Router);
  private contexte = inject(ContexteService);

  private readonly base = '/api/auth';
  private static readonly TOKEN_KEY = 'rcp_token';
  private static readonly USER_KEY  = 'rcp_user';

  /** Utilisateur courant (null si déconnecté). */
  readonly currentUser = signal<AuthUser | null>(this.loadUser());

  /**
   * Permissions effectives (codes `module:action`) résolues par le backend pour le CONTEXTE
   * actif. Source de vérité de l'affichage : les helpers `can*()` et `has()` en dérivent.
   * Le backend reste seul juge des accès — ceci ne fait que piloter le masquage de l'UI.
   */
  readonly permissions = signal<string[]>([]);

  constructor() {
    // (Re)charge les permissions au boot et à chaque changement de contexte (club/équipe),
    // car elles sont scopées par équipe. L'effect est asynchrone → pas de cycle DI avec
    // l'interceptor de contexte qui injecte AuthService.
    effect(() => {
      this.contexte.clubActif();
      this.contexte.equipesActives();
      if (this.isAuthenticated()) this.loadPermissions();
    });
    // Rafraîchit le profil (dont le rôle « principal ») au démarrage : un admin a pu changer le
    // rôle pendant que l'utilisateur était déconnecté. Différé (microtask) pour éviter le cycle DI.
    queueMicrotask(() => { if (this.isAuthenticated()) this.refreshUser(); });
  }

  login(email: string, motDePasse: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { email, motDePasse }).pipe(
      tap(res => { this.store(res); this.loadPermissions(); })
    );
  }

  logout(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    this.currentUser.set(null);
    this.permissions.set([]);
    // Purge le contexte de navigation (club/équipes) : sinon le contexte d'un compte précédent
    // (ex. super-admin entré dans un club démo) « fuite » sur la session suivante.
    this.contexte.reinitialiser();
    this.router.navigate(['/login']);
  }

  /** Recharge les permissions de l'utilisateur courant pour le contexte actif. */
  loadPermissions(): void {
    this.http.get<string[]>('/api/me/permissions').subscribe({
      next: perms => this.permissions.set(perms),
      error: () => this.permissions.set([]),
    });
  }

  /** Rafraîchit le profil stocké (rôle « principal », équipe…) depuis le serveur. */
  refreshUser(): void {
    this.http.get<LoginResponse>('/api/auth/me').subscribe({
      next: res => {
        const { token, type, ...user } = res;
        localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      },
      error: () => {},
    });
  }

  getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  hasRole(...roles: Role[]): boolean {
    const u = this.currentUser();
    return !!u && roles.includes(u.role);
  }

  /** Possède-t-il la permission (code `module:action`) dans le contexte actif ? */
  has(code: string): boolean {
    return this.permissions().includes(code);
  }

  /** Droits par module — miroir EXACT des règles backend (hasAuthority). */
  canEcrireJoueurs(): boolean   { return this.has('joueurs:write'); }
  canEcrireSeances(): boolean   { return this.has('seances:write'); }
  canEcrirePesees(): boolean    { return this.has('pesees:write'); }
  canEcrireBlessures(): boolean { return this.has('blessures:write'); }
  canImporterGps(): boolean     { return this.has('gps:import'); }
  canTraiterGene(): boolean     { return this.has('wellness:treat'); }
  canRouvrirGene(): boolean     { return this.has('wellness:reopen'); }
  canEditerConseils(): boolean  { return this.has('conseils:write'); }
  canGererClub(): boolean       { return this.has('club:manage'); }
  /** Gestion des comptes (staff & joueurs) de son périmètre : président, entraîneur en chef, entraîneur. */
  canGererMembres(): boolean    { return this.has('membres:manage') || this.has('club:manage'); }

  /**
   * Variante « préparateur » du dashboard (vue readiness/charge) : pilotée par capability,
   * plus par le rôle. Exclut le président (qui garde la vue d'ensemble équipe via club:manage).
   * Étape future : remplacer par un sélecteur de « casquette » pour les profils multi-rôles.
   */
  estPreparateurVue(): boolean {
    return this.has('gps:import') && !this.has('club:manage');
  }

  /** Page d'accueil selon le rôle (après login / accès racine). */
  homeRoute(): string {
    switch (this.currentUser()?.role) {
      case 'SUPER_ADMIN': return '/admin/clubs';
      case 'PRESIDENT':   return '/mon-club';
      case 'JOUEUR':      return '/joueur';
      default:            return '/dashboard';
    }
  }

  private store(res: LoginResponse): void {
    localStorage.setItem(AuthService.TOKEN_KEY, res.token);
    const { token, type, ...user } = res;
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): AuthUser | null {
    const raw = localStorage.getItem(AuthService.USER_KEY);
    return raw ? JSON.parse(raw) as AuthUser : null;
  }
}
