import { Component, Input, OnChanges, inject } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChartComponent, ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexStroke, ApexMarkers, ApexLegend, ApexTooltip, ApexDataLabels, ApexGrid } from 'ng-apexcharts';
import { AuthService } from '@core/services/auth.service';
import {
  Axe, CategorieAxe, Entretien, EntretienService, StatutAxe, Synthese,
} from '@core/services/entretien.service';
import { EntretienDialogComponent, EntretienDialogData } from './entretien-dialog.component';

/** Onglet « Suivi individuel » de la fiche joueur (staff) : axes, progression, timeline. */
@Component({
  selector: 'app-suivi-individuel',
  standalone: true,
  templateUrl: './suivi-individuel.component.html',
  styleUrl: './suivi-individuel.component.scss',
  imports: [DatePipe, LowerCasePipe, FormsModule, ChartComponent],
})
export class SuiviIndividuelComponent implements OnChanges {

  @Input({ required: true }) joueurId!: string;
  @Input() joueurNom = '';
  /** true si aucun compte utilisateur n'est lié à la fiche (partage visible mais sans notif). */
  @Input() sansCompte = false;

  private service = inject(EntretienService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  axes: Axe[] = [];
  entretiens: Entretien[] = [];
  synthese: Synthese | null = null;
  chargement = true;

  // Pagination (axes + timeline) : 3 ou 6 par page, défaut 3.
  readonly TAILLES_PAGE = [3, 6];
  axesTaille = 3;
  axesPage = 0;
  entTaille = 3;
  entPage = 0;

  // Création d'axe inline
  ajoutAxeOuvert = false;
  nouvelAxe = { libelle: '', categorie: 'TECHNIQUE' as CategorieAxe };

  readonly CATEGORIES: { value: CategorieAxe; label: string }[] = [
    { value: 'TECHNIQUE', label: 'Technique' },
    { value: 'TACTIQUE',  label: 'Tactique' },
    { value: 'MENTAL',    label: 'Mental' },
    { value: 'PHYSIQUE',  label: 'Physique' },
  ];

  readonly TYPE_ICONS: Record<string, string> = { VIDEO: '🎬', TERRAIN: '🥅', DISCUSSION: '💬' };
  readonly TYPE_LABELS: Record<string, string> = { VIDEO: 'Vidéo', TERRAIN: 'Terrain', DISCUSSION: 'Discussion' };
  readonly TEND_ICONS: Record<string, string> = { EN_PROGRES: '↗', STAGNE: '→', REGRESSE: '↘' };
  readonly TEND_TONE: Record<string, string> = { EN_PROGRES: 'up', STAGNE: 'flat', REGRESSE: 'down' };
  // Palette catégorielle (chips + séries) — volontairement non thémée.
  private readonly CAT_COLORS: Record<string, string> = {
    TECHNIQUE: '#2563eb', TACTIQUE: '#7c3aed', MENTAL: '#db2777', PHYSIQUE: '#0891b2',
  };
  private readonly PALETTE = ['#16a34a', '#2563eb', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];

  /** Légende personnalisée sous le graphe (une entrée par axe tracé). */
  legende: { name: string; color: string }[] = [];

  chartOptions: {
    series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis; yaxis: ApexYAxis;
    stroke: ApexStroke; markers: ApexMarkers; legend: ApexLegend; tooltip: ApexTooltip;
    dataLabels: ApexDataLabels; grid: ApexGrid; colors: string[];
  } = {
    series: [],
    chart: { type: 'line', height: 300, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif' },
    xaxis: { type: 'datetime', labels: { style: { colors: '#64748B', fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, max: 5, tickAmount: 5, labels: { style: { colors: '#94A3B8', fontSize: '11px' }, formatter: (v: number) => `${Math.round(v)}` } },
    stroke: { curve: 'smooth', width: 2.5 },
    markers: { size: 4, strokeWidth: 2, strokeColors: '#fff', hover: { size: 6 } },
    legend: { show: false },
    tooltip: { theme: 'light', style: { fontFamily: 'Manrope, sans-serif' } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#E5E9EF', strokeDashArray: 4, padding: { left: 4, right: 8 } },
    colors: this.PALETTE,
  };

  ngOnChanges(): void {
    if (this.joueurId) this.recharger();
  }

  get peutEcrireAxe(): boolean { return this.auth.has('axe:write'); }
  get peutEcrireEntretien(): boolean { return this.auth.has('entretien:write'); }
  get peutModerer(): boolean { return this.auth.has('entretien:manage'); }

  // ── KPI dérivés (bandeau de tête) — sur les comptes-rendus REALISE (un RDV à venir ne compte pas) ──
  get axesEnCours(): Axe[] { return this.axes.filter(a => a.statut === 'EN_COURS'); }
  get nbAxesActifs(): number { return this.axesEnCours.length; }
  get nbAcquis(): number { return this.axes.filter(a => a.statut === 'ACQUIS').length; }
  private get entretiensRealises(): Entretien[] { return this.entretiens.filter(e => e.statut !== 'PLANIFIE'); }
  get nbEntretiens(): number { return this.entretiensRealises.length; }
  get rdvsAVenir(): Entretien[] { return this.entretiens.filter(e => e.statut === 'PLANIFIE'); }

  /** Jours depuis le dernier entretien réalisé (le plus récent), ou null si aucun. */
  get joursDernierEntretien(): number | null {
    const realises = this.entretiensRealises;
    if (!realises.length) return null;
    const dernier = Math.max(...realises.map(e => new Date(e.dateEntretien).getTime()));
    return Math.max(0, Math.floor((Date.now() - dernier) / 86_400_000));
  }

  private get axesNotes(): Axe[] {
    return this.axes.filter(a => a.statut !== 'ABANDONNE' && a.derniereNote != null);
  }
  get noteStaffMoyenne(): number | null {
    const n = this.axesNotes;
    return n.length ? n.reduce((s, a) => s + (a.derniereNote as number), 0) / n.length : null;
  }

  private get pairesEcart(): Axe[] {
    return this.axes.filter(a => a.derniereNote != null && a.derniereAutoEvalNote != null);
  }
  /** Écart absolu moyen entre note staff et auto-évaluation joueur. */
  get ecartStaffJoueur(): number | null {
    const p = this.pairesEcart;
    return p.length
      ? p.reduce((s, a) => s + Math.abs((a.derniereNote as number) - (a.derniereAutoEvalNote as number)), 0) / p.length
      : null;
  }
  /** Interprétation de l'écart signé (auto − staff) pour le sous-texte du KPI. */
  get ecartSens(): string {
    const p = this.pairesEcart;
    if (!p.length) return 'aucune auto-évaluation';
    const moy = p.reduce((s, a) => s + ((a.derniereAutoEvalNote as number) - (a.derniereNote as number)), 0) / p.length;
    if (Math.abs(moy) < 0.25) return 'perception alignée';
    return moy < 0 ? 'le joueur se sous-note' : 'le joueur se surnote';
  }

  fmt1(v: number | null): string { return v == null ? '—' : v.toFixed(1).replace('.', ','); }

  /** Jours écoulés depuis une date ISO (pour la timeline). */
  joursDepuis(date: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  }

  /** Jours restants avant une date ISO (pour un RDV planifié) ; 0 = aujourd'hui. */
  joursAvant(date: string): number {
    return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000));
  }

  /** 'HH:mm' d'une heure ISO ('HH:mm:ss'), ou '' si absente. */
  heureCourte(heure?: string | null): string {
    return heure ? heure.slice(0, 5) : '';
  }

  /** Écart absolu d'un axe (staff vs joueur), null si l'une des deux notes manque. */
  ecartAxe(a: Axe): number | null {
    if (a.derniereNote == null || a.derniereAutoEvalNote == null) return null;
    return Math.abs(a.derniereNote - a.derniereAutoEvalNote);
  }
  /** Sous-libellé de la colonne écart d'un axe. */
  ecartAxeSens(a: Axe): string {
    if (a.derniereNote == null || a.derniereAutoEvalNote == null) return 'pas d\'auto';
    const d = a.derniereAutoEvalNote - a.derniereNote;
    if (d === 0) return 'aligné';
    return d < 0 ? 'se sous-note' : 'se surnote';
  }

  // ── Pagination (axes + timeline) ──
  get axesVisibles(): Axe[] {
    const start = this.axesPage * this.axesTaille;
    return this.axes.slice(start, start + this.axesTaille);
  }
  get axesNbPages(): number { return Math.max(1, Math.ceil(this.axes.length / this.axesTaille)); }
  get entretiensVisibles(): Entretien[] {
    const start = this.entPage * this.entTaille;
    return this.entretiens.slice(start, start + this.entTaille);
  }
  get entNbPages(): number { return Math.max(1, Math.ceil(this.entretiens.length / this.entTaille)); }

  setAxesTaille(t: number): void { this.axesTaille = t; this.axesPage = 0; }
  axesPagePrec(): void { if (this.axesPage > 0) this.axesPage--; }
  axesPageSuiv(): void { if (this.axesPage < this.axesNbPages - 1) this.axesPage++; }
  setEntTaille(t: number): void { this.entTaille = t; this.entPage = 0; }
  entPagePrec(): void { if (this.entPage > 0) this.entPage--; }
  entPageSuiv(): void { if (this.entPage < this.entNbPages - 1) this.entPage++; }

  private recharger(): void {
    this.chargement = true;
    this.axesPage = 0;
    this.entPage = 0;
    this.service.listerAxes(this.joueurId).subscribe(a => this.axes = a);
    this.service.synthese(this.joueurId).subscribe(s => { this.synthese = s; this.construireGraphe(s); });
    this.service.listerEntretiens(this.joueurId).subscribe({
      next: e => { this.entretiens = e; this.chargement = false; },
      error: () => this.chargement = false,
    });
  }

  private construireGraphe(s: Synthese): void {
    const axesTraces = s.axes.filter(a => a.serie.some(p => p.note != null));
    const series: ApexAxisChartSeries = axesTraces.map(a => ({
      name: a.libelle,
      data: a.serie.filter(p => p.note != null).map(p => ({ x: new Date(p.date).getTime(), y: p.note as number })),
    }));
    const colors = axesTraces.map((a, i) => this.CAT_COLORS[a.categorie] ?? this.PALETTE[i % this.PALETTE.length]);
    this.chartOptions.series = series;
    this.chartOptions.colors = colors;
    this.legende = axesTraces.map((a, i) => ({ name: a.libelle, color: colors[i] }));
  }

  categorieLabel(c?: string | null): string {
    return this.CATEGORIES.find(x => x.value === c)?.label ?? (c ?? '');
  }

  // ── Axes ──
  toggleAjoutAxe(): void { this.ajoutAxeOuvert = !this.ajoutAxeOuvert; }

  creerAxe(): void {
    const libelle = this.nouvelAxe.libelle.trim();
    if (!libelle) return;
    this.service.creerAxe(this.joueurId, { libelle, categorie: this.nouvelAxe.categorie }).subscribe(() => {
      this.nouvelAxe = { libelle: '', categorie: 'TECHNIQUE' };
      this.ajoutAxeOuvert = false;
      this.recharger();
    });
  }

  changerStatutAxe(a: Axe, statut: StatutAxe): void {
    this.service.modifierAxe(a.id, { libelle: a.libelle, categorie: a.categorie, statut }).subscribe(() => this.recharger());
  }

  supprimerAxe(a: Axe): void {
    if (!confirm(`Supprimer l'axe « ${a.libelle} » ? (s'il a des entretiens, il sera archivé)`)) return;
    this.service.supprimerAxe(a.id).subscribe(() => this.recharger());
  }

  // ── Entretiens ──
  ouvrirSaisie(entretien?: Entretien, opts?: { modeInitial?: 'PLANIFIE' | 'REALISE'; realiser?: boolean }): void {
    const data: EntretienDialogData = {
      joueurId: this.joueurId,
      joueurNom: this.joueurNom,
      axesExistants: this.axes.filter(a => a.statut === 'EN_COURS'),
      entretien,
      modeInitial: opts?.modeInitial,
      realiser: opts?.realiser,
    };
    this.dialog.open(EntretienDialogComponent, { data, autoFocus: false, panelClass: 'rcp-dialog' })
      .afterClosed().subscribe(ok => { if (ok) this.recharger(); });
  }

  /** Planifier un RDV (création en mode PLANIFIE). */
  ouvrirPlanification(): void { this.ouvrirSaisie(undefined, { modeInitial: 'PLANIFIE' }); }

  /** Réaliser un RDV : rouvre la même fiche en mode compte-rendu (transition PLANIFIE → REALISE). */
  realiserRdv(e: Entretien): void { this.ouvrirSaisie(e, { realiser: true }); }

  basculerPartage(e: Entretien): void {
    this.service.basculerVisibilite(e.id).subscribe(res => {
      let msg: string;
      if (!res.partage) {
        msg = 'Entretien repassé en privé (staff)';
      } else if (res.notificationEnvoyee) {
        msg = 'Partagé — le joueur a reçu une notification';
      } else {
        msg = 'Partagé — visible dès l\'activation du compte du joueur (aucun compte lié pour l\'instant)';
      }
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.recharger();
    });
  }

  supprimerEntretien(e: Entretien): void {
    if (!confirm('Supprimer cet entretien ?')) return;
    this.service.supprimerEntretien(e.id).subscribe(() => this.recharger());
  }

  peutEditer(e: Entretien): boolean {
    return this.peutEcrireEntretien || this.peutModerer;
  }
}
