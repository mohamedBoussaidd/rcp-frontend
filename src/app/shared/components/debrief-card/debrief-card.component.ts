import { Component, inject, input, signal } from '@angular/core';
import { PredictionService, Briefing } from '@core/services/prediction.service';
import { AuthService } from '@core/services/auth.service';
import { IaBadgeComponent } from '@shared/components/ia-badge/ia-badge.component';

/**
 * Carte « Debrief IA » d'une séance : petit paragraphe (prévu vs réalisé, écarts) généré à la demande.
 * Réutilisable partout où l'on a l'id d'une séance réalisée (vue séance, bilan du dashboard).
 * S'auto-masque sans la permission {@code prepa_ia:debrief} (qui tombe si le module add-on est off).
 * Texte issu du LLM (badge IA) ou d'un gabarit local (repli transparent).
 */
@Component({
  selector: 'app-debrief-card',
  standalone: true,
  imports: [IaBadgeComponent],
  templateUrl: './debrief-card.component.html',
  styleUrl: './debrief-card.component.scss',
})
export class DebriefCardComponent {

  /** Id de la séance à débriefer. */
  readonly seanceId = input.required<string>();

  private predictions = inject(PredictionService);
  private auth = inject(AuthService);

  readonly chargement = signal(false);
  readonly debrief = signal<Briefing | null>(null);
  readonly erreur = signal<string | null>(null);

  get visible(): boolean {
    return this.auth.has('prepa_ia:debrief');
  }

  generer(): void {
    if (this.chargement()) return;
    this.chargement.set(true);
    this.erreur.set(null);
    this.predictions.genererDebrief(this.seanceId()).subscribe({
      next: b => { this.debrief.set(b); this.chargement.set(false); },
      error: () => { this.erreur.set('Debrief indisponible pour le moment — réessaie dans un instant.'); this.chargement.set(false); },
    });
  }
}
