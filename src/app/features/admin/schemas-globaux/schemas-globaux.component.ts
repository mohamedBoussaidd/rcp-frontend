import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Exercice, SchemaRecherche, SchemaTactique, TechniqueService } from '@core/services/technique.service';
import { SchemaEditorComponent } from '../../tactical/schema-editor/schema-editor.component';
import { CATEGORIES_SCHEMA, SchemaMeta, SchemaMetaDialogComponent } from '../../tactical/schema-meta-dialog/schema-meta-dialog.component';
import { ExercicePickerDialogComponent } from '../../tactical/exercice-picker-dialog/exercice-picker-dialog.component';
import { AuteurChipComponent } from '@shared/components/auteur-chip/auteur-chip.component';

/** Carte enrichie : schéma + infos d'animation dérivées de son JSON. */
interface SchemaCarte extends SchemaTactique { animee: boolean; frames: number; }

/**
 * Écran SUPER_ADMIN « Schémas globaux » : miroir de « Exercices globaux » pour la bibliothèque de
 * schémas tactiques communs à tous les clubs. Trois usages :
 *  1. gérer les schémas fournis (créer/éditer/supprimer) hors de tout contexte de club ;
 *  2. attacher un schéma global à un exercice global (copy-on-attach) ;
 *  3. parcourir les schémas des clubs (filtre) et en <b>promouvoir</b> en global — la promotion
 *     DUPLIQUE, elle ne touche jamais le schéma d'origine du club.
 */
@Component({
  selector: 'app-schemas-globaux',
  standalone: true,
  templateUrl: './schemas-globaux.component.html',
  styleUrl: './schemas-globaux.component.scss',
  imports: [DatePipe, FormsModule, RouterLink, MatIcon, AuteurChipComponent],
})
export class SchemasGlobauxComponent implements OnInit {

  private service = inject(TechniqueService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  readonly categories = CATEGORIES_SCHEMA;

  schemas = signal<SchemaTactique[]>([]);
  loading = signal(true);

  readonly cartes = computed<SchemaCarte[]>(() => this.schemas().map(s => {
    let frames = 1, traces = 0;
    try {
      const d = JSON.parse(s.schemaJson);
      if (Array.isArray(d.keyframes) && d.keyframes.length) frames = d.keyframes.length;
      if (Array.isArray(d.traces)) traces = d.traces.length;
    } catch { /* JSON illisible → considéré statique */ }
    return { ...s, frames, animee: traces > 0 || frames > 1 };
  }));

  // ── Recherche cross-club (Lot 3) ──
  clubs = signal<{ id: string; nom: string }[]>([]);
  clubsSelectionnes = signal<Set<string>>(new Set());
  filtreNom = '';
  filtreCategorie = '';
  resultats = signal<SchemaRecherche[] | null>(null);
  recherching = signal(false);

  ngOnInit(): void {
    this.charger();
    this.service.listerClubs().subscribe({ next: c => this.clubs.set(c), error: () => {} });
  }

  charger(): void {
    this.loading.set(true);
    this.service.listerSchemasGlobaux().subscribe({
      next: s => { this.schemas.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  /** Nouveau schéma global : mini-formulaire (nom + catégorie) puis éditeur Konva. */
  nouveau(): void {
    this.dialog.open(SchemaMetaDialogComponent, {
      panelClass: 'app-dialog', data: { titre: 'Nouveau schéma global' },
    }).afterClosed().subscribe((meta: SchemaMeta | undefined) => {
      if (!meta) return;
      this.dialog.open(SchemaEditorComponent, {
        width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
        data: {
          titre: meta.nom,
          enregistrer: (json: string, apercu: string) =>
            this.service.creerSchemaGlobal({ nom: meta.nom, categorie: meta.categorie, schemaJson: json, apercu }),
        },
      }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
    });
  }

  /** Ouvre un schéma global dans l'éditeur (modifiable sur place par le super-admin). */
  ouvrir(s: SchemaTactique): void {
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: s.nom, schemaJson: s.schemaJson,
        enregistrer: (json: string, apercu: string) =>
          this.service.modifierSchema(s.id, { nom: s.nom, categorie: s.categorie, schemaJson: json, apercu }),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
  }

  /** Renommer / changer la catégorie sans ouvrir l'éditeur. */
  renommer(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    this.dialog.open(SchemaMetaDialogComponent, {
      panelClass: 'app-dialog',
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

  supprimer(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Supprimer le schéma global « ${s.nom} » ? Il ne sera plus proposé aux clubs.`)) return;
    this.service.supprimerSchema(s.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Attache ce schéma global à un exercice GLOBAL (copy-on-attach). */
  ajouterAExercice(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    this.dialog.open(ExercicePickerDialogComponent, {
      panelClass: 'dark-dialog', width: '520px', maxWidth: '95vw', autoFocus: false,
      data: { globaux: true },
    }).afterClosed().subscribe((ex: Exercice | undefined) => {
      if (!ex) return;
      if (ex.schemaJson && !confirm(`L'exercice global « ${ex.nom} » a déjà un schéma. Le remplacer ?`)) return;
      this.service.sauverSchema(ex.id, s.schemaJson).subscribe({
        next: () => this.snack.open(`Schéma ajouté à « ${ex.nom} »`, 'Fermer', { duration: 2500 }),
        error: () => this.snack.open('Ajout impossible', 'Fermer', { duration: 3000 }),
      });
    });
  }

  // ── Recherche cross-club + promotion ──

  toggleClub(id: string): void {
    this.clubsSelectionnes.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  tousLesClubs(): void { this.clubsSelectionnes.set(new Set()); }

  rechercher(): void {
    this.recherching.set(true);
    const clubIds = [...this.clubsSelectionnes()];
    this.service.rechercherSchemas({
      clubIds: clubIds.length ? clubIds : undefined,
      q: this.filtreNom.trim() || undefined,
      categorie: this.filtreCategorie.trim() || undefined,
    }).subscribe({
      next: r => { this.resultats.set(r); this.recherching.set(false); },
      error: () => { this.recherching.set(false); this.snack.open('Recherche impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  /** Promeut un schéma de club en global : duplique (l'original du club n'est jamais touché). */
  promouvoir(r: SchemaRecherche): void {
    if (!confirm(`Promouvoir « ${r.nom} » en schéma global ? Une copie sera proposée à tous les clubs ; l'original du club « ${r.clubNom ?? '—'} » reste intact.`)) return;
    this.service.promouvoirSchema(r.id).subscribe({
      next: () => {
        this.charger();
        this.snack.open('Schéma promu en global', 'Fermer', { duration: 2500 });
      },
      error: err => this.snack.open(err?.status === 409 ? 'Ce schéma est déjà global' : 'Promotion impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
