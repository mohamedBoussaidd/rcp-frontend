import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SchemaViewerComponent } from '../schema-viewer/schema-viewer.component';

export interface SchemaViewerData {
  titre: string;
  schemaJson?: string | null;
}

/** Affichage en LECTURE SEULE d'un schéma tactique (réutilisable, ex. exercice d'un autre staff). */
@Component({
  selector: 'app-schema-viewer-dialog',
  standalone: true,
  imports: [SchemaViewerComponent],
  template: `
    <div class="svd">
      <div class="svd__head">
        <span class="svd__titre">{{ data.titre }}</span>
        <button type="button" class="svd__close" (click)="fermer()" aria-label="Fermer">✕</button>
      </div>
      <div class="svd__body">
        @if (data.schemaJson) {
          <app-schema-viewer [schemaJson]="data.schemaJson" [largeur]="720"></app-schema-viewer>
        } @else {
          <p class="svd__vide">Aucun schéma pour cet exercice.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .svd { background: #11162a; color: #fff; border-radius: 10px; padding: 14px; }
    .svd__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .svd__titre { font-weight: 700; font-size: 15px; }
    .svd__close { background: transparent; border: none; color: #fff; font-size: 18px; cursor: pointer; }
    .svd__body { display: flex; justify-content: center; }
    .svd__vide { color: #aab; padding: 24px; }
  `],
})
export class SchemaViewerDialogComponent {
  dialogRef = inject<MatDialogRef<SchemaViewerDialogComponent>>(MatDialogRef);
  data = inject<SchemaViewerData>(MAT_DIALOG_DATA);
  fermer(): void { this.dialogRef.close(); }
}
