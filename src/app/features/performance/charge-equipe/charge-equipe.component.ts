import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis, ApexLegend } from 'ng-apexcharts';
import { PredictionService, ChargeEquipe, ChargeSeance, ChargeJoueur, ObjectifHebdo, ObjectifHebdoJoueur,
  Simulation, SimulationJoueur, ZoneAcwr } from '@core/services/prediction.service';
import { SeanceService, TypeSeance } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { couleurTheme } from '@core/services/theme.service';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';
import { BriefingCardComponent } from '@shared/components/briefing-card/briefing-card.component';

/**
 * Scénarios de simulation. Un seul aujourd'hui ; la liste est le point d'extension prévu
 * (semaine complète, retour de blessure, ajout d'un match…) — tous sous le même add-on
 * `assistant_simulation`, chacun avec sa propre route back.
 */
type CodeScenario = 'seance';
interface Scenario { code: CodeScenario; libelle: string; description: string; }

const COULEURS_TYPE: Record<string, string> = {
  MATCH:        '#ef4444',
  MATCH_AMICAL: '#f97316',
  INTENSIF:     '#6366f1',
  TECHNIQUE:    '#0ea5a0',
  REPRISE:      '#22c55e',
  PRE_MATCH:    '#eab308',
  FORCE:        '#8b5cf6',
};

type TriCol = 'distance_totale_m' | 'distance_attendue_m' | 'delta_pct' | 'ratio_reel'
  | 'duree_minutes' | 'nb_sprints' | 'vitesse_max' | 'nb_seances';

@Component({
  selector: 'app-charge-equipe',
  standalone: true,
  templateUrl: './charge-equipe.component.html',
  styleUrl: './charge-equipe.component.scss',
  imports: [MatIcon, ChartComponent, DecimalPipe, DatePipe, FormsModule, InfoHintComponent, BriefingCardComponent],
})
export class ChargeEquipeComponent implements OnInit {

  private predictionService = inject(PredictionService);
  private seanceService = inject(SeanceService);
  private auth = inject(AuthService);

  data: ChargeEquipe | null = null;
  loading = true;

  /** Panneau « Objectif de la semaine » — toujours la semaine en cours, indépendant du filtre. */
  objectif: ObjectifHebdo | null = null;
  editObjectif = false;
  objectifInputKm: number | null = null;
  majObjLoading = false;

  /**
   * Onglet actif : Objectif = semaine en cours (sans filtre) ; Charge / Par séance = analyse filtrée ;
   * Simulation = projection d'une séance à venir (add-on, masqué sans la permission).
   */
  onglet: 'objectif' | 'charge' | 'seance' | 'simulation' = 'charge';

  // ── Onglet Simulation (add-on `assistant_simulation`) ──
  readonly SCENARIOS: Scenario[] = [
    { code: 'seance', libelle: 'Une séance',
      description: "Projette une séance à venir sur l'effectif : distance attendue par joueur (d'après son historique sur ce type de séance) et impact sur son ACWR." },
  ];
  scenario: CodeScenario = 'seance';

  typesSeance: TypeSeance[] = [];
  simTypeId: string | null = null;
  simDuree = 90;
  simulation: Simulation | null = null;
  simLoading = false;
  simErreur: string | null = null;
  simNote: string | null = null;
  simNoteSource: 'IA' | 'GABARIT' | null = null;
  simNoteLoading = false;

  /** Pagination + recherche par nom (panneau objectif, détail par séance, classement joueurs). */
  readonly TAILLE_PAGE = 12;
  objSearch = '';    objPage = 0;
  joueurSearch = ''; joueurPage = 0;
  seancePage = 0;

  filtreDebut = '';
  filtreFin   = '';
  filtreTypes: string[] = [];
  /** Raccourci de période actif (chips 7/14/21/30 j) ; null = fenêtre personnalisée. */
  raccourciJours: 7 | 14 | 21 | 30 | null = 7;
  readonly RACCOURCIS: (7 | 14 | 21 | 30)[] = [7, 14, 21, 30];

  vue: 'equipe' | 'joueurs' = 'equipe';

  triCol: TriCol = 'distance_totale_m';
  triDesc = true;

  readonly TYPES_GPS = [
    { code: 'MATCH',        libelle: 'Match',        couleur: '#ef4444' },
    { code: 'MATCH_AMICAL', libelle: 'Match amical', couleur: '#f97316' },
    { code: 'INTENSIF',     libelle: 'Intensif',     couleur: '#6366f1' },
    { code: 'TECHNIQUE',    libelle: 'Technique',    couleur: '#0ea5a0' },
    { code: 'REPRISE',      libelle: 'Reprise',      couleur: '#22c55e' },
    { code: 'PRE_MATCH',    libelle: 'Pré-match',    couleur: '#eab308' },
    { code: 'FORCE',        libelle: 'Force',        couleur: '#8b5cf6' },
  ];

  @ViewChild('equipeChart') private equipeChart?: ChartComponent;

  ngOnInit(): void {
    this.appliquerJours(this.raccourciJours ?? 7);
    this.charger();
    this.chargerObjectif();
    if (this.peutSimuler) {
      this.seanceService.getTypeSeances().subscribe({
        next: t => this.typesSeance = t ?? [],
        error: () => this.typesSeance = [],
      });
    }
  }

  // ── Simulation ──

  /** L'onglet n'existe que si l'add-on est actif ET la permission accordée. */
  get peutSimuler(): boolean { return this.auth.has('prepa_ia:simulation'); }

  choisirScenario(code: CodeScenario): void {
    this.scenario = code;
    this.reinitSimulation();
  }

  private reinitSimulation(): void {
    this.simulation = null;
    this.simErreur = null;
    this.simNote = null;
    this.simNoteSource = null;
  }

  /** Sélectionne un type de séance et pré-remplit la durée avec sa durée théorique si connue. */
  onTypeSimulationChange(): void {
    const t = this.typesSeance.find(x => x.id === this.simTypeId);
    const theorique = t?.dureeTheoriqueMin;
    if (theorique && theorique > 0) this.simDuree = theorique;
    this.reinitSimulation();
  }

  lancerSimulation(): void {
    if (this.simDuree <= 0) { this.simErreur = 'Indique une durée supérieure à 0.'; return; }
    this.simLoading = true;
    this.reinitSimulation();
    this.predictionService.simulerSeance({ typeSeanceId: this.simTypeId, dureeMinutes: this.simDuree }).subscribe({
      next: s => { this.simulation = s; this.simLoading = false; },
      error: () => {
        this.simLoading = false;
        this.simErreur = "Simulation impossible pour l'instant. Réessaie dans un moment.";
      },
    });
  }

  genererNoteSimulation(): void {
    this.simNoteLoading = true;
    this.predictionService.genererSimulationNote({ typeSeanceId: this.simTypeId, dureeMinutes: this.simDuree })
      .subscribe({
        next: b => { this.simNote = b.texte; this.simNoteSource = b.source; this.simNoteLoading = false; },
        error: () => { this.simNoteLoading = false; this.simNote = null; },
      });
  }

  /** Joueurs de la simulation : ceux qui basculent d'abord, puis par ACWR projeté décroissant. */
  get simJoueurs(): SimulationJoueur[] {
    return [...(this.simulation?.joueurs ?? [])].sort((a, b) => {
      if (a.bascule !== b.bascule) return a.bascule ? -1 : 1;
      return (b.acwr_apres ?? -1) - (a.acwr_apres ?? -1);
    });
  }

  zoneLibelle(z: ZoneAcwr | null): string {
    return ({ SOUS_CHARGE: 'Sous-charge', OPTIMALE: 'Optimale', SURCHARGE: 'Surcharge' } as Record<string, string>)[z ?? ''] ?? '—';
  }

  zoneTone(z: ZoneAcwr | null): string {
    if (z === 'SURCHARGE') return 'tone-alert';
    if (z === 'SOUS_CHARGE') return 'tone-warn';
    if (z === 'OPTIMALE') return 'tone-ok';
    return '';
  }

  private iso(d: Date): string {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /** Cale la fenêtre sur les N derniers jours (N inclus, se terminant aujourd'hui). */
  private appliquerJours(jours: number): void {
    const today = new Date();
    const debut = new Date(today); debut.setDate(today.getDate() - (jours - 1));
    this.filtreFin   = this.iso(today);
    this.filtreDebut = this.iso(debut);
  }

  /** Raccourci de période (chips 7/14/21/30 j). */
  setRaccourci(jours: 7 | 14 | 21 | 30): void {
    this.raccourciJours = jours;
    this.appliquerJours(jours);
    this.charger();
  }

  charger(): void {
    this.loading = true;
    this.predictionService.getChargeEquipe(this.filtreDebut, this.filtreFin, this.filtreTypes).subscribe({
      next: d => { this.data = d; this.loading = false; this.buildChart(); },
      error: () => { this.data = { seances: [], joueurs: [] }; this.loading = false; },
    });
  }

  // ── Objectif de la semaine (semaine en cours, indépendant du filtre) ──
  chargerObjectif(): void {
    this.predictionService.getObjectifHebdo().subscribe({
      next: o => this.objectif = o,
      error: () => this.objectif = null,
    });
  }

  ouvrirEditObjectif(): void {
    const m = this.objectif?.objectif_distance_m;
    this.objectifInputKm = m != null ? Math.round(m / 100) / 10 : null;
    this.editObjectif = true;
  }
  annulerEditObjectif(): void { this.editObjectif = false; }

  enregistrerObjectif(): void {
    const km = this.objectifInputKm;
    const m = km != null && km > 0 ? Math.round(km * 1000) : null;
    this.majObjLoading = true;
    this.predictionService.setObjectifHebdo(m).subscribe({
      next: () => { this.majObjLoading = false; this.editObjectif = false; this.chargerObjectif(); },
      error: () => { this.majObjLoading = false; },
    });
  }

  effacerObjectif(): void {
    this.majObjLoading = true;
    this.predictionService.setObjectifHebdo(null).subscribe({
      next: () => { this.majObjLoading = false; this.editObjectif = false; this.chargerObjectif(); },
      error: () => { this.majObjLoading = false; },
    });
  }

  /** Joueurs triés : ceux qui ont encore de la marge d'abord (reste décroissant), atteints ensuite. */
  get objJoueursTries(): ObjectifHebdoJoueur[] {
    return [...(this.objectif?.joueurs ?? [])].sort((a, b) => (b.reste_m ?? -1) - (a.reste_m ?? -1));
  }

  // ── Pagination + recherche par nom ──
  private page<T>(items: T[], p: number): T[] {
    const max = Math.max(0, Math.ceil(items.length / this.TAILLE_PAGE) - 1);
    const cur = Math.min(Math.max(0, p), max);
    return items.slice(cur * this.TAILLE_PAGE, (cur + 1) * this.TAILLE_PAGE);
  }
  private nbPages(n: number): number { return Math.max(1, Math.ceil(n / this.TAILLE_PAGE)); }
  private matchNom(prenom: string, nom: string, q: string): boolean {
    return `${prenom} ${nom}`.toLowerCase().includes(q.trim().toLowerCase());
  }

  // Panneau objectif
  get objJoueursFiltres(): ObjectifHebdoJoueur[] {
    const q = this.objSearch.trim();
    return q ? this.objJoueursTries.filter(j => this.matchNom(j.prenom, j.nom, q)) : this.objJoueursTries;
  }
  get objNbPages(): number { return this.nbPages(this.objJoueursFiltres.length); }
  get objJoueursPage(): ObjectifHebdoJoueur[] { return this.page(this.objJoueursFiltres, this.objPage); }
  objPagePrec(): void { if (this.objPage > 0) this.objPage--; }
  objPageSuiv(): void { if (this.objPage < this.objNbPages - 1) this.objPage++; }
  onObjSearch(): void { this.objPage = 0; }

  // Détail par séance (vue équipe)
  get seanceNbPages(): number { return this.nbPages(this.seances.length); }
  get seancesPage(): ChargeSeance[] { return this.page(this.seances, this.seancePage); }
  seancePagePrec(): void { if (this.seancePage > 0) this.seancePage--; }
  seancePageSuiv(): void { if (this.seancePage < this.seanceNbPages - 1) this.seancePage++; }

  // Classement par joueur
  get joueursFiltres(): ChargeJoueur[] {
    const q = this.joueurSearch.trim();
    return q ? this.joueursTriees.filter(j => this.matchNom(j.prenom, j.nom, q)) : this.joueursTriees;
  }
  get joueurNbPages(): number { return this.nbPages(this.joueursFiltres.length); }
  get joueurPageOffset(): number { return Math.min(Math.max(0, this.joueurPage), this.joueurNbPages - 1) * this.TAILLE_PAGE; }
  get joueursPage(): ChargeJoueur[] { return this.page(this.joueursFiltres, this.joueurPage); }
  joueurPagePrec(): void { if (this.joueurPage > 0) this.joueurPage--; }
  joueurPageSuiv(): void { if (this.joueurPage < this.joueurNbPages - 1) this.joueurPage++; }
  onJoueurSearch(): void { this.joueurPage = 0; }

  onFiltreChange(): void { this.raccourciJours = null; this.charger(); }

  toggleFiltreType(code: string): void {
    const i = this.filtreTypes.indexOf(code);
    if (i >= 0) this.filtreTypes.splice(i, 1);
    else this.filtreTypes.push(code);
    this.charger();
  }

  resetFiltres(): void {
    this.raccourciJours = 7;
    this.appliquerJours(7);
    this.filtreTypes = [];
    this.charger();
  }

  setVue(v: 'equipe' | 'joueurs'): void { this.vue = v; }

  // ── Accès données ──
  get seances(): ChargeSeance[] { return this.data?.seances ?? []; }
  get joueurs(): ChargeJoueur[] { return this.data?.joueurs ?? []; }

  // ── KPIs équipe (sur la période) ──
  private somme(sel: (s: ChargeSeance) => number | null): number {
    return this.seances.reduce((t, s) => t + (sel(s) ?? 0), 0);
  }
  get totalDistanceKm():    number { return this.somme(s => s.distance_totale_m) / 1000; }
  get totalAttendueKm():    number { return this.somme(s => s.distance_attendue_m) / 1000; }
  get totalDist19Km():      number { return this.somme(s => s.distance_19kmh_m) / 1000; }
  get totalDist28Km():      number { return this.somme(s => s.distance_28kmh_m) / 1000; }
  get totalSprints():       number { return this.somme(s => s.nb_sprints); }
  get totalAccelerations(): number { return this.somme(s => s.nb_accelerations); }
  get totalFreinages():     number { return this.somme(s => s.nb_freinages); }
  get nbSeances():          number { return this.seances.length; }

  get totalDureeMoy(): number {
    // Somme des durées moyennes par séance (minutes-joueur typiques cumulées).
    return this.somme(s => s.duree_minutes);
  }
  get dureeFormatee(): string {
    const m = Math.round(this.totalDureeMoy);
    const h = Math.floor(m / 60), mm = m % 60;
    return h > 0 ? `${h} h ${mm.toString().padStart(2, '0')}` : `${mm} min`;
  }

  get ratioMoyen(): number | null {
    const valides = this.seances.filter(s => s.ratio_reel != null);
    return valides.length ? valides.reduce((t, s) => t + (s.ratio_reel as number), 0) / valides.length : null;
  }
  get maxVitesse(): number | null {
    const valides = this.seances.filter(s => s.vitesse_max != null);
    return valides.length ? Math.max(...valides.map(s => s.vitesse_max as number)) : null;
  }

  get pourcentageVsAttendu(): number | null {
    const real = this.somme(s => s.distance_totale_m);
    const exp  = this.somme(s => s.distance_attendue_m);
    return exp > 0 ? (real / exp - 1) * 100 : null;
  }

  /** Répartition du volume par type de séance. */
  get repartitionTypes(): { libelle: string; couleur: string; km: number; pct: number }[] {
    const map = new Map<string, { libelle: string; couleur: string; m: number }>();
    for (const s of this.seances) {
      const cur = map.get(s.type_code) ?? { libelle: s.type_libelle, couleur: this.couleurType(s.type_code), m: 0 };
      cur.m += s.distance_totale_m ?? 0;
      map.set(s.type_code, cur);
    }
    const arr = [...map.values()];
    const max = Math.max(1, ...arr.map(a => a.m));
    return arr.sort((a, b) => b.m - a.m)
      .map(a => ({ libelle: a.libelle, couleur: a.couleur, km: a.m / 1000, pct: (a.m / max) * 100 }));
  }

  // ── Classement joueurs (tri) ──
  get joueursTriees(): ChargeJoueur[] {
    const dir = this.triDesc ? -1 : 1;
    const col = this.triCol;
    return [...this.joueurs].sort((a, b) => {
      const va = (a[col] ?? 0) as number, vb = (b[col] ?? 0) as number;
      return va === vb ? 0 : (va < vb ? -1 : 1) * dir;
    });
  }

  trier(col: TriCol): void {
    if (this.triCol === col) this.triDesc = !this.triDesc;
    else { this.triCol = col; this.triDesc = true; }
  }

  // ── Statut / couleurs ──
  couleurType(code: string): string { return COULEURS_TYPE[code] ?? '#6366f1'; }

  chargeTone(statut: string): string {
    if (statut === 'DANS_NORME') return 'tone-ok';
    if (statut === 'SOUS_NORME' || statut === 'SUR_NORME') return 'tone-warn';
    return '';
  }
  statutLibelle(statut: string): string {
    return ({
      SOUS_NORME: 'Sous norme', DANS_NORME: 'Dans norme',
      SUR_NORME: 'Sur norme', SANS_BASELINE: '—',
    } as Record<string, string>)[statut] ?? statut;
  }

  // ── Graphe « Distance d'équipe par séance » ──
  private chartMeta: { type: string; date: string; dist: string; att: string }[] = [];

  chartOptions: {
    series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis;
    plotOptions: ApexPlotOptions; dataLabels: ApexDataLabels; tooltip: ApexTooltip;
    yaxis: ApexYAxis; legend: ApexLegend; colors: string[];
  } = {
    series: [],
    chart: { type: 'bar', height: 300, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', foreColor: '#8892b0' },
    xaxis: { categories: [], labels: { style: { colors: '#8892b0', fontSize: '11px' } } },
    yaxis: { labels: { formatter: (v: number) => `${(v / 1000).toFixed(1)} km`, style: { colors: '#8892b0' } } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '55%', distributed: true } },
    dataLabels: { enabled: false },
    legend: { show: false },
    colors: [couleurTheme()],
    tooltip: {
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const m = this.chartMeta[dataPointIndex];
        if (!m) return '';
        const row = (l: string, v: string, b = false) =>
          `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;color:#fff"><span style="color:rgba(255,255,255,.6);font-weight:600">${l}</span><span style="font-weight:${b ? 800 : 700}">${v}</span></div>`;
        return `<div style="padding:10px 13px;background:#0f172a;border-radius:12px;font-family:Manrope,system-ui,sans-serif;min-width:160px">
          <div style="font-size:12px;font-weight:800;color:#fff;margin-bottom:8px">${m.type} <span style="color:rgba(255,255,255,.55);font-weight:600;margin-left:4px">${m.date}</span></div>
          ${row('Réalisée', m.dist, true)}${row('Attendue', m.att)}
        </div>`;
      }
    }
  };

  private buildChart(): void {
    const rows = this.seances;
    this.chartMeta = rows.map(s => ({
      type: s.type_libelle,
      date: new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      dist: Math.round(s.distance_totale_m).toLocaleString('fr-FR') + ' m',
      att: s.distance_attendue_m != null ? Math.round(s.distance_attendue_m).toLocaleString('fr-FR') + ' m' : '—',
    }));
    const series: ApexAxisChartSeries = [{ name: 'Distance', data: rows.map(s => Math.round(s.distance_totale_m)) }];
    const colors = rows.map(s => this.couleurType(s.type_code));
    const categories = rows.map(s => {
      const dt = new Date(s.date);
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
    });
    this.chartOptions = { ...this.chartOptions, series, colors, xaxis: { categories, labels: { style: { colors: '#8892b0', fontSize: '11px' } } } };
    this.equipeChart?.updateOptions({ series, colors, xaxis: { categories } }, false, false);
  }
}
