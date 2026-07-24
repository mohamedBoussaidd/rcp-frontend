import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { BADGE_FALLBACK, BadgeDef, BadgeRegistry, BadgeTon, BadgeTonDef, ClubTonCouleur } from '../../shared/components/badge/badge.model';
import { AuthService } from './auth.service';
import { ContexteService } from './contexte.service';

const CLE_CACHE_TONS = 'rcp_badge_tons';
const TOUS_TONS: BadgeTon[] = ['NEUTRAL', 'INFO', 'SUCCESS', 'WARNING', 'DANGER', 'BRAND'];

/**
 * Registre des badges hydraté depuis `/api/badges/registry` (badges actifs + tons personnalisés,
 * couleurs déjà résolues pour le club courant). Rechargé au login et au changement de club/contexte
 * (comme {@link ThemeService}). Injecte les tons personnalisés en variables CSS sur `<html>` — les
 * tons NON renvoyés gardent le défaut theme-aware de `:root`. En attendant l'API, `resolve()`
 * retombe sur le repli statique {@link BADGE_FALLBACK}.
 */
@Injectable({ providedIn: 'root' })
export class BadgeRegistryService {

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);

  private readonly _badges = signal<Map<string, BadgeDef>>(new Map());

  constructor() {
    // Applique tout de suite les tons en cache (évite un flash de couleur par défaut).
    try {
      const cache = localStorage.getItem(CLE_CACHE_TONS);
      if (cache) this.appliquerTons(JSON.parse(cache) as BadgeTonDef[]);
    } catch { /* cache corrompu : défauts :root */ }

    // Recharge au boot, au login/logout et quand le super-admin change de club (contexte).
    effect(() => {
      const user = this.auth.currentUser();
      this.contexte.clubActif();
      if (user) this.load();
    });
  }

  /** (Re)charge la registry. Silencieux en cas d'échec : le repli statique prend le relais. */
  load(): void {
    this.http.get<BadgeRegistry>('/api/badges/registry').subscribe({
      next: reg => {
        this._badges.set(new Map((reg.badges ?? []).map(b => [b.cle, b])));
        const tons = reg.tons ?? [];
        localStorage.setItem(CLE_CACHE_TONS, JSON.stringify(tons));
        this.appliquerTons(tons);
      },
      error: () => { /* repli statique */ },
    });
  }

  /**
   * Définition d'un badge par sa clé : registry serveur d'abord, sinon repli statique.
   * Lit le signal → un composant qui l'appelle dans un `computed` se met à jour au chargement.
   */
  resolve(cle: string | null | undefined): BadgeDef | undefined {
    if (!cle) return undefined;
    return this._badges().get(cle) ?? BADGE_FALLBACK[cle];
  }

  // ── Surcharge de couleur par club (6 tons) ──

  couleursClub(): Observable<ClubTonCouleur[]> {
    return this.http.get<ClubTonCouleur[]>('/api/badges/couleurs-club');
  }

  /** Enregistre les surcharges de couleur du club puis recharge la registry (réinjection). */
  majCouleursClub(valeurs: ClubTonCouleur[]): Observable<ClubTonCouleur[]> {
    return this.http.put<ClubTonCouleur[]>('/api/badges/couleurs-club', valeurs).pipe(
      tap(() => this.load()),
    );
  }

  // ── Injection des variables CSS ──

  /** Pose `--badge-<ton>-bg/fg` pour les tons personnalisés ; réinitialise les autres (→ défaut :root). */
  private appliquerTons(tons: BadgeTonDef[]): void {
    const style = document.documentElement.style;
    TOUS_TONS.forEach(t => {
      const k = t.toLowerCase();
      style.removeProperty(`--badge-${k}-bg`);
      style.removeProperty(`--badge-${k}-fg`);
    });
    (tons ?? []).forEach(t => {
      const k = String(t.ton).toLowerCase();
      if (t.couleurBg) style.setProperty(`--badge-${k}-bg`, t.couleurBg);
      if (t.couleurFg) style.setProperty(`--badge-${k}-fg`, t.couleurFg);
    });
  }
}
