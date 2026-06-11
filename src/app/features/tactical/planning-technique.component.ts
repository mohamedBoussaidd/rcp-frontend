import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import {
  CATEGORIES_EXERCICE, Exercice, ExerciceRequest, TechniqueService,
} from '@core/services/technique.service';
import { SchemaEditorComponent } from './schema-editor/schema-editor.component';
import { SchemaTactiqueComponent } from './schema-tactique/schema-tactique.component';
import { PlanDeJeuComponent } from './plan-de-jeu/plan-de-jeu.component';
import { MatchComponent } from './match/match.component';

@Component({
  selector: 'app-planning-technique',
  standalone: true,
  templateUrl: './planning-technique.component.html',
  styleUrl: './planning-technique.component.scss',
  imports: [FormsModule, MatIcon, SchemaTactiqueComponent, PlanDeJeuComponent, MatchComponent],
})
export class PlanningTechniqueComponent implements OnInit {

  readonly categories = CATEGORIES_EXERCICE;

  /** Section active pilotée par ?section= (exercices | creer | schemas). */
  private route = inject(ActivatedRoute);
  readonly section = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('section') ?? 'exercices')),
    { initialValue: 'exercices' },
  );

  exercices = signal<Exercice[]>([]);
  loading   = signal(true);

  filtreCreateur  = signal('');
  filtreEquipe    = signal('');
  filtreCategorie = signal('');

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
    (!this.filtreCreateur()  || e.creeParId       === this.filtreCreateur()) &&
    (!this.filtreEquipe()    || e.equipeOrigineId  === this.filtreEquipe()) &&
    (!this.filtreCategorie() || e.categorie        === this.filtreCategorie())));

  showExoForm   = signal(false);
  editingExoId  = signal<string | null>(null);
  exoForm: ExerciceRequest = this.exoVide();
  savingExo     = signal(false);

  constructor(private service: TechniqueService, private snack: MatSnackBar, private dialog: MatDialog) {}
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

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.listerExercices().subscribe({
      next: ex => { this.exercices.set(ex); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  nouvelExo(): void   { this.editingExoId.set(null); this.exoForm = this.exoVide(); this.showExoForm.set(true); }
  annulerExo(): void  { this.showExoForm.set(false); this.editingExoId.set(null); }
  editerExo(e: Exercice): void {
    this.editingExoId.set(e.id);
    this.exoForm = {
      nom: e.nom, categorie: e.categorie, type: e.type ?? 'TECHNIQUE',
      dureeMinutes: e.dureeMinutes, objectif: e.objectif, intensite: e.intensite, description: e.description,
      distanceAttendueM: e.distanceAttendueM, distanceHauteIntensiteM: e.distanceHauteIntensiteM, nbSprints: e.nbSprints,
    };
    this.showExoForm.set(true);
  }
  enregistrerExo(): void {
    if (!this.exoForm.nom) return;
    this.savingExo.set(true);
    const id  = this.editingExoId();
    const obs = id ? this.service.modifierExercice(id, this.exoForm) : this.service.creerExercice(this.exoForm);
    obs.subscribe({
      next: () => { this.savingExo.set(false); this.showExoForm.set(false); this.charger(); },
      error: () => { this.savingExo.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }
  supprimerExo(e: Exercice): void {
    if (!confirm(`Supprimer l'exercice « ${e.nom} » ?`)) return;
    this.service.supprimerExercice(e.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private exoVide(): ExerciceRequest {
    return {
      nom: '', categorie: '', type: 'TECHNIQUE', dureeMinutes: null, objectif: '', intensite: null, description: '',
      distanceAttendueM: null, distanceHauteIntensiteM: null, nbSprints: null,
    };
  }
}
