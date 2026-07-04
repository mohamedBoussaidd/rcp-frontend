import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { ContexteService } from './contexte.service';

/** Thème visuel d'un club : couleur d'accent (null = vert par défaut) + nav teintée. */
export interface ThemeClub {
  couleurAccent: string | null;
  navTeintee: boolean;
}

const THEME_DEFAUT: ThemeClub = { couleurAccent: null, navTeintee: false };
const CLE_CACHE = 'rcp_theme_club';
const VERT_DEFAUT = '#15803D';

/** Nuances de la gamme d'accent surchargées au runtime (mêmes clés que styles.scss). */
const NUANCES = [50, 100, 200, 400, 500, 600, 700, 800, 900] as const;

/**
 * Couleur d'accent courante pour les GRAPHIQUES (ApexCharts…), lue depuis les variables CSS :
 * suit automatiquement le thème du club. À utiliser à la place d'un hex vert en dur.
 */
export function couleurTheme(nuance: (typeof NUANCES)[number] = 600): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--green-${nuance}`).trim();
  return v || VERT_DEFAUT;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _isDark = signal<boolean>(true);
  readonly isDark = this._isDark.asReadonly();

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);

  /** Thème ENREGISTRÉ du club courant (l'aperçu ne modifie pas ce signal). */
  readonly themeClub = signal<ThemeClub>(THEME_DEFAUT);

  constructor() {
    // Recharge le thème au boot, au login/logout et quand le super-admin change de club (contexte).
    effect(() => {
      const user = this.auth.currentUser();
      this.contexte.clubActif();
      if (user) this.chargerThemeClub();
      else this.definirLocal(THEME_DEFAUT);
    });
  }

  init(): void {
    const saved = localStorage.getItem('rcp-theme') ?? 'dark';
    this.apply(saved === 'dark');
    // Applique tout de suite le thème club en cache (évite le flash vert avant la réponse serveur).
    try {
      const cache = localStorage.getItem(CLE_CACHE);
      if (cache) this.definirLocal(JSON.parse(cache) as ThemeClub);
    } catch { /* cache corrompu : thème par défaut */ }
  }

  toggle(): void {
    this.apply(!this._isDark());
  }

  private apply(dark: boolean): void {
    this._isDark.set(dark);
    localStorage.setItem('rcp-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  // ── Thème club (couleur d'accent par club) ──

  /** Récupère le thème du club courant et l'applique. */
  chargerThemeClub(): void {
    this.http.get<ThemeClub>('/api/club/theme').subscribe({
      next: t => this.definirLocal(t),
      error: () => { /* hors ligne / login : on garde le thème courant */ },
    });
  }

  /** Enregistre le thème du club (président / super-admin) puis l'applique. */
  enregistrerThemeClub(t: ThemeClub): Observable<ThemeClub> {
    return this.http.put<ThemeClub>('/api/club/theme', t).pipe(
      tap(res => this.definirLocal(res)),
    );
  }

  /** Applique un thème à l'écran SANS l'enregistrer (aperçu en direct). */
  previsualiser(t: ThemeClub): void {
    this.appliquerThemeClub(t);
  }

  /** Abandonne l'aperçu : ré-applique le thème enregistré. */
  annulerApercu(): void {
    this.appliquerThemeClub(this.themeClub());
  }

  private definirLocal(t: ThemeClub): void {
    this.themeClub.set(t);
    localStorage.setItem(CLE_CACHE, JSON.stringify(t));
    this.appliquerThemeClub(t);
  }

  /** Surcharge (ou restaure) les variables CSS de la gamme d'accent sur <html>. */
  private appliquerThemeClub(t: ThemeClub): void {
    const style = document.documentElement.style;
    const alias: Record<string, number> = {
      '--copper': 600, '--copper-light': 500, '--copper-soft': 50, '--copper-border': 200,
    };
    if (!t.couleurAccent) {
      NUANCES.forEach(n => style.removeProperty(`--green-${n}`));
      Object.keys(alias).forEach(p => style.removeProperty(p));
      this.majMetaThemeColor(VERT_DEFAUT);
    } else {
      const gamme = ThemeService.gammeDepuis(t.couleurAccent);
      NUANCES.forEach(n => style.setProperty(`--green-${n}`, gamme[n]));
      Object.entries(alias).forEach(([p, n]) => style.setProperty(p, gamme[n]));
      this.majMetaThemeColor(gamme[600]);
    }
    document.documentElement.classList.toggle('theme-nav-teintee', t.navTeintee);
  }

  /** Couleur de la barre système mobile (PWA). */
  private majMetaThemeColor(couleur: string): void {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', couleur);
  }

  // ── Génération de la gamme de nuances depuis la couleur choisie ──

  /** La couleur choisie devient la nuance 600 (boutons) ; le reste est dérivé par mélange blanc/noir. */
  static gammeDepuis(accent: string): Record<number, string> {
    const base = ThemeService.assurerContraste(accent);
    return {
      600: base,
      500: ThemeService.mix(base, '#FFFFFF', 0.10),
      400: ThemeService.mix(base, '#FFFFFF', 0.35),
      200: ThemeService.mix(base, '#FFFFFF', 0.72),
      100: ThemeService.mix(base, '#FFFFFF', 0.84),
      50:  ThemeService.mix(base, '#FFFFFF', 0.93),
      700: ThemeService.mix(base, '#000000', 0.15),
      800: ThemeService.mix(base, '#000000', 0.30),
      900: ThemeService.mix(base, '#000000', 0.45),
    };
  }

  /** Garde-fou : assombrit la couleur jusqu'à ce que du texte blanc reste lisible dessus (boutons). */
  static assurerContraste(hex: string): string {
    let c = hex;
    for (let i = 0; i < 12 && ThemeService.contrasteAvecBlanc(c) < 3.0; i++) {
      c = ThemeService.mix(c, '#000000', 0.08);
    }
    return c;
  }

  private static contrasteAvecBlanc(hex: string): number {
    const [r, g, b] = ThemeService.versRgb(hex).map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (lum + 0.05);
  }

  private static mix(a: string, b: string, t: number): string {
    const ca = ThemeService.versRgb(a);
    const cb = ThemeService.versRgb(b);
    const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  private static versRgb(hex: string): number[] {
    const h = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16));
  }
}
