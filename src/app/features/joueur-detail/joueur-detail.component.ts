import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { JoueurService, Joueur, GpsPoint } from '../../core/services/joueur.service';
import { PredictionService, NiveauFatigue } from '../../core/services/prediction.service';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTabGroup, MatTab, MatTabContent } from '@angular/material/tabs';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { BadgeRisqueComponent } from '../../shared/components/badge-risque/badge-risque.component';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis, ApexFill } from 'ng-apexcharts';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  selector: 'app-joueur-detail',
  standalone: true,
  templateUrl: './joueur-detail.component.html',
  styleUrl: './joueur-detail.component.scss',
  imports: [
    MatCard, MatCardHeader, MatCardTitle, MatCardContent,
    BadgeRisqueComponent, MatProgressBar,
    MatTabGroup, MatTab, MatTabContent,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow,
    MatPaginator,
    ChartComponent, DecimalPipe, DatePipe, FormsModule
  ]
})
export class JoueurDetailComponent implements OnInit {

  joueur: Joueur | null = null;
  risque: any = null;
  fatigue: NiveauFatigue | null = null;

  gpsData: GpsPoint[] = [];
  gpsLoading = true;

  joueursList: Joueur[] = [];
  currentIndex = -1;

  // Pagination
  pageIndex = 0;
  pageSize = 10;

  // Blocs rétractables
  posteRoleExpanded  = true;
  physiquesExpanded  = true;
  etatExpanded       = true;
  chartExpanded      = false;
  tableExpanded      = true;

  private activeTab = 0;

  // Filtres GPS
  filtreTypes: string[] = [];
  filtreDebut = '';
  filtreFin   = '';

  readonly TYPES_GPS = [
    { code: 'MATCH',        libelle: 'Match',        couleur: '#ef4444' },
    { code: 'MATCH_AMICAL', libelle: 'Match amical', couleur: '#f97316' },
    { code: 'INTENSIF',     libelle: 'Intensif',     couleur: '#6366f1' },
    { code: 'TECHNIQUE',    libelle: 'Technique',    couleur: '#0ea5a0' },
    { code: 'REPRISE',      libelle: 'Reprise',      couleur: '#22c55e' },
    { code: 'PRE_MATCH',    libelle: 'Pré-match',    couleur: '#eab308' },
    { code: 'FORCE',        libelle: 'Force',        couleur: '#8b5cf6' },
  ];

  readonly POSTES: Record<string, string> = {
    gardien:             'Gardien',
    defenseur_central:   'Défenseur central',
    lateral_droit:       'Latéral droit',
    lateral_gauche:      'Latéral gauche',
    milieu_defensif:     'Milieu défensif',
    milieu_central:      'Milieu central',
    milieu_offensif:     'Milieu offensif',
    ailier_droit:        'Ailier droit',
    ailier_gauche:       'Ailier gauche',
    attaquant:           'Attaquant',
    avant_centre:        'Avant-centre',
  };

  readonly PROFILS: Record<string, string> = {
    explosif_leger:        'Explosif léger',
    pivot_costaud:         'Pivot costaud',
    box_to_box:            'Box to box',
    sentinelle:            'Sentinelle',
    lateral_offensif:      'Latéral offensif',
    central_rapide:        'Central rapide',
    central_costaud:       'Central costaud',
    renard_surfaces:       'Renard des surfaces',
    attaquant_profondeur:  'Attaquant en profondeur',
  };

  readonly PIEDS: Record<string, string> = {
    droit:       'Droit',
    gauche:      'Gauche',
    ambidextre:  'Ambidextre',
  };

  readonly STATUTS: Record<string, string> = {
    actif:     'Actif',
    blesse:    'Blessé',
    suspendu:  'Suspendu',
    prete:     'Prêté',
    inactif:   'Inactif',
  };

  get age(): string {
    if (!this.joueur?.dateNaissance) return '—';
    const birth = new Date(this.joueur.dateNaissance);
    const today = new Date();
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return `${a} ans`;
  }

  colonnesGps = ['date', 'type', 'duree', 'distance', 'ratioReel', 'distAttendue', 'statut', 'sprint', 'vitesseMax', 'accelerations'];

  get gpsDataPage() {
    return this.gpsDataEnriched.slice(
      this.pageIndex * this.pageSize,
      (this.pageIndex + 1) * this.pageSize
    );
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize  = event.pageSize;
  }

  // ── Agrégats footer ──
  get totalDuree():         number { return this.gpsDataEnriched.reduce((s, d) => s + (d.dureeMinutes ?? 0), 0); }
  get totalDistanceKm():    number { return this.gpsDataEnriched.reduce((s, d) => s + (d.distanceTotaleM ?? 0), 0) / 1000; }
  get totalDistAttendueKm():number { return this.gpsDataEnriched.reduce((s, d) => s + (d.distAttendue ?? 0), 0) / 1000; }
  get totalSprintM():       number { return this.gpsDataEnriched.reduce((s, d) => s + (d.distanceSprint24kmhM ?? 0), 0); }
  get totalAccelerations(): number { return this.gpsDataEnriched.reduce((s, d) => s + (d.nbAccelerations ?? 0), 0); }

  get moyenneRatioReel(): number | null {
    const valid = this.gpsDataEnriched.filter(d => d.ratioReel !== null);
    return valid.length ? valid.reduce((s, d) => s + (d.ratioReel as number), 0) / valid.length : null;
  }

  get maxVitesse(): number | null {
    const valid = this.gpsDataEnriched.filter(d => d.vitesseMaxKmh !== null);
    return valid.length ? Math.max(...valid.map(d => d.vitesseMaxKmh as number)) : null;
  }

  get gpsDataFiltre(): GpsPoint[] {
    let data = this.gpsData;
    if (this.filtreTypes.length > 0) {
      data = data.filter(d => this.filtreTypes.includes(d.typeCode));
    }
    if (this.filtreDebut) {
      data = data.filter(d => d.date >= this.filtreDebut);
    }
    if (this.filtreFin) {
      data = data.filter(d => d.date <= this.filtreFin);
    }
    return data;
  }

  get gpsDataEnriched() {
    const source = this.gpsDataFiltre;
    const valid = source.filter(d => d.distanceTotaleM && d.dureeMinutes && d.dureeMinutes > 0);
    const ratios = valid.map(d => d.distanceTotaleM! / d.dureeMinutes!);
    const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

    return source.map(d => {
      const ratioReel = (d.distanceTotaleM && d.dureeMinutes && d.dureeMinutes > 0)
        ? d.distanceTotaleM / d.dureeMinutes : null;
      const distAttendue = (avgRatio !== null && d.dureeMinutes) ? avgRatio * d.dureeMinutes : null;
      let statut = 'SANS_BASELINE';
      if (ratioReel !== null && avgRatio !== null && avgRatio > 0) {
        const pct = ((ratioReel - avgRatio) / avgRatio) * 100;
        statut = pct < -20 ? 'SOUS_NORME' : pct > 20 ? 'SUR_NORME' : 'DANS_NORME';
      }
      return { ...d, ratioReel, distAttendue, statut };
    });
  }

  toggleFiltreType(code: string): void {
    const idx = this.filtreTypes.indexOf(code);
    if (idx >= 0) this.filtreTypes.splice(idx, 1);
    else this.filtreTypes.push(code);
    this.pageIndex = 0;
  }

  onFiltreChange(): void {
    this.pageIndex = 0;
  }

  resetFiltres(): void {
    this.filtreTypes = [];
    this.filtreDebut = '';
    this.filtreFin   = '';
    this.pageIndex   = 0;
  }

  statutClass(statut: string): string {
    return ({ SOUS_NORME: 'statut-sous', DANS_NORME: 'statut-dans', SUR_NORME: 'statut-sur', SANS_BASELINE: 'statut-sans' } as Record<string, string>)[statut] ?? '';
  }

  statutLibelle(statut: string): string {
    return ({ SOUS_NORME: 'Sous norme', DANS_NORME: 'Dans norme', SUR_NORME: 'Sur norme', SANS_BASELINE: '—' } as Record<string, string>)[statut] ?? statut;
  }

  chartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    plotOptions: ApexPlotOptions;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
    yaxis: ApexYAxis;
    fill: ApexFill;
  } = {
    series: [{ name: 'Distance totale', data: [0] }],
    chart: { type: 'bar', height: 280, toolbar: { show: false }, background: 'transparent', foreColor: '#8892b0' },
    xaxis: { categories: [''], labels: { style: { colors: '#8892b0', fontSize: '11px' } } },
    yaxis: { labels: { formatter: (v: number) => `${(v / 1000).toFixed(1)} km`, style: { colors: '#8892b0' } } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    fill: { colors: ['#6366f1'] },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v: number) => `${(v / 1000).toFixed(2)} km` }
    }
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private joueurService: JoueurService,
    private predictionService: PredictionService,
    private dialog: MatDialog
  ) {}

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    // matTabContent garantit que le contenu est rendu dans un onglet actif.
    // buildChart met à jour chartOptions avant que le chart existe (1ère activation)
    // ou déclenche ngOnChanges → updateChart sur un chart déjà visible.
    if (index === 1 && this.gpsData.length > 0) {
      this.buildChart(this.gpsData);
    }
  }

  get joueurPrecedent(): Joueur | null {
    return this.currentIndex > 0 ? this.joueursList[this.currentIndex - 1] : null;
  }

  get joueurSuivant(): Joueur | null {
    return this.currentIndex < this.joueursList.length - 1 ? this.joueursList[this.currentIndex + 1] : null;
  }

  naviguerVers(joueur: Joueur): void {
    this.router.navigate(['/joueurs', joueur.id]);
  }

  ngOnInit(): void {
    this.joueurService.getAll().subscribe(liste => {
      this.joueursList = liste.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    });

    this.route.paramMap.subscribe(params => {
      const id = params.get('id')!;
      this.chargerJoueur(id);
    });
  }

  private chargerJoueur(id: string): void {
    this.joueur    = null;
    this.risque    = null;
    this.fatigue   = null;
    this.gpsData   = [];
    this.gpsLoading = true;
    this.pageIndex  = 0;

    this.joueurService.getById(id).subscribe(j => {
      this.joueur = j;
      this.currentIndex = this.joueursList.findIndex(p => p.id === j.id);
    });
    this.predictionService.getRisque(id).subscribe(r => this.risque = r);
    this.predictionService.getFatigue(id).subscribe(f => this.fatigue = f);
    this.joueurService.getHistoriqueGps(id).subscribe({
      next: data => {
        this.gpsData = data;
        this.gpsLoading = false;
        if (this.activeTab === 1 && data.length > 0) this.buildChart(data);
      },
      error: () => { this.gpsLoading = false; }
    });
  }

  private buildChart(data: GpsPoint[]): void {
    const reversed = [...data].reverse();
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Distance totale', data: reversed.map(d => d.distanceTotaleM ?? 0) }],
      xaxis: {
        categories: reversed.map(d => {
          const dt = new Date(d.date);
          return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}`;
        }),
        labels: { style: { colors: '#8892b0', fontSize: '11px' } }
      },
      fill: {
        colors: reversed.map(d => COULEURS_TYPE[d.typeCode] ?? '#6366f1')
      }
    };
  }

  couleurType(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }

  ouvrirEdition(): void {
    if (!this.joueur) return;
    const ref = this.dialog.open(JoueurFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
      data: this.joueur,
    });
    ref.afterClosed().subscribe(joueurMaj => {
      if (joueurMaj) this.joueur = joueurMaj;
    });
  }
}
