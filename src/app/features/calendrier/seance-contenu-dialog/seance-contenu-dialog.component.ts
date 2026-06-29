import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';
import { ContenuSeance, Seance } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';
import { PresenceDialogComponent } from '../../performance/presence-dialog/presence-dialog.component';

export interface SeanceContenuData {
  titre: string;
  date: string;
  contenu: ContenuSeance | null;
  seance?: Seance;
}

/** Détail en lecture seule d'une séance : exercices + schémas (consultable par le joueur). */
@Component({
  selector: 'app-seance-contenu-dialog',
  standalone: true,
  templateUrl: './seance-contenu-dialog.component.html',
  styleUrl: './seance-contenu-dialog.component.scss',
  imports: [DatePipe, SchemaViewerComponent],
})
export class SeanceContenuDialogComponent {
  dialogRef = inject<MatDialogRef<SeanceContenuDialogComponent>>(MatDialogRef);
  data = inject<SeanceContenuData>(MAT_DIALOG_DATA);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);

  /** Appel possible : c'est un entraînement (pas un match) et l'utilisateur peut saisir la présence. */
  get peutFaireAppel(): boolean {
    return !!this.data.seance && !this.data.seance.adversaire && this.auth.has('presence:write');
  }

  ouvrirAppel(): void {
    if (!this.data.seance) return;
    this.dialog.open(PresenceDialogComponent, {
      data: { seance: this.data.seance },
      panelClass: 'app-dialog',
      maxWidth: '95vw',
    });
  }

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : ''; }
  fermer(): void { this.dialogRef.close(); }
}
