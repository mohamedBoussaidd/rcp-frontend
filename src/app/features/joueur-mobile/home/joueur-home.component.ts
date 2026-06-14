import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';
import { AuthService } from '@core/services/auth.service';

/**
 * Écran d'accueil joueur (PWA) : carte « Aujourd'hui » centrée sur les 2 gestes
 * du jour (wellness, sRPE) + déclaration de gêne, puis raccourcis (historique,
 * conseils).
 */
@Component({
  selector: 'app-joueur-home',
  standalone: true,
  templateUrl: './joueur-home.component.html',
  styleUrl: './joueur-home.component.scss',
  imports: [RouterLink, DatePipe],
})
export class JoueurHomeComponent {

  store = inject(JoueurStore);
  private auth = inject(AuthService);

  readonly prenom = computed(() => this.store.profil()?.prenom ?? '');

  deconnexion(): void {
    if (confirm('Se déconnecter ?')) this.auth.logout();
  }

  /** Salutation selon l'heure. */
  readonly salutation = computed(() => {
    const h = new Date().getHours();
    if (h < 6) return 'Bonne nuit';
    if (h < 18) return 'Bonjour';
    return 'Bonsoir';
  });

  readonly nbConseils = computed(() => this.store.conseils().length);
}
