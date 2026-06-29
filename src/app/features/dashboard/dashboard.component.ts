import { Component, OnInit, inject, isDevMode } from '@angular/core';
import { PredictionService, ResumeJoueur } from '@core/services/prediction.service';
import { PeseesService, PoidsFicheJoueur } from '@core/services/pesees.service';
import { JoueurService, Joueur, AssiduiteJoueur } from '@core/services/joueur.service';
import { TechniqueService, JoueurCompoStats } from '@core/services/technique.service';
import { DecimalPipe, DatePipe, SlicePipe } from '@angular/common';
import { SeanceService, Seance, ResumeAppel } from '@core/services/seance.service';
import { Router, RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { JoueurFormDialogComponent } from '../joueur/joueur-form-dialog/joueur-form-dialog.component';
import { JoueurSupprimerDialogComponent } from '../joueur/joueur-supprimer-dialog/joueur-supprimer-dialog.component';
import { PresenceDialogComponent } from '../performance/presence-dialog/presence-dialog.component';
import { ApexChart, ApexAxisChartSeries, ApexXAxis, ApexStroke, ApexDataLabels, ApexTitleSubtitle, ApexTheme, ApexGrid, ApexYAxis, ApexFill, ApexMarkers, ChartComponent } from 'ng-apexcharts';
import { MatIcon } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { PageEvent } from '@angular/material/paginator';
import { AuthService } from '@core/services/auth.service';
import { DateSimuleeService } from '@core/services/date-simulee.service';
import { DashboardPreparateurComponent } from './dashboard-preparateur/dashboard-preparateur.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  standalone: true,
  styleUrl: './dashboard.component.scss',
  imports: [
    MatIcon, ChartComponent, FormsModule, DecimalPipe, DatePipe, SlicePipe,
    DashboardPreparateurComponent, RouterLink,
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
  /** Résumé d'appel par séance (effectif/dispo/présents…), pour la card du jour + pastille « X/Y dispo ». */
  resumesAppel = new Map<string, ResumeAppel>();
  readonly aujourdhui = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  readonly demain = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // ── Panel joueur ──
  panelJoueur: Joueur | null = null;
  panelResume: ResumeJoueur | null = null;
  panelStats: JoueurCompoStats | null = null;
  panelAssiduite: AssiduiteJoueur | null = null;
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

  /* ── Filtre statut de l'effectif ── */
  filtreStatut: 'tous' | 'actif' | 'blesse' | 'suspendu' | 'prete' | 'inactif' = 'tous';
  readonly filtresStatut: { key: typeof DashboardComponent.prototype.filtreStatut; label: string }[] = [
    { key: 'tous',     label: 'Tous' },
    { key: 'actif',    label: 'Actif' },
    { key: 'blesse',   label: 'Blessé' },
    { key: 'suspendu', label: 'Suspendu' },
    { key: 'prete',    label: 'Prêté' },
    { key: 'inactif',  label: 'Inactif' },
  ];

  get effectifFiltre(): ResumeJoueur[] {
    const q = this.recherche.trim().toLowerCase();
    return this.joueurs.filter(j => {
      const st = this.statutMap.get(j.joueur_id) ?? 'actif';
      if (this.filtreStatut !== 'tous' && st !== this.filtreStatut) return false;
      if (q && !`${j.prenom} ${j.nom}`.toLowerCase().includes(q)
            && !`${j.nom} ${j.prenom}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  /** Couleur pastel déterministe d'un avatar, dérivée d'une clé (id joueur). */
  private readonly AVATAR_PALETTE = [
    { bg: '#dbeafe', fg: '#1d4ed8' }, { bg: '#dcfce7', fg: '#15803d' },
    { bg: '#cffafe', fg: '#0e7490' }, { bg: '#fce7f3', fg: '#be185d' },
    { bg: '#ede9fe', fg: '#6d28d9' }, { bg: '#fef3c7', fg: '#b45309' },
    { bg: '#ffedd5', fg: '#c2410c' }, { bg: '#e0e7ff', fg: '#4338ca' },
  ];
  avatarColor(key: string): { bg: string; fg: string } {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return this.AVATAR_PALETTE[h % this.AVATAR_PALETTE.length];
  }

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

  /* ── Séances groupées par jour (Aujourd'hui / Demain / date) ── */
  get totalSeances(): number {
    return this.seancesAujourdhui.length + this.seancesAVenir.length;
  }

  get seancesParJour(): { date: string; label: string | null; seances: Seance[] }[] {
    const all = [...this.seancesAujourdhui, ...this.seancesAVenir];
    const groups = new Map<string, Seance[]>();
    for (const s of all) {
      if (!groups.has(s.date)) groups.set(s.date, []);
      groups.get(s.date)!.push(s);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, seances]) => ({
        date,
        label: date === this.aujourdhui ? "Aujourd'hui" : date === this.demain ? 'Demain' : null,
        seances,
      }));
  }

  /** Couleur (texte / fond) d'un chip de type de séance, d'après le libellé. */
  couleurType(s: Seance): { bg: string; fg: string } {
    const t = `${s.typeSeance?.code ?? ''} ${s.typeSeance?.libelle ?? ''}`.toLowerCase();
    if (t.includes('match'))                       return { fg: '#ef4444', bg: '#ef444418' }; // rouge
    if (t.includes('muscu') || t.includes('force')) return { fg: '#d97706', bg: '#f59e0b18' }; // orange
    if (t.includes('récup') || t.includes('recup')) return { fg: '#0ea5e9', bg: '#0ea5e918' }; // bleu
    if (t.includes('vidéo') || t.includes('video')) return { fg: '#7c3aed', bg: '#7c3aed18' }; // violet
    if (t.includes('soin') || t.includes('méd') || t.includes('med')) return { fg: '#ec4899', bg: '#ec489918' }; // rose
    if (t.includes('intensif'))                    return { fg: '#6366f1', bg: '#6366f118' }; // indigo
    return { fg: '#0ea5a0', bg: '#0ea5a018' };                                                // teal (entraînement / défaut)
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
    fill: ApexFill;
    markers: ApexMarkers;
  } = {
    series:     [{ name: 'Charge équipe (km)', data: [0, 0, 0, 0] }],
    chart:      { type: 'area', height: 260, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif' },
    xaxis:      { categories: ['S-4', 'S-3', 'S-2', 'S-1'], labels: { style: { colors: '#64748B', fontSize: '12px' } } },
    yaxis:      { labels: { style: { colors: '#64748B', fontSize: '12px' } } },
    stroke:     { curve: 'smooth', width: 2.5 },
    dataLabels: { enabled: false },
    title:      { text: '' },
    theme:      { mode: 'light' },
    grid:       { borderColor: '#E5E9EF', strokeDashArray: 3 },
    colors:     ['#15803D'],
    fill:       { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.04, stops: [0, 100] } },
    markers:    { size: 4, strokeWidth: 0, hover: { size: 6 } },
  };

  private predictionService = inject(PredictionService);
  private peseesService = inject(PeseesService);
  private joueurService = inject(JoueurService);
  private seanceService = inject(SeanceService);
  private techniqueService = inject(TechniqueService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private dateSimuleeService = inject(DateSimuleeService);
  auth = inject(AuthService);

  /**
   * Outil de test « date simulée » : disponible pour TOUS les rôles mais UNIQUEMENT en build
   * de développement (isDevMode) → jamais présent dans le build de production.
   */
  peutSimulerDate(): boolean { return isDevMode(); }

  /** Date simulée active (outil de test temporalité), ou null = date réelle. */
  dateSimulee(): string | null { return this.dateSimuleeService.get(); }

  /** Change la date simulée et recharge l'app pour que toutes les vues refetch avec le nouvel en-tête. */
  changerDateSimulee(valeur: string): void {
    this.dateSimuleeService.set(valeur || null);
    window.location.reload();
  }

  /** Casquette active du dashboard pour les profils qui peuvent basculer (prépa + équipe). */
  vue: 'prepa' | 'equipe' = 'prepa';
  /** Capacité « entraîneur » (écriture tactique) — ce qu'un préparateur seul n'a PAS. */
  private aCapaciteEntraineur(): boolean {
    return this.auth.has('exercices:write') || this.auth.has('schemas:write')
        || this.auth.has('plandejeu:write') || this.auth.has('matchs:write');
  }
  /**
   * Toggle visible si l'utilisateur cumule une capacité prépa ET entraîneur (hors admin club),
   * OU s'il a un accès complet (super-admin / admin club) — pour pouvoir consulter les deux vues.
   */
  peutBasculer(): boolean {
    if (this.auth.hasRole('SUPER_ADMIN') || this.auth.has('club:manage')) return true;
    return this.auth.has('gps:import') && this.aCapaciteEntraineur();
  }
  /** Faut-il afficher la vue préparateur ? (toggle si dispo, sinon règle par capability). */
  afficherPrepa(): boolean {
    return this.peutBasculer() ? this.vue === 'prepa' : this.auth.estPreparateurVue();
  }

  ngOnInit(): void {
    // Accès complet (super-admin / admin club) : on garde l'écran « Équipe » par défaut,
    // mais le toggle permet désormais d'aller voir la vue « Préparation ».
    if (this.auth.hasRole('SUPER_ADMIN') || this.auth.has('club:manage')) {
      this.vue = 'equipe';
    }
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
    this.panelAssiduite = null;
    this.joueurService.getAssiduite(resume.joueur_id).subscribe({
      next: a => this.panelAssiduite = a,
      error: () => this.panelAssiduite = null,
    });
    const deja = this.joueursComplets.find(j => j.id === resume.joueur_id);
    if (deja) { this.panelJoueur = deja; this.panelLoading = false; return; }
    this.joueurService.getById(resume.joueur_id).subscribe({
      next: j => { this.panelJoueur = j; this.panelLoading = false; },
      error: () => { this.panelLoading = false; }
    });
  }

  fermerPanel(): void { this.panelJoueur = null; this.panelResume = null; this.panelAssiduite = null; }

  libelleAssiduite(statut: string): string {
    return ({ PRESENT: 'Présent', ABSENT: 'Absent', EXCUSE: 'Excusé', RETARD: 'Retard' } as Record<string, string>)[statut] ?? statut;
  }

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
        this.chargerResumesAppel();
      },
      error: () => {}
    });
  }

  /** Charge les résumés d'appel des entraînements affichés (hors matchs) pour les pastilles + la card. */
  private chargerResumesAppel(): void {
    const ids = [...this.seancesAujourdhui, ...this.seancesAVenir]
      .filter(s => !s.adversaire)
      .map(s => s.id);
    if (!ids.length) { this.resumesAppel = new Map(); return; }
    this.seanceService.getResumes(ids).subscribe({
      next: rs => this.resumesAppel = new Map(rs.map(r => [r.seanceId, r])),
      error: () => {}
    });
  }

  /** Résumé d'appel d'une séance (pour la pastille « X/Y dispo »). */
  resumeDe(seanceId: string): ResumeAppel | undefined { return this.resumesAppel.get(seanceId); }

  /** Y a-t-il un appel (entraînement) aujourd'hui dont on peut afficher la répartition ? */
  get appelDuJour(): boolean {
    return this.seancesAujourdhui.some(s => !s.adversaire && this.resumesAppel.has(s.id));
  }
  private cumulAujourdhui(champ: keyof ResumeAppel): number {
    return this.seancesAujourdhui
      .filter(s => !s.adversaire)
      .reduce((a, s) => a + ((this.resumesAppel.get(s.id)?.[champ] as number) ?? 0), 0);
  }
  get presentsAujourdhui(): number { return this.cumulAujourdhui('presents'); }
  get absentsAujourdhui():  number { return this.cumulAujourdhui('absents');  }
  get excusesAujourdhui():  number { return this.cumulAujourdhui('excuses');  }
  get retardsAujourdhui():  number { return this.cumulAujourdhui('retards');  }

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
