import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { JoueurStore, SeanceANoter } from '../joueur.store';

/**
 * Notation de l'effort ressenti (sRPE) des séances passées non encore notées.
 * RPE 1..10 + durée → charge = RPE × durée. Une séance notée disparaît de la liste.
 */
@Component({
  selector: 'app-joueur-rpe',
  standalone: true,
  templateUrl: './joueur-rpe.component.html',
  styleUrl: './joueur-rpe.component.scss',
  imports: [DatePipe],
})
export class JoueurRpeComponent {

  store = inject(JoueurStore);

  readonly NOTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  readonly seanceSel = signal<SeanceANoter | null>(null);
  readonly intensite = signal(0);
  readonly duree = signal<number | null>(null);
  readonly envoi = signal(false);
  readonly toast = signal(false);

  readonly charge = computed(() => {
    const i = this.intensite();
    const d = this.duree();
    return i > 0 && d ? i * d : null;
  });

  readonly peutEnvoyer = computed(() => !!this.seanceSel() && this.intensite() > 0 && !this.envoi());

  choisirSeance(s: SeanceANoter): void {
    this.seanceSel.set(s);
    this.intensite.set(0);
    this.duree.set(s.duree ?? null);
  }

  fermer(): void { this.seanceSel.set(null); }

  setIntensite(v: number): void { this.intensite.set(v); }
  setDuree(v: string): void { const n = parseInt(v, 10); this.duree.set(isNaN(n) ? null : n); }

  /** Couleur d'une note d'effort (vert → rouge). */
  couleur(v: number): string {
    if (v <= 3) return '#15803D';
    if (v <= 5) return '#65A30D';
    if (v <= 7) return '#CA8A04';
    if (v <= 8) return '#EA580C';
    return '#B91C1C';
  }

  valider(): void {
    const s = this.seanceSel();
    if (!s || !this.peutEnvoyer()) return;
    this.envoi.set(true);
    this.store.saisirRpe(s.id, this.intensite(), this.duree() ?? undefined).subscribe({
      next: () => {
        this.envoi.set(false);
        this.seanceSel.set(null);
        this.toast.set(true);
        setTimeout(() => this.toast.set(false), 1600);
      },
      error: () => this.envoi.set(false),
    });
  }
}
