import { Component, OnInit, HostListener, inject, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { JoueurService, Joueur, GpsPoint } from '@core/services/joueur.service';
import { PredictionService, NiveauFatigue, ResumeJoueur } from '@core/services/prediction.service';
import { PeseesService, Pesee } from '@core/services/pesees.service';
import { SuiviSubjectifService, Wellness, Rpe } from '@core/services/suivi-subjectif.service';
import { Blessure, BlessureService } from '@core/services/blessure.service';
import { RtpEtape, BlessureSuiviService } from '@core/services/blessure-suivi.service';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';
import { MatIcon } from '@angular/material/icon';
import { MatTabGroup, MatTab, MatTabContent } from '@angular/material/tabs';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis, ApexFill, ApexStroke, ApexMarkers, ApexAnnotations, ApexLegend } from 'ng-apexcharts';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ChargeVueComponent } from '@shared/components/charge-vue/charge-vue.component';

@Component({
  selector: 'app-joueur-detail',
  standalone: true,
  templateUrl: './joueur-detail.component.html',
  styleUrl: './joueur-detail.component.scss',
  imports: [
    MatIcon,
    MatTabGroup, MatTab, MatTabContent,
    ChartComponent, DecimalPipe, DatePipe,
    ChargeVueComponent
  ]
})
export class JoueurDetailComponent implements OnInit {

  joueur: Joueur | null = null;
  risque: any = null;
  chargeCible: any = null;
  fatigue: NiveauFatigue | null = null;
  /** Résumé d'équipe chargé UNE fois (porte l'ACWR, charges aiguë/chronique, readiness…). */
  resumeEquipe: ResumeJoueur[] = [];
  /** Ligne du joueur courant, recalculée à la volée → pas de re-fetch ni de clignotement en navigation. */
  get resume(): ResumeJoueur | null {
    return this.joueur ? (this.resumeEquipe.find(r => r.joueur_id === this.joueur!.id) ?? null) : null;
  }

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

  // ── Suivi subjectif (wellness + sRPE) ──
  wellnessHisto: Wellness[] = [];
  rpeHisto: Rpe[] = [];
  fenetreWellness: 7 | 14 = 7;

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
    annotations: ApexAnnotations;
    fill: ApexFill;
    legend: ApexLegend;
  } = {
    series: [],
    chart: { type: 'area', height: 220, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent' },
    xaxis: { categories: [] },
    // Poids : trait plein ; Cible : trait rouge pointillé.
    stroke: { curve: 'smooth', width: [3, 2], dashArray: [0, 5] },
    markers: { size: [4, 0] },
    tooltip: { theme: 'light', y: { formatter: (v: number) => `${v.toFixed(1)} kg` } },
    yaxis: { labels: { formatter: (v: number) => `${v.toFixed(0)} kg` } },
    dataLabels: { enabled: false },
    colors: ['#15803d', '#ef4444'],
    annotations: {},
    // Dégradé vert sous la courbe : foncé près de la ligne (poids actuel), s'éclaircissant vers le bas.
    fill: {
      type: ['gradient', 'solid'],
      gradient: { shadeIntensity: 1, opacityFrom: 0.55, opacityTo: 0.04, stops: [0, 100] },
    },
    legend: { show: true, position: 'top', horizontalAlign: 'right', fontWeight: 600 },
  };

  joueursList: Joueur[] = [];
  currentIndex = -1;

  activeTab = 0;
  readonly tabLabels = ['Profil', 'GPS & Charge', 'Suivi subjectif'];

  /** Bascule d'onglet via le toggle segmenté (le mat-tab-group suit selectedIndex). */
  allerOnglet(i: number): void { this.activeTab = i; }

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

  // ── Helpers redesign Profil (hero dashboard, KPIs, donut, jauge) ──

  get initials(): string {
    const p = (this.joueur?.prenom ?? '').charAt(0);
    const n = (this.joueur?.nom ?? '').charAt(0);
    return (p + n).toUpperCase() || '?';
  }

  /** Tonalité sémantique liée au statut administratif du joueur. */
  get statutTone(): 'ok' | 'warn' | 'alert' | 'neutral' {
    switch (this.joueur?.statut) {
      case 'blesse':   return 'alert';
      case 'suspendu': return 'warn';
      case 'prete':    return 'neutral';
      case 'inactif':  return 'neutral';
      default:         return 'ok';
    }
  }

  /** ACWR du joueur (issu du résumé d'équipe), ou null si la donnée n'est pas disponible. */
  get acwr(): number | null { return this.resume?.acwr ?? null; }

  acwrTone(v: number): 'ok' | 'warn' | 'alert' {
    if (v < 0.8) return 'warn';
    if (v <= 1.3) return 'ok';
    if (v <= 1.5) return 'warn';
    return 'alert';
  }
  acwrZone(v: number): string {
    if (v < 0.8) return 'Sous-charge';
    if (v <= 1.3) return 'Zone optimale';
    if (v <= 1.5) return 'Zone de vigilance';
    return 'Surcharge';
  }

  riskTone(score: number):    'ok' | 'warn' | 'alert' { return score < 35 ? 'ok' : score < 60 ? 'warn' : 'alert'; }
  fatigueTone(score: number): 'ok' | 'warn' | 'alert' { return score < 40 ? 'ok' : score < 65 ? 'warn' : 'alert'; }
  ecartTone(ecart: number):   'ok' | 'warn' | 'alert' {
    const a = Math.abs(ecart);
    if (a <= 1) return 'ok';
    return ecart > 2 ? 'alert' : 'warn';
  }

  get ecartPoids(): number | null {
    if (this.joueur?.poidsActuel == null || this.joueur?.poidsFormeCible == null) return null;
    return Math.round((Number(this.joueur.poidsActuel) - Number(this.joueur.poidsFormeCible)) * 10) / 10;
  }

  get ecartLabel(): string {
    const e = this.ecartPoids;
    if (e == null) return '';
    return Math.abs(e) < 0.1 ? 'Dans la cible' : e > 0 ? 'Au-dessus' : 'En dessous';
  }

  /** Phrase d'explication du score de risque (cohérente avec le badge). */
  get riskPhrase(): string {
    if (!this.risque) return '';
    // Phrase probabiliste explicable fournie par le back (sans ML), si disponible.
    if (this.risque.phrase) return this.risque.phrase;
    const t = this.riskTone(this.risque.score_risque);
    return t === 'alert' ? 'Niveau élevé — surveillance rapprochée et charge individualisée recommandées.'
      : t === 'warn'     ? 'Niveau modéré — maintenir le monitoring et adapter le volume.'
      : 'Niveau faible — disponibilité optimale pour la charge collective.';
  }

  /** Cercle de progression du donut de risque (r = 36). */
  readonly RISK_CIRC = 2 * Math.PI * 36;
  get riskDash(): string {
    const s = this.risque?.score_risque ?? 0;
    return `${(s / 100 * this.RISK_CIRC).toFixed(1)} ${this.RISK_CIRC.toFixed(1)}`;
  }

  // ── Graphe combiné Suivi subjectif : barres Hooper (par état) + ligne sRPE (axe secondaire) ──
  suiviChartOptions: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis;
    plotOptions: ApexPlotOptions;
    dataLabels: ApexDataLabels;
    stroke: ApexStroke;
    markers: ApexMarkers;
    colors: string[];
    legend: ApexLegend;
    tooltip: ApexTooltip;
  } = {
    series: [],
    chart: { type: 'line', height: 320, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', foreColor: '#94a3b8' },
    xaxis: { categories: [], labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
    yaxis: ([
      { min: 0, max: 25, tickAmount: 5, title: { text: 'Hooper /25', style: { color: '#94a3b8' } }, labels: { style: { colors: '#cbd5e1' } } },
      { opposite: true, min: 0, title: { text: 'sRPE (UA)', style: { color: '#15803d' } }, labels: { style: { colors: '#15803d' } } },
    ] as unknown as ApexYAxis),
    plotOptions: { bar: { columnWidth: '45%', borderRadius: 4, colors: { ranges: [
      { from: 0,  to: 11, color: '#22c55e' },
      { from: 12, to: 16, color: '#f59e0b' },
      { from: 17, to: 25, color: '#ef4444' },
    ] } } },
    dataLabels: { enabled: false },
    stroke: { width: [0, 3], curve: 'smooth' },
    markers: { size: [0, 5], colors: ['#15803d'], strokeColors: '#fff', strokeWidth: 2 },
    colors: ['#cbd5e1', '#15803d'],
    legend: { show: false },
    tooltip: { shared: true, intersect: false, theme: 'light' },
  };

  @ViewChild('suiviChart') private suiviChart?: ChartComponent;

  private buildSuiviChart(): void {
    const rows = [...this.serieWellness].reverse(); // ordre chronologique
    const series: ApexAxisChartSeries = [
      { name: 'Hooper', type: 'column', data: rows.map(j => j.hooper) },
      { name: 'sRPE',   type: 'line',   data: rows.map(j => j.charge) },
    ];
    const categories = rows.map(j => { const d = new Date(j.date); return `${d.getDate()}/${d.getMonth() + 1}`; });
    this.suiviChartOptions = {
      ...this.suiviChartOptions,
      series,
      xaxis: { categories, labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
    };
    // Force la mise à jour même si le graphe vient juste d'être rendu (onglet lazy).
    this.suiviChart?.updateOptions({ series, xaxis: { categories } }, false, false);
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private joueurService = inject(JoueurService);
  private predictionService = inject(PredictionService);
  private peseesService = inject(PeseesService);
  private suiviService = inject(SuiviSubjectifService);
  private blessureService = inject(BlessureService);
  private blessureSuiviService = inject(BlessureSuiviService);
  private dialog = inject(MatDialog);

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    // L'onglet GPS & Charge gère son propre rendu via <app-charge-vue> (ngOnChanges).
    if (index === 2 && this.wellnessHisto.length > 0) {
      this.buildSuiviChart();
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

    // ACWR & indicateurs préparateur : pas d'endpoint par joueur → résumé d'équipe chargé une seule fois.
    this.predictionService.getResumeEquipe().subscribe({
      next: liste => this.resumeEquipe = liste,
      error: () => {},
    });

    this.route.paramMap.subscribe(params => {
      const id = params.get('id')!;
      this.chargerJoueur(id);
    });
  }

  private chargerJoueur(id: string): void {
    this.joueur    = null;
    this.risque    = null;
    this.chargeCible = null;
    this.fatigue   = null;
    this.gpsData   = [];
    this.pesees    = [];
    this.blessureActive = null;
    this.rtpEtapes = [];
    this.gpsLoading = true;

    this.chargerParcoursMedical(id);

    this.joueurService.getById(id).subscribe(j => {
      this.joueur = j;
      this.currentIndex = this.joueursList.findIndex(p => p.id === j.id);
    });
    this.predictionService.getRisque(id).subscribe(r => this.risque = r);
    this.predictionService.getChargeCible(id).subscribe(c => this.chargeCible = c);
    this.predictionService.getFatigue(id).subscribe(f => this.fatigue = f);
    this.joueurService.getHistoriqueGps(id).subscribe({
      next: data => {
        this.gpsData = data;
        this.gpsLoading = false;
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

    this.suiviService.getWellness(id).subscribe({
      next: d => { this.wellnessHisto = d; if (this.activeTab === 2) this.buildSuiviChart(); },
      error: () => {},
    });
    this.suiviService.getRpe(id).subscribe({
      next: d => { this.rpeHisto = d; if (this.activeTab === 2) this.buildSuiviChart(); },
      error: () => {},
    });
  }

  // ── Suivi subjectif : série Hooper + sRPE sur 7 ou 14 jours ──

  private dateISOd(d: Date): string {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  hooperTotal(w: Wellness): number {
    return w.sommeil + w.fatigue + w.douleur + w.stress + w.humeur;
  }

  /** Classe d'état d'après le total Hooper (5..25, plus bas = mieux). */
  hooperClasse(v: number | null): string {
    if (v == null) return '';
    if (v <= 11) return 'ok';
    if (v <= 16) return 'moyen';
    return 'bad';
  }

  /** Tonalité sémantique du total Hooper. */
  hooperTone(v: number | null): 'ok' | 'warn' | 'alert' | 'neutral' {
    if (v == null) return 'neutral';
    if (v <= 11) return 'ok';
    if (v <= 16) return 'warn';
    return 'alert';
  }
  hooperLabel(v: number | null): string {
    if (v == null) return '—';
    if (v <= 11) return 'Bon';
    if (v <= 16) return 'Vigilance';
    return 'Alerte';
  }
  /** Couleur d'un item Hooper (1..5, plus haut = moins bon). */
  itemColor(v: number): string { return v <= 2 ? '#22c55e' : v === 3 ? '#f59e0b' : '#ef4444'; }

  /** Série des N derniers jours (du plus récent au plus ancien) : Hooper + sRPE + gêne. */
  get serieWellness(): { date: string; hooper: number | null; rpe: number | null; charge: number | null;
                         gene: boolean; geneZone: string | null; geneIntensite: number | null; geneTraitee: boolean }[] {
    const wByDate = new Map(this.wellnessHisto.map(w => [w.date, w]));
    const rpeByDate = new Map<string, number>();
    const chargeByDate = new Map<string, number>();
    for (const r of this.rpeHisto) {
      rpeByDate.set(r.date, Math.max(rpeByDate.get(r.date) ?? 0, r.rpe));
      if (r.charge != null) chargeByDate.set(r.date, (chargeByDate.get(r.date) ?? 0) + r.charge);
    }
    const out = [];
    for (let i = 0; i < this.fenetreWellness; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = this.dateISOd(d);
      const w = wByDate.get(iso);
      out.push({
        date: iso,
        hooper: w ? this.hooperTotal(w) : null,
        rpe: rpeByDate.get(iso) ?? null,
        charge: chargeByDate.get(iso) ?? null,
        gene: !!(w?.geneZone && !w.geneTraitee),
        geneZone: w?.geneZone ?? null,
        geneIntensite: w?.geneIntensite ?? null,
        geneTraitee: !!w?.geneTraitee,
      });
    }
    return out;
  }

  /** Libellé de la fenêtre courante (du plus ancien au plus récent). */
  get rangeWellnessLabel(): string {
    const s = this.serieWellness;
    if (!s.length) return '';
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${fmt(s[s.length - 1].date)} → ${fmt(s[0].date)}`;
  }

  /** Dernier wellness rempli dans la fenêtre (pour la décomposition « Dernier relevé »). */
  get wellnessDernierRempli(): Wellness | null {
    const map = new Map(this.wellnessHisto.map(w => [w.date, w]));
    for (const j of this.serieWellness) { if (j.hooper != null) return map.get(j.date) ?? null; }
    return null;
  }

  /** Décomposition du dernier relevé en 5 items (mini-jauges). */
  get itemsDernierReleve(): { label: string; value: number; color: string; segs: boolean[] }[] {
    const w = this.wellnessDernierRempli;
    if (!w) return [];
    const defs: [string, number][] = [
      ['Sommeil', w.sommeil], ['Fatigue', w.fatigue], ['Courbatures', w.douleur], ['Stress', w.stress], ['Humeur', w.humeur],
    ];
    return defs.map(([label, v]) => ({
      label, value: v, color: this.itemColor(v),
      segs: [1, 2, 3, 4, 5].map(n => n <= v),
    }));
  }

  /** Gêne récente NON traitée dans la fenêtre (alerte). */
  get geneAlerte(): { zone: string; intensite: number | null; date: string } | null {
    const map = new Map(this.wellnessHisto.map(w => [w.date, w]));
    for (const j of this.serieWellness) {
      const w = map.get(j.date);
      if (w?.geneZone && !w.geneTraitee) {
        return { zone: this.joliZone(w.geneZone), intensite: w.geneIntensite ?? null, date: j.date };
      }
    }
    return null;
  }

  get wellnessDernier(): Wellness | null {
    return [...this.wellnessHisto].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }
  get hooperDernier(): number | null {
    const w = this.wellnessDernier;
    return w ? this.hooperTotal(w) : null;
  }
  get hooperMoyen(): number | null {
    const vals = this.serieWellness.map(j => j.hooper).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  get joursRemplisWellness(): number {
    return this.serieWellness.filter(j => j.hooper != null).length;
  }
  get chargeCumuleeWellness(): number {
    const limite = this.dateISOd(new Date(Date.now() - (this.fenetreWellness - 1) * 86400000));
    return this.rpeHisto.filter(r => r.date >= limite && r.charge != null).reduce((t, r) => t + (r.charge ?? 0), 0);
  }

  setFenetreWellness(n: 7 | 14): void {
    this.fenetreWellness = n;
    if (this.activeTab === 2) this.buildSuiviChart();
  }
  joliZone(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

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
    // Poids = aire verte dégradée ; Cible = ligne rouge pointillée traversant le graphe.
    const series: ApexAxisChartSeries = [
      { name: 'Poids', type: 'area', data: valeurs },
      ...(cible ? [{ name: 'Cible', type: 'line', data: Array(valeurs.length).fill(Number(cible)) }] : []),
    ];
    this.poidsChartOptions = {
      ...this.poidsChartOptions,
      series,
      xaxis: { ...this.poidsChartOptions.xaxis, categories: labels },
    };
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
