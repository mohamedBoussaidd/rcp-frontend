import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Exercice, SchemaTactique, TechniqueService } from '@core/services/technique.service';
import { SchemaEditorComponent } from '../schema-editor/schema-editor.component';
import { SchemaMeta, SchemaMetaDialogComponent } from '../schema-meta-dialog/schema-meta-dialog.component';
import { ExercicePickerDialogComponent } from '../exercice-picker-dialog/exercice-picker-dialog.component';

/** Carte enrichie : schéma + infos d'animation dérivées de son JSON. */
interface SchemaCarte extends SchemaTactique { animee: boolean; frames: number; }

/**
 * Bibliothèque de schémas tactiques (sous-menu « Schémas »).
 * Grille de cartes (visuel + nom + catégorie + date) ; l'édition se fait dans
 * l'éditeur Konva commun (SchemaEditorComponent), partagé avec les exercices.
 */
@Component({
  selector: 'app-schema-tactique',
  standalone: true,
  templateUrl: './schema-tactique.component.html',
  styleUrl: './schema-tactique.component.scss',
  imports: [DatePipe, MatIcon],
})
export class SchemaTactiqueComponent implements OnInit {

  private service = inject(TechniqueService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  schemas = signal<SchemaTactique[]>([]);
  loading = signal(true);

  /** Cartes enrichies : on parse une fois le JSON pour savoir si le schéma est animé. */
  readonly cartes = computed<SchemaCarte[]>(() => this.schemas().map(s => {
    let frames = 1, traces = 0;
    try {
      const d = JSON.parse(s.schemaJson);
      if (Array.isArray(d.keyframes) && d.keyframes.length) frames = d.keyframes.length;
      if (Array.isArray(d.traces)) traces = d.traces.length;
    } catch { /* JSON illisible → considéré statique */ }
    return { ...s, frames, animee: traces > 0 || frames > 1 };
  }));

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.listerSchemas().subscribe({
      next: s => { this.schemas.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  /** Nouveau schéma : mini-formulaire (nom + catégorie) puis ouverture de l'éditeur. */
  nouveau(): void {
    this.dialog.open(SchemaMetaDialogComponent, {
      panelClass: 'dark-dialog', data: { titre: 'Nouveau schéma' },
    }).afterClosed().subscribe((meta: SchemaMeta | undefined) => {
      if (!meta) return;
      this.dialog.open(SchemaEditorComponent, {
        width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
        data: {
          titre: meta.nom,
          enregistrer: (json: string, apercu: string) =>
            this.service.creerSchema({ nom: meta.nom, categorie: meta.categorie, schemaJson: json, apercu }),
        },
      }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
    });
  }

  /** Renommer / changer la catégorie d'un schéma existant (sans ouvrir l'éditeur). */
  renommer(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    this.dialog.open(SchemaMetaDialogComponent, {
      panelClass: 'dark-dialog',
      data: { titre: 'Renommer le schéma', nom: s.nom, categorie: s.categorie },
    }).afterClosed().subscribe((meta: SchemaMeta | undefined) => {
      if (!meta) return;
      this.service.modifierSchema(s.id, {
        nom: meta.nom, categorie: meta.categorie, schemaJson: s.schemaJson, apercu: s.apercu,
      }).subscribe({
        next: () => this.charger(),
        error: () => this.snack.open('Modification impossible', 'Fermer', { duration: 3000 }),
      });
    });
  }

  /** Édite un schéma existant : sauvegarde sur place (modifierSchema), nom/catégorie conservés. */
  ouvrir(s: SchemaTactique): void {
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: s.nom,
        schemaJson: s.schemaJson,
        enregistrer: (json: string, apercu: string) =>
          this.service.modifierSchema(s.id, { nom: s.nom, categorie: s.categorie, schemaJson: json, apercu }),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
  }

  /** Attache directement ce schéma à un exercice existant (copy-on-attach), sans passer par l'éditeur. */
  ajouterAExercice(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    this.dialog.open(ExercicePickerDialogComponent, {
      panelClass: 'dark-dialog', width: '520px', maxWidth: '95vw', autoFocus: false,
    }).afterClosed().subscribe((ex: Exercice | undefined) => {
      if (!ex) return;
      if (ex.schemaJson && !confirm(`L'exercice « ${ex.nom} » a déjà un schéma. Le remplacer ?`)) return;
      this.service.sauverSchema(ex.id, s.schemaJson).subscribe({
        next: () => this.snack.open(`Schéma ajouté à « ${ex.nom} »`, 'Fermer', { duration: 2500 }),
        error: () => this.snack.open('Ajout impossible', 'Fermer', { duration: 3000 }),
      });
    });
  }

  supprimer(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Supprimer le schéma « ${s.nom} » ?`)) return;
    this.service.supprimerSchema(s.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
