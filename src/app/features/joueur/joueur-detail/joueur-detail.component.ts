import { Component, OnInit, HostListener, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { JoueurService, Joueur, GpsPoint } from '@core/services/joueur.service';
import { PredictionService, NiveauFatigue } from '@core/services/prediction.service';
import { PeseesService, Pesee } from '@core/services/pesees.service';
import { Blessure, BlessureService } from '@core/services/blessure.service';
import { RtpEtape, BlessureSuiviService } from '@core/services/blessure-suivi.service';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTabGroup, MatTab, MatTabContent } from '@angular/material/tabs';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatFooterCellDef, MatFooterCell, MatFooterRowDef, MatFooterRow } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { BadgeRisqueComponent } from '@shared/components/badge-risque/badge-risque.component';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis, ApexFill, ApexStroke, ApexMarkers } from 'ng-apexcharts';
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

  // ── Parcours médical (blessure active + protocole de reprise) ──
  blessureActive: Blessure | null = null;
  rtpEtapes: RtpEtape[] = [];
  readonly PARCOURS: { statut: string; label: string }[] = [
    { statut: 'INDISPONIBLE', label: 'Indisponible' },
    { statut: 'EN_REPRISE',   label: 'En reprise' },
    { statut: 'RETABLI',      label: 'Rétabli' },
  ];

  get parcoursIndex(): number {
    return this.blessureActive ? this.PARCOURS.findIndex(p => p.statut === this.blessureActive!.statut) : -1;
  }
  get rtpProgression(): number {
    if (this.rtpEtapes.length === 0) return 0;
    return Math.round(this.rtpEtapes.filter(e => e.statut === 'VALIDEE').length / this.rtpEtapes.length * 100);
  }
  get rtpEtapeCourante(): RtpEtape | null {
    return this.rtpEtapes.find(e => e.statut === 'EN_COURS')
      ?? this.rtpEtapes.find(e => e.statut === 'A_FAIRE')
      ?? null;
  }

  gpsData: GpsPoint[] = [];
  gpsLoading = true;

  pesees: Pesee[] = [];
  poidsExpanded = false;

  poidsChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    stroke: ApexStroke;
    markers: ApexMarkers;
    tooltip: ApexTooltip;
    yaxis: ApexYAxis;
    dataLabels: ApexDataLabels;
    colors: string[];
  } = {
    series: [],
    chart: { type: 'line', height: 220, toolbar: { show: false }, background: 'transparent' },
    xaxis: { categories: [] },
    stroke: { curve: 'smooth', width: [3, 2], dashArray: [0, 6] },
    markers: { size: [4, 0] },
    tooltip: { theme: 'light', y: { formatter: (v: number) => `${v.toFixed(1)} kg` } },
    yaxis: { labels: { formatter: (v: number) => `${v.toFixed(0)} kg` } },
    dataLabels: { enabled: false },
    colors: ['#6366f1', '#16a34a'],
  };

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

  get alerteSurpoids(): { ecart: number; pointsRisque: number; plafonne: boolean } | null {
    if (!this.joueur?.poidsActuel || !this.joueur?.poidsFormeCible) return null;
    const ecart = Number(this.joueur.poidsActuel) - Number(this.joueur.poidsFormeCible);
    if (ecart < 2) return null;
    const pointsRisque = Math.min(Math.round(ecart * 5), 20);
    return { ecart: Math.round(ecart * 10) / 10, pointsRisque, plafonne: ecart * 5 >= 20 };
  }

  get imc(): { valeur: number; categorie: string; classe: string } | null {
    if (!this.joueur?.poidsActuel || !this.joueur?.taille) return null;
    const tailleM = Number(this.joueur.taille) / 100;
    const valeur  = Number(this.joueur.poidsActuel) / (tailleM * tailleM);
    let categorie: string;
    let classe: string;
    if (valeur < 18.5)      { categorie = 'Insuffisance pondérale'; classe = 'imc-bas'; }
    else if (valeur < 25)   { categorie = 'Poids normal';           classe = 'imc-normal'; }
    else if (valeur < 30)   { categorie = 'Surpoids';               classe = 'imc-surpoids'; }
    else                    { categorie = 'Obésité';                 classe = 'imc-obesite'; }
    return { valeur: Math.round(valeur * 10) / 10, categorie, classe };
  }

  get age(): string {
    if (!this.joueur?.dateNaissance) return '—';
    const birth = new Date(this.joueur.dateNaissance);
    const today = new Date();
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return `${a} ans`;
  }

  colonnesGps = ['date', 'type', 'duree', 'distance', 'ratioReel', 'distAttendue', 'statut', 'dist19', 'dist28', 'sprint', 'vitesseMax', 'accelerations', 'freinages'];

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
  get totalFreinages():     number { return this.gpsDataEnriched.reduce((s, d) => s + (d.nbFreinages ?? 0), 0); }
  get totalDist19Km():      number { return this.gpsDataEnriched.reduce((s, d) => s + (d.distance19kmhM ?? 0), 0) / 1000; }
  get totalDist28Km():      number { return this.gpsDataEnriched.reduce((s, d) => s + (d.distanceSprint28kmhM ?? 0), 0) / 1000; }

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

    // Les séances ARRET_INTEMPERIE sont exclues du calcul de baseline
    const baseline = source.filter(d =>
      d.conditionsMeteo !== 'ARRET_INTEMPERIE' &&
      d.distanceTotaleM && d.dureeMinutes && d.dureeMinutes > 0
    );
    const ratios   = baseline.map(d => d.distanceTotaleM! / d.dureeMinutes!);
    const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

    return source.map(d => {
      const ratioReel = (d.distanceTotaleM && d.dureeMinutes && d.dureeMinutes > 0)
        ? d.distanceTotaleM / d.dureeMinutes : null;

      if (d.conditionsMeteo === 'ARRET_INTEMPERIE') {
        return { ...d, ratioReel, distAttendue: null, statut: 'NON_COMPARABLE' };
      }

      const correcteur  = this.correcteurConditions(d);
      const distAttendue = (avgRatio !== null && d.dureeMinutes)
        ? avgRatio * d.dureeMinutes * correcteur : null;

      let statut = 'SANS_BASELINE';
      if (ratioReel !== null && distAttendue && distAttendue > 0 && d.distanceTotaleM) {
        const pct = ((d.distanceTotaleM - distAttendue) / distAttendue) * 100;
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
    return ({
      SOUS_NORME:     'statut-sous',
      DANS_NORME:     'statut-dans',
      SUR_NORME:      'statut-sur',
      SANS_BASELINE:  'statut-sans',
      NON_COMPARABLE: 'statut-nc',
    } as Record<string, string>)[statut] ?? '';
  }

  statutLibelle(statut: string): string {
    return ({
      SOUS_NORME:     'Sous norme',
      DANS_NORME:     'Dans norme',
      SUR_NORME:      'Sur norme',
      SANS_BASELINE:  '—',
      NON_COMPARABLE: 'Non comparable',
    } as Record<string, string>)[statut] ?? statut;
  }

  private correcteurConditions(d: GpsPoint): number {
    let c = 1.0;
    if (d.temperature != null) {
      if (d.temperature > 32)      c = Math.min(c, 0.90);
      else if (d.temperature > 28) c = Math.min(c, 0.95);
    }
    if (d.conditionsMeteo === 'NEIGE')                                    c = Math.min(c, 0.88);
    else if (d.conditionsMeteo === 'PLUIE' || d.conditionsMeteo === 'VENT') c = Math.min(c, 0.97);
    return c;
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

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private joueurService = inject(JoueurService);
  private predictionService = inject(PredictionService);
  private peseesService = inject(PeseesService);
  private blessureService = inject(BlessureService);
  private blessureSuiviService = inject(BlessureSuiviService);
  private dialog = inject(MatDialog);

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

  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft' && this.joueurPrecedent) this.naviguerVers(this.joueurPrecedent);
    if (e.key === 'ArrowRight' && this.joueurSuivant)  this.naviguerVers(this.joueurSuivant);
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
    this.pesees    = [];
    this.blessureActive = null;
    this.rtpEtapes = [];
    this.gpsLoading = true;
    this.pageIndex  = 0;

    this.chargerParcoursMedical(id);

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

    this.peseesService.getByJoueur(id).subscribe({
      next: data => {
        this.pesees = [...data].reverse(); // du plus ancien au plus récent
        this.buildPoidsChart();
      },
      error: () => {}
    });
  }

  /** Blessure active du joueur (statut != RETABLI) + son protocole de reprise. */
  private chargerParcoursMedical(id: string): void {
    this.blessureService.lister(id).subscribe({
      next: blessures => {
        const active = blessures
          .filter(b => b.statut !== 'RETABLI')
          .sort((a, b) => (b.dateBlessure ?? '').localeCompare(a.dateBlessure ?? ''))[0] ?? null;
        this.blessureActive = active;
        if (active) {
          this.blessureSuiviService.listerRtp(active.id).subscribe({
            next: etapes => this.rtpEtapes = etapes,
            error: () => {},
          });
        }
      },
      error: () => {},
    });
  }

  private buildPoidsChart(): void {
    if (this.pesees.length === 0) return;
    const labels = this.pesees.map(p => {
      const d = new Date(p.date);
      return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
    });
    const valeurs = this.pesees.map(p => p.poids);
    const cible   = this.joueur?.poidsFormeCible;
    const series: ApexAxisChartSeries = [
      { name: 'Poids', data: valeurs },
      ...(cible ? [{ name: 'Poids cible', data: Array(valeurs.length).fill(Number(cible)) }] : []),
    ];
    this.poidsChartOptions = {
      ...this.poidsChartOptions,
      series,
      xaxis: { ...this.poidsChartOptions.xaxis, categories: labels },
    };
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
      panelClass: 'app-dialog',
      data: this.joueur,
    });
    ref.afterClosed().subscribe(joueurMaj => {
      if (joueurMaj) this.joueur = joueurMaj;
    });
  }
}
