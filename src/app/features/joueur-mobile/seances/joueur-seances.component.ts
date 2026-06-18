import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';
import { Seance, ContenuSeance, ExerciceLigneSeance } from '@core/services/seance.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';

/**
 * Mes séances à venir (lecture). Liste chronologique ; au tap, on déplie le
 * contenu (exercices) chargé à la demande via /api/moi/seances/:id/exercices.
 * Un exercice porteur d'un schéma tactique (animation) affiche un bouton lecture
 * qui ouvre l'animation dans une fenêtre.
 */
@Component({
  selector: 'app-joueur-seances',
  standalone: true,
  templateUrl: './joueur-seances.component.html',
  styleUrl: './joueur-seances.component.scss',
  imports: [DatePipe, SchemaViewerComponent],
})
export class JoueurSeancesComponent {

  store = inject(JoueurStore);

  readonly ouvert = signal<string | null>(null);
  readonly contenus = signal<Record<string, ContenuSeance | null>>({});

  /** Exercice dont on visionne l'animation (null = fermé). */
  readonly apercu = signal<ExerciceLigneSeance | null>(null);

  /** Largeur du terrain dans la fenêtre d'animation (s'adapte à l'écran). */
  readonly largeurViewer = computed(() =>
    Math.min(typeof window !== 'undefined' ? window.innerWidth - 56 : 420, 460));

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

  ouvrirAnimation(e: ExerciceLigneSeance): void { this.apercu.set(e); }
  fermerAnimation(): void { this.apercu.set(null); }

  estMatch(s: Seance): boolean { return !!s.adversaire; }
  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : ''; }
}
