import { Component, ElementRef, HostListener, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PredictionService, EtatChat, MessageChat, ActionRapide } from '@core/services/prediction.service';
import { AuthService } from '@core/services/auth.service';
import { BulleFlottanteDirective } from '@shared/directives/bulle-flottante.directive';

/**
 * Widget de l'assistant conversationnel (« Tempo » par défaut, nom paramétrable par le super-admin
 * et surchargeable par club). Bulle flottante déplaçable + panneau de discussion.
 *
 * <p>Trois partis pris :
 * <ul>
 *   <li><strong>LLM obligatoire</strong> : sans clé ni quota, le panneau s'ouvre quand même mais la
 *       saisie est bloquée avec un message explicite — plutôt qu'un échec au premier envoi ;</li>
 *   <li><strong>historique côté navigateur</strong> : le fil vit dans le composant et remonte à
 *       chaque appel. Rien n'est persisté (ni base, ni rétention à purger) ;</li>
 *   <li><strong>actions rapides</strong> : le back publie les cartes que CET utilisateur peut
 *       déclencher (permission + add-on actif). Elles ouvrent l'écran correspondant plutôt que de
 *       laisser le modèle choisir des outils — coût constant et comportement prévisible.</li>
 * </ul>
 */
@Component({
  selector: 'app-assistant-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant-widget.component.html',
  styleUrl: './assistant-widget.component.scss',
})
export class AssistantWidgetComponent {

  private predictions = inject(PredictionService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private host = inject(ElementRef);
  /** Injectée par l'hôte : sert à ignorer le clic qui termine un déplacement de la bulle. */
  private bulle = inject(BulleFlottanteDirective, { optional: true, self: true });

  readonly etat = signal<EtatChat | null>(null);
  readonly ouvert = signal(false);
  readonly messages = signal<MessageChat[]>([]);
  readonly saisie = signal('');
  readonly envoiEnCours = signal(false);
  readonly erreur = signal<string | null>(null);

  /** Le widget n'existe que si la permission (et donc l'add-on) est accordée. */
  get visible(): boolean { return this.auth.has('assistant_ia:chat'); }

  get nom(): string { return this.etat()?.nom || 'Assistant'; }
  get actions(): ActionRapide[] { return this.etat()?.actions ?? []; }
  get disponible(): boolean { return this.etat()?.disponible === true; }

  constructor() {
    // Les permissions et le contexte club arrivent par le réseau, APRÈS la création du widget : un
    // chargement en ngOnInit tomberait sur `visible === false` et n'interrogerait jamais le serveur
    // (le nom resterait « Assistant » et le chat éternellement « indisponible »). L'effet relit
    // `visible`, donc il part dès que la permission est là — et rejoue à chaque changement de club,
    // ce qui rafraîchit au passage le nom de l'assistant et le quota restant.
    effect(() => {
      if (!this.visible) return;
      this.predictions.getEtatChat().subscribe({
        next: e => this.etat.set(e),
        error: () => this.etat.set(null),
      });
    });
  }

  basculer(): void {
    if (this.bulle?.aGlisse) return;   // fin de déplacement : ne pas ouvrir le panneau
    this.ouvert.set(!this.ouvert());
  }

  fermer(): void { this.ouvert.set(false); }

  @HostListener('document:click', ['$event'])
  onClicExterieur(e: MouseEvent): void {
    if (this.ouvert() && !this.host.nativeElement.contains(e.target as Node)) this.ouvert.set(false);
  }

  @HostListener('document:keydown.escape')
  onEchap(): void { if (this.ouvert()) this.ouvert.set(false); }

  envoyer(): void {
    const texte = this.saisie().trim();
    if (!texte || this.envoiEnCours() || !this.disponible) return;

    const fil = [...this.messages(), { role: 'user', contenu: texte } as MessageChat];
    this.messages.set(fil);
    this.saisie.set('');
    this.erreur.set(null);
    this.envoiEnCours.set(true);

    this.predictions.envoyerChat(fil).subscribe({
      next: r => {
        this.messages.set([...fil, r]);
        this.envoiEnCours.set(false);
      },
      error: err => {
        this.envoiEnCours.set(false);
        this.erreur.set(err?.status === 429
          ? 'Limite de questions atteinte pour aujourd\'hui.'
          : 'Réponse impossible pour le moment. Réessaie dans un instant.');
        // Le quota a pu tomber à zéro : on rafraîchit l'état pour bloquer la saisie proprement.
        this.predictions.getEtatChat().subscribe({ next: e => this.etat.set(e), error: () => {} });
      },
    });
  }

  effacer(): void {
    this.messages.set([]);
    this.erreur.set(null);
  }

  /** Ouvre l'écran de la carte visée par l'action (le chat ne déclenche pas la génération lui-même). */
  lancerAction(a: ActionRapide): void {
    const routes: Record<string, string> = {
      briefing: '/charge-equipe',
      derives: '/tableau-preparateur',
      simulation: '/charge-equipe',
    };
    const route = routes[a.code];
    if (route) {
      this.ouvert.set(false);
      this.router.navigateByUrl(route);
    }
  }
}
