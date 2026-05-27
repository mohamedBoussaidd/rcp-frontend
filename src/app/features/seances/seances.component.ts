import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SeanceService, Seance } from '../../core/services/seance.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { DatePipe } from '@angular/common';

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
  selector: 'app-seances',
  standalone: true,
  templateUrl: './seances.component.html',
  styleUrl: './seances.component.scss',
  imports: [
    MatToolbar, MatCard, MatCardHeader, MatCardTitle, MatCardContent,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    DatePipe,
  ]
})
export class SeancesComponent implements OnInit {

  seances: Seance[] = [];
  loading = true;
  displayedColumns = ['date', 'type', 'terrain', 'description'];

  constructor(private seanceService: SeanceService, private router: Router) {}

  ngOnInit(): void {
    this.seanceService.getAll().subscribe({
      next: data => {
        this.seances = data.sort((a, b) => b.date.localeCompare(a.date));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  allerDetail(seance: Seance): void {
    this.router.navigate(['/seances', seance.id]);
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  couleurType(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }
}
