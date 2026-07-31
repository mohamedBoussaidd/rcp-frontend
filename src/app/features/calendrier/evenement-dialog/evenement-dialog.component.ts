import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Evenement, EvenementRequest, EvenementService, TYPES_EVENEMENT, TypeEvenement,
} from '@core/services/evenement.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';

interface DialogData {
  date: string;
  evenement?: Evenement;
}

/**
 * Création / édition d'un événement extrasportif.
 *
 * Le ciblage nominatif est le cœur de l'écran : sans personne sélectionnée, l'événement
 * concerne toute l'équipe ; avec, il n'apparaît que pour les personnes listées — c'est ce qui
 * permet d'expliquer une absence individuelle (« examens jeudi ») plutôt qu'une simple note.
 */
@Component({
  selector: 'app-evenement-dialog',
  standalone: true,
  templateUrl: './evenement-dialog.component.html',
  styleUrl: './evenement-dialog.component.scss',
  imports: [FormsModule],
})
export class EvenementDialogComponent implements OnInit {

  private service = inject(EvenementService);
  private joueurService = inject(JoueurService);
  private snackBar = inject(MatSnackBar);

  readonly TYPES = TYPES_EVENEMENT;

  readonly type = signal<TypeEvenement>('VIE_CLUB');
  readonly titre = signal('');
  readonly date = signal('');
  readonly dateFin = signal('');
  readonly heureDebut = signal('');
  readonly heureFin = signal('');
  readonly lieu = signal('');
  readonly description = signal('');
  readonly visibleJoueurs = signal(true);
  readonly cibles = signal<Set<string>>(new Set());

  readonly joueurs = signal<Joueur[]>([]);
  readonly recherche = signal('');
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  constructor(
    private ref: MatDialogRef<EvenementDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
  ) {}

  ngOnInit(): void {
    const e = this.data.evenement;
    this.date.set(e?.date ?? this.data.date);
    if (e) {
      this.type.set(e.type);
      this.titre.set(e.titre);
      this.dateFin.set(e.dateFin ?? '');
      this.heureDebut.set(e.heureDebut?.slice(0, 5) ?? '');
      this.heureFin.set(e.heureFin?.slice(0, 5) ?? '');
      this.lieu.set(e.lieu ?? '');
      this.description.set(e.description ?? '');
      this.visibleJoueurs.set(e.visibleJoueurs);
      this.cibles.set(new Set(e.concernes.map(p => p.id)));
    }
    this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
  }

  get estEdition(): boolean { return !!this.data.evenement; }

  /** Liste filtrée par la recherche — un effectif de 30 fiches se navigue mal sans filtre. */
  get joueursFiltres(): Joueur[] {
    const q = this.recherche().trim().toLowerCase();
    if (!q) return this.joueurs();
    return this.joueurs().filter(j => `${j.prenom} ${j.nom}`.toLowerCase().includes(q));
  }

  estCible(id: string): boolean { return this.cibles().has(id); }

  basculerCible(id: string): void {
    this.cibles.update(set => {
      const copie = new Set(set);
      if (copie.has(id)) copie.delete(id); else copie.add(id);
      return copie;
    });
  }

  effacerCibles(): void { this.cibles.set(new Set()); }

  get valide(): boolean {
    if (!this.titre().trim() || !this.date()) return false;
    return !this.dateFin() || this.dateFin() >= this.date();
  }

  annuler(): void { this.ref.close(false); }

  enregistrer(): void {
    if (!this.valide || this.envoi()) return;
    this.erreur.set(null);
    this.envoi.set(true);
    const req: EvenementRequest = {
      type: this.type(),
      titre: this.titre().trim(),
      date: this.date(),
      dateFin: this.dateFin() || null,
      heureDebut: this.heureDebut() || null,
      heureFin: this.heureFin() || null,
      lieu: this.lieu().trim() || null,
      description: this.description().trim() || null,
      joueurIds: [...this.cibles()],
      visibleJoueurs: this.visibleJoueurs(),
    };
    const obs = this.estEdition
      ? this.service.modifier(this.data.evenement!.id, req)
      : this.service.creer(req);
    obs.subscribe({
      next: () => {
        this.snackBar.open(this.estEdition ? 'Événement modifié' : 'Événement créé', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: err => {
        this.envoi.set(false);
        this.erreur.set(err?.error?.message ?? "Enregistrement impossible.");
      },
    });
  }
}
