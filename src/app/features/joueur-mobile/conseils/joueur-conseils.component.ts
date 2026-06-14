import { Component, computed, inject } from '@angular/core';
import { JoueurStore } from '../joueur.store';

const EMOJIS: Record<string, string> = {
  HYDRATATION: '💧', SOMMEIL: '😴', MOBILITE: '🤸', NUTRITION: '🍽️',
  RECUP: '🧖', ALERTE: '⚠️', GENERAL: '💡',
};

/** Conseils du staff au joueur (lecture) : conseils d'équipe + conseils perso. */
@Component({
  selector: 'app-joueur-conseils',
  standalone: true,
  templateUrl: './joueur-conseils.component.html',
  styleUrl: './joueur-conseils.component.scss',
})
export class JoueurConseilsComponent {

  store = inject(JoueurStore);

  readonly perso = computed(() => this.store.conseils().filter(c => !c.equipe));
  readonly equipe = computed(() => this.store.conseils().filter(c => c.equipe));

  emoji(key?: string | null): string { return EMOJIS[key ?? 'GENERAL'] ?? '💡'; }
}
