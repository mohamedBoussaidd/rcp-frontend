import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '@core/services/auth.service';

/**
 * Vue d'ensemble du menu « Gestion du club » — page d'accueil EXCLUSIVE du président.
 * PLACEHOLDER : la maquette et les indicateurs réels (effectif, conformité, alertes, résultats)
 * seront définis ultérieurement. On pose ici la structure et des cartes « à venir » pour que
 * l'atterrissage du président soit propre dès maintenant.
 */
@Component({
  selector: 'app-dashboard-president',
  standalone: true,
  templateUrl: './dashboard-president.component.html',
  styleUrl: './dashboard-president.component.scss',
  imports: [RouterLink, MatIcon],
})
export class DashboardPresidentComponent {
  private auth = inject(AuthService);
  readonly prenom = this.auth.currentUser()?.prenom ?? '';

  /** Blocs prévus (placeholder) — donnent à voir la future maquette. */
  readonly aVenir = [
    { icon: 'groups',            titre: 'Effectif & staff',        desc: 'Joueurs, encadrants, répartition par équipe' },
    { icon: 'assignment_turned_in', titre: 'Conformité du club',   desc: 'Licences & documents manquants ou à renouveler' },
    { icon: 'warning',           titre: 'Alertes',                 desc: 'Blessures en cours, gênes non traitées' },
    { icon: 'insights',          titre: 'Activité & résultats',    desc: 'Séances de la semaine, prochains matchs' },
  ];
}
