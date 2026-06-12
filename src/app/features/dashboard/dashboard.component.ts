import { Component, OnInit, inject } from '@angular/core';
import { PredictionService, ResumeJoueur } from '@core/services/prediction.service';
import { PeseesService, PoidsFicheJoueur } from '@core/services/pesees.service';
import { JoueurService, Joueur } from '@core/services/joueur.service';
import { TechniqueService, JoueurCompoStats } from '@core/services/technique.service';
import { DecimalPipe, DatePipe, SlicePipe, NgTemplateOutlet } from '@angular/common';
import { SeanceService, Seance } from '@core/services/seance.service';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { JoueurFormDialogComponent } from '../joueur/joueur-form-dialog/joueur-form-dialog.component';
import { JoueurSupprimerDialogComponent } from '../joueur/joueur-supprimer-dialog/joueur-supprimer-dialog.component';
import { PresenceDialogComponent } from '../performance/presence-dialog/presence-dialog.component';
import { ApexChart, ApexAxisChartSeries, ApexXAxis, ApexStroke, ApexDataLabels, ApexTitleSubtitle, ApexTheme, ApexGrid, ApexYAxis, ChartComponent } from 'ng-apexcharts';
import { MatIcon } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { BadgeRisqueComponent } from '@shared/components/badge-risque/badge-risque.component';
import { MatProgressBar } from '@angular/material/progress-bar';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  standalone: true,
  styleUrl: './dashboard.component.scss',
  imports: [
    MatIcon, ChartComponent, FormsModule, DecimalPipe, DatePipe, SlicePipe, RouterLink, NgTemplateOutlet,
    BadgeRisqueComponent, MatProgressBar,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    MatPaginator,
  ]
})
export class DashboardComponent implements OnInit {

  joueurs: ResumeJoueur[] = [];
  poidsMap  = new Map<string, PoidsFicheJoueur>();
  statutMap = new Map<string, string>();
  loading   = true;

  // ── Séances du jour / semaine ──
  seancesAujourdhui: Seance[] = [];
  seancesAVenir: Seance[] = [];
  readonly aujourdhui = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // ── Panel joueur ──
  panelJoueur: Joueur | null = null;
  panelResume: ResumeJoueur | null = null;
  panelStats: JoueurCompoStats | null = null;
  panelOnglet: 'profil' | 'gps' | 'performances' = 'profil';
  panelLoading = false;
  statsCompo: JoueurCompoStats[] = [];
  joueursComplets: Joueur[] = [];

  displayedColumns = ['joueur', 'poste', 'statut', 'risque', 'fatigue', 'poids'];

  chargeExpanded   = true;
  effectifExpanded = true;

  pageIndex = 0;
  pageSize  = 10;

  recherche  = '';
  triFatigue: 'asc' | 'desc' | null = null;
  triRisque:  'asc' | 'desc' | null = null;

  /* ── KPIs dérivés ── */
  get nbDisponibles(): number {
    return [...this.statutMap.values()].filter(s => s === 'actif').length;
  }
  get nbBlesses(): number {
    return [...this.statutMap.values()].filter(s => s === 'blesse').length;
  }
  get fatigueMoyenne(): number {
    if (!this.joueurs.length) return 0;
    const sum = this.joueurs.reduce((a, j) => a + (j.score_fatigue ?? 0), 0);
    return sum / this.joueurs.length;
  }
  get risqueMoyen(): number {
    if (!this.joueurs.length) return 0;
    const sum = this.joueurs.reduce((a, j) => a + (j.score_risque ?? 0), 0);
    return sum / this.joueurs.length;
  }

  /* ── Filtrage / tri / pagination ── */
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

  get joueursPagines(): ResumeJoueur[] {
    return this.joueursFiltres.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
  }

  onPageChange(event: PageEvent): void { this.pageIndex = event.pageIndex; this.pageSize = event.pageSize; }
  onRecherche(): void { this.pageIndex = 0; }

  toggleTriFatigue(): void {
    this.triRisque  = null;
    this.triFatigue = this.triFatigue === 'desc' ? 'asc' : 'desc';
    this.pageIndex  = 0;
  }
  toggleTriRisque(): void {
    this.triFatigue = null;
    this.triRisque  = this.triRisque === 'desc' ? 'asc' : 'desc';
    this.pageIndex  = 0;
  }

  /* ── Chart ApexCharts ── */
  chartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis;
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    title: ApexTitleSubtitle;
    theme: ApexTheme;
    grid: ApexGrid;
    colors: string[];
  } = {
    series:     [{ name: 'Charge équipe (km)', data: [0, 0, 0, 0] }],
    chart:      { type: 'line', height: 260, toolbar: { show: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif' },
    xaxis:      { categories: ['S-4', 'S-3', 'S-2', 'S-1'], labels: { style: { colors: '#64748B', fontSize: '12px' } } },
    yaxis:      { labels: { style: { colors: '#64748B', fontSize: '12px' } } },
    stroke:     { curve: 'smooth', width: 2.5 },
    dataLabels: { enabled: false },
    title:      { text: '' },
    theme:      { mode: 'light' },
    grid:       { borderColor: '#E5E9EF', strokeDashArray: 3 },
    colors:     ['#15803D'],
  };

  private predictionService = inject(PredictionService);
  private peseesService = inject(PeseesService);
  private joueurService = inject(JoueurService);
  private seanceService = inject(SeanceService);
  private techniqueService = inject(TechniqueService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  auth = inject(AuthService);

  ngOnInit(): void {
    this.loadEquipe();
    this.loadChargeGraph();
    this.loadPoids();
    this.loadStatuts();
    this.loadSeancesAujourdhui();
    this.loadJoueursComplets();
    this.loadStatsCompo();
  }

  loadJoueursComplets(): void {
    this.joueurService.getAll().subscribe({
      next: data => { this.joueursComplets = data; },
      error: () => {}
    });
  }

  loadStatsCompo(): void {
    this.techniqueService.statsCompo().subscribe({
      next: data => { this.statsCompo = data; },
      error: () => {}
    });
  }

  ouvrirPanel(resume: ResumeJoueur): void {
    this.panelLoading = true;
    this.panelResume = resume;
    this.panelOnglet = 'profil';
    this.panelStats = this.statsCompo.find(s => s.joueurId === resume.joueur_id) ?? null;
    const deja = this.joueursComplets.find(j => j.id === resume.joueur_id);
    if (deja) { this.panelJoueur = deja; this.panelLoading = false; return; }
    this.joueurService.getById(resume.joueur_id).subscribe({
      next: j => { this.panelJoueur = j; this.panelLoading = false; },
      error: () => { this.panelLoading = false; }
    });
  }

  fermerPanel(): void { this.panelJoueur = null; this.panelResume = null; }

  statutLibelle(s: string): string {
    return ({ actif: 'Actif', blesse: 'Blessé', suspendu: 'Suspendu', prete: 'Prêté' } as Record<string,string>)[s] ?? s;
  }

  // Séances du jour + les 7 prochaines séances planifiées (peu importe leur éloignement,
  // pas une fenêtre de 7 jours). Données scopées par l'équipe/contexte actif.
  loadSeancesAujourdhui(): void {
    this.seanceService.getAll().subscribe({
      next: data => {
        const aVenir = data
          .filter(s => s.date >= this.aujourdhui && s.statut !== 'ANNULEE')
          .sort((a, b) =>
            a.date.localeCompare(b.date) || (a.heureDebut ?? '').localeCompare(b.heureDebut ?? ''));
        this.seancesAujourdhui = aVenir.filter(s => s.date === this.aujourdhui);
        this.seancesAVenir = aVenir.filter(s => s.date > this.aujourdhui).slice(0, 7);
      },
      error: () => {}
    });
  }

  allerPresence(seance: Seance): void {
    this.dialog.open(PresenceDialogComponent, {
      data: { seance },
      panelClass: 'app-dialog',
      maxWidth: '95vw',
    });
  }

  loadStatuts(): void {
    this.joueurService.getAll().subscribe({
      next: data => { this.statutMap = new Map(data.map(j => [j.id, j.statut])); },
      error: () => {}
    });
  }

  loadPoids(): void {
    this.peseesService.getEquipe().subscribe({
      next: data => { this.poidsMap = new Map(data.map(d => [d.joueurId, d])); },
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
          xaxis: { ...this.chartOptions.xaxis, categories: res.labels },
        };
      },
      error: () => {}
    });
  }

  ouvrirDialogJoueur(): void {
    const ref = this.dialog.open(JoueurFormDialogComponent, {
      width: '560px', maxWidth: '95vw', panelClass: 'app-dialog',
    });
    ref.afterClosed().subscribe(joueur => { if (joueur) this.loadEquipe(); });
  }

  ouvrirDialogSuppression(): void {
    const ref = this.dialog.open(JoueurSupprimerDialogComponent, {
      width: '500px', maxWidth: '95vw', panelClass: 'app-dialog',
    });
    ref.afterClosed().subscribe(() => this.loadEquipe());
  }
}
