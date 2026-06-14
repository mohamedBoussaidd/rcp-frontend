import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';
import { Blessure } from '@core/services/blessure.service';

/**
 * Mes blessures (lecture) : cartes triées (en cours d'abord), avec le parcours
 * de reprise (RTP) dépliable et sa progression. Le suivi reste piloté par le
 * staff médical ; ici le joueur ne fait que consulter.
 */
@Component({
  selector: 'app-joueur-blessures',
  standalone: true,
  templateUrl: './joueur-blessures.component.html',
  styleUrl: './joueur-blessures.component.scss',
  imports: [DatePipe],
})
export class JoueurBlessuresComponent {

  store = inject(JoueurStore);

  readonly ouvert = signal<string | null>(null);

  readonly STATUTS: Record<string, string> = {
    INDISPONIBLE: 'Indisponible', EN_REPRISE: 'En reprise', RETABLI: 'Rétabli',
  };
  readonly ETAPES: Record<string, string> = {
    A_FAIRE: 'À faire', EN_COURS: 'En cours', VALIDEE: 'Validée',
  };

  basculer(b: Blessure): void {
    if (this.ouvert() === b.id) { this.ouvert.set(null); return; }
    this.ouvert.set(b.id);
    this.store.chargerRtp(b.id);
  }

  statutLabel(v?: string): string { return v ? (this.STATUTS[v] ?? v) : '—'; }
  statutClasse(v?: string): string { return v === 'RETABLI' ? 'ok' : v === 'EN_REPRISE' ? 'moyen' : 'bad'; }
  etapeClasse(s: string): string { return s === 'VALIDEE' ? 'ok' : s === 'EN_COURS' ? 'moyen' : ''; }

  joursAvantRetour(d?: string): number | null {
    if (!d) return null;
    const cible = new Date(d + 'T00:00:00'); const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return Math.round((cible.getTime() - auj.getTime()) / 86400000);
  }
  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }
}
