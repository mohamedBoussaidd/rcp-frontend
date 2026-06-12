import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';
import { ContenuSeance } from '@core/services/seance.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';

export interface SeanceContenuData {
  titre: string;
  date: string;
  contenu: ContenuSeance | null;
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

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : ''; }
  fermer(): void { this.dialogRef.close(); }
}
