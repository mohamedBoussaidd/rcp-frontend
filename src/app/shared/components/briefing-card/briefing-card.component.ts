import { Component, inject, signal } from '@angular/core';
import { PredictionService, Briefing } from '@core/services/prediction.service';
import { AuthService } from '@core/services/auth.service';
import { IaBadgeComponent } from '@shared/components/ia-badge/ia-badge.component';

/**
 * Carte « Briefing du préparateur » (note automatique de l'état de l'équipe sur la semaine).
 * Réutilisable telle quelle sur plusieurs écrans (dashboard prépa, écran Charge). Génération à la
 * demande (bouton) : l'appel peut consommer du quota IA. S'auto-masque si l'utilisateur n'a pas la
 * permission {@code prepa_ia:briefing} — laquelle tombe si le module add-on n'est pas activé pour le club.
 * Le texte peut venir du LLM (badge IA) ou d'un gabarit local (repli transparent).
 */
@Component({
  selector: 'app-briefing-card',
  standalone: true,
  imports: [IaBadgeComponent],
  templateUrl: './briefing-card.component.html',
  styleUrl: './briefing-card.component.scss',
})
export class BriefingCardComponent {

  private predictions = inject(PredictionService);
  private auth = inject(AuthService);

  readonly chargement = signal(false);
  readonly briefing = signal<Briefing | null>(null);
  readonly erreur = signal<string | null>(null);

  /** Visible seulement si la carte est accessible (permission + module add-on actif côté backend). */
  get visible(): boolean {
    return this.auth.has('prepa_ia:briefing');
  }

  generer(): void {
    if (this.chargement()) return;
    this.chargement.set(true);
    this.erreur.set(null);
    this.predictions.genererBriefing().subscribe({
      next: b => { this.briefing.set(b); this.chargement.set(false); },
      error: () => { this.erreur.set('Briefing indisponible pour le moment — réessaie dans un instant.'); this.chargement.set(false); },
    });
  }
}
