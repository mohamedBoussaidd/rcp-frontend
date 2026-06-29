import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JoueurStore } from '../joueur.store';
import { Seance, ContenuSeance, ExerciceLigneSeance, StatutPresence } from '@core/services/seance.service';
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
  imports: [DatePipe, FormsModule, SchemaViewerComponent],
})
export class JoueurSeancesComponent {

  store = inject(JoueurStore);

  readonly ouvert = signal<string | null>(null);
  readonly contenus = signal<Record<string, ContenuSeance | null>>({});

  /** Séance dont la présence est en cours d'envoi (spinner / désactivation des boutons). */
  readonly enregistrement = signal<string | null>(null);

  /** Brouillon de commentaire d'absence, par séance. */
  commentaires: Record<string, string> = {};

  /** Exercice dont on visionne l'animation (null = fermé). */
  readonly apercu = signal<ExerciceLigneSeance | null>(null);

  /** Largeur du terrain dans la fenêtre d'animation (s'adapte à l'écran). */
  readonly largeurViewer = computed(() =>
    Math.min(typeof window !== 'undefined' ? window.innerWidth - 56 : 420, 460));

  basculer(s: Seance): void {
    if (this.ouvert() === s.id) { this.ouvert.set(null); return; }
    this.ouvert.set(s.id);
    if (this.commentaires[s.id] === undefined) {
      this.commentaires[s.id] = this.store.declarations().find(d => d.seanceId === s.id)?.note ?? '';
    }
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

  /** Statut déjà déclaré par le joueur (null = rien → présent par défaut). */
  monStatut(s: Seance): StatutPresence | null { return this.store.maDeclaration(s.id); }

  /** Je me déclare présent / absent (+ commentaire) pour cette séance. */
  declarer(s: Seance, statut: StatutPresence): void {
    this.enregistrement.set(s.id);
    const note = statut === 'ABSENT' ? (this.commentaires[s.id]?.trim() || undefined) : undefined;
    this.store.declarerPresence(s.id, statut, note).subscribe({
      next: () => this.enregistrement.set(null),
      error: () => this.enregistrement.set(null),
    });
  }
}
