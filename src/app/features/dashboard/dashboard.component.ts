import { Component, OnInit } from '@angular/core';
import { PredictionService, ResumeJoueur } from '../../core/services/prediction.service';
import { PeseesService, PoidsFicheJoueur } from '../../core/services/pesees.service';
import { JoueurService } from '../../core/services/joueur.service';
import { DecimalPipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';
import { JoueurSupprimerDialogComponent } from '../joueur-supprimer-dialog/joueur-supprimer-dialog.component';
import { ApexChart, ApexAxisChartSeries, ApexXAxis, ApexStroke, ApexDataLabels, ApexTitleSubtitle, ChartComponent } from 'ng-apexcharts';
import { MatToolbar } from '@angular/material/toolbar';
import { MatIcon } from '@angular/material/icon';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { FormsModule } from '@angular/forms';

import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { BadgeRisqueComponent } from '../../shared/components/badge-risque/badge-risque.component';
import { MatProgressBar } from '@angular/material/progress-bar';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    standalone: true,
    styleUrl: './dashboard.component.scss',
    imports: [MatToolbar, MatIcon, MatCard, ChartComponent, MatCardHeader, MatCardTitle, MatCardContent, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, RouterLink, BadgeRisqueComponent, MatProgressBar, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, FormsModule, DecimalPipe]
})
export class DashboardComponent implements OnInit {

  joueurs: ResumeJoueur[] = [];
  poidsMap   = new Map<string, PoidsFicheJoueur>();
  statutMap  = new Map<string, string>();
  loading = true;
  displayedColumns = ['joueur', 'poste', 'statut', 'risque', 'fatigue', 'poids'];

  chargeExpanded   = false;
  effectifExpanded = true;

  pageIndex = 0;
  pageSize  = 10;

  recherche = '';
  triFatigue: 'asc' | 'desc' | null = null;
  triRisque:  'asc' | 'desc' | null = null;

  get joueursFiltres(): ResumeJoueur[] {
    const q = this.recherche.trim().toLowerCase();
    let liste = q
      ? this.joueurs.filter(j =>
          `${j.prenom} ${j.nom}`.toLowerCase().includes(q) ||
          `${j.nom} ${j.prenom}`.toLowerCase().includes(q))
      : [...this.joueurs];

    if (this.triRisque) {
      const dir = this.triRisque === 'asc' ? 1 : -1;
      liste = liste.sort((a, b) => dir * ((a.score_risque ?? 0) - (b.score_risque ?? 0)));
    } else if (this.triFatigue) {
      const dir = this.triFatigue === 'asc' ? 1 : -1;
      liste = liste.sort((a, b) => dir * ((a.score_fatigue ?? 0) - (b.score_fatigue ?? 0)));
    }
    return liste;
  }

  get joueursPagines() {
    return this.joueursFiltres.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize  = event.pageSize;
  }

  onRecherche(): void {
    this.pageIndex = 0;
  }

  toggleTriFatigue(): void {
    this.triRisque = null;
    this.triFatigue = this.triFatigue === 'desc' ? 'asc' : 'desc';
    this.pageIndex = 0;
  }

  toggleTriRisque(): void {
    this.triFatigue = null;
    this.triRisque = this.triRisque === 'desc' ? 'asc' : 'desc';
    this.pageIndex = 0;
  }

  chartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    title: ApexTitleSubtitle;
  } = {
    series: [{ name: 'Charge équipe (km)', data: [0, 0, 0, 0] }],
    chart: { type: 'line', height: 280, toolbar: { show: false } },
    xaxis: { categories: ['S-4', 'S-3', 'S-2', 'S-1'] },
    stroke: { curve: 'smooth', width: 3 },
    dataLabels: { enabled: false },
    title: { text: 'Charge collective — 4 dernières semaines', align: 'left' }
  };

  constructor(
    private predictionService: PredictionService,
    private peseesService: PeseesService,
    private joueurService: JoueurService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadEquipe();
    this.loadChargeGraph();
    this.loadPoids();
    this.loadStatuts();
  }

  loadStatuts(): void {
    this.joueurService.getAll().subscribe({
      next: data => { this.statutMap = new Map(data.map(j => [j.id, j.statut])); },
      error: () => {}
    });
  }

  loadPoids(): void {
    this.peseesService.getEquipe().subscribe({
      next: data => {
        this.poidsMap = new Map(data.map(d => [d.joueurId, d]));
      },
      error: () => {}
    });
  }

  loadEquipe(): void {
    this.predictionService.getResumeEquipe().subscribe({
      next: data => { this.joueurs = data; this.loading = false; },
      error: () => {
        this.loading = false;
        this.snackBar.open('Impossible de charger les données équipe', 'Fermer', { duration: 4000 });
      }
    });
  }

  loadChargeGraph(): void {
    this.predictionService.getChargeCollective().subscribe({
      next: res => {
        this.chartOptions = {
          ...this.chartOptions,
          series: [{ name: 'Charge équipe (km)', data: res.data }],
          xaxis: { categories: res.labels }
        };
      },
      error: () => {}
    });
  }

  ouvrirDialogJoueur(): void {
    const ref = this.dialog.open(JoueurFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });
    ref.afterClosed().subscribe(joueur => {
      if (joueur) this.loadEquipe();
    });
  }

  ouvrirDialogSuppression(): void {
    const ref = this.dialog.open(JoueurSupprimerDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });
    ref.afterClosed().subscribe(() => this.loadEquipe());
  }

}
