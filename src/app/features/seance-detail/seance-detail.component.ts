import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PredictionService, RapportSeance, LigneRapport } from '../../core/services/prediction.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { DecimalPipe, DatePipe } from '@angular/common';

const COULEURS_TYPE: Record<string, string> = {
  MATCH:        '#ef4444',
  MATCH_AMICAL: '#f97316',
  INTENSIF:     '#6366f1',
  TECHNIQUE:    '#0ea5a0',
  REPRISE:      '#22c55e',
  PRE_MATCH:    '#eab308',
  FORCE:        '#8b5cf6',
};

@Component({
  selector: 'app-seance-detail',
  standalone: true,
  templateUrl: './seance-detail.component.html',
  styleUrl: './seance-detail.component.scss',
  imports: [
    MatToolbar, MatCard, MatCardHeader, MatCardTitle, MatCardContent,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    DecimalPipe, DatePipe,
  ]
})
export class SeanceDetailComponent implements OnInit {

  rapport: RapportSeance | null = null;
  loading = true;
  error = false;

  readonly colonnesBase = ['joueur', 'poste', 'duree', 'dist_reelle', 'ratio_reel', 'dist_attendue', 'delta', 'statut', 'vitesse', 'sprints'];
  readonly colonnesMatch = [...this.colonnesBase, 'objectif'];

  get displayedColumns(): string[] {
    if (!this.rapport) return this.colonnesBase;
    return ['MATCH', 'MATCH_AMICAL'].includes(this.rapport.type_code)
      ? this.colonnesMatch
      : this.colonnesBase;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private predictionService: PredictionService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.predictionService.getRapportSeance(id).subscribe({
      next: data => { this.rapport = data; this.loading = false; },
      error: () => { this.loading = false; this.error = true; }
    });
  }

  retourSeances(): void {
    this.router.navigate(['/seances']);
  }

  couleurType(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }

  statutClass(statut: string): string {
    return {
      SOUS_NORME:    'statut-sous',
      DANS_NORME:    'statut-dans',
      SUR_NORME:     'statut-sur',
      SANS_BASELINE: 'statut-sans',
    }[statut] ?? '';
  }

  statutLibelle(statut: string): string {
    return {
      SOUS_NORME:    'Sous la norme',
      DANS_NORME:    'Dans la norme',
      SUR_NORME:     'Sur la norme',
      SANS_BASELINE: 'Pas de baseline',
    }[statut] ?? statut;
  }

  deltaClass(delta: number | null): string {
    if (delta === null) return '';
    return delta < 0 ? 'delta-neg' : delta > 0 ? 'delta-pos' : '';
  }

  get lignesSorted(): LigneRapport[] {
    if (!this.rapport) return [];
    return [...this.rapport.lignes].sort((a, b) => {
      const order = { SOUS_NORME: 0, SANS_BASELINE: 1, DANS_NORME: 2, SUR_NORME: 3 };
      return (order[a.statut] ?? 9) - (order[b.statut] ?? 9);
    });
  }
}
