import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

/** Métadonnées d'un schéma renvoyées par le dialog. */
export interface SchemaMeta { nom: string; categorie?: string; }

/** Données d'entrée : valeurs initiales (création = vide ; édition = pré-rempli). */
export interface SchemaMetaData { titre?: string; nom?: string; categorie?: string; }

/** Catégories suggérées (datalist) — l'utilisateur peut aussi saisir librement. */
export const CATEGORIES_SCHEMA = [
  'pressing', 'sortie_de_balle', 'transition_offensive', 'transition_defensive',
  'corner_offensif', 'corner_defensif', 'coup_franc', 'attaque_placee',
  'bloc_defensif', 'conservation', 'jeu_reduit',
];

/**
 * Petit formulaire (nom + catégorie) avant d'ouvrir l'éditeur de schéma.
 * La catégorie propose les valeurs connues via <datalist> tout en autorisant la saisie libre.
 */
@Component({
  selector: 'app-schema-meta-dialog',
  standalone: true,
  templateUrl: './schema-meta-dialog.component.html',
  styleUrl: './schema-meta-dialog.component.scss',
  imports: [FormsModule, MatIcon],
})
export class SchemaMetaDialogComponent {

  readonly titre: string;
  readonly categories = CATEGORIES_SCHEMA;
  nom = '';
  categorie = '';

  constructor(
    private dialogRef: MatDialogRef<SchemaMetaDialogComponent, SchemaMeta>,
    @Inject(MAT_DIALOG_DATA) data: SchemaMetaData,
  ) {
    this.titre = data?.titre ?? 'Nouveau schéma';
    this.nom = data?.nom ?? '';
    this.categorie = data?.categorie ?? '';
  }

  label(v: string): string { return v.replace(/_/g, ' '); }

  valider(): void {
    const nom = this.nom.trim();
    if (!nom) return;
    this.dialogRef.close({ nom, categorie: this.categorie.trim() || undefined });
  }

  annuler(): void { this.dialogRef.close(); }
}
