import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { PlanDeJeu, SectionPlan, TechniqueService } from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
import { SchemaEditorComponent } from '../schema-editor/schema-editor.component';
import { ReglesCalibrationComponent } from './regles-calibration.component';

/**
 * Plan de jeu (« document d'identité équipe »), sous-menu « Plan de jeu ».
 * Document vivant d'une équipe : sections ordonnées (phases de jeu), chacune
 * avec un titre, un texte et un schéma optionnel édité dans l'éditeur Konva
 * commun (copy-on-attach). Réordonnancement par glisser-déposer.
 */
@Component({
  selector: 'app-plan-de-jeu',
  standalone: true,
  templateUrl: './plan-de-jeu.component.html',
  styleUrl: './plan-de-jeu.component.scss',
  imports: [DatePipe, FormsModule, MatIcon, DragDropModule, ReglesCalibrationComponent],
})
export class PlanDeJeuComponent implements OnInit {

  private service = inject(TechniqueService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  sections = signal<SectionPlan[]>([]);
  modifiable = signal(false);
  loading = signal(true);

  /** Onglet actif : sections (document) ou règles du moteur tactique. */
  onglet = signal<'sections' | 'regles'>('sections');
  /** L'onglet Règles n'apparaît que si la permission (donc le module moteur_tactique) est active. */
  readonly reglesVisibles = this.auth.has('regles_tactiques:read');

  /** Section en cours d'édition (titre/texte) + tampon de saisie. */
  editingId = signal<string | null>(null);
  editBuf = { titre: '', texte: '' };
  saving = signal(false);

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.getPlanDeJeu().subscribe({
      next: p => this.appliquer(p),
      error: err => {
        this.loading.set(false);
        const msg = err?.status === 409 ? 'Sélectionnez une équipe pour accéder à son plan de jeu' : 'Erreur de chargement';
        this.snack.open(msg, 'Fermer', { duration: 3500 });
      },
    });
  }

  private appliquer(p: PlanDeJeu): void {
    this.sections.set(p.sections);
    this.modifiable.set(p.modifiable);
    this.loading.set(false);
  }

  /** Un schéma est « animé » s'il porte des tracés ou plusieurs keyframes. */
  animee(s: SectionPlan): boolean {
    if (!s.schemaJson) return false;
    try {
      const d = JSON.parse(s.schemaJson);
      const frames = Array.isArray(d.keyframes) ? d.keyframes.length : 1;
      const traces = Array.isArray(d.traces) ? d.traces.length : 0;
      return traces > 0 || frames > 1;
    } catch { return false; }
  }

  // ── Édition titre / texte ──
  editer(s: SectionPlan): void {
    this.editingId.set(s.id);
    this.editBuf = { titre: s.titre, texte: s.texte ?? '' };
  }
  annuler(): void { this.editingId.set(null); }

  enregistrer(s: SectionPlan): void {
    if (!this.editBuf.titre.trim()) return;
    this.saving.set(true);
    this.service.modifierSection(s.id, {
      titre: this.editBuf.titre.trim(),
      texte: this.editBuf.texte,
      schemaJson: s.schemaJson,
      apercu: s.apercu,
    }).subscribe({
      next: maj => { this.remplacer(maj); this.saving.set(false); this.editingId.set(null); },
      error: () => { this.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── Schéma de la section ──
  ouvrirSchema(s: SectionPlan): void {
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: s.titre,
        schemaJson: s.schemaJson,
        enregistrer: (json: string, apercu: string) =>
          this.service.modifierSection(s.id, { titre: s.titre, texte: s.texte, schemaJson: json, apercu }),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
  }

  // ── Ajout / suppression ──
  ajouter(): void {
    this.service.ajouterSection({ titre: 'Nouvelle section' }).subscribe({
      next: s => { this.sections.update(list => [...list, s]); this.editer(s); },
      error: () => this.snack.open('Ajout impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimer(s: SectionPlan): void {
    if (!confirm(`Supprimer la section « ${s.titre} » ?`)) return;
    this.service.supprimerSection(s.id).subscribe({
      next: () => this.sections.update(list => list.filter(x => x.id !== s.id)),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── Réordonnancement (glisser-déposer) ──
  drop(ev: CdkDragDrop<SectionPlan[]>): void {
    if (ev.previousIndex === ev.currentIndex) return;
    const list = [...this.sections()];
    moveItemInArray(list, ev.previousIndex, ev.currentIndex);
    this.sections.set(list);
    this.service.reordonnerSections(list.map(s => s.id)).subscribe({
      error: () => { this.snack.open('Réordonnancement impossible', 'Fermer', { duration: 3000 }); this.charger(); },
    });
  }

  private remplacer(maj: SectionPlan): void {
    this.sections.update(list => list.map(x => x.id === maj.id ? maj : x));
  }
}
