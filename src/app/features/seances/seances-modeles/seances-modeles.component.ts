import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeanceModeleService, SeanceModele, SeanceModeleRequest, PlanifieResponse,
} from '@core/services/seance-modele.service';
import { SeanceService, TypeSeance } from '@core/services/seance.service';
import { TechniqueService, Exercice } from '@core/services/technique.service';

/**
 * Bibliothèque de séances-modèles (espace Coaching). Gabarits réutilisables : on les crée/édite
 * (créateur-only), on les duplique, et surtout on les « Planifie » pour générer une vraie séance
 * dans le calendrier. Pattern inline (panneaux togglés), calqué sur « Modèles de semaine ».
 */
@Component({
  selector: 'app-seances-modeles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './seances-modeles.component.html',
  styleUrl: './seances-modeles.component.scss',
})
export class SeancesModelesComponent implements OnInit {

  private service = inject(SeanceModeleService);
  private seanceService = inject(SeanceService);
  private technique = inject(TechniqueService);

  modeles: SeanceModele[] = [];
  types: TypeSeance[] = [];
  exercices: Exercice[] = [];
  loading = true;
  message = '';

  // Édition (création ou modification du cadre + sélection d'exercices)
  edition: SeanceModeleRequest | null = null;
  editionId: string | null = null;
  selection: Exercice[] = [];
  exoListeOuverte = false;
  filtreExo = '';

  // Planification (instanciation en séance)
  planifId: string | null = null;
  planifNom = '';
  planifDate = '';
  planifHeure = '';
  planifResult: PlanifieResponse | null = null;

  ngOnInit(): void {
    this.seanceService.getTypeSeances().subscribe(t => this.types = t);
    this.technique.listerExercices().subscribe(ex =>
      this.exercices = ex.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '')));
    this.charger();
  }

  charger(): void {
    this.loading = true;
    this.service.lister().subscribe({
      next: m => { this.modeles = m; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  // ── Édition ──
  nouveau(): void {
    this.editionId = null;
    this.selection = [];
    this.exoListeOuverte = false;
    this.edition = {
      nom: '', typeSeanceId: this.types[0]?.id ?? '', objectif: '', dureeMinutes: null,
      objectifDistanceM: null, objectifIntensite: null, objectifDistanceHauteIntensiteM: null, description: '',
    };
  }

  modifier(m: SeanceModele): void {
    this.service.detail(m.id).subscribe(d => {
      this.editionId = m.id;
      this.exoListeOuverte = false;
      this.edition = {
        nom: d.modele.nom,
        typeSeanceId: d.modele.typeSeanceId ?? this.types[0]?.id ?? '',
        objectif: d.modele.objectif ?? '',
        dureeMinutes: d.modele.dureeMinutes ?? null,
        objectifDistanceM: d.modele.objectifDistanceM ?? null,
        objectifIntensite: d.modele.objectifIntensite ?? null,
        objectifDistanceHauteIntensiteM: d.modele.objectifDistanceHauteIntensiteM ?? null,
        description: d.modele.description ?? '',
      };
      this.selection = d.exercices
        .map(l => this.exercices.find(e => e.id === l.exerciceId))
        .filter((e): e is Exercice => !!e);
    });
  }

  annulerEdition(): void {
    this.edition = null;
    this.editionId = null;
    this.selection = [];
  }

  // ── Sélection d'exercices ──
  toggleExoListe(): void { this.exoListeOuverte = !this.exoListeOuverte; }

  get exercicesFiltres(): Exercice[] {
    const q = this.filtreExo.trim().toLowerCase();
    return this.exercices.filter(e => !q || (e.nom || '').toLowerCase().includes(q));
  }

  estSelectionne(e: Exercice): boolean { return this.selection.some(x => x.id === e.id); }

  toggleSelection(e: Exercice): void {
    this.selection = this.estSelectionne(e)
      ? this.selection.filter(x => x.id !== e.id)
      : [...this.selection, e];
    this.recalculerDuree();
  }

  retirer(e: Exercice): void {
    this.selection = this.selection.filter(x => x.id !== e.id);
    this.recalculerDuree();
  }

  get dureeSelection(): number {
    return this.selection.reduce((s, e) => s + (e.dureeMinutes ?? 0), 0);
  }

  /** Durée du modèle = somme des durées des exercices (auto, modifiable ensuite). */
  recalculerDuree(): void {
    if (this.edition && this.dureeSelection > 0) this.edition.dureeMinutes = this.dureeSelection;
  }

  enregistrer(): void {
    if (!this.edition) return;
    if (!this.edition.nom.trim()) { this.message = 'Le nom est obligatoire.'; return; }
    if (!this.edition.typeSeanceId) { this.message = 'Le type de séance est obligatoire.'; return; }
    const req: SeanceModeleRequest = {
      nom: this.edition.nom.trim(),
      typeSeanceId: this.edition.typeSeanceId,
      objectif: this.edition.objectif || null,
      dureeMinutes: this.edition.dureeMinutes ?? null,
      objectifDistanceM: this.edition.objectifDistanceM ?? null,
      objectifIntensite: this.edition.objectifIntensite ?? null,
      objectifDistanceHauteIntensiteM: this.edition.objectifDistanceHauteIntensiteM ?? null,
      description: this.edition.description || null,
    };
    const lignes = this.selection.map(e => ({ exerciceId: e.id }));
    const obs = this.editionId ? this.service.modifier(this.editionId, req) : this.service.creer(req);
    obs.subscribe({
      next: saved => {
        this.service.remplacerExercices(saved.id, lignes).subscribe({
          next: () => { this.message = 'Modèle enregistré.'; this.annulerEdition(); this.charger(); },
          error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
        });
      },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  dupliquer(m: SeanceModele): void {
    this.service.dupliquer(m.id).subscribe(() => { this.message = 'Modèle dupliqué.'; this.charger(); });
  }

  supprimer(m: SeanceModele): void {
    if (!confirm(`Supprimer le modèle « ${m.nom} » ?`)) return;
    this.service.supprimer(m.id).subscribe({
      next: () => { this.message = 'Modèle supprimé.'; this.charger(); },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  // ── Planification ──
  ouvrirPlanifier(m: SeanceModele): void {
    this.planifId = m.id;
    this.planifNom = m.nom;
    this.planifDate = new Date().toISOString().slice(0, 10);
    this.planifHeure = '';
    this.planifResult = null;
  }

  annulerPlanifier(): void {
    this.planifId = null;
    this.planifResult = null;
  }

  lancerPlanifier(): void {
    if (!this.planifId || !this.planifDate) return;
    this.service.planifier(this.planifId, {
      date: this.planifDate,
      heureDebut: this.planifHeure || undefined,
    }).subscribe({
      next: r => { this.planifResult = r; this.message = 'Séance créée dans le calendrier.'; },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  nomType(id?: string): string {
    return this.types.find(t => t.id === id)?.libelle ?? '—';
  }
}
