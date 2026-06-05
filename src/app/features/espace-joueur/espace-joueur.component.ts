import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { EspaceJoueurService, MaPesee } from '../../core/services/espace-joueur.service';
import { Joueur, GpsPoint } from '../../core/services/joueur.service';
import { Blessure } from '../../core/services/blessure.service';
import { Seance } from '../../core/services/seance.service';

@Component({
  selector: 'app-espace-joueur',
  standalone: true,
  templateUrl: './espace-joueur.component.html',
  styleUrl: './espace-joueur.component.scss',
  imports: [DatePipe, DecimalPipe, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class EspaceJoueurComponent implements OnInit {

  profil = signal<Joueur | null>(null);
  pesees = signal<MaPesee[]>([]);
  blessures = signal<Blessure[]>([]);
  gps = signal<GpsPoint[]>([]);
  seances = signal<Seance[]>([]);
  loading = signal(true);
  nonLie = signal(false);

  /** Séances non annulées à partir d'aujourd'hui, triées chronologiquement (vue « prévues »). */
  readonly seancesAVenir = computed(() => {
    const auj = new Date().toISOString().slice(0, 10);
    return this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date >= auj)
      .sort((a, b) => (a.date + (a.heureDebut ?? '')).localeCompare(b.date + (b.heureDebut ?? '')));
  });

  // ── Pagination (7 par page) : poids et dernières séances (GPS), plus récentes d'abord ──
  readonly TAILLE_PAGE = 7;
  peseesPage = signal(0);
  gpsPage = signal(0);

  private readonly gpsTries = computed(() =>
    this.gps().slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));

  readonly peseesNbPages = computed(() => Math.max(1, Math.ceil(this.pesees().length / this.TAILLE_PAGE)));
  readonly gpsNbPages = computed(() => Math.max(1, Math.ceil(this.gpsTries().length / this.TAILLE_PAGE)));
  readonly peseesAffichees = computed(() => {
    const i = this.peseesPage() * this.TAILLE_PAGE;
    return this.pesees().slice(i, i + this.TAILLE_PAGE);
  });
  readonly gpsAffichees = computed(() => {
    const i = this.gpsPage() * this.TAILLE_PAGE;
    return this.gpsTries().slice(i, i + this.TAILLE_PAGE);
  });

  pagePesees(d: number): void {
    this.peseesPage.update(p => Math.min(this.peseesNbPages() - 1, Math.max(0, p + d)));
  }
  pageGps(d: number): void {
    this.gpsPage.update(p => Math.min(this.gpsNbPages() - 1, Math.max(0, p + d)));
  }

  readonly dernierPoids = computed(() => this.pesees()[0]?.poids ?? null);
  readonly ecartCible = computed(() => {
    const p = this.profil();
    const dp = this.dernierPoids();
    if (!p || p.poidsFormeCible == null || dp == null) return null;
    return Math.round((dp - p.poidsFormeCible) * 10) / 10;
  });

  constructor(private service: EspaceJoueurService) {}

  ngOnInit(): void {
    this.service.getProfil().subscribe({
      next: p => { this.profil.set(p); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 409) this.nonLie.set(true);
      },
    });
    this.service.getPesees().subscribe({ next: d => this.pesees.set(d), error: () => {} });
    this.service.getBlessures().subscribe({ next: d => this.blessures.set(d), error: () => {} });
    this.service.getGps().subscribe({ next: d => this.gps.set(d), error: () => {} });
    this.service.getSeances().subscribe({ next: d => this.seances.set(d), error: () => {} });
  }

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }
}
