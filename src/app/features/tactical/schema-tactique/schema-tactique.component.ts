import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Exercice, SchemaTactique, TechniqueService } from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
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
  imports: [DatePipe, MatIcon, NgTemplateOutlet],
})
export class SchemaTactiqueComponent implements OnInit {

  private service = inject(TechniqueService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  /** Peut créer/dupliquer un schéma (permission d'écriture). */
  canEcrire(): boolean { return this.auth.has('schemas:write'); }

  /** Seul le super-admin pose des schémas FOURNIS (contenu commun à tous les clubs). */
  estSuperAdmin(): boolean { return this.auth.currentUser()?.role === 'SUPER_ADMIN'; }

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

  /** Bibliothèque du club : ce que le staff a construit lui-même. */
  readonly cartesClub = computed(() => this.cartes().filter(s => !s.fourni));

  /** Schémas fournis : point de départ commun, affiché en second (c'est une base, pas la vitrine). */
  readonly cartesFournies = computed(() => this.cartes().filter(s => s.fourni));

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.listerSchemas().subscribe({
      next: s => { this.schemas.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  /**
   * Nouveau schéma : mini-formulaire (nom + catégorie) puis ouverture de l'éditeur.
   * `fourni` (super-admin only) crée un schéma commun à tous les clubs au lieu d'un schéma de club.
   */
  nouveau(fourni = false): void {
    this.dialog.open(SchemaMetaDialogComponent, {
      panelClass: 'app-dialog', data: { titre: fourni ? 'Nouveau schéma fourni' : 'Nouveau schéma' },
    }).afterClosed().subscribe((meta: SchemaMeta | undefined) => {
      if (!meta) return;
      this.dialog.open(SchemaEditorComponent, {
        width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
        data: {
          titre: meta.nom,
          enregistrer: (json: string, apercu: string) =>
            this.service.creerSchema({ nom: meta.nom, categorie: meta.categorie, schemaJson: json, apercu, fourni }),
        },
      }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
    });
  }

  /**
   * Copie un schéma fourni dans la bibliothèque du club : la copie appartient au club et devient
   * librement modifiable, l'original reste intact pour les autres clubs.
   */
  copier(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    this.service.dupliquerSchema(s.id).subscribe({
      next: () => { this.charger(); this.snack.open('Copié dans votre bibliothèque', 'Fermer', { duration: 2500 }); },
      error: () => this.snack.open('Copie impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Renommer / changer la catégorie d'un schéma existant (sans ouvrir l'éditeur). */
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

  /**
   * Ouvre un schéma dans l'éditeur. Le créateur l'édite sur place (modifierSchema) ; un autre
   * membre l'édite mais l'enregistrement crée une COPIE à son nom (creerSchema) — l'original
   * n'est jamais modifié.
   */
  ouvrir(s: SchemaTactique): void {
    const enregistrer = s.modifiable
      ? (json: string, apercu: string) =>
          this.service.modifierSchema(s.id, { nom: s.nom, categorie: s.categorie, schemaJson: json, apercu })
      : (json: string, apercu: string) =>
          this.service.creerSchema({ nom: s.nom + ' (copie)', categorie: s.categorie, schemaJson: json, apercu });
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: { titre: s.modifiable ? s.nom : s.nom + ' (copie)', schemaJson: s.schemaJson, enregistrer },
    }).afterClosed().subscribe(saved => {
      if (saved) {
        this.charger();
        if (!s.modifiable) this.snack.open('Copie créée à votre nom', 'Fermer', { duration: 2500 });
      }
    });
  }

  /** Duplique un schéma (copie éditable à son nom) sans passer par l'éditeur. */
  dupliquer(s: SchemaTactique, ev: Event): void {
    ev.stopPropagation();
    this.service.dupliquerSchema(s.id).subscribe({
      next: () => { this.charger(); this.snack.open('Schéma dupliqué', 'Fermer', { duration: 2500 }); },
      error: () => this.snack.open('Duplication impossible', 'Fermer', { duration: 3000 }),
    });
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
