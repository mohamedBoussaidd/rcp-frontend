import { Component, OnInit, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

import { SaisonService, Saison, BilanSaison } from '@core/services/saison.service';

/**
 * Comparaison inter-saisons : sélectionne plusieurs saisons (de l'équipe) et compare leurs
 * bilans synthétiques côte à côte (effectif, séances, blessures, durée + indicateurs dérivés).
 * Les données historiques sont conservées d'une saison à l'autre (jamais supprimées).
 */
@Component({
  selector: 'app-comparaison-saisons',
  standalone: true,
  templateUrl: './comparaison-saisons.component.html',
  styleUrl: './comparaison-saisons.component.scss',
  imports: [DatePipe, DecimalPipe],
})
export class ComparaisonSaisonsComponent implements OnInit {

  private saisonService = inject(SaisonService);

  saisons: Saison[] = [];
  selectedIds = new Set<string>();
  bilans = new Map<string, BilanSaison>();
  loading = true;

  ngOnInit(): void {
    this.saisonService.getAll().subscribe({
      next: data => {
        this.saisons = data;
        this.loading = false;
        // Pré-sélectionne les 2 saisons les plus récentes pour un comparatif immédiat.
        data.slice(0, 2).forEach(s => this.basculer(s.id));
      },
      error: () => (this.loading = false),
    });
  }

  basculer(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
      if (!this.bilans.has(id)) {
        this.saisonService.getBilan(id).subscribe({
          next: b => this.bilans.set(id, b),
          error: () => {},
        });
      }
    }
  }

  estSelectionnee(id: string): boolean { return this.selectedIds.has(id); }

  /** Bilans des saisons sélectionnées, dans l'ordre de la liste. */
  get colonnes(): BilanSaison[] {
    return this.saisons
      .filter(s => this.selectedIds.has(s.id))
      .map(s => this.bilans.get(s.id))
      .filter((b): b is BilanSaison => !!b);
  }

  seancesParSemaine(b: BilanSaison): number {
    return b.jours > 0 ? (b.nbSeances / (b.jours / 7)) : 0;
  }

  blessuresParMois(b: BilanSaison): number {
    return b.jours > 0 ? (b.nbBlessures / (b.jours / 30)) : 0;
  }
}
