import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SchemaTactique, TechniqueService } from '../../../core/services/technique.service';

/**
 * Sélecteur de schéma de la bibliothèque (copy-on-attach).
 * Renvoie le schéma choisi ; l'appelant copie son schemaJson dans sa propre cible.
 */
@Component({
  selector: 'app-schema-picker-dialog',
  standalone: true,
  templateUrl: './schema-picker-dialog.component.html',
  styleUrl: './schema-picker-dialog.component.scss',
  imports: [DatePipe, MatIcon],
})
export class SchemaPickerDialogComponent implements OnInit {

  private service = inject(TechniqueService);
  private snack = inject(MatSnackBar);
  private dialogRef = inject(MatDialogRef<SchemaPickerDialogComponent, SchemaTactique>);

  schemas = signal<SchemaTactique[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.service.listerSchemas().subscribe({
      next: s => { this.schemas.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }
  choisir(s: SchemaTactique): void { this.dialogRef.close(s); }
  annuler(): void { this.dialogRef.close(); }
}
