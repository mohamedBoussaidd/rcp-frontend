import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ModeleSemaineService, ModeleSemaine, CreneauModele, ModeleRequest, InstancierResult,
} from '@core/services/modele-semaine.service';
import { SeanceService, TypeSeance } from '@core/services/seance.service';

@Component({
  selector: 'app-modeles-semaine',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './modeles-semaine.component.html',
  styleUrl: './modeles-semaine.component.scss',
})
export class ModelesSemaineComponent implements OnInit {

  private service = inject(ModeleSemaineService);
  private seanceService = inject(SeanceService);

  readonly jours = [
    { v: 1, l: 'Lundi' }, { v: 2, l: 'Mardi' }, { v: 3, l: 'Mercredi' },
    { v: 4, l: 'Jeudi' }, { v: 5, l: 'Vendredi' }, { v: 6, l: 'Samedi' }, { v: 7, l: 'Dimanche' },
  ];

  modeles: ModeleSemaine[] = [];
  types: TypeSeance[] = [];
  loading = true;

  // Édition (création ou modification d'un modèle)
  edition: ModeleRequest | null = null;
  editionId: string | null = null;

  // Instanciation
  instancieId: string | null = null;
  instDebut = '';
  instFin = '';
  instRemplacer = false;
  instResult: InstancierResult | null = null;
  message = '';

  ngOnInit(): void {
    this.seanceService.getTypeSeances().subscribe(t => this.types = t);
    this.charger();
  }

  charger(): void {
    this.loading = true;
    this.service.getAll().subscribe({
      next: m => { this.modeles = m; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  // ── Édition ──
  nouveau(): void {
    this.editionId = null;
    this.edition = { nom: '', description: '', creneaux: [] };
  }

  modifier(m: ModeleSemaine): void {
    this.editionId = m.id;
    this.edition = {
      nom: m.nom,
      description: m.description ?? '',
      creneaux: m.creneaux.map(c => ({ ...c })),
    };
  }

  annulerEdition(): void {
    this.edition = null;
    this.editionId = null;
  }

  ajouterCreneau(): void {
    if (!this.edition) return;
    const typeId = this.types[0]?.id ?? '';
    this.edition.creneaux.push({
      jourSemaine: 1, heureDebut: '', dureeMinutes: null, terrain: '',
      typeSeanceId: typeId, titre: '', objectif: '', objectifDistanceM: null,
      objectifIntensite: null, ordre: this.edition.creneaux.length,
    });
  }

  retirerCreneau(i: number): void {
    this.edition?.creneaux.splice(i, 1);
  }

  enregistrer(): void {
    if (!this.edition || !this.edition.nom.trim()) { this.message = 'Le nom est obligatoire.'; return; }
    // Nettoie les chaînes vides en null pour le back.
    const req: ModeleRequest = {
      nom: this.edition.nom.trim(),
      description: this.edition.description || null,
      creneaux: this.edition.creneaux.map((c, i) => ({
        ...c,
        heureDebut: c.heureDebut || null,
        terrain: c.terrain || null,
        titre: c.titre || null,
        objectif: c.objectif || null,
        ordre: i,
      })),
    };
    const obs = this.editionId
      ? this.service.update(this.editionId, req)
      : this.service.create(req);
    obs.subscribe({
      next: () => { this.message = 'Modèle enregistré.'; this.annulerEdition(); this.charger(); },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  dupliquer(m: ModeleSemaine): void {
    this.service.dupliquer(m.id).subscribe(() => { this.message = 'Modèle dupliqué.'; this.charger(); });
  }

  supprimer(m: ModeleSemaine): void {
    if (!confirm(`Supprimer le modèle « ${m.nom} » ?`)) return;
    this.service.delete(m.id).subscribe(() => { this.message = 'Modèle supprimé.'; this.charger(); });
  }

  // ── Instanciation ──
  ouvrirInstanciation(m: ModeleSemaine): void {
    this.instancieId = m.id;
    this.instResult = null;
    this.instRemplacer = false;
    const lundi = this.prochainLundi();
    this.instDebut = this.iso(lundi);
    this.instFin = this.iso(this.addDays(lundi, 6));
  }

  annulerInstanciation(): void {
    this.instancieId = null;
    this.instResult = null;
  }

  lancerInstanciation(): void {
    if (!this.instancieId || !this.instDebut || !this.instFin) return;
    this.service.instancier(this.instancieId, {
      debut: this.instDebut, fin: this.instFin, remplacer: this.instRemplacer,
    }).subscribe({
      next: r => { this.instResult = r; },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  nomJour(v: number): string {
    return this.jours.find(j => j.v === v)?.l ?? '?';
  }

  // ── Dates ──
  private prochainLundi(): Date {
    const d = new Date();
    const delta = (8 - (d.getDay() === 0 ? 7 : d.getDay())) % 7 || 7;
    return this.addDays(d, delta);
  }
  private addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(r.getDate() + n); return r;
  }
  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
