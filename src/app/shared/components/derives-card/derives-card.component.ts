import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PredictionService, Briefing, Derives } from '@core/services/prediction.service';
import { AuthService } from '@core/services/auth.service';
import { IaBadgeComponent } from '@shared/components/ia-badge/ia-badge.component';
import { DomSanitizer } from '@angular/platform-browser';


/**
 * Carte « Dérives & surveillance » : sur ~4 semaines, 3 axes SÉPARÉS (volume, haute intensité,
 * ressenti) avec, par axe, les joueurs en hausse / en baisse. Les axes structurés se chargent sans
 * coût IA (GET) ; la synthèse textuelle est générée à la demande (LLM ou gabarit). S'auto-masque
 * sans la permission {@code prepa_ia:derives} (qui tombe si le module add-on est off).
 */
@Component({
  selector: 'app-derives-card',
  standalone: true,
  imports: [IaBadgeComponent, DecimalPipe],
  templateUrl: './derives-card.component.html',
  styleUrl: './derives-card.component.scss',
})
export class DerivesCardComponent implements OnInit {

  private predictions = inject(PredictionService);
  private auth = inject(AuthService);

  readonly derives = signal<Derives | null>(null);
  readonly note = signal<Briefing | null>(null);
  readonly chargementNote = signal(false);
  readonly erreur = signal<string | null>(null);

  get visible(): boolean {
    return this.auth.has('prepa_ia:derives');
  }

  ngOnInit(): void {
    if (!this.visible) return;
    this.predictions.getDerives().subscribe({
      next: d => this.derives.set(d),
      error: () => this.erreur.set('Dérives indisponibles pour le moment.'),
    });
  }

  get aucuneDerive(): boolean {
    const d = this.derives();
    return !!d && d.axes.every(a => a.nb_hausse === 0 && a.nb_baisse === 0);
  }

  genererNote(): void {
    if (this.chargementNote()) return;
    this.chargementNote.set(true);
    this.predictions.genererDeriveNote().subscribe({
      next: n => { this.note.set(n); this.chargementNote.set(false); },
      error: () => { this.chargementNote.set(false); this.erreur.set('Synthèse indisponible pour le moment.'); },
    });
  }
  private sanitizer = inject(DomSanitizer);
  readonly safeHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.note()?.texte || '')
  );
}
