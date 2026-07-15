import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  CapaciteEnvoi, DestinataireChat, MessageEnvoye, NotificationChatService,
} from '@core/services/notification-chat.service';

/**
 * Messagerie staff (mobile) — port plein écran du chat-widget web (1 sens) :
 * écrire à toute l'équipe ou à des joueurs ciblés, revoir les messages envoyés.
 * Même service, mêmes règles (capacité résolue par le backend), zéro logique nouvelle.
 */
@Component({
  selector: 'app-staff-messages',
  standalone: true,
  templateUrl: './staff-messages.component.html',
  styleUrl: './staff-messages.component.scss',
  imports: [FormsModule, DatePipe],
})
export class StaffMessagesComponent implements OnInit {

  private chat = inject(NotificationChatService);

  readonly capacite = signal<CapaciteEnvoi | null>(null);
  readonly onglet = signal<'ecrire' | 'envoyes'>('ecrire');

  readonly destinatairesDispo = signal<DestinataireChat[]>([]);
  readonly cibles = signal<Set<string>>(new Set());
  readonly modeCible = signal(false);

  titre = '';
  corps = '';
  readonly envoiEnCours = signal(false);
  readonly retour = signal<string | null>(null);

  readonly envoyes = signal<MessageEnvoye[]>([]);

  ngOnInit(): void {
    this.chat.capacite().subscribe({
      next: c => {
        this.capacite.set(c);
        if (c.peutCibler) {
          this.chat.destinataires().subscribe({ next: d => this.destinatairesDispo.set(d), error: () => {} });
        }
      },
      error: () => this.capacite.set(null),
    });
  }

  choisirOnglet(o: 'ecrire' | 'envoyes'): void {
    this.onglet.set(o);
    if (o === 'envoyes') {
      this.chat.envoyes().subscribe({ next: e => this.envoyes.set(e), error: () => {} });
    }
  }

  basculerCible(id: string): void {
    const set = new Set(this.cibles());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.cibles.set(set);
  }

  envoyer(): void {
    const corps = this.corps.trim();
    if (!corps || this.envoiEnCours()) return;
    this.envoiEnCours.set(true);
    this.retour.set(null);
    const destinataires = this.modeCible() ? Array.from(this.cibles()) : [];
    this.chat.envoyer({ corps, titre: this.titre.trim() || undefined, destinataires }).subscribe({
      next: r => {
        this.retour.set(`Envoyé à ${r.envoyes} destinataire(s).`);
        this.titre = ''; this.corps = ''; this.cibles.set(new Set());
        this.envoiEnCours.set(false);
      },
      error: e => {
        this.retour.set(e?.error?.message || "Échec de l'envoi.");
        this.envoiEnCours.set(false);
      },
    });
  }
}
