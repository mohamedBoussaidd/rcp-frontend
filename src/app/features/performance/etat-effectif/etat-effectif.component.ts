import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { PageEvent, MatPaginator } from '@angular/material/paginator';
import {
  MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell,
  MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
} from '@angular/material/table';

import { PredictionService, ResumeJoueur } from '@core/services/prediction.service';
import { PeseesService, PoidsFicheJoueur } from '@core/services/pesees.service';
import { JoueurService } from '@core/services/joueur.service';
import { BadgeRisqueComponent } from '@shared/components/badge-risque/badge-risque.component';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';

/**
 * État de l'effectif (GPS) — table complète risque / fatigue / ACWR / poids,
 * avec recherche, tri et pagination. Déplacée depuis le dashboard pour ne garder
 * sur l'accueil que le pilotage essentiel.
 */
@Component({
  selector: 'app-etat-effectif',
  standalone: true,
  templateUrl: './etat-effectif.component.html',
  styleUrl: './etat-effectif.component.scss',
  imports: [
    DecimalPipe, FormsModule, RouterLink, MatIcon, MatProgressBar,
    BadgeRisqueComponent, InfoHintComponent,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell,
    MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator,
  ],
})
export class EtatEffectifComponent implements OnInit {

  private prediction = inject(PredictionService);
  private peseesService = inject(PeseesService);
  private joueurService = inject(JoueurService);

  joueurs: ResumeJoueur[] = [];
  poidsMap = new Map<string, PoidsFicheJoueur>();
  statutMap = new Map<string, string>();
  loading = true;

  displayedColumns = ['joueur', 'poste', 'statut', 'risque', 'acwr', 'fatigue', 'poids'];

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

  acwrClasse(acwr: number | null | undefined): string {
    if (acwr == null) return 'neutral';
    if (acwr > 1.5) return 'bad';
    if (acwr > 1.3 || acwr < 0.8) return 'warn';
    return 'ok';
  }

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

  onPageChange(e: PageEvent): void { this.pageIndex = e.pageIndex; this.pageSize = e.pageSize; }
  onRecherche(): void { this.pageIndex = 0; }
  toggleTriFatigue(): void { this.triRisque = null; this.triFatigue = this.triFatigue === 'desc' ? 'asc' : 'desc'; this.pageIndex = 0; }
  toggleTriRisque(): void { this.triFatigue = null; this.triRisque = this.triRisque === 'desc' ? 'asc' : 'desc'; this.pageIndex = 0; }

  statutLibelle(s: string): string {
    return ({ actif: 'Actif', blesse: 'Blessé', suspendu: 'Suspendu', prete: 'Prêté' } as Record<string, string>)[s] ?? s;
  }
}
