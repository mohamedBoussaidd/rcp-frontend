import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';
import { AuthService } from '@core/services/auth.service';
import { InstallPwaComponent } from '@shared/components/install-pwa/install-pwa.component';
import { NotificationBellComponent } from '@shared/components/notification-bell/notification-bell.component';

/**
 * Écran d'accueil joueur (PWA) — refonte « Claude Design ».
 * En-tête salutation + avatar, héros « Aujourd'hui » (2 gestes du jour : ressenti
 * + sRPE), déclaration de gêne, prochaine séance, raccourcis suivi et bloc
 * « Mon corps & santé ».
 */
@Component({
  selector: 'app-joueur-home',
  standalone: true,
  templateUrl: './joueur-home.component.html',
  styleUrl: './joueur-home.component.scss',
  imports: [RouterLink, DatePipe, InstallPwaComponent, NotificationBellComponent],
})
export class JoueurHomeComponent {

  store = inject(JoueurStore);
  private auth = inject(AuthService);

  readonly today = new Date();

  readonly prenom = computed(() => this.store.profil()?.prenom ?? '');

  /** Initiales pour l'avatar (prénom + nom). */
  readonly initiales = computed(() => {
    const p = this.store.profil();
    const a = (p?.prenom ?? '').trim()[0] ?? '';
    const b = (p?.nom ?? '').trim()[0] ?? '';
    return (a + b).toUpperCase() || '⚽';
  });

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
  readonly nbDocuments = computed(() => this.store.documents().length);

  /** Module « Suivi individuel » actif pour le club → raccourcis axes/entretiens visibles. */
  readonly peutSuivi = computed(() => this.auth.hasModule('suivi_individuel'));

  /** Module « Licences & documents » actif pour le club → raccourci visible. */
  readonly peutDocumentsAdmin = computed(() => this.auth.hasModule('documents_admin'));

  /** Une séance de la prochaine est-elle un match ? */
  estMatch(): boolean {
    const s = this.store.prochaineSeance();
    return !!(s && (s.adversaire || s.typeSeance?.code === 'MATCH'));
  }

  /** Poids le plus récent, formaté « 74,8 kg » (virgule française). */
  readonly poidsAffiche = computed(() => {
    const p = this.store.dernierPoids();
    return p == null ? '—' : `${p.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
  });
}
