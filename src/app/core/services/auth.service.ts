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

  /**
   * Modules ACTIFS du club pour le contexte actif (couche packs / abonnement). Pilote le masquage
   * des écrans et entrées de menu des modules non souscrits — la sécurité reste côté backend (403).
   * SUPER_ADMIN reçoit tous les modules.
   */
  readonly modules = signal<string[]>([]);

  constructor() {
    // (Re)charge permissions ET modules actifs au boot et à chaque changement de contexte
    // (club/équipe), car ils sont scopés par club/équipe. L'effect est asynchrone → pas de cycle DI
    // avec l'interceptor de contexte qui injecte AuthService.
    effect(() => {
      this.contexte.clubActif();
      this.contexte.equipesActives();
      if (this.isAuthenticated()) { this.loadPermissions(); this.loadModules(); }
    });
    // Rafraîchit le profil (dont le rôle « principal ») au démarrage : un admin a pu changer le
    // rôle pendant que l'utilisateur était déconnecté. Différé (microtask) pour éviter le cycle DI.
    queueMicrotask(() => { if (this.isAuthenticated()) this.refreshUser(); });
  }

  login(email: string, motDePasse: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { email, motDePasse }).pipe(
      tap(res => { this.store(res); this.loadPermissions(); this.loadModules(); })
    );
  }

  logout(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    this.currentUser.set(null);
    this.permissions.set([]);
    this.modules.set([]);
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

  /** Recharge les modules actifs du club (pour le contexte actif). */
  loadModules(): void {
    this.http.get<string[]>('/api/me/modules').subscribe({
      next: mods => this.modules.set(mods),
      error: () => this.modules.set([]),
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

  /**
   * Le club a-t-il le MODULE fonctionnel activé (couche pack/abonnement) ? Ex. {@code gps},
   * {@code medical}, {@code presence}. Tant que la liste n'est pas chargée, on renvoie true
   * (fail-open) pour ne pas masquer l'UI à tort au boot : le backend reste seul juge (403).
   */
  hasModule(code: string): boolean {
    const mods = this.modules();
    return mods.length === 0 || mods.includes(code);
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

  /**
   * Page d'accueil selon le rôle (après login / accès racine). Chaque zone de menu a sa propre
   * « Vue d'ensemble » : on renvoie chacun vers la sienne (le dashboard suit le menu, pas le rôle).
   * Un utilisateur multi-rôle atterrit sur la vue de son rôle « principal » (utilisateur.role),
   * puis navigue librement entre les menus qu'il détient.
   */
  homeRoute(): string {
    switch (this.currentUser()?.role) {
      case 'SUPER_ADMIN':   return '/admin/clubs';
      case 'PRESIDENT':     return '/tableau-president';   // Gestion du club › Mon tableau de bord
      case 'ADMINISTRATIF': return '/administration';      // Administration › Vue d'ensemble
      case 'PREPARATEUR':   return '/performance';         // Performance › Vue d'ensemble
      case 'MEDICAL':       return '/medical';             // Médical
      case 'JOUEUR':        return '/joueur';
      case 'ENTRAINEUR':    return '/coaching';            // Coaching › Vue d'ensemble
      default:               return '/coaching';
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
