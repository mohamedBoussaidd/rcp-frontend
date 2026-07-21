import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Clés de préférence connues (self-scope : chaque compte ne voit que les siennes). */
// `mode_avance_seance` a disparu : les rubriques avancées dépendent désormais du seul module
// `seance_avancee`, sans interrupteur à armer. Les lignes déjà en base restent inertes — elles
// ne valent pas une migration de suppression.
export const PREF_STYLE_RENDU_SCHEMA = 'style_rendu_schema';
/** Angle de la caméra du rendu incliné, sérialisé « inclinaison:rotation » (degrés). */
export const PREF_ANGLE_SCHEMA = 'angle_camera_schema';

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

  definir(cle: string, valeur: string): void {
    this.prefs.update(p => ({ ...p, [cle]: valeur }));
    this.http.put(`/api/preferences/${cle}`, { valeur }).subscribe({ error: () => {} });
  }
}
