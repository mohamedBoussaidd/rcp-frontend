import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Exercice, ExerciceRecherche, FORMES_EXERCICE, TechniqueService } from '@core/services/technique.service';
import { SchemaEditorComponent } from '../../tactical/schema-editor/schema-editor.component';
import { AuteurChipComponent } from '@shared/components/auteur-chip/auteur-chip.component';

/**
 * Bibliothèque d'exercices GLOBALE (SUPER_ADMIN) — exercices proposés en lecture à tous les clubs
 * (CB), et base du générateur IA. Se comporte comme la bibliothèque d'un club : cards avec badges,
 * auteur, et actions Schéma / Modifier / Supprimer / Dupliquer. Création & édition passent par la
 * même fiche que les clubs (`exercice-form`) en mode global.
 *
 * <p>Comporte aussi la recherche cross-club + la <b>promotion</b> d'un exercice de club en global
 * (duplication : l'original du club n'est jamais modifié).</p>
 */
@Component({
  selector: 'app-exercices-globaux',
  standalone: true,
  templateUrl: './exercices-globaux.component.html',
  styleUrl: './exercices-globaux.component.scss',
  imports: [FormsModule, RouterLink, MatIcon, AuteurChipComponent],
})
export class ExercicesGlobauxComponent implements OnInit {

  private tech = inject(TechniqueService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  readonly exercices = signal<Exercice[]>([]);
  readonly loading = signal(true);
  readonly formeOptions = ['ECHAUFFEMENT', 'ANALYTIQUE', 'SITUATION', 'JEU_REDUIT', 'MATCH_A_THEME'];
  readonly typeOptions = ['TECHNIQUE', 'PHYSIQUE', 'MIXTE'];

  // ── Recherche cross-club + promotion ──
  clubs = signal<{ id: string; nom: string }[]>([]);
  clubsSelectionnes = signal<Set<string>>(new Set());
  filtreNom = '';
  filtreForme = '';
  filtreType = '';
  resultats = signal<ExerciceRecherche[] | null>(null);
  recherching = signal(false);

  ngOnInit(): void {
    this.charger();
    this.tech.listerClubs().subscribe({ next: c => this.clubs.set(c), error: () => {} });
  }

  charger(): void {
    this.loading.set(true);
    this.tech.listerExercicesGlobaux().subscribe({
      next: e => { this.exercices.set(e); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string | null): string { return v ? v.replace(/_/g, ' ') : '—'; }

  libelleForme(code?: string | null): string {
    return FORMES_EXERCICE.find(f => f.code === code)?.libelle ?? this.label(code);
  }

  /** Dessine / édite le schéma tactique de l'exercice global (même éditeur que les clubs). */
  ouvrirSchema(e: Exercice): void {
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: e.nom,
        schemaJson: e.schemaJson,
        enregistrer: (json: string) => this.tech.sauverSchema(e.id, json),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.charger(); });
  }

  supprimer(e: Exercice): void {
    if (!confirm(`Supprimer l'exercice global « ${e.nom} » ? Il ne sera plus proposé aux clubs.`)) return;
    this.tech.supprimerExercice(e.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  dupliquer(e: Exercice): void {
    this.tech.dupliquerExercice(e.id).subscribe({
      next: () => { this.charger(); this.snack.open('Exercice dupliqué', 'Fermer', { duration: 2500 }); },
      error: () => this.snack.open('Duplication impossible', 'Fermer', { duration: 3000 }),
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
    this.tech.rechercherExercices({
      clubIds: clubIds.length ? clubIds : undefined,
      q: this.filtreNom.trim() || undefined,
      forme: this.filtreForme || undefined,
      type: this.filtreType || undefined,
    }).subscribe({
      next: r => { this.resultats.set(r); this.recherching.set(false); },
      error: () => { this.recherching.set(false); this.snack.open('Recherche impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  /** Promeut un exercice de club en global : duplique (l'original du club n'est jamais touché). */
  promouvoir(r: ExerciceRecherche): void {
    if (!confirm(`Promouvoir « ${r.nom} » en exercice global ? Une copie sera proposée à tous les clubs ; l'original du club « ${r.clubNom ?? '—'} » reste intact.`)) return;
    this.tech.promouvoirExercice(r.id).subscribe({
      next: () => { this.charger(); this.snack.open('Exercice promu en global', 'Fermer', { duration: 2500 }); },
      error: err => this.snack.open(err?.status === 409 ? 'Cet exercice est déjà global' : 'Promotion impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
