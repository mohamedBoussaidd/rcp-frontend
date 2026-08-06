import { Component, OnInit, HostListener, inject, ViewChild, ApplicationRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { JoueurService, Joueur, GpsPoint, AssiduiteJoueur, StatsCompetition } from '@core/services/joueur.service';
import { AuthService } from '@core/services/auth.service';
import { couleurTheme } from '@core/services/theme.service';
import { SuiviIndividuelComponent } from '../suivi-individuel/suivi-individuel.component';
import { PredictionService, NiveauFatigue, ResumeJoueur, RisqueBlessure } from '@core/services/prediction.service';
import { InfoHintComponent, LigneComposition } from '@shared/components/info-hint/info-hint.component';
import { AIDES_INDICATEURS } from '@shared/indicateurs/aides-indicateurs';
import { PeseesService, Pesee } from '@core/services/pesees.service';
import { SuiviSubjectifService, Wellness, Rpe } from '@core/services/suivi-subjectif.service';
import { Blessure, BlessureService } from '@core/services/blessure.service';
import { RtpEtape, BlessureSuiviService } from '@core/services/blessure-suivi.service';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';
import { SuiviCoachService, EvenementVie, ObjectifJoueur, NoteJoueur } from '@core/services/suivi-coach.service';
import { MatIcon } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatTabGroup, MatTab, MatTabContent } from '@angular/material/tabs';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis, ApexFill, ApexStroke, ApexMarkers, ApexAnnotations, ApexLegend } from 'ng-apexcharts';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ChargeVueComponent } from '@shared/components/charge-vue/charge-vue.component';
import { ObjectifChargeJoueurComponent } from '../../performance/objectifs/objectif-charge-joueur.component';
import { BadgeListeComponent } from '@shared/components/badge/badge-liste.component';
import { BadgeAssignComponent } from '@shared/components/badge/badge-assign.component';

/**
 * Gêne déclarée non traitée, quelle que soit sa source. `contexte` porte le titre de la séance
 * concernée pour une gêne d'après-séance (source RPE), et reste nul pour une gêne du matin.
 */
interface GeneRecente {
  zone: string;
  intensite: number | null;
  date: string;
  source: 'WELLNESS' | 'RPE';
  contexte: string | null;
}

@Component({
  selector: 'app-joueur-detail',
  standalone: true,
  templateUrl: './joueur-detail.component.html',
  styleUrl: './joueur-detail.component.scss',
  imports: [
    MatIcon, FormsModule,
    MatTabGroup, MatTab, MatTabContent,
    ChartComponent, DecimalPipe, DatePipe,
    ChargeVueComponent, RouterLink, SuiviIndividuelComponent,
    BadgeListeComponent, BadgeAssignComponent, InfoHintComponent,
    ObjectifChargeJoueurComponent
  ]
})
export class JoueurDetailComponent implements OnInit {

  joueur: Joueur | null = null;
  risque: RisqueBlessure | null = null;
  chargeCible: any = null;
  fatigue: NiveauFatigue | null = null;
  /** Résumé d'équipe chargé UNE fois (porte l'ACWR, charges aiguë/chronique, readiness…). */
  resumeEquipe: ResumeJoueur[] = [];
  /** Ligne du joueur courant, recalculée à la volée → pas de re-fetch ni de clignotement en navigation. */
  get resume(): ResumeJoueur | null {
    return this.joueur ? (this.resumeEquipe.find(r => r.joueur_id === this.joueur!.id) ?? null) : null;
  }

  // ── Assiduité (présence aux entraînements, saison active) ──
  assiduite: AssiduiteJoueur | null = null;

  // ── Compétition (module add-on `stats_competition`) ──
  competition: StatsCompetition | null = null;
  competitionLoading = false;

  // ── Suivi coach : fil de vie, objectifs, notes (module `suivi_individuel`) ──
  filDeVie: EvenementVie[] = [];
  objectifs: ObjectifJoueur[] = [];
  notesStaff: NoteJoueur[] = [];
  /** Formulaire d'ajout d'objectif, replié tant qu'on ne clique pas sur « Ajouter ». */
  nouvelObjectif = { ouvert: false, titre: '', description: '', echeance: '' };
  nouvelleNote = '';
  savingSuivi = false;

  // ── Parcours médical (blessure active + protocole de reprise) ──
  blessureActive: Blessure | null = null;
  rtpEtapes: RtpEtape[] = [];
  readonly PARCOURS: { statut: string; label: string }[] = [
    { statut: 'INDISPONIBLE', label: 'Indisponible' },
    { statut: 'EN_REPRISE', label: 'En reprise' },
    { statut: 'RETABLI', label: 'Rétabli' },
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
      colors: [couleurTheme(), '#ef4444'],
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
  /** Passe à true juste avant de quitter la fiche : démonte l'onglet lazy « Suivi individuel »
   *  (et son graphe) de façon anticipée pour éviter un crash ApexCharts au démontage de la route. */
  leaving = false;
  /** L'onglet « Suivi individuel » (dernier) n'apparaît qu'avec la permission entretien:read. */
  get peutSuivi(): boolean { return this.auth.has('entretien:read'); }
  /** L'onglet « Compétition » suit le module add-on `stats_competition`. */
  get peutCompetition(): boolean { return this.auth.has('stats:read'); }
  /**
   * L'onglet « Objectif de charge » suit l'add-on `objectifs_performance` — pas une permission
   * de plus : sans le module, la trajectoire n'existe pas, l'onglet n'a rien à montrer.
   * `predictions:read` reste exigé parce que c'est de la charge d'entraînement.
   */
  get peutObjectifCharge(): boolean {
    return this.auth.hasModule('objectifs_performance') && this.auth.has('predictions:read');
  }
  /** Fil de vie, objectifs et notes : rattachés au module `suivi_individuel`. */
  get peutSuiviCoach(): boolean { return this.auth.has('suivi_coach:read'); }
  get peutSuiviCoachEcrire(): boolean { return this.auth.has('suivi_coach:write'); }

  /**
   * Composition des onglets. Les index ne sont plus écrits en dur nulle part : « Compétition »
   * s'insère au milieu selon une permission, ce qui décalerait silencieusement tous les deep-links.
   * Toute cible d'onglet passe donc par {@link indexOnglet}.
   */
  get tabLabels(): string[] {
    const labels = ['Profil'];
    if (this.peutCompetition) labels.push('Compétition');
    labels.push('GPS & Charge');
    // Juste après GPS & Charge : même sujet, mais une autre échelle de temps — la période de
    // saison et ses phases, là où GPS & Charge suit une fenêtre de dates libre.
    if (this.peutObjectifCharge) labels.push('Objectif de charge');
    labels.push('Suivi subjectif');
    if (this.peutSuiviCoach) labels.push('Fil de vie');
    if (this.peutSuivi) labels.push('Suivi individuel');
    return labels;
  }

  /** Index d'un onglet par son libellé, ou 0 (Profil) s'il n'est pas visible pour cet utilisateur. */
  private indexOnglet(label: string): number {
    const i = this.tabLabels.indexOf(label);
    return i >= 0 ? i : 0;
  }

  /**
   * Onglet d'ouverture selon le métier de celui qui consulte : un entraîneur vient chercher du temps
   * de jeu, un préparateur de la charge, un médecin du ressenti. Un deep-link `?tab=` reste prioritaire.
   */
  private ongletParDefaut(): number {
    // `matchs:write` distingue celui qui compose l'équipe (entraîneur) de celui qui suit la charge
    // (préparateur) — les deux peuvent avoir `stats:read` sans chercher la même chose en ouvrant.
    if (this.peutCompetition && this.auth.has('matchs:write')) return this.indexOnglet('Compétition');
    if (this.auth.has('predictions:read')) return this.indexOnglet('GPS & Charge');
    return 0;
  }

  /** Bascule d'onglet via le toggle segmenté (le mat-tab-group suit selectedIndex). */
  allerOnglet(i: number): void { this.activeTab = i; }

  readonly POSTES: Record<string, string> = {
    gardien: 'Gardien',
    defenseur_central: 'Défenseur central',
    lateral_droit: 'Latéral droit',
    lateral_gauche: 'Latéral gauche',
    milieu_defensif: 'Milieu défensif',
    milieu_central: 'Milieu central',
    milieu_offensif: 'Milieu offensif',
    ailier_droit: 'Ailier droit',
    ailier_gauche: 'Ailier gauche',
    attaquant: 'Attaquant',
    avant_centre: 'Avant-centre',
  };

  readonly PROFILS: Record<string, string> = {
    explosif_leger: 'Explosif léger',
    pivot_costaud: 'Pivot costaud',
    box_to_box: 'Box to box',
    sentinelle: 'Sentinelle',
    lateral_offensif: 'Latéral offensif',
    central_rapide: 'Central rapide',
    central_costaud: 'Central costaud',
    renard_surfaces: 'Renard des surfaces',
    attaquant_profondeur: 'Attaquant en profondeur',
  };

  readonly PIEDS: Record<string, string> = {
    droit: 'Droit',
    gauche: 'Gauche',
    ambidextre: 'Ambidextre',
  };

  readonly STATUTS: Record<string, string> = {
    actif: 'Actif',
    blesse: 'Blessé',
    suspendu: 'Suspendu',
    prete: 'Prêté',
    inactif: 'Inactif',
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
    const valeur = Number(this.joueur.poidsActuel) / (tailleM * tailleM);
    let categorie: string;
    let classe: string;
    if (valeur < 18.5) { categorie = 'Insuffisance pondérale'; classe = 'imc-bas'; }
    else if (valeur < 25) { categorie = 'Poids normal'; classe = 'imc-normal'; }
    else if (valeur < 30) { categorie = 'Surpoids'; classe = 'imc-surpoids'; }
    else { categorie = 'Obésité'; classe = 'imc-obesite'; }
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
      case 'blesse': return 'alert';
      case 'suspendu': return 'warn';
      case 'prete': return 'neutral';
      case 'inactif': return 'neutral';
      default: return 'ok';
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

  /**
   * Tonalités dérivées du NIVEAU calculé par le moteur, et non plus de seuils recopiés côté front.
   * Les anciens seuils (risque 35/60, fatigue 40/65) divergeaient de ceux du moteur (30/60) : un
   * score de 32 affichait le badge « VIGILANCE » sur fond vert, et 62 « ALERTE » en orange.
   * Une seule source de vérité désormais — le back.
   */
  riskTone(niveau?: string | null): 'ok' | 'warn' | 'alert' {
    return niveau === 'ELEVE' ? 'alert' : niveau === 'MODERE' ? 'warn' : 'ok';
  }
  fatigueTone(niveau?: string | null): 'ok' | 'warn' | 'alert' {
    return niveau === 'ALERTE' ? 'alert' : niveau === 'VIGILANCE' ? 'warn' : 'ok';
  }
  /** Vocabulaire unique des niveaux (celui du moteur et de la méthodologie). */
  niveauRisqueLibelle(niveau?: string | null): string {
    return ({ FAIBLE: 'Faible', MODERE: 'Modéré', ELEVE: 'Élevé' } as Record<string, string>)[niveau ?? ''] ?? '—';
  }
  niveauFatigueLibelle(niveau?: string | null): string {
    return ({ NOMINAL: 'Nominal', VIGILANCE: 'Vigilance', ALERTE: 'Alerte' } as Record<string, string>)[niveau ?? ''] ?? '—';
  }
  ecartTone(ecart: number): 'ok' | 'warn' | 'alert' {
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
    const t = this.riskTone(this.risque.niveau);
    return t === 'alert' ? 'Niveau élevé — surveillance rapprochée et charge individualisée recommandées.'
      : t === 'warn' ? 'Niveau modéré — maintenir le monitoring et adapter le volume.'
        : 'Niveau faible — disponibilité optimale pour la charge collective.';
  }

  // ── Explicabilité : composition des scores + lectures de l'ACWR ──

  readonly AIDES = AIDES_INDICATEURS;

  /**
   * L'utilisateur a-t-il accès à /methodologie ? La route exige les permissions d'écriture GPS
   * (mêmes que `PERMS_GPS` dans app.routes.ts) : un médecin ou un joueur serait rejeté, donc on
   * n'affiche pas le lien pour eux — la bulle reste autosuffisante.
   */
  get peutMethodologie(): boolean {
    return this.auth.has('gps:import') || this.auth.has('pesees:write');
  }
  lienMethodologie(): string | null { return this.peutMethodologie ? '/methodologie' : null; }

  /** Composition du score de risque, du facteur le plus lourd au plus léger. */
  get compositionRisque(): LigneComposition[] {
    return (this.risque?.contributions ?? []).map(c => ({ libelle: c.libelle, points: c.points }));
  }

  /** Composition du score de fatigue : fait mesuré devant, étiquette physiologique au second rang. */
  get compositionFatigue(): LigneComposition[] {
    return (this.fatigue?.signaux ?? []).map(s => ({
      libelle: s.fait, points: s.points, type: s.type_suggere ?? null,
    }));
  }

  /** Les 2 causes principales de la fatigue — le reste reste dans la bulle de composition. */
  get fatigueCausesPrincipales(): LigneComposition[] { return this.compositionFatigue.slice(0, 2); }
  get fatigueAutresCauses(): number { return Math.max(0, this.compositionFatigue.length - 2); }

  /** Libellé lisible de la source de charge (au lieu du code brut « MIXTE »). */
  sourceLibelle(source?: string | null): string {
    return ({
      GPS: 'GPS (charge mesurée)',
      RPE: 'ressenti (sRPE)',
      MIXTE: 'GPS + ressenti',
    } as Record<string, string>)[source ?? ''] ?? 'source inconnue';
  }

  /**
   * Les 3 lectures de l'ACWR : celle retenue (mixte pondéré 0,6/0,4 quand les deux sources
   * existent), la charge mesurée seule et la charge ressentie seule. On les affiche ENSEMBLE
   * plutôt qu'en sélecteur : c'est leur écart qui informe, et un sélecteur donnerait trois
   * vérités concurrentes pour le même joueur.
   */
  get lecturesAcwr(): { code: string; libelle: string; valeur: number; semaines?: number | null; aide: string }[] {
    const r = this.risque;
    if (!r) return [];
    const out: { code: string; libelle: string; valeur: number; semaines?: number | null; aide: string }[] = [];
    if (r.acwr != null) {
      out.push({
        code: 'RETENU', libelle: `Retenu — ${this.sourceLibelle(r.source)}`, valeur: r.acwr,
        aide: r.source === 'MIXTE'
          ? 'Moyenne pondérée des deux ratios (60 % mesuré, 40 % ressenti). C\'est la valeur qui alimente le score de risque.'
          : 'Une seule source disponible : ce ratio est celui qui alimente le score de risque.',
      });
    }
    if (r.acwr_gps != null) {
      out.push({
        code: 'GPS', libelle: 'Charge mesurée (GPS)', valeur: r.acwr_gps, semaines: r.semaines_gps,
        aide: 'Ratio calculé sur les distances parcourues. Reflète ce que le joueur a réellement produit.',
      });
    }
    if (r.acwr_rpe != null) {
      out.push({
        code: 'RPE', libelle: 'Charge ressentie (sRPE)', valeur: r.acwr_rpe, semaines: r.semaines_rpe,
        aide: 'Ratio calculé sur le RPE × durée déclaré par le joueur. Reflète ce qu\'il a vécu, y compris hors terrain.',
      });
    }
    return out;
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
        { min: 0, max: 50, tickAmount: 5, title: { text: 'Hooper /50', style: { color: '#94a3b8' } }, labels: { style: { colors: '#cbd5e1' } } },
        { opposite: true, min: 0, title: { text: 'sRPE (UA)', style: { color: couleurTheme() } }, labels: { style: { colors: couleurTheme() } } },
      ] as unknown as ApexYAxis),
      plotOptions: {
        bar: {
          columnWidth: '45%', borderRadius: 4, colors: {
            ranges: [
              { from: 0, to: 22, color: '#22c55e' },
              { from: 23, to: 34, color: '#f59e0b' },
              { from: 35, to: 50, color: '#ef4444' },
            ]
          }
        }
      },
      dataLabels: { enabled: false },
      stroke: { width: [0, 3], curve: 'smooth' },
      markers: { size: [0, 5], colors: [couleurTheme()], strokeColors: '#fff', strokeWidth: 2 },
      colors: ['#cbd5e1', couleurTheme()],
      legend: { show: false },
      tooltip: { shared: true, intersect: false, theme: 'light' },
    };

  @ViewChild('suiviChart') private suiviChart?: ChartComponent;

  private buildSuiviChart(): void {
    const rows = [...this.serieWellness].reverse(); // ordre chronologique
    const series: ApexAxisChartSeries = [
      { name: 'Hooper', type: 'column', data: rows.map(j => j.hooper) },
      { name: 'sRPE', type: 'line', data: rows.map(j => j.charge) },
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
  private suiviCoachService = inject(SuiviCoachService);
  private blessureService = inject(BlessureService);
  private blessureSuiviService = inject(BlessureSuiviService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private appRef = inject(ApplicationRef);

  retourEffectif(): void {
    // Retour vers « État de l'effectif » si l'utilisateur y a accès (staff physique/GPS),
    // sinon repli sur le dashboard (évite un blocage par les gardes de rôle/module). Le nettoyage
    // du graphe de l'onglet Suivi est fait par le canDeactivate (prepareLeave) → aucune précaution ici.
    const dest = (this.auth.has('pesees:write') || this.auth.has('gps:import')) ? '/etat-effectif' : '/dashboard';
    window.location.href = dest;
    // this.router.navigate([dest]);
  }

  /**
   * Appelé par le `canDeactivate` de la route AVANT tout départ de la fiche (bouton Effectif, menu,
   * retour navigateur…). Démonte l'onglet lazy « Suivi individuel » (et son graphe ApexCharts) PENDANT
   * que le DOM est encore attaché — le `tick()` synchrone détruit le graphe proprement — pour éviter le
   * crash « Cannot read properties of undefined (reading 'node') » qui survenait au démontage de la route
   * (le portail Material détache le DOM avant le nettoyage du graphe) et avortait la navigation.
   */
  prepareLeave(): boolean {
    this.leaving = true;
    this.appRef.tick();
    return true;
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    // L'onglet GPS & Charge gère son propre rendu via <app-charge-vue> (ngOnChanges).
    if (this.surOngletSubjectif && this.wellnessHisto.length > 0) {
      this.buildSuiviChart();
    }
  }

  /** Le graphe Hooper/sRPE ne se construit que si son onglet est à l'écran — et son index bouge. */
  private get surOngletSubjectif(): boolean {
    return this.tabLabels[this.activeTab] === 'Suivi subjectif';
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
    if (e.key === 'ArrowRight' && this.joueurSuivant) this.naviguerVers(this.joueurSuivant);
  }

  ngOnInit(): void {
    this.joueurService.getAll().subscribe(liste => {
      this.joueursList = liste.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    });

    // ACWR & indicateurs préparateur : pas d'endpoint par joueur → résumé d'équipe chargé une seule fois.
    this.predictionService.getResumeEquipe().subscribe({
      next: liste => this.resumeEquipe = liste,
      error: () => { },
    });

    this.route.paramMap.subscribe(params => {
      const id = params.get('id')!;
      this.chargerJoueur(id);
    });

    // Deep-links d'onglet : ?tab=suivi (entretiens, depuis « Suivi des entretiens ») et
    // ?tab=subjectif (Hooper/sRPE, depuis Performance › RPE/sRPE — sans ça on atterrissait sur
    // l'onglet Profil et il fallait recliquer).
    this.route.queryParamMap.subscribe(q => {
      const tab = q.get('tab');
      if (tab === 'suivi' && this.peutSuivi) {
        this.activeTab = this.indexOnglet('Suivi individuel');
      } else if (tab === 'subjectif') {
        this.activeTab = this.indexOnglet('Suivi subjectif');
        if (this.wellnessHisto.length) this.buildSuiviChart();
      } else if (tab === 'competition' && this.peutCompetition) {
        this.activeTab = this.indexOnglet('Compétition');
      } else if (!tab) {
        this.activeTab = this.ongletParDefaut();
      }
    });
  }

  /**
   * Statistiques de compétition. L'onglet peut être celui d'ouverture pour un entraîneur : on
   * charge dès la fiche, sans attendre le clic. Une erreur laisse `competition` à null — le module
   * peut être désactivé pour ce club, ce n'est pas une panne à signaler.
   */
  private chargerCompetition(id: string): void {
    this.competition = null;
    if (!this.peutCompetition) return;
    this.competitionLoading = true;
    this.joueurService.getCompetition(id).subscribe({
      next: s => { this.competition = s; this.competitionLoading = false; },
      error: () => { this.competition = null; this.competitionLoading = false; },
    });
  }

  // ── Suivi coach : fil de vie, objectifs, notes ──────────────────────────

  /**
   * Le fil de vie et ses deux compléments. Comme pour la compétition, une erreur laisse les
   * listes vides sans message : le module peut simplement être désactivé pour ce club.
   */
  private chargerSuiviCoach(id: string): void {
    this.filDeVie = [];
    this.objectifs = [];
    this.notesStaff = [];
    if (!this.peutSuiviCoach) return;
    this.suiviCoachService.filDeVie(id).subscribe({
      next: f => this.filDeVie = f.evenements,
      error: () => this.filDeVie = [],
    });
    this.suiviCoachService.objectifs(id).subscribe({
      next: o => this.objectifs = o,
      error: () => this.objectifs = [],
    });
    this.suiviCoachService.notes(id).subscribe({
      next: n => this.notesStaff = n,
      error: () => this.notesStaff = [],
    });
  }

  ajouterObjectif(): void {
    const j = this.joueur;
    if (!j || !this.nouvelObjectif.titre.trim() || this.savingSuivi) return;
    this.savingSuivi = true;
    this.suiviCoachService.creerObjectif(j.id, {
      titre: this.nouvelObjectif.titre.trim(),
      description: this.nouvelObjectif.description || null,
      echeance: this.nouvelObjectif.echeance || null,
    }).subscribe({
      next: () => {
        this.nouvelObjectif = { ouvert: false, titre: '', description: '', echeance: '' };
        this.savingSuivi = false;
        this.chargerSuiviCoach(j.id);
      },
      error: () => this.savingSuivi = false,
    });
  }

  /** Un objectif se clôt en changeant son statut : on ne supprime pas ce qui a été fixé. */
  changerStatutObjectif(o: ObjectifJoueur, statut: 'EN_COURS' | 'ATTEINT' | 'ABANDONNE'): void {
    const j = this.joueur;
    if (!j) return;
    this.suiviCoachService.modifierObjectif(o.id, {
      titre: o.titre, description: o.description, echeance: o.echeance, statut,
    }).subscribe({ next: () => this.chargerSuiviCoach(j.id) });
  }

  supprimerObjectif(o: ObjectifJoueur): void {
    const j = this.joueur;
    if (!j || !confirm(`Supprimer l'objectif « ${o.titre} » ?`)) return;
    this.suiviCoachService.supprimerObjectif(o.id).subscribe({ next: () => this.chargerSuiviCoach(j.id) });
  }

  ajouterNote(): void {
    const j = this.joueur;
    if (!j || !this.nouvelleNote.trim() || this.savingSuivi) return;
    this.savingSuivi = true;
    this.suiviCoachService.creerNote(j.id, { texte: this.nouvelleNote.trim() }).subscribe({
      next: () => { this.nouvelleNote = ''; this.savingSuivi = false; this.chargerSuiviCoach(j.id); },
      error: () => this.savingSuivi = false,
    });
  }

  supprimerNote(n: NoteJoueur): void {
    const j = this.joueur;
    if (!j || !confirm('Supprimer cette note ?')) return;
    this.suiviCoachService.supprimerNote(n.id).subscribe({ next: () => this.chargerSuiviCoach(j.id) });
  }

  /** Pictogramme du fil de vie, par type d'évènement. */
  iconeEvenement(type: string): string {
    return ({
      BLESSURE: 'healing', RETOUR: 'check_circle', MATCH: 'sports_soccer',
      ENTRETIEN: 'record_voice_over', OBJECTIF: 'flag', NOTE: 'sticky_note_2',
    } as Record<string, string>)[type] ?? 'circle';
  }

  libelleStatutObjectif(statut: string): string {
    return ({ EN_COURS: 'En cours', ATTEINT: 'Atteint', ABANDONNE: 'Abandonné' } as Record<string, string>)[statut] ?? statut;
  }

  libelleStatutCompo(statut: string): string {
    return ({
      TITULAIRE: 'Titulaire', REMPLACANT: 'Remplaçant', RESERVE: 'Réserve',
      REPOS: 'Repos', SUSPENDU: 'Suspendu',
    } as Record<string, string>)[statut] ?? statut;
  }

  /** D'où vient la minute affichée — le coach doit pouvoir distinguer un relevé d'une estimation. */
  libelleSource(source: string): string {
    return ({ SAISIE: 'Staff', FEDERATION: 'Fédération', GPS: 'GPS' } as Record<string, string>)[source] ?? source;
  }

  libelleAssiduite(statut: string): string {
    return ({
      PRESENT: 'Présent', ABSENT: 'Absent', EXCUSE: 'Excusé', RETARD: 'Retard',
      ADAPTE: 'Séance adaptée', SOIN: 'Au soin',
    } as Record<string, string>)[statut] ?? statut;
  }

  private chargerJoueur(id: string): void {
    this.joueur = null;
    this.risque = null;
    this.chargeCible = null;
    this.fatigue = null;
    this.gpsData = [];
    this.pesees = [];
    this.blessureActive = null;
    this.rtpEtapes = [];
    this.assiduite = null;
    this.gpsLoading = true;

    this.chargerParcoursMedical(id);
    this.joueurService.getAssiduite(id).subscribe({
      next: a => this.assiduite = a,
      error: () => this.assiduite = null,
    });
    this.chargerCompetition(id);
    this.chargerSuiviCoach(id);

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
      error: () => { }
    });

    this.suiviService.getWellness(id).subscribe({
      next: d => { this.wellnessHisto = d; if (this.surOngletSubjectif) this.buildSuiviChart(); },
      error: () => { },
    });
    this.suiviService.getRpe(id).subscribe({
      next: d => { this.rpeHisto = d; if (this.surOngletSubjectif) this.buildSuiviChart(); },
      error: () => { },
    });
  }

  // ── Suivi subjectif : série Hooper + sRPE sur 7 ou 14 jours ──

  private dateISOd(d: Date): string {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  hooperTotal(w: Wellness): number {
    return w.sommeil + w.fatigue + w.douleur + w.stress + w.humeur;
  }

  // Seuils du total Hooper (5..50, plus bas = mieux). Bornes UNIQUES : elles étaient à 33 ici et
  // à 34 dans les barres du graphe et dans /suivi-subjectif — un total de 34 donnait donc une barre
  // orange sous un badge rouge « Alerte », dans le même onglet.
  static readonly HOOPER_OK = 22;
  static readonly HOOPER_VIGILANCE = 34;

  /** Classe d'état d'après le total Hooper (5..50, plus bas = mieux). */
  hooperClasse(v: number | null): string {
    if (v == null) return '';
    if (v <= JoueurDetailComponent.HOOPER_OK) return 'ok';
    if (v <= JoueurDetailComponent.HOOPER_VIGILANCE) return 'moyen';
    return 'bad';
  }

  /** Tonalité sémantique du total Hooper. */
  hooperTone(v: number | null): 'ok' | 'warn' | 'alert' | 'neutral' {
    if (v == null) return 'neutral';
    if (v <= JoueurDetailComponent.HOOPER_OK) return 'ok';
    if (v <= JoueurDetailComponent.HOOPER_VIGILANCE) return 'warn';
    return 'alert';
  }
  hooperLabel(v: number | null): string {
    if (v == null) return '—';
    if (v <= JoueurDetailComponent.HOOPER_OK) return 'Bon';
    if (v <= JoueurDetailComponent.HOOPER_VIGILANCE) return 'Vigilance';
    return 'Alerte';
  }
  /** Couleur d'un item Hooper (1..10, plus haut = moins bon). Convention app : ≥8 = alerte. */
  itemColor(v: number): string { return v <= 4 ? '#22c55e' : v <= 7 ? '#f59e0b' : '#ef4444'; }
  /** Segments d'une mini-jauge d'item : 10 crans depuis V46 (l'échelle 1-5 en laissait 5). */
  readonly CRANS_ITEM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /** Série des N derniers jours (du plus récent au plus ancien) : Hooper + sRPE + gêne. */
  get serieWellness(): {
    date: string; hooper: number | null; rpe: number | null; charge: number | null;
    gene: boolean; geneZone: string | null; geneIntensite: number | null; geneTraitee: boolean
  }[] {
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
      // 10 crans : avec les 5 d'avant, toute valeur ≥ 5 remplissait la jauge — un joueur à 5/10
      // et un joueur à 10/10 étaient visuellement identiques.
      segs: this.CRANS_ITEM.map(n => n <= v),
    }));
  }

  /**
   * Gêne récente NON traitée (alerte), sur les DEUX sources depuis V91 : le ressenti du matin
   * (`wellness_quotidien`) et le questionnaire d'après-séance (`rpe_seance`). N'en lire qu'une
   * revenait à ignorer en silence les douleurs signalées après l'entraînement — exactement l'écart
   * corrigé dans l'écran Médical. On retient la plus récente des deux.
   */
  get geneAlerte(): GeneRecente | null {
    const map = new Map(this.wellnessHisto.map(w => [w.date, w]));
    let retenue: GeneRecente | null = null;

    // `serieWellness` est ordonnée du plus récent au plus ancien : la première trouvée suffit.
    for (const j of this.serieWellness) {
      const w = map.get(j.date);
      if (w?.geneZone && !w.geneTraitee) {
        retenue = { zone: this.joliZone(w.geneZone), intensite: w.geneIntensite ?? null,
                    date: j.date, source: 'WELLNESS', contexte: null };
        break;
      }
    }

    // `rpeHisto` n'est pas garanti trié : on parcourt tout et on garde la plus récente.
    for (const r of this.rpeHisto) {
      if (!r.geneZone || r.geneTraitee) continue;
      if (retenue && retenue.date >= r.date) continue;
      retenue = { zone: this.joliZone(r.geneZone), intensite: r.geneIntensite ?? null,
                  date: r.date, source: 'RPE', contexte: r.seanceTitre ?? null };
    }
    return retenue;
  }

  /**
   * Marqueur neuromusculaire (perte de vitesse de pointe) : il PÈSE dans le classement
   * « à surveiller » du dashboard préparateur, mais la fiche ne l'affichait nulle part. Un joueur
   * signalé en fatigue neuromusculaire ouvrait donc une fiche muette, qui semblait le contredire.
   * Seul le résumé d'équipe porte ce champ — `getRisque` / `getFatigue` ne le renvoient pas.
   */
  get marqueurNeuro(): { niveau: string; message: string } | null {
    const r = this.resume;
    if (!r?.sprint_niveau || !r.sprint_message) return null;
    return { niveau: r.sprint_niveau, message: r.sprint_message };
  }

  /**
   * Dernière saisie retenue = la dernière DE LA FENÊTRE affichée. C'était auparavant la dernière de
   * tout l'historique : avec une saisie vieille de deux mois, le KPI affichait un score que le bloc
   * « Dernier relevé » (lui, borné à la fenêtre) ne savait pas décomposer → « D'où vient le score
   * de 34/50 ? » suivi d'aucune jauge.
   */
  get wellnessDernier(): Wellness | null {
    return this.wellnessDernierRempli;
  }
  get hooperDernier(): number | null {
    const w = this.wellnessDernier;
    return w ? this.hooperTotal(w) : null;
  }
  /** Date de la dernière saisie retenue, pour dater explicitement le KPI. */
  get hooperDernierDate(): string | null { return this.wellnessDernier?.date ?? null; }
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
    if (this.surOngletSubjectif) this.buildSuiviChart();
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
            error: () => { },
          });
        }
      },
      error: () => { },
    });
  }

  private buildPoidsChart(): void {
    if (this.pesees.length === 0) return;
    const labels = this.pesees.map(p => {
      const d = new Date(p.date);
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    });
    const valeurs = this.pesees.map(p => p.poids);
    const cible = this.joueur?.poidsFormeCible;
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
