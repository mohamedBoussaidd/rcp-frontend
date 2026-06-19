import { Component, inject, signal, OnInit, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  NotificationChatService, CapaciteEnvoi, DestinataireChat, MessageEnvoye,
} from '@core/services/notification-chat.service';

/**
 * Widget de chat 1-sens, bouton flottant en bas à droite. Visible uniquement pour les
 * utilisateurs autorisés à émettre (tout le staff ; joueurs avec un droit d'envoi). Permet
 * d'écrire à toute l'équipe ou à des destinataires ciblés, et de revoir les messages envoyés.
 * Conçu pour évoluer vers la réponse (threads) côté backend.
 */
@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
})
export class ChatWidgetComponent implements OnInit {

  private chat = inject(NotificationChatService);
  private host = inject(ElementRef);

  readonly capacite = signal<CapaciteEnvoi | null>(null);
  readonly ouvert = signal(false);
  readonly onglet = signal<'ecrire' | 'envoyes'>('ecrire');

  readonly destinatairesDispo = signal<DestinataireChat[]>([]);
  readonly cibles = signal<Set<string>>(new Set());
  readonly modeCible = signal(false);

  readonly titre = signal('');
  readonly corps = signal('');
  readonly envoiEnCours = signal(false);
  readonly retour = signal<string | null>(null);

  readonly envoyes = signal<MessageEnvoye[]>([]);

  ngOnInit(): void {
    this.chat.capacite().subscribe({
      next: c => this.capacite.set(c),
      error: () => this.capacite.set(null),
    });
  }

  basculer(): void {
    const o = !this.ouvert();
    this.ouvert.set(o);
    if (o && this.capacite()?.peutCibler && this.destinatairesDispo().length === 0) {
      this.chat.destinataires().subscribe({ next: d => this.destinatairesDispo.set(d), error: () => {} });
    }
  }

  choisirOnglet(o: 'ecrire' | 'envoyes'): void {
    this.onglet.set(o);
    if (o === 'envoyes') {
      this.chat.envoyes().subscribe({ next: e => this.envoyes.set(e), error: () => {} });
    }
  }

  basculerCible(id: string): void {
    const set = new Set(this.cibles());
    set.has(id) ? set.delete(id) : set.add(id);
    this.cibles.set(set);
  }

  envoyer(): void {
    const corps = this.corps().trim();
    if (!corps || this.envoiEnCours()) return;
    this.envoiEnCours.set(true);
    this.retour.set(null);
    const destinataires = this.modeCible() ? Array.from(this.cibles()) : [];
    this.chat.envoyer({ corps, titre: this.titre().trim() || undefined, destinataires }).subscribe({
      next: r => {
        this.retour.set(`Envoyé à ${r.envoyes} destinataire(s).`);
        this.titre.set(''); this.corps.set(''); this.cibles.set(new Set());
        this.envoiEnCours.set(false);
      },
      error: e => {
        this.retour.set(e?.error?.message || "Échec de l'envoi.");
        this.envoiEnCours.set(false);
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  @HostListener('document:keydown.escape')
  fermerEsc(): void { if (this.ouvert()) this.ouvert.set(false); }
}
