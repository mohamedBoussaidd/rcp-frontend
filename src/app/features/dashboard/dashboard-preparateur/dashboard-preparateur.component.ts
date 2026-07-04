import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe, DatePipe, SlicePipe, LowerCasePipe } from '@angular/common';
import { couleurTheme } from '@core/services/theme.service';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import {
  ApexChart, ApexAxisChartSeries, ApexXAxis, ApexYAxis, ApexStroke,
  ApexDataLabels, ApexTitleSubtitle, ApexTheme, ApexGrid, ApexAnnotations,
  ChartComponent,
} from 'ng-apexcharts';

import { PredictionService, ResumeJoueur, RapportSeance } from '@core/services/prediction.service';
import { SeanceService, Seance } from '@core/services/seance.service';
import { JoueurService } from '@core/services/joueur.service';
import { SuiviSubjectifService, Wellness } from '@core/services/suivi-subjectif.service';
import { SaisonService, Saison, PeriodeType } from '@core/services/saison.service';
import { PresenceDialogComponent } from '../../performance/presence-dialog/presence-dialog.component';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';

type Semaines = 4 | 8 | 12;

/**
 * Dashboard spécialisé préparateur physique : centré sur la lecture de l'état
 * de fraîcheur de l'effectif (readiness), les joueurs à surveiller (risque /
 * ACWR / fatigue), la charge collective et le bilan prévu/réalisé de la
 * dernière séance. Volontairement sans le tableau effectif complet (déplacé
 * dans GPS › État de l'effectif).
 */
@Component({
  selector: 'app-dashboard-preparateur',
  standalone: true,
  templateUrl: './dashboard-preparateur.component.html',
  styleUrl: './dashboard-preparateur.component.scss',
  imports: [DecimalPipe, DatePipe, SlicePipe, LowerCasePipe, RouterLink, MatIcon, ChartComponent, InfoHintComponent],
})
export class DashboardPreparateurComponent implements OnInit {

  private prediction = inject(PredictionService);
  private seanceService = inject(SeanceService);
  private joueurService = inject(JoueurService);
  private suivi = inject(SuiviSubjectifService);
  private saisonService = inject(SaisonService);
  private dialog = inject(MatDialog);

  /* ── Saison / période courante (bandeau) ── */
  saisonCourante: Saison | null = null;
  infoPeriodeOuverte = false;

  get periodeType(): PeriodeType | 'AUCUNE' {
    return this.saisonCourante?.periodeCourante?.type ?? 'AUCUNE';
  }
  get periodeLabel(): string {
    return this.saisonCourante?.periodeCourante?.libelle ?? 'Hors période définie';
  }
  /** Explication contextuelle « ce qu'on surveille » selon la période. */
  get explicationPeriode(): string {
    switch (this.periodeType) {
      case 'PREPARATION':
        return "Phase de montée en charge. On ne surveille pas l'ACWR (pas de référence stable) "
          + "mais la progressivité de la charge et le ressenti (wellness/RPE). Une charge élevée est attendue.";
      case 'COMPETITION':
        return "Phase de compétition. Surveillance complète : ACWR (écarts de charge), fatigue, "
          + "readiness et risque de blessure.";
      case 'TREVE':
        return "Trêve : pas d'entraînement attendu. Les alertes de charge et de fatigue sont "
          + "suspendues, les joueurs n'apparaissent pas « à surveiller ».";
      case 'REPRISE':
        return "Reprise après trêve : l'ACWR est neutralisé le temps que la référence se "
          + "reconstruise. On suit la progressivité et le ressenti.";
      case 'INTERSAISON':
        return "Intersaison : hors charge, aucun suivi actif.";
      default:
        return "Aucune période n'est définie pour aujourd'hui. Définis les périodes de la saison "
          + "pour adapter la surveillance (préparation, championnat, trêve…).";
    }
  }

  joueurs: ResumeJoueur[] = [];
  statutMap = new Map<string, string>();
  remplisAujIds = new Set<string>();
  wellnessData: Wellness[] = [];
  loading = true;

  /** Libellés lisibles des zones de gêne. */
  private readonly ZONES_LABEL: Record<string, string> = {
    ischio_jambiers: 'ischio-jambiers', quadriceps: 'quadriceps', mollet: 'mollet',
    cheville: 'cheville', genou: 'genou', hanche: 'hanche', dos: 'dos',
    epaule: 'épaule', adducteurs: 'adducteurs', autre: 'zone signalée',
  };

  seancesAujourdhui: Seance[] = [];
  seancesAVenir: Seance[] = [];
  derniereSeance: Seance | null = null;
  rapport: RapportSeance | null = null;

  semaines: Semaines = 4;

  readonly aujourdhui = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  /* ── Textes d'aide (info-hint) ── */
  readonly aide = {
    readiness: "Indice de fraîcheur ressentie (questionnaire de Hooper : sommeil, "
      + "fatigue, courbatures, stress, humeur). 0 à 100, plus c'est haut mieux c'est. "
      + "Calculé sur la dernière saisie du joueur. Sous 55 = à surveiller, sous 40 = dégradé.",
    acwr: "Ratio charge aiguë / chronique (Gabbett). Compare ta charge des 7 derniers "
      + "jours à ta moyenne des 4 semaines précédentes. Zone optimale 0.8–1.3 ; "
      + "au-dessus de 1.5 le risque de blessure augmente nettement ; sous 0.8 = sous-charge.",
    risque: "Score prédictif de risque de blessure (0–100), combinant l'ACWR, "
      + "les blessures récentes et l'écart de poids. Plus c'est haut, plus la vigilance s'impose.",
    fatigue: "Score d'alerte fatigue (0–100) issu de la baisse de performance GPS, "
      + "de la monotonie d'entraînement, du ressenti et de la congestion de matchs.",
    charge: "Distance totale parcourue par l'équipe, semaine par semaine. Sert à "
      + "vérifier la progressivité : on évite les hausses brutales (> ~10 % d'une "
      + "semaine à l'autre), facteur de blessure.",
    bilan: "Compare la distance réellement parcourue à l'objectif d'équipe défini "
      + "pour la séance. Permet de voir si la séance a produit la charge visée.",
  };

  /* ── Chart ── */
  chartOptions: {
    series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis; yaxis: ApexYAxis;
    stroke: ApexStroke; dataLabels: ApexDataLabels; title: ApexTitleSubtitle;
    theme: ApexTheme; grid: ApexGrid; colors: string[]; annotations: ApexAnnotations;
  } = {
    series:      [{ name: 'Charge équipe (km)', data: [] }],
    chart:       { type: 'area', height: 260, toolbar: { show: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif' },
    xaxis:       { categories: [], labels: { style: { colors: '#64748B', fontSize: '12px' } } },
    yaxis:       { labels: { style: { colors: '#64748B', fontSize: '12px' } } },
    stroke:      { curve: 'smooth', width: 2.5 },
    dataLabels:  { enabled: false },
    title:       { text: '' },
    theme:       { mode: 'light' },
    grid:        { borderColor: '#E5E9EF', strokeDashArray: 3 },
    colors:      [couleurTheme()],
    annotations: {},
  };

  ngOnInit(): void {
    this.loadEquipe();
    this.loadStatuts();
    this.loadCharge();
    this.loadSeances();
    this.loadWellnessJour();
    this.saisonService.getCourante().subscribe({
      next: s => (this.saisonCourante = s),
      error: () => {},
    });
  }

  /** Joueurs (effectif actif) n'ayant pas saisi leur wellness aujourd'hui. */
  get nbNonRemplis(): number {
    return this.joueurs.filter(j => !this.remplisAujIds.has(j.joueur_id)).length;
  }

  /* ── KPIs ── */
  get nbDisponibles(): number {
    return [...this.statutMap.values()].filter(s => s === 'actif').length;
  }
  get nbBlesses(): number {
    return [...this.statutMap.values()].filter(s => s === 'blesse').length;
  }
  get nbRisqueEleve(): number {
    return this.joueurs.filter(j => j.niveau_risque === 'ELEVE').length;
  }
  get nbAlerteFatigue(): number {
    return this.joueurs.filter(j => j.niveau_fatigue === 'ALERTE').length;
  }
  get readinessEquipe(): number | null {
    const vals = this.joueurs.map(j => j.readiness).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }

  /* ── À surveiller ── */
  /** États « hors charge » : le joueur ne doit jamais remonter dans « à surveiller ». */
  private estSilence(j: ResumeJoueur): boolean {
    return j.etat === 'INACTIF' || j.etat === 'HORS_CHARGE'
        || j.etat === 'HORS_SAISON' || j.etat === 'BLESSE';
  }

  private priorite(j: ResumeJoueur): number {
    if (this.estSilence(j)) return 0;
    let p = 0;
    if (j.niveau_risque === 'ELEVE') p += 100;
    else if (j.niveau_risque === 'MODERE') p += 40;
    if (j.acwr != null && j.acwr > 1.5) p += 60;
    else if (j.acwr != null && j.acwr > 1.3) p += 30;
    if (j.niveau_fatigue === 'ALERTE') p += 50;
    else if (j.niveau_fatigue === 'VIGILANCE') p += 20;
    if (j.readiness != null && j.readiness < 40) p += 40;
    else if (j.readiness != null && j.readiness < 55) p += 15;
    // Fatigue neuromusculaire (sprint)
    if (j.sprint_niveau === 'PROBABLE') p += 60;
    else if (j.sprint_niveau === 'POSSIBLE') p += 35;
    // Gêne déclarée récente (rappel d'un problème)
    const g = this.geneRecente(j.joueur_id);
    if (g) p += g.jours <= 2 ? 55 : 30;
    // Wellness du jour dégradé
    p += this.wellnessJourDegrade(j.joueur_id).length * 12;
    return p;
  }

  get aSurveiller(): ResumeJoueur[] {
    return this.joueurs
      .map(j => ({ j, p: this.priorite(j) }))
      .filter(x => x.p > 0)
      .sort((a, b) => b.p - a.p)
      .slice(0, 5)
      .map(x => x.j);
  }

  acwrClasse(acwr: number | null | undefined): string {
    if (acwr == null) return 'neutral';
    if (acwr > 1.5) return 'bad';
    if (acwr > 1.3 || acwr < 0.8) return 'warn';
    return 'ok';
  }
  readinessClasse(r: number | null | undefined): string {
    if (r == null) return 'neutral';
    if (r < 40) return 'bad';
    if (r < 55) return 'warn';
    return 'ok';
  }

  /* ── Bilan dernière séance ── */
  get bilanObjectifM(): number | null {
    return this.rapport?.objectif_distance_m ?? null;
  }
  get bilanAtteint(): number {
    return (this.rapport?.lignes ?? []).filter(l => l.atteint_objectif_seance === true).length;
  }
  get bilanConcernes(): number {
    return (this.rapport?.lignes ?? []).filter(l => l.atteint_objectif_seance != null).length;
  }

  /* ── Chargements ── */
  loadEquipe(): void {
    this.prediction.getResumeEquipe().subscribe({
      next: data => { this.joueurs = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  loadStatuts(): void {
    this.joueurService.getAll().subscribe({
      next: data => { this.statutMap = new Map(data.map(j => [j.id, j.statut])); },
      error: () => {},
    });
  }

  loadWellnessJour(): void {
    this.suivi.getWellness().subscribe({
      next: data => {
        this.wellnessData = data;
        this.remplisAujIds = new Set(
          data.filter(w => w.date === this.aujourdhui).map(w => w.joueurId));
      },
      error: () => {},
    });
  }

  /** Gêne déclarée non traitée dans les 7 derniers jours (la plus récente). */
  geneRecente(joueurId: string): { zone: string; jours: number } | null {
    const limite = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const w = this.wellnessData
      .filter(x => x.joueurId === joueurId && x.geneZone && !x.geneTraitee && x.date >= limite)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!w?.geneZone) return null;
    const jours = Math.round((Date.now() - new Date(w.date).getTime()) / 86400000);
    return { zone: this.ZONES_LABEL[w.geneZone] ?? w.geneZone.replace(/_/g, ' '), jours };
  }

  /** Items dégradés de la saisie du jour (sommeil/courbatures/fatigue ≥ 4/5). */
  private wellnessJourDegrade(joueurId: string): string[] {
    const w = this.wellnessData.find(x => x.joueurId === joueurId && x.date === this.aujourdhui);
    if (!w) return [];
    const out: string[] = [];
    if (w.sommeil >= 4) out.push('sommeil dégradé');
    if (w.douleur >= 4) out.push('courbatures');
    if (w.fatigue >= 4) out.push('fatigue déclarée');
    return out;
  }

  jourDegradeChips(joueurId: string): string[] { return this.wellnessJourDegrade(joueurId); }

  /** Message d'orientation combiné (sprint neuromusculaire + rappel de gêne). */
  messageSurveillance(j: ResumeJoueur): string | null {
    const parts: string[] = [];
    if (j.sprint_message) parts.push(j.sprint_message);
    const g = this.geneRecente(j.joueur_id);
    if (g) {
      const ilya = g.jours <= 0 ? "aujourd'hui" : g.jours === 1 ? 'il y a 1 jour' : `il y a ${g.jours} jours`;
      parts.push(parts.length
        ? `en plus d'une gêne aux ${g.zone} ${ilya}`
        : `gêne aux ${g.zone} signalée ${ilya}`);
    }
    return parts.length ? this.capitaliser(parts.join(' — ')) : null;
  }

  private capitaliser(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  loadCharge(): void {
    this.prediction.getChargeCollective(this.semaines).subscribe({
      next: res => {
        this.chartOptions = {
          ...this.chartOptions,
          series: [{ name: 'Charge équipe (km)', data: res.data }],
          xaxis: { ...this.chartOptions.xaxis, categories: res.labels },
        };
      },
      error: () => {},
    });
  }

  changerSemaines(s: Semaines): void {
    if (this.semaines === s) return;
    this.semaines = s;
    this.loadCharge();
  }

  loadSeances(): void {
    this.seanceService.getAll().subscribe({
      next: data => {
        // « À venir » est piloté par le statut : une séance réalisée (ou annulée) en sort.
        const aVenir = data
          .filter(s => s.date >= this.aujourdhui && s.statut === 'PLANIFIEE')
          .sort((a, b) => a.date.localeCompare(b.date) || (a.heureDebut ?? '').localeCompare(b.heureDebut ?? ''));
        this.seancesAujourdhui = aVenir.filter(s => s.date === this.aujourdhui);
        this.seancesAVenir = aVenir.filter(s => s.date > this.aujourdhui).slice(0, 3);

        // Dernière séance réalisée → bilan prévu/réalisé (une séance faite aujourd'hui y bascule).
        const passees = data
          .filter(s => s.statut === 'REALISEE')
          .sort((a, b) => b.date.localeCompare(a.date) || (b.heureDebut ?? '').localeCompare(a.heureDebut ?? ''));
        this.derniereSeance = passees[0] ?? null;
        if (this.derniereSeance) {
          this.prediction.getRapportSeance(this.derniereSeance.id).subscribe({
            next: r => { this.rapport = r; },
            error: () => {},
          });
        }
      },
      error: () => {},
    });
  }

  allerPresence(seance: Seance): void {
    this.dialog.open(PresenceDialogComponent, {
      data: { seance }, panelClass: 'app-dialog', maxWidth: '95vw',
    });
  }
}
