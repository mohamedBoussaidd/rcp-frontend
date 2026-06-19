import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';

import { PredictionService, ResumeJoueur } from '@core/services/prediction.service';
import { PeseesService, PoidsFicheJoueur } from '@core/services/pesees.service';
import { JoueurService } from '@core/services/joueur.service';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';

type Dispo = 'disponible' | 'incertain' | 'indisponible';

/**
 * État de l'effectif (GPS) — synthèse (KPIs) + table complète risque / fatigue /
 * ACWR / poids, avec recherche, tri et pagination. Déplacée depuis le dashboard
 * pour ne garder sur l'accueil que le pilotage essentiel.
 */
@Component({
  selector: 'app-etat-effectif',
  standalone: true,
  templateUrl: './etat-effectif.component.html',
  styleUrl: './etat-effectif.component.scss',
  imports: [DecimalPipe, FormsModule, RouterLink, MatIcon, InfoHintComponent],
})
export class EtatEffectifComponent implements OnInit {

  private prediction = inject(PredictionService);
  private peseesService = inject(PeseesService);
  private joueurService = inject(JoueurService);

  joueurs: ResumeJoueur[] = [];
  poidsMap = new Map<string, PoidsFicheJoueur>();
  statutMap = new Map<string, string>();
  loading = true;

  pageIndex = 0;
  pageSize = 10;
  recherche = '';
  triFatigue: 'asc' | 'desc' | null = null;
  triRisque: 'asc' | 'desc' | null = null;

  readonly aideAcwr = "Ratio charge aiguë / chronique (Gabbett) : charge des 7 derniers jours "
    + "vs moyenne des 4 semaines précédentes. Optimal 0.8–1.3 ; au-dessus de 1.5, risque accru.";

  ngOnInit(): void {
    this.loadEquipe();
    this.loadPoids();
    this.loadStatuts();
  }

  loadEquipe(): void {
    this.prediction.getResumeEquipe().subscribe({
      next: data => { this.joueurs = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
  loadPoids(): void {
    this.peseesService.getEquipe().subscribe({
      next: data => { this.poidsMap = new Map(data.map(d => [d.joueurId, d])); },
      error: () => {},
    });
  }
  loadStatuts(): void {
    this.joueurService.getAll().subscribe({
      next: data => { this.statutMap = new Map(data.map(j => [j.id, j.statut])); },
      error: () => {},
    });
  }

  /* ── Disponibilité dérivée (statut + risque + fatigue) ── */
  dispo(j: ResumeJoueur): Dispo {
    const s = this.statutMap.get(j.joueur_id);
    if (s && s !== 'actif') return 'indisponible';
    if (j.niveau_risque === 'ELEVE' || j.niveau_fatigue === 'ALERTE') return 'incertain';
    return 'disponible';
  }
  dispoLibelle(d: Dispo): string {
    return ({ disponible: 'Disponible', incertain: 'Incertain', indisponible: 'Indisponible' })[d];
  }

  /* ── Écart de poids significatif ── */
  ecartSignificatif(j: ResumeJoueur): number | null {
    const f = this.poidsMap.get(j.joueur_id);
    return f?.ecartKg != null && f.ecartKg > 1 ? f.ecartKg : null;
  }

  /* ── KPIs ── */
  get nbDisponibles(): number { return this.joueurs.filter(j => this.dispo(j) === 'disponible').length; }
  get nbRisqueEleve(): number { return this.joueurs.filter(j => j.niveau_risque === 'ELEVE').length; }
  get nbFatigueHaute(): number { return this.joueurs.filter(j => j.niveau_fatigue === 'ALERTE').length; }
  get nbEcartPoids(): number { return this.joueurs.filter(j => this.ecartSignificatif(j) != null).length; }

  /* ── Libellés / classes ── */
  acwrClasse(acwr: number | null | undefined): string {
    if (acwr == null) return 'neutral';
    if (acwr > 1.5) return 'bad';
    if (acwr > 1.3 || acwr < 0.8) return 'warn';
    return 'ok';
  }
  risqueLibelle(n: ResumeJoueur['niveau_risque']): string {
    return ({ FAIBLE: 'Faible', MODERE: 'Modéré', ELEVE: 'Élevé' })[n];
  }
  risqueClasse(n: ResumeJoueur['niveau_risque']): string {
    return ({ FAIBLE: 'ok', MODERE: 'warn', ELEVE: 'bad' })[n];
  }
  fatigueLibelle(n: ResumeJoueur['niveau_fatigue']): string {
    return ({ NOMINAL: 'Faible', VIGILANCE: 'Modérée', ALERTE: 'Élevée' })[n];
  }
  fatigueClasse(n: ResumeJoueur['niveau_fatigue']): string {
    return ({ NOMINAL: 'ok', VIGILANCE: 'warn', ALERTE: 'bad' })[n];
  }
  initiales(j: ResumeJoueur): string {
    return `${(j.prenom || '').charAt(0)}${(j.nom || '').charAt(0)}`.toUpperCase();
  }

  /* ── Filtre / tri / pagination ── */
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

  get total(): number { return this.joueursFiltres.length; }
  get nbPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get rangeDebut(): number { return this.total === 0 ? 0 : this.pageIndex * this.pageSize + 1; }
  get rangeFin(): number { return Math.min(this.total, (this.pageIndex + 1) * this.pageSize); }

  setPageSize(n: number): void { this.pageSize = n; this.pageIndex = 0; }
  pagePrec(): void { if (this.pageIndex > 0) this.pageIndex--; }
  pageSuiv(): void { if (this.pageIndex < this.nbPages - 1) this.pageIndex++; }

  onRecherche(): void { this.pageIndex = 0; }
  toggleTriFatigue(): void { this.triRisque = null; this.triFatigue = this.triFatigue === 'desc' ? 'asc' : 'desc'; this.pageIndex = 0; }
  toggleTriRisque(): void { this.triFatigue = null; this.triRisque = this.triRisque === 'desc' ? 'asc' : 'desc'; this.pageIndex = 0; }
}
