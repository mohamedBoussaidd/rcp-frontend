import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Exercice, TechniqueService } from '@core/services/technique.service';

/** Données optionnelles : `globaux` cible la bibliothèque GLOBALE (super-admin) au lieu du club. */
export interface ExercicePickerData { globaux?: boolean; }

/**
 * Sélecteur d'exercice pour y attacher un schéma de la bibliothèque (copy-on-attach).
 * Renvoie l'exercice choisi ; l'appelant copie le schemaJson dans cet exercice.
 */
@Component({
  selector: 'app-exercice-picker-dialog',
  standalone: true,
  templateUrl: './exercice-picker-dialog.component.html',
  styleUrl: './exercice-picker-dialog.component.scss',
  imports: [FormsModule, MatIcon],
})
export class ExercicePickerDialogComponent implements OnInit {

  private service = inject(TechniqueService);
  private snack = inject(MatSnackBar);
  private dialogRef = inject(MatDialogRef<ExercicePickerDialogComponent, Exercice>);
  private data = inject<ExercicePickerData>(MAT_DIALOG_DATA, { optional: true });

  exercices = signal<Exercice[]>([]);
  loading = signal(true);
  filtre = signal('');

  ngOnInit(): void {
    const source$ = this.data?.globaux ? this.service.listerExercicesGlobaux() : this.service.listerExercices();
    source$.subscribe({
      next: ex => {
        this.exercices.set(ex.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '')));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  /** Exercices modifiables filtrés par le texte saisi. */
  readonly visibles = computed(() => {
    const q = this.filtre().trim().toLowerCase();
    return this.exercices().filter(e => e.modifiable && (!q || (e.nom || '').toLowerCase().includes(q)));
  });

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }
  choisir(e: Exercice): void { this.dialogRef.close(e); }
  annuler(): void { this.dialogRef.close(); }
}
