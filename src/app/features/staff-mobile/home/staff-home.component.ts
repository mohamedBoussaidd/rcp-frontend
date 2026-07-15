import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { NotificationPushService } from '@core/services/notification-push.service';
import { NotificationService } from '@core/services/notification.service';
import { Seance, SeanceService } from '@core/services/seance.service';
import { NotificationBellComponent } from '@shared/components/notification-bell/notification-bell.component';

/**
 * Accueil de l'espace staff mobile : salutation + cloche, sélecteur d'équipe
 * (staff multi-équipes), bannière d'activation du push, séances du jour et
 * tuiles vers les sections. Aucune logique métier nouvelle : tout est branché
 * sur les services existants.
 */
@Component({
  selector: 'app-staff-home',
  standalone: true,
  templateUrl: './staff-home.component.html',
  styleUrl: './staff-home.component.scss',
  imports: [DatePipe, FormsModule, RouterLink, NotificationBellComponent],
})
export class StaffHomeComponent implements OnInit {

  auth = inject(AuthService);
  contexte = inject(ContexteService);
  push = inject(NotificationPushService);
  notifications = inject(NotificationService);
  private seanceService = inject(SeanceService);
  private router = inject(Router);

  readonly today = new Date();
  readonly seancesJour = signal<Seance[]>([]);

  readonly prenom = computed(() => this.auth.currentUser()?.prenom ?? '');
  readonly equipeChoisie = computed(() => this.contexte.equipesActives()[0] ?? '');

  ngOnInit(): void {
    this.chargerJour();
  }

  salutation(): string {
    const h = this.today.getHours();
    return h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  }

  initiales(): string {
    const u = this.auth.currentUser();
    return ((u?.prenom?.[0] ?? '') + (u?.nom?.[0] ?? '')).toUpperCase() || '?';
  }

  changerEquipe(id: string): void {
    this.contexte.choisirEquipe(id || null);
    this.chargerJour();
  }

  estMatch(s: Seance): boolean {
    return !!s.adversaire || s.typeSeance?.code?.toLowerCase() === 'match';
  }

  private chargerJour(): void {
    const jour = this.today.toISOString().slice(0, 10);
    this.seanceService.getSemaine(jour, jour).subscribe({
      next: s => this.seancesJour.set(s.filter(x => x.statut !== 'ANNULEE')),
      error: () => this.seancesJour.set([]),
    });
  }

  deconnexion(): void { this.auth.logout(); }

  /** Bascule vers l'interface web complète : accueil desktop du rôle. */
  versionComplete(): void { this.router.navigateByUrl(this.auth.homeRoute()); }
}
