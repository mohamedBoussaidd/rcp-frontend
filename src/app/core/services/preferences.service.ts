import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Clés de préférence connues (self-scope : chaque compte ne voit que les siennes). */
export const PREF_MODE_AVANCE_SEANCE = 'mode_avance_seance';
export const PREF_STYLE_RENDU_SCHEMA = 'style_rendu_schema';

/**
 * Préférences d'interface de l'utilisateur courant, persistées côté serveur
 * (table preference_utilisateur, V61). Chargées une fois par session, mises à
 * jour de façon optimiste (le signal bouge tout de suite, le PUT suit).
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {

  private http = inject(HttpClient);

  private readonly prefs = signal<Record<string, string>>({});
  private chargees = false;

  /** Charge (une fois) les préférences du compte. Sans effet si déjà chargées. */
  charger(): void {
    if (this.chargees) return;
    this.chargees = true;
    this.http.get<Record<string, string>>('/api/preferences').subscribe({
      next: p => this.prefs.set(p ?? {}),
      error: () => { this.chargees = false; },
    });
  }

  valeur(cle: string): string | undefined {
    return this.prefs()[cle];
  }

  /** Le mode avancé séances/exercices est-il activé pour cet entraîneur ? */
  modeAvanceSeance(): boolean {
    return this.prefs()[PREF_MODE_AVANCE_SEANCE] === 'true';
  }

  definir(cle: string, valeur: string): void {
    this.prefs.update(p => ({ ...p, [cle]: valeur }));
    this.http.put(`/api/preferences/${cle}`, { valeur }).subscribe({ error: () => {} });
  }

  basculerModeAvanceSeance(actif: boolean): void {
    this.definir(PREF_MODE_AVANCE_SEANCE, actif ? 'true' : 'false');
  }
}
