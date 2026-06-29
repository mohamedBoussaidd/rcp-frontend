import { Injectable, signal } from '@angular/core';

/**
 * Outil de TEST : « date du jour » simulée de l'application. Quand elle est définie,
 * un intercepteur HTTP envoie l'en-tête `X-Date-Simulee` ; le backend et le service
 * analytics calculent la période/contexte (préparation, trêve…) contre cette date.
 * Persistée en localStorage pour survivre aux rechargements.
 */
@Injectable({ providedIn: 'root' })
export class DateSimuleeService {

  private static readonly KEY = 'rcp_date_simulee';

  /** yyyy-MM-dd, ou null = date réelle. */
  readonly date = signal<string | null>(localStorage.getItem(DateSimuleeService.KEY));

  set(valeur: string | null): void {
    if (valeur) localStorage.setItem(DateSimuleeService.KEY, valeur);
    else localStorage.removeItem(DateSimuleeService.KEY);
    this.date.set(valeur || null);
  }

  get(): string | null {
    return this.date();
  }
}
