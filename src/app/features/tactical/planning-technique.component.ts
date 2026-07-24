import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { FORMES_EXERCICE, Exercice, TechniqueService } from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
import { ImportPhotoResultat } from '@core/services/import-photo.service';
import { ImportPhotoDialogComponent } from './import-photo-dialog/import-photo-dialog.component';
import { SchemaEditorComponent } from './schema-editor/schema-editor.component';
import { SchemaViewerDialogComponent } from './schema-viewer-dialog/schema-viewer-dialog.component';
import { SchemaTactiqueComponent } from './schema-tactique/schema-tactique.component';
import { PlanDeJeuComponent } from './plan-de-jeu/plan-de-jeu.component';
import { MatchComponent } from './match/match.component';
import { DiaporamaComponent } from './diaporama/diaporama.component';
import { AuteurChipComponent } from '@shared/components/auteur-chip/auteur-chip.component';

/**
 * Bibliothèque d'exercices et écrans tactiques associés.
 *
 * La FICHE d'exercice ne vit plus ici : elle a sa propre page (`/exercices/nouveau`,
 * `/exercices/:id/editer`). Ce composant redevient ce qu'il est — un catalogue : lister,
 * filtrer, dupliquer, ouvrir un schéma. On ne peut plus se retrouver avec un formulaire
 * déplié qui pousse le catalogue hors de l'écran.
 */
@Component({
  selector: 'app-planning-technique',
  standalone: true,
  templateUrl: './planning-technique.component.html',
  styleUrl: './planning-technique.component.scss',
  imports: [FormsModule, MatIcon, SchemaTactiqueComponent, PlanDeJeuComponent, MatchComponent,
            DiaporamaComponent, AuteurChipComponent],
  // ImportPhotoDialogComponent est ouvert via MatDialog (pas dans le template).
})
export class PlanningTechniqueComponent implements OnInit {

  readonly formes = FORMES_EXERCICE;

  libelleForme(code?: string | null): string {
    return this.formes.find(f => f.code === code)?.libelle ?? '';
  }

  /** Section active pilotée par ?section= (exercices | schemas | planjeu | match | diaporama). */
  private route = inject(ActivatedRoute);
  readonly section = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('section') ?? 'exercices')),
    { initialValue: 'exercices' },
  );

  exercices = signal<Exercice[]>([]);
  loading   = signal(true);

  filtreCreateur = signal('');
  filtreEquipe   = signal('');
  filtreForme    = signal('');

  readonly createurs = computed(() => {
    const map = new Map<string, string>();
    this.exercices().forEach(e => { if (e.creeParId) map.set(e.creeParId, e.creeParNom ?? '—'); });
    return Array.from(map, ([id, nom]) => ({ id, nom }));
  });
  readonly equipesOrigine = computed(() => {
    const map = new Map<string, string>();
    this.exercices().forEach(e => { if (e.equipeOrigineId) map.set(e.equipeOrigineId, e.equipeOrigineNom ?? '—'); });
    return Array.from(map, ([id, nom]) => ({ id, nom }));
  });
  readonly exercicesFiltres = computed(() => this.exercices().filter(e =>
    (!this.filtreCreateur() || e.creeParId       === this.filtreCreateur()) &&
    (!this.filtreEquipe()   || e.equipeOrigineId === this.filtreEquipe()) &&
    (!this.filtreForme()    || e.forme           === this.filtreForme())));

  private service = inject(TechniqueService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private router = inject(Router);

  /** Peut créer/dupliquer un exercice (permission d'écriture). */
  canEcrire(): boolean { return this.auth.has('exercices:write'); }

  /** Peut importer depuis une photo (module import_photo_ia + rôle). */
  peutImportPhoto(): boolean { return this.auth.has('import_photo:use'); }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.listerExercices().subscribe({
      next: ex => { this.exercices.set(ex); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  nouvelExo(): void { this.router.navigate(['/exercices/nouveau']); }

  editerExo(e: Exercice): void { this.router.navigate(['/exercices', e.id, 'editer']); }

  /**
   * « Importer depuis une photo » : l'IA analyse la fiche papier ici, puis le résultat part
   * vers la fiche vierge en état de navigation — rien n'est persisté entre les deux écrans,
   * l'utilisateur vérifie et ajuste avant d'enregistrer.
   */
  importerDepuisPhoto(): void {
    const ref = this.dialog.open(ImportPhotoDialogComponent, {
      width: '720px', maxWidth: '96vw', panelClass: 'app-dialog',
    });
    ref.afterClosed().subscribe((r: ImportPhotoResultat | null) => {
      if (!r) return;
      this.router.navigate(['/exercices/nouveau'], { state: { prefill: r } });
    });
  }

  /** Visualise le schéma d'un exercice en LECTURE SEULE (accessible à tout le staff). */
  voirSchema(e: Exercice): void {
    this.dialog.open(SchemaViewerDialogComponent, {
      panelClass: 'dark-dialog', maxWidth: '95vw',
      data: { titre: e.nom, schemaJson: e.schemaJson },
    });
  }

  /** Duplique un exercice (copie éditable à son nom) sans toucher l'original. */
  dupliquerExo(e: Exercice): void {
    this.service.dupliquerExercice(e.id).subscribe({
      next: () => { this.charger(); this.snack.open('Exercice dupliqué', 'Fermer', { duration: 2500 }); },
      error: () => this.snack.open('Duplication impossible', 'Fermer', { duration: 3000 }),
    });
  }

  ouvrirSchema(e: Exercice): void {
    const ref = this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: e.nom,
        schemaJson: e.schemaJson,
        // Sauvegarde dans la COPIE de l'exercice : ne touche pas un éventuel schéma de base.
        enregistrer: (json: string) => this.service.sauverSchema(e.id, json),
      },
    });
    ref.afterClosed().subscribe(saved => { if (saved) this.charger(); });
  }

  supprimerExo(e: Exercice): void {
    if (!confirm(`Supprimer l'exercice « ${e.nom} » ?`)) return;
    this.service.supprimerExercice(e.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
