import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';
import { Seance, ContenuSeance } from '@core/services/seance.service';

/**
 * Mes séances à venir (lecture). Liste chronologique ; au tap, on déplie le
 * contenu (exercices) chargé à la demande via /api/moi/seances/:id/exercices.
 */
@Component({
  selector: 'app-joueur-seances',
  standalone: true,
  templateUrl: './joueur-seances.component.html',
  styleUrl: './joueur-seances.component.scss',
  imports: [DatePipe],
})
export class JoueurSeancesComponent {

  store = inject(JoueurStore);

  readonly ouvert = signal<string | null>(null);
  readonly contenus = signal<Record<string, ContenuSeance | null>>({});

  basculer(s: Seance): void {
    if (this.ouvert() === s.id) { this.ouvert.set(null); return; }
    this.ouvert.set(s.id);
    if (this.contenus()[s.id] === undefined) {
      this.contenus.update(m => ({ ...m, [s.id]: null }));
      this.store.contenuSeance(s.id).subscribe({
        next: c => this.contenus.update(m => ({ ...m, [s.id]: c })),
        error: () => this.contenus.update(m => ({ ...m, [s.id]: null })),
      });
    }
  }

  contenu(id: string): ContenuSeance | null { return this.contenus()[id] ?? null; }

  estMatch(s: Seance): boolean { return !!s.adversaire; }
  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : ''; }
}
