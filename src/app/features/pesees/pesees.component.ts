import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PeseesService, PoidsFicheJoueur } from '../../core/services/pesees.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import {
  MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
  MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow
} from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';

interface LignePesee extends PoidsFicheJoueur {
  poidsInput: number | null;
  saving: boolean;
  saved: boolean;
}

@Component({
  selector: 'app-pesees',
  standalone: true,
  templateUrl: './pesees.component.html',
  styleUrl: './pesees.component.scss',
  imports: [
    MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle,
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    MatPaginator, FormsModule, DecimalPipe, DatePipe
  ]
})
export class PeseesComponent implements OnInit {

  lignes: LignePesee[] = [];
  loading = true;
  datePesee = new Date().toISOString().slice(0, 10);

  displayedColumns = ['joueur', 'poste', 'poidsCible', 'dernierePesee', 'poidsInput', 'ecart', 'action'];

  pageIndex = 0;
  pageSize  = 15;

  get lignesPaginees(): LignePesee[] {
    return this.lignes.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize  = event.pageSize;
  }

  constructor(
    private peseesService: PeseesService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.loading = true;
    this.peseesService.getEquipe().subscribe({
      next: data => {
        this.lignes = data.map(d => ({
          ...d,
          poidsInput: d.dernierPoids ?? null,
          saving: false,
          saved: false,
        }));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Impossible de charger les données', 'Fermer', { duration: 4000 });
      }
    });
  }

  sauvegarder(ligne: LignePesee): void {
    if (!ligne.poidsInput) return;
    ligne.saving = true;
    this.peseesService.upsert({
      joueurId: ligne.joueurId,
      date: this.datePesee,
      poids: ligne.poidsInput,
    }).subscribe({
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
      }
    });
  }

  ecartClass(ecart: number | null | undefined): string {
    if (ecart == null) return '';
    if (ecart > 3) return 'ecart-danger';
    if (ecart > 0) return 'ecart-warning';
    return 'ecart-ok';
  }

  retour(): void {
    this.router.navigate(['/dashboard']);
  }
}
