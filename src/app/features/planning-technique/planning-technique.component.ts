import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import {
  CATEGORIES_EXERCICE, Exercice, ExerciceRequest,
  SeanceTechnique, SeanceTechniqueRequest, TechniqueService,
} from '../../core/services/technique.service';
import { SchemaEditorComponent } from './schema-editor/schema-editor.component';
import { SchemaTactiqueComponent } from './schema-tactique/schema-tactique.component';
import { PlanDeJeuComponent } from './plan-de-jeu/plan-de-jeu.component';
import { MatchComponent } from './match/match.component';
import { SeanceDetailComponent } from './seance-detail/seance-detail.component';

@Component({
  selector: 'app-planning-technique',
  standalone: true,
  templateUrl: './planning-technique.component.html',
  styleUrl: './planning-technique.component.scss',
  imports: [FormsModule, DatePipe, MatIcon, SchemaTactiqueComponent, PlanDeJeuComponent, MatchComponent],
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
  seances   = signal<SeanceTechnique[]>([]);
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

  showSeanceForm   = signal(false);
  editingSeanceId  = signal<string | null>(null);
  seanceForm = { date: new Date().toISOString().slice(0, 10), titre: '', objectif: '', description: '' };
  selection  = signal<Exercice[]>([]);
  savingSeance = signal(false);

  readonly dureeSelection = computed(() => this.selection().reduce((s, e) => s + (e.dureeMinutes ?? 0), 0));
  readonly intensiteSelection = computed(() => {
    const sel = this.selection();
    const d   = this.dureeSelection();
    if (d === 0) return null;
    const pond = sel.reduce((s, e) => s + (e.intensite ?? 0) * (e.dureeMinutes ?? 0), 0);
    return Math.round((pond / d) * 10) / 10;
  });

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

  ouvrirDetail(s: SeanceTechnique): void {
    this.dialog.open(SeanceDetailComponent, {
      width: '900px', maxWidth: '96vw', panelClass: 'dark-dialog', data: { seance: s },
    });
  }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.listerExercices().subscribe({
      next: ex => { this.exercices.set(ex); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
    this.service.listerSeances().subscribe({ next: s => this.seances.set(s), error: () => {} });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  nouvelExo(): void   { this.editingExoId.set(null); this.exoForm = this.exoVide(); this.showExoForm.set(true); }
  annulerExo(): void  { this.showExoForm.set(false); this.editingExoId.set(null); }
  editerExo(e: Exercice): void {
    this.editingExoId.set(e.id);
    this.exoForm = { nom: e.nom, categorie: e.categorie, dureeMinutes: e.dureeMinutes, objectif: e.objectif, intensite: e.intensite, description: e.description };
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

  estSelectionne(e: Exercice): boolean { return this.selection().some(x => x.id === e.id); }
  toggleSelection(e: Exercice): void {
    this.selection.update(sel => this.estSelectionne(e) ? sel.filter(x => x.id !== e.id) : [...sel, e]);
  }
  retirerSelection(e: Exercice): void { this.selection.update(sel => sel.filter(x => x.id !== e.id)); }

  nouvelleSeance(): void {
    this.editingSeanceId.set(null);
    this.selection.set([]);
    this.seanceForm = { date: new Date().toISOString().slice(0, 10), titre: '', objectif: '', description: '' };
    this.showSeanceForm.set(true);
  }
  annulerSeance(): void { this.showSeanceForm.set(false); this.editingSeanceId.set(null); this.selection.set([]); }
  editerSeance(s: SeanceTechnique): void {
    this.editingSeanceId.set(s.id);
    this.seanceForm = { date: s.date, titre: s.titre ?? '', objectif: s.objectif ?? '', description: s.description ?? '' };
    const lib = this.exercices();
    this.selection.set(s.exercices.map(l => lib.find(e => e.id === l.exerciceId) ?? ({
      id: l.exerciceId, nom: l.nom, categorie: l.categorie, dureeMinutes: l.dureeMinutes,
      intensite: l.intensite, objectif: l.objectif, modifiable: false,
    } as Exercice)));
    this.showSeanceForm.set(true);
  }
  enregistrerSeance(): void {
    if (this.selection().length === 0) { this.snack.open('Ajoutez au moins un exercice', 'Fermer', { duration: 2500 }); return; }
    this.savingSeance.set(true);
    const req: SeanceTechniqueRequest = {
      date: this.seanceForm.date, titre: this.seanceForm.titre || undefined,
      objectif: this.seanceForm.objectif || undefined, description: this.seanceForm.description || undefined,
      exerciceIds: this.selection().map(e => e.id),
    };
    const id  = this.editingSeanceId();
    const obs = id ? this.service.modifierSeance(id, req) : this.service.creerSeance(req);
    obs.subscribe({
      next: () => { this.savingSeance.set(false); this.annulerSeance(); this.snack.open(id ? 'Séance modifiée' : 'Séance créée', 'Fermer', { duration: 2500 }); this.charger(); },
      error: () => { this.savingSeance.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }
  realiserSeance(s: SeanceTechnique): void {
    this.service.realiserSeance(s.id).subscribe({ next: () => this.charger(), error: () => this.snack.open('Action impossible', 'Fermer', { duration: 3000 }) });
  }
  supprimerSeance(s: SeanceTechnique): void {
    if (!confirm('Supprimer cette séance technique ?')) return;
    this.service.supprimerSeance(s.id).subscribe({ next: () => this.charger(), error: () => {} });
  }

  private exoVide(): ExerciceRequest {
    return { nom: '', categorie: '', dureeMinutes: null, objectif: '', intensite: null, description: '' };
  }
}
