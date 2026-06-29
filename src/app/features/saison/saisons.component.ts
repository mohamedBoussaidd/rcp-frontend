import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';

import {
  SaisonService, Saison, SaisonRequest, Periode, PeriodeType,
  EffectifMembre, ReconductionProposition,
} from '@core/services/saison.service';
import { JoueurService, Joueur } from '@core/services/joueur.service';

/**
 * Gestion des saisons d'une équipe : ouverture (clôture auto de la précédente),
 * clôture, édition des périodes typées (génération par défaut + ajustement libre) et
 * définition de l'effectif (cases à cocher + reconduction depuis la saison précédente).
 */
@Component({
  selector: 'app-saisons',
  standalone: true,
  templateUrl: './saisons.component.html',
  styleUrl: './saisons.component.scss',
  imports: [DatePipe, FormsModule, MatIcon],
})
export class SaisonsComponent implements OnInit {

  private saisonService = inject(SaisonService);
  private joueurService = inject(JoueurService);

  saisons: Saison[] = [];
  joueurs: Joueur[] = [];
  selected: Saison | null = null;

  loading = true;
  message: string | null = null;
  erreur: string | null = null;

  // Formulaire « nouvelle saison »
  showForm = false;
  form: SaisonRequest = this.formVide();

  // Édition des périodes de la saison sélectionnée
  periodesEdit: Periode[] = [];

  // Effectif (cases cochées = effectif de la saison) + reconduction
  selectedJoueurIds = new Set<string>();
  reconduction: ReconductionProposition | null = null;

  readonly TYPES: { value: PeriodeType; label: string }[] = [
    { value: 'PREPARATION', label: 'Préparation' },
    { value: 'COMPETITION', label: 'Championnat' },
    { value: 'TREVE',       label: 'Trêve' },
    { value: 'REPRISE',     label: 'Reprise' },
    { value: 'INTERSAISON', label: 'Intersaison' },
  ];

  ngOnInit(): void {
    this.load();
    this.joueurService.getAll().subscribe({ next: d => (this.joueurs = d), error: () => {} });
  }

  private formVide(): SaisonRequest {
    const annee = new Date().getFullYear();
    return {
      libelle: `${annee}-${annee + 1}`,
      dateDebut: `${annee}-07-01`,
      dateFin: `${annee + 1}-06-30`,
      genererPeriodes: true,
    };
  }

  /** Saison actuellement active (EN_COURS) de l'équipe, ou null. */
  get saisonActive(): Saison | null {
    return this.saisons.find(s => s.statut === 'EN_COURS') ?? null;
  }

  load(): void {
    this.loading = true;
    this.saisonService.getAll().subscribe({
      next: data => {
        this.saisons = data;
        this.loading = false;
        if (this.selected) {
          this.selected = data.find(s => s.id === this.selected!.id) ?? null;
        }
      },
      error: () => { this.loading = false; this.erreur = 'Chargement impossible.'; },
    });
  }

  // ── Sélection ──
  selectionner(s: Saison): void {
    this.selected = s;
    this.periodesEdit = s.periodes.map(p => ({ ...p }));
    this.reconduction = null;
    this.selectedJoueurIds = new Set();
    this.saisonService.getEffectif(s.id).subscribe({
      next: (membres: EffectifMembre[]) =>
        (this.selectedJoueurIds = new Set(membres.map(m => m.joueurId))),
      error: () => {},
    });
  }

  // ── Ouverture / clôture ──
  ouvrir(): void {
    this.erreur = this.message = null;
    this.saisonService.ouvrir(this.form).subscribe({
      next: s => {
        this.message = `Saison « ${s.libelle} » ouverte.`;
        this.showForm = false;
        this.form = this.formVide();
        this.load();
        this.selectionner(s);
      },
      error: e => (this.erreur = e?.error?.message ?? 'Ouverture impossible.'),
    });
  }

  cloturer(s: Saison): void {
    this.saisonService.cloturer(s.id).subscribe({
      next: () => { this.message = `Saison « ${s.libelle} » clôturée.`; this.load(); },
      error: () => (this.erreur = 'Clôture impossible.'),
    });
  }

  supprimer(s: Saison): void {
    this.saisonService.delete(s.id).subscribe({
      next: () => { if (this.selected?.id === s.id) this.selected = null; this.load(); },
      error: () => (this.erreur = 'Suppression impossible.'),
    });
  }

  // ── Périodes ──
  genererPeriodes(): void {
    if (!this.selected) return;
    this.saisonService.genererPeriodes(this.selected.id).subscribe({
      next: s => { this.message = 'Périodes par défaut générées.'; this.load(); this.selectionner(s); },
      error: () => (this.erreur = 'Génération impossible.'),
    });
  }

  ajouterPeriode(): void {
    const debut = this.selected?.dateDebut ?? new Date().toISOString().slice(0, 10);
    this.periodesEdit.push({ type: 'COMPETITION', libelle: '', dateDebut: debut, dateFin: debut, ordre: this.periodesEdit.length });
  }

  retirerPeriode(i: number): void { this.periodesEdit.splice(i, 1); }

  enregistrerPeriodes(): void {
    if (!this.selected) return;
    this.saisonService.remplacerPeriodes(this.selected.id, this.periodesEdit).subscribe({
      next: s => { this.message = 'Périodes enregistrées.'; this.load(); this.selectionner(s); },
      error: e => (this.erreur = e?.error?.message ?? 'Enregistrement impossible.'),
    });
  }

  // ── Effectif ──
  estDansEffectif(j: Joueur): boolean { return this.selectedJoueurIds.has(j.id); }

  basculer(j: Joueur): void {
    if (this.selectedJoueurIds.has(j.id)) this.selectedJoueurIds.delete(j.id);
    else this.selectedJoueurIds.add(j.id);
  }

  reconduire(): void {
    if (!this.selected) return;
    this.saisonService.getReconduction(this.selected.id).subscribe({
      next: prop => {
        this.reconduction = prop;
        // Pré-coche les joueurs suggérés (l'utilisateur décoche les transférés puis enregistre).
        prop.lignes.filter(l => l.suggerer).forEach(l => this.selectedJoueurIds.add(l.joueurId));
        if (!prop.saisonPrecedenteId) this.message = 'Aucune saison précédente à reconduire.';
      },
      error: () => (this.erreur = 'Reconduction impossible.'),
    });
  }

  enregistrerEffectif(): void {
    if (!this.selected) return;
    this.saisonService.definirEffectif(this.selected.id, [...this.selectedJoueurIds]).subscribe({
      next: () => { this.message = 'Effectif enregistré.'; this.load(); },
      error: () => (this.erreur = 'Enregistrement de l\'effectif impossible.'),
    });
  }

  // ── Helpers UI ──
  badgeStatut(s: Saison): string {
    return { PREPARATION: 'prep', EN_COURS: 'encours', CLOTUREE: 'cloturee' }[s.statut] ?? '';
  }

  labelType(t: PeriodeType): string {
    return this.TYPES.find(x => x.value === t)?.label ?? t;
  }
}
