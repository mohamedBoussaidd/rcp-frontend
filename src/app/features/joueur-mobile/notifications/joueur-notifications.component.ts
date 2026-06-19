import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationConfigService, Preference } from '@core/services/notification-config.service';
import { NotificationPushService } from '@core/services/notification-push.service';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';

const LIBELLES: Record<string, string> = {
  RAPPEL_WELLNESS: 'Rappel wellness', RAPPEL_RPE: 'Rappel RPE', RAPPEL_POIDS: 'Rappel pesée',
  RAPPEL_SEANCE: 'Rappel séance', SEANCE_MODIFIEE: 'Séance modifiée', DOC_MEDICAL: 'Document médical',
  GENE_SUIVI: 'Suivi de gêne', MESSAGE_STAFF: 'Message du staff',
};

const AIDES: Record<string, string> = {
  RAPPEL_WELLNESS: 'Une notification le matin si tu n\'as pas encore renseigné ton ressenti du jour.',
  RAPPEL_RPE: 'Un rappel après la séance pour saisir ton effort ressenti (RPE).',
  RAPPEL_POIDS: 'Un rappel pour renseigner ton poids.',
  RAPPEL_SEANCE: 'Un rappel le jour d\'une séance prévue.',
  SEANCE_MODIFIEE: 'Tu es prévenu si une séance est ajoutée, modifiée ou annulée.',
  DOC_MEDICAL: 'Tu es prévenu quand un nouveau document médical te concerne.',
  GENE_SUIVI: 'Le suivi par le staff d\'une gêne que tu as signalée.',
  MESSAGE_STAFF: 'Les messages que le staff t\'envoie.',
};

/** Préférences de notifications du joueur (PWA) + activation du push de l'appareil. */
@Component({
  selector: 'app-joueur-notifications',
  standalone: true,
  imports: [CommonModule, InfoHintComponent],
  templateUrl: './joueur-notifications.component.html',
  styleUrl: './joueur-notifications.component.scss',
})
export class JoueurNotificationsComponent implements OnInit {

  private api = inject(NotificationConfigService);
  private push = inject(NotificationPushService);

  readonly preferences = signal<Preference[]>([]);
  readonly etatPush = this.push.etat;

  ngOnInit(): void {
    this.api.mesPreferences().subscribe(p => this.preferences.set(p));
  }

  libelle(type: string): string { return LIBELLES[type] ?? type; }
  aide(type: string): string { return AIDES[type] ?? 'Notification de ce type.'; }

  activerPush(): void { this.push.activer(); }
}
