import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { GpsPoint } from '@core/services/joueur.service';
import { couleurTheme } from '@core/services/theme.service';
import { MatIcon } from '@angular/material/icon';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis, ApexLegend } from 'ng-apexcharts';
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

/**
 * Vue « GPS & Charge » réutilisable : KPIs, graphe distance/séance, répartition par type
 * et tableau détaillé. Extraite de joueur-detail pour être partagée entre le profil joueur
 * et la future page « Charge de l'équipe ». Les filtres (période + type) sont gérés en interne
 * et émis via (periodeChange) pour permettre à un parent de re-fetcher si besoin.
 */
@Component({
  selector: 'app-charge-vue',
  standalone: true,
  templateUrl: './charge-vue.component.html',
  styleUrl: './charge-vue.component.scss',
  imports: [MatIcon, ChartComponent, DecimalPipe, DatePipe, FormsModule],
})
export class ChargeVueComponent implements OnChanges {

  @Input() gpsData: GpsPoint[] = [];
  @Input() gpsLoading = false;
  @Output() periodeChange = new EventEmitter<{ debut: string; fin: string }>();

  // Pagination
  pageIndex = 0;
  pageSize = 10;

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

  @ViewChild('gpsChart') private gpsChart?: ChartComponent;

  ngOnChanges(changes: SimpleChanges): void {
    // Nouveau jeu de données (ex. changement de joueur) → on réinitialise filtres,
    // pagination et période (dernier mois), comme le faisait le parent auparavant.
    if (changes['gpsData']) {
      this.filtreTypes = [];
      this.pageIndex = 0;
      this.definirDernierMois();
      this.buildChart();
    }
  }

  /** Cale la période sur le dernier mois contenant des données GPS. */
  private definirDernierMois(): void {
    if (this.gpsData.length === 0) return;
    const max = this.gpsData.map(d => d.date).sort().at(-1)!;   // ISO yyyy-mm-dd, plus récente
    this.filtreFin   = max;
    this.filtreDebut = max.slice(0, 8) + '01';                   // 1er jour du mois de la dernière séance
    this.emettrePeriode();
  }

  private emettrePeriode(): void {
    this.periodeChange.emit({ debut: this.filtreDebut, fin: this.filtreFin });
  }

  // ── Pagination ──
  get gpsDataPage() {
    return this.gpsDataEnriched.slice(
      this.pageIndex * this.pageSize,
      (this.pageIndex + 1) * this.pageSize
    );
  }

  get nbPagesGps(): number {
    return Math.max(1, Math.ceil(this.gpsDataEnriched.length / this.pageSize));
  }
  pagePrecedente(): void { if (this.pageIndex > 0) this.pageIndex--; }
  pageSuivante(): void   { if (this.pageIndex < this.nbPagesGps - 1) this.pageIndex++; }

  /** Tonalité du badge « charge relative » dans le tableau. */
  chargeTone(statut: string): string {
    if (statut === 'DANS_NORME') return 'tone-ok';
    if (statut === 'SOUS_NORME' || statut === 'SUR_NORME') return 'tone-warn';
    return '';
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

  /** Durée totale formatée « X h MM » (ou « N min »). */
  get dureeFormatee(): string {
    const m = Math.round(this.totalDuree);
    const h = Math.floor(m / 60), mm = m % 60;
    return h > 0 ? `${h} h ${mm.toString().padStart(2, '0')}` : `${mm} min`;
  }

  /** Total des sprints (> 24 km/h) sur la période. */
  get totalNbSprints(): number {
    return this.gpsDataEnriched.reduce((s, d) => s + (d.nbSprints24kmh ?? 0), 0);
  }

  /** Écart réalisé vs attendu (%) sur les séances comparables uniquement. */
  get pourcentageVsAttendu(): number | null {
    let real = 0, exp = 0;
    for (const d of this.gpsDataEnriched) {
      if (d.distAttendue != null && d.distanceTotaleM != null) { real += d.distanceTotaleM; exp += d.distAttendue; }
    }
    return exp > 0 ? (real / exp - 1) * 100 : null;
  }

  /** Répartition du volume (distance) par type de séance. */
  get repartitionTypes(): { libelle: string; couleur: string; km: number; pct: number }[] {
    const map = new Map<string, { libelle: string; couleur: string; m: number }>();
    for (const d of this.gpsDataEnriched) {
      const cur = map.get(d.typeCode) ?? { libelle: d.typeLibelle, couleur: this.couleurType(d.typeCode), m: 0 };
      cur.m += d.distanceTotaleM ?? 0;
      map.set(d.typeCode, cur);
    }
    const arr = [...map.values()];
    const max = Math.max(1, ...arr.map(a => a.m));
    return arr.sort((a, b) => b.m - a.m)
      .map(a => ({ libelle: a.libelle, couleur: a.couleur, km: a.m / 1000, pct: (a.m / max) * 100 }));
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
    // Baseline par TYPE de séance, calculée sur tout l'historique du joueur (indépendante
    // de la période affichée) : moyenne des 10 séances les plus récentes du même type,
    // hors séance courante. Aligné sur le rapport par séance (pas de correction météo).
    const histByType = new Map<string, { seanceId: string; date: string; ratio: number }[]>();
    for (const d of this.gpsData) {
      if (d.distanceTotaleM && d.dureeMinutes && d.dureeMinutes > 0) {
        const arr = histByType.get(d.typeCode) ?? [];
        arr.push({ seanceId: d.seanceId, date: d.date, ratio: d.distanceTotaleM / d.dureeMinutes });
        histByType.set(d.typeCode, arr);
      }
    }
    for (const arr of histByType.values()) arr.sort((a, b) => b.date.localeCompare(a.date));

    return this.gpsDataFiltre.map(d => {
      const ratioReel = (d.distanceTotaleM && d.dureeMinutes && d.dureeMinutes > 0)
        ? d.distanceTotaleM / d.dureeMinutes : null;

      const peers = (histByType.get(d.typeCode) ?? [])
        .filter(p => p.seanceId !== d.seanceId).slice(0, 10);
      const avgRatio = peers.length ? peers.reduce((s, p) => s + p.ratio, 0) / peers.length : null;
      const distAttendue = (avgRatio !== null && d.dureeMinutes) ? avgRatio * d.dureeMinutes : null;

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
    this.buildChart();
  }

  onFiltreChange(): void {
    this.pageIndex = 0;
    this.emettrePeriode();
    this.buildChart();
  }

  resetFiltres(): void {
    this.filtreTypes = [];
    this.definirDernierMois();   // revient au dernier mois, pas à toute la saison
    this.pageIndex   = 0;
    this.buildChart();
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

  /** Métadonnées par barre pour le tooltip personnalisé (réalisée / attendue / ratio). */
  private chartMeta: { type: string; date: string; dist: string; att: string; ratio: string }[] = [];

  chartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    plotOptions: ApexPlotOptions;
    dataLabels: ApexDataLabels;
    tooltip: ApexTooltip;
    yaxis: ApexYAxis;
    legend: ApexLegend;
    colors: string[];
  } = {
    series: [],
    chart: { type: 'bar', height: 300, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', foreColor: '#8892b0' },
    xaxis: { categories: [], labels: { style: { colors: '#8892b0', fontSize: '11px' } } },
    yaxis: { labels: { formatter: (v: number) => `${(v / 1000).toFixed(1)} km`, style: { colors: '#8892b0' } } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '55%', distributed: true } },
    dataLabels: { enabled: false },
    legend: { show: false },
    colors: [couleurTheme()],
    // Barres colorées par type ; l'attendue reste consultable au survol.
    tooltip: {
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const m = this.chartMeta[dataPointIndex];
        if (!m) return '';
        const row = (l: string, v: string, b = false) =>
          `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;color:#fff"><span style="color:rgba(255,255,255,.6);font-weight:600">${l}</span><span style="font-weight:${b ? 800 : 700}">${v}</span></div>`;
        return `<div style="padding:10px 13px;background:#0f172a;border-radius:12px;font-family:Manrope,system-ui,sans-serif;min-width:160px">
          <div style="font-size:12px;font-weight:800;color:#fff;margin-bottom:8px">${m.type} <span style="color:rgba(255,255,255,.55);font-weight:600;margin-left:4px">${m.date}</span></div>
          ${row('Réalisée', m.dist, true)}${row('Attendue', m.att)}${row('Ratio', m.ratio)}
        </div>`;
      }
    }
  };

  /** Graphe « Distance par séance » : barres colorées par type (attendue au survol), respectant les filtres. */
  private buildChart(): void {
    const rows = [...this.gpsDataEnriched].reverse(); // ordre chronologique
    this.chartMeta = rows.map(d => ({
      type: d.typeLibelle,
      date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      dist: Math.round(d.distanceTotaleM ?? 0).toLocaleString('fr-FR') + ' m',
      att: d.distAttendue != null ? Math.round(d.distAttendue).toLocaleString('fr-FR') + ' m' : '—',
      ratio: d.ratioReel != null ? Math.round(d.ratioReel) + ' m/min' : '—',
    }));
    const series: ApexAxisChartSeries = [{ name: 'Distance', data: rows.map(d => Math.round(d.distanceTotaleM ?? 0)) }];
    const colors = rows.map(d => this.couleurType(d.typeCode));
    const categories = rows.map(d => {
      const dt = new Date(d.date);
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
    });
    this.chartOptions = {
      ...this.chartOptions,
      series,
      colors,
      xaxis: { categories, labels: { style: { colors: '#8892b0', fontSize: '11px' } } },
    };
    // Force la mise à jour même si le graphe vient juste d'être rendu.
    this.gpsChart?.updateOptions({ series, colors, xaxis: { categories } }, false, false);
  }

  couleurType(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }
}
