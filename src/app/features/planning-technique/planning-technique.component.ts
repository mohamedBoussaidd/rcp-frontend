import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  CATEGORIES_EXERCICE, Exercice, ExerciceRequest,
  SeanceTechnique, SeanceTechniqueRequest, TechniqueService,
} from '../../core/services/technique.service';

@Component({
  selector: 'app-planning-technique',
  standalone: true,
  templateUrl: './planning-technique.component.html',
  styleUrl: './planning-technique.component.scss',
  imports: [FormsModule, DatePipe, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class PlanningTechniqueComponent implements OnInit {

  readonly categories = CATEGORIES_EXERCICE;

  exercices = signal<Exercice[]>([]);
  seances = signal<SeanceTechnique[]>([]);
  loading = signal(true);

  // Filtres bibliotheque
  filtreCreateur = signal('');
  filtreEquipe = signal('');
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
    (!this.filtreCreateur() || e.creeParId === this.filtreCreateur()) &&
    (!this.filtreEquipe() || e.equipeOrigineId === this.filtreEquipe()) &&
    (!this.filtreCategorie() || e.categorie === this.filtreCategorie())));

  // Form exercice
  showExoForm = signal(false);
  editingExoId = signal<string | null>(null);
  exoForm: ExerciceRequest = this.exoVide();
  savingExo = signal(false);

  // Composition seance
  showSeanceForm = signal(false);
  seanceForm = { date: new Date().toISOString().slice(0, 10), titre: '', objectif: '' };
  selection = signal<Exercice[]>([]);
  savingSeance = signal(false);

  readonly dureeSelection = computed(() => this.selection().reduce((s, e) => s + (e.dureeMinutes ?? 0), 0));
  readonly intensiteSelection = computed(() => {
    const sel = this.selection();
    const d = this.dureeSelection();
    if (d === 0) return null;
    const pond = sel.reduce((s, e) => s + (e.intensite ?? 0) * (e.dureeMinutes ?? 0), 0);
    return Math.round((pond / d) * 10) / 10;
  });

  constructor(private service: TechniqueService, private snack: MatSnackBar) {}

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

  // ── Exercices ──
  nouvelExo(): void { this.editingExoId.set(null); this.exoForm = this.exoVide(); this.showExoForm.set(true); }
  editerExo(e: Exercice): void {
    this.editingExoId.set(e.id);
    this.exoForm = { nom: e.nom, categorie: e.categorie, dureeMinutes: e.dureeMinutes, objectif: e.objectif, intensite: e.intensite, description: e.description };
    this.showExoForm.set(true);
  }
  annulerExo(): void { this.showExoForm.set(false); this.editingExoId.set(null); }
  enregistrerExo(): void {
    if (!this.exoForm.nom) return;
    this.savingExo.set(true);
    const id = this.editingExoId();
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

  // ── Composition seance ──
  estSelectionne(e: Exercice): boolean { return this.selection().some(x => x.id === e.id); }
  toggleSelection(e: Exercice): void {
    this.selection.update(sel => this.estSelectionne(e) ? sel.filter(x => x.id !== e.id) : [...sel, e]);
  }
  retirerSelection(e: Exercice): void { this.selection.update(sel => sel.filter(x => x.id !== e.id)); }

  enregistrerSeance(): void {
    if (this.selection().length === 0) { this.snack.open('Ajoutez au moins un exercice', 'Fermer', { duration: 2500 }); return; }
    this.savingSeance.set(true);
    const req: SeanceTechniqueRequest = {
      date: this.seanceForm.date,
      titre: this.seanceForm.titre || undefined,
      objectif: this.seanceForm.objectif || undefined,
      exerciceIds: this.selection().map(e => e.id),
    };
    this.service.creerSeance(req).subscribe({
      next: () => {
        this.savingSeance.set(false);
        this.showSeanceForm.set(false);
        this.selection.set([]);
        this.seanceForm = { date: new Date().toISOString().slice(0, 10), titre: '', objectif: '' };
        this.snack.open('Séance technique créée', 'Fermer', { duration: 2500 });
        this.charger();
      },
      error: () => { this.savingSeance.set(false); this.snack.open('Création impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  realiserSeance(s: SeanceTechnique): void {
    this.service.realiserSeance(s.id).subscribe({ next: () => this.charger(), error: () => {} });
  }
  supprimerSeance(s: SeanceTechnique): void {
    if (!confirm('Supprimer cette séance technique ?')) return;
    this.service.supprimerSeance(s.id).subscribe({ next: () => this.charger(), error: () => {} });
  }

  private exoVide(): ExerciceRequest {
    return { nom: '', categorie: '', dureeMinutes: null, objectif: '', intensite: null, description: '' };
  }
}
