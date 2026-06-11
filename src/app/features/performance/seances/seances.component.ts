import { Component, OnInit, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { SeanceService, Seance } from '@core/services/seance.service';
import { MatIcon } from '@angular/material/icon';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
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
    MatIcon,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    MatPaginator, DatePipe,
  ]
})
export class SeancesComponent implements OnInit {

  /** Section active pilotée par ?section= (liste par défaut). */
  private route = inject(ActivatedRoute);
  readonly section = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('section') ?? 'liste')),
    { initialValue: 'liste' },
  );

  seances: Seance[] = [];
  loading = true;
  displayedColumns = ['date', 'type', 'terrain', 'description'];

  pageIndex = 0;
  pageSize  = 10;

  get seancesPaginees(): Seance[] {
    return this.seances.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize  = event.pageSize;
  }

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

  couleurType(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }
}
