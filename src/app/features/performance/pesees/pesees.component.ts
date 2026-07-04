import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { couleurTheme } from '@core/services/theme.service';
import { DecimalPipe, DatePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ApexChart, ApexAxisChartSeries, ApexXAxis, ApexYAxis, ApexStroke,
  ApexDataLabels, ApexFill, ApexMarkers, ApexTooltip, ApexGrid,
  ChartComponent,
} from 'ng-apexcharts';

import { PeseesService, PoidsFicheJoueur } from '@core/services/pesees.service';
import { AuthService } from '@core/services/auth.service';

interface LignePesee extends PoidsFicheJoueur {
  poidsInput: number | null;
  saving: boolean;
  saved: boolean;
}

type Semaines = 8 | 16 | 24;

/**
 * Pesée de l'effectif (GPS) — saisie du poids du jour par carte joueur.
 * Un clic sur une carte ouvre la courbe de poids du joueur (8 / 16 / 24 sem.).
 */
@Component({
  selector: 'app-pesees',
  standalone: true,
  templateUrl: './pesees.component.html',
  styleUrl: './pesees.component.scss',
  imports: [FormsModule, DecimalPipe, DatePipe, MatIcon, ChartComponent],
})
export class PeseesComponent implements OnInit {

  private peseesService = inject(PeseesService);
  private snackBar = inject(MatSnackBar);
  auth = inject(AuthService);

  lignes: LignePesee[] = [];
  loading = true;
  datePesee = new Date().toISOString().slice(0, 10);
  recherche = '';

  /* ── Courbe (modale) ── */
  courbeJoueur: LignePesee | null = null;
  chargementCourbe = false;
  semaines: Semaines = 8;
  readonly periodes: Semaines[] = [8, 16, 24];
  private historiqueComplet: { date: string; poids: number }[] = [];

  chartOptions: {
    series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis; yaxis: ApexYAxis;
    stroke: ApexStroke; dataLabels: ApexDataLabels; fill: ApexFill; markers: ApexMarkers;
    tooltip: ApexTooltip; grid: ApexGrid; colors: string[];
  } = {
    series:     [{ name: 'Poids', data: [] }],
    chart:      { type: 'area', height: 300, toolbar: { show: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif', animations: { enabled: true } },
    xaxis:      { categories: [], labels: { style: { colors: '#94A3B8', fontSize: '12px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis:      { labels: { style: { colors: '#94A3B8', fontSize: '12px' }, formatter: (v: number) => `${Math.round(v * 10) / 10}` } },
    stroke:     { curve: 'smooth', width: 3 },
    dataLabels: { enabled: false },
    fill:       { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 95, 100] } },
    markers:    { size: 4, colors: [couleurTheme()], strokeColors: '#fff', strokeWidth: 2, hover: { size: 6 } },
    tooltip:    { theme: 'light', y: { formatter: (v: number) => `${v} kg` } },
    grid:       { borderColor: '#E5E9EF', strokeDashArray: 4, padding: { left: 8, right: 8 } },
    colors:     [couleurTheme()],
  };

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading = true;
    this.peseesService.getEquipe().subscribe({
      next: data => {
        this.lignes = data.map(d => ({ ...d, poidsInput: d.dernierPoids ?? null, saving: false, saved: false }));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Impossible de charger les données', 'Fermer', { duration: 4000 });
      },
    });
  }

  get lignesFiltrees(): LignePesee[] {
    const q = this.recherche.trim().toLowerCase();
    if (!q) return this.lignes;
    return this.lignes.filter(l =>
      `${l.prenom} ${l.nom}`.toLowerCase().includes(q) ||
      `${l.nom} ${l.prenom}`.toLowerCase().includes(q));
  }

  initiales(l: PoidsFicheJoueur): string {
    return `${(l.prenom || '').charAt(0)}${(l.nom || '').charAt(0)}`.toUpperCase();
  }

  /** État pondéral vs cible : surpoids (> +1 kg) / sous-poids (< −1 kg) / dans la cible. */
  etatPoids(l: LignePesee): { mode: 'sur' | 'sous' | 'ok'; classe: string } | null {
    if (l.ecartKg == null) return null;
    const e = l.ecartKg;
    if (e > 1) return { mode: 'sur', classe: e > 3 ? 'bad' : 'warn' };
    if (e < -1) return { mode: 'sous', classe: 'info' };
    return { mode: 'ok', classe: 'ok' };
  }

  sauvegarder(ligne: LignePesee): void {
    if (!ligne.poidsInput) return;
    ligne.saving = true;
    this.peseesService.upsert({ joueurId: ligne.joueurId, date: this.datePesee, poids: ligne.poidsInput }).subscribe({
      next: () => {
        ligne.saving = false;
        ligne.saved = true;
        ligne.dernierePeseeDate = this.datePesee;
        ligne.dernierPoids = ligne.poidsInput!;
        if (ligne.poidsFormeCible != null) {
          ligne.ecartKg = Math.round((ligne.poidsInput! - ligne.poidsFormeCible) * 10) / 10;
        }
        setTimeout(() => ligne.saved = false, 2000);
      },
      error: () => {
        ligne.saving = false;
        this.snackBar.open('Erreur lors de la sauvegarde', 'Fermer', { duration: 3000 });
      },
    });
  }

  /* ── Courbe de poids ── */
  ouvrirCourbe(ligne: LignePesee): void {
    this.courbeJoueur = ligne;
    this.semaines = 8;
    this.chargementCourbe = true;
    this.historiqueComplet = [];
    this.peseesService.getByJoueur(ligne.joueurId).subscribe({
      next: data => {
        this.historiqueComplet = data
          .map(p => ({ date: p.date, poids: p.poids }))
          .sort((a, b) => a.date.localeCompare(b.date));
        this.appliquerPeriode();
        this.chargementCourbe = false;
      },
      error: () => { this.chargementCourbe = false; },
    });
  }

  changerSemaines(s: Semaines): void {
    if (this.semaines === s) return;
    this.semaines = s;
    this.appliquerPeriode();
  }

  private appliquerPeriode(): void {
    const limite = new Date(Date.now() - this.semaines * 7 * 86400000).toISOString().slice(0, 10);
    const pts = this.historiqueComplet.filter(p => p.date >= limite);
    const labels = pts.map(p => new Date(p.date).toLocaleDateString('fr', { day: 'numeric', month: 'short' }));
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Poids', data: pts.map(p => p.poids) }],
      xaxis: { ...this.chartOptions.xaxis, categories: labels },
    };
  }

  get courbeData(): { date: string; poids: number }[] {
    const limite = new Date(Date.now() - this.semaines * 7 * 86400000).toISOString().slice(0, 10);
    return this.historiqueComplet.filter(p => p.date >= limite);
  }

  fermerCourbe(): void { this.courbeJoueur = null; }
}
