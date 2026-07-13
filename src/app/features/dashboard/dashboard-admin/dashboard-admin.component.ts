import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { DocumentAdminService, ConformiteResponse } from '@core/services/documentadmin.service';
import { MonClubService, MonClub } from '@core/services/mon-club.service';

interface CategorieLigne { code: string; nb: number; }

/**
 * Vue d'ensemble du menu « Administration » — page d'accueil de l'Administratif.
 * Trois regards, tous CLUB-WIDE (pas de scope saison) : conformité documentaire de l'effectif,
 * comptes du club (staff / joueurs / équipes) et répartition de l'effectif par catégorie d'âge.
 * Purement en lecture + liens de drill-down vers Licences & documents / Annuaire / Mon club.
 */
@Component({
  selector: 'app-dashboard-admin',
  standalone: true,
  templateUrl: './dashboard-admin.component.html',
  styleUrl: './dashboard-admin.component.scss',
  imports: [RouterLink, MatIcon],
})
export class DashboardAdminComponent implements OnInit {

  private docService = inject(DocumentAdminService);
  private clubService = inject(MonClubService);

  readonly conformite = signal<ConformiteResponse | null>(null);
  readonly club = signal<MonClub | null>(null);
  readonly loading = signal(true);

  // ── Comptes ──
  readonly staffCount   = computed(() => (this.club()?.membres ?? []).filter(m => m.role !== 'JOUEUR').length);
  readonly joueursCount = computed(() => (this.club()?.membres ?? []).filter(m => m.role === 'JOUEUR').length);
  readonly equipesCount = computed(() => this.club()?.equipes.length ?? 0);
  readonly clubNom      = computed(() => this.club()?.clubNom ?? '');

  // ── Conformité ──
  readonly complets    = computed(() => this.conformite()?.complets ?? 0);
  readonly incomplets  = computed(() => this.conformite()?.incomplets ?? 0);
  readonly aValider    = computed(() => this.conformite()?.aValider ?? 0);
  readonly expirent    = computed(() => this.conformite()?.expirentSous30j ?? 0);
  readonly effectifTotal = computed(() => this.conformite()?.joueurs.length ?? 0);
  /** Part de l'effectif en règle (barre de progression). */
  readonly tauxConformite = computed(() => {
    const tot = this.effectifTotal();
    return tot ? Math.round((this.complets() / tot) * 100) : 0;
  });

  // ── Effectif par catégorie d'âge (dérivé de la conformité, club-wide) ──
  readonly parCategorie = computed<CategorieLigne[]>(() => {
    const joueurs = this.conformite()?.joueurs ?? [];
    const map = new Map<string, number>();
    for (const j of joueurs) {
      const code = j.categorieAgeCode || 'Non catégorisé';
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([code, nb]) => ({ code, nb }))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  });
  /** Effectif de la plus grosse catégorie (échelle des barres). */
  readonly categorieMax = computed(() => Math.max(1, ...this.parCategorie().map(c => c.nb)));

  ngOnInit(): void {
    this.docService.conformite().subscribe({
      next: c => { this.conformite.set(c); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.clubService.getMonClub().subscribe({
      next: c => this.club.set(c),
      error: () => {},
    });
  }

  pct(nb: number): number {
    return Math.round((nb / this.categorieMax()) * 100);
  }
}
