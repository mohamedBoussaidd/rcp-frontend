import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

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

  private readonly base = '/api/auth';
  private static readonly TOKEN_KEY = 'rcp_token';
  private static readonly USER_KEY  = 'rcp_user';

  /** Utilisateur courant (null si déconnecté). */
  readonly currentUser = signal<AuthUser | null>(this.loadUser());

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, motDePasse: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { email, motDePasse }).pipe(
      tap(res => this.store(res))
    );
  }

  logout(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
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

  /** Page d'accueil selon le rôle (après login / accès racine). */
  homeRoute(): string {
    switch (this.currentUser()?.role) {
      case 'SUPER_ADMIN': return '/admin/clubs';
      case 'PRESIDENT':   return '/mon-club';
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
