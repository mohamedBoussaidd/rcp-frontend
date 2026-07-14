import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AnnuaireJoueur, JoueurService } from '@core/services/joueur.service';
import { ContexteService } from '@core/services/contexte.service';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';

/**
 * Annuaire du club : toutes les personnes (fiches joueur), leurs équipes d'appartenance dérivées
 * de l'effectif de la saison EN_COURS, le pool des non-assignés, et les actions créer → assigner /
 * retirer. L'affectation crée/supprime une ligne d'effectif (source de vérité multi-équipe).
 */
@Component({
  selector: 'app-annuaire',
  standalone: true,
  templateUrl: './annuaire.component.html',
  styleUrl: './annuaire.component.scss',
  imports: [FormsModule, MatMenuModule, MatIcon],
})
export class AnnuaireComponent implements OnInit {

  private service = inject(JoueurService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  contexte = inject(ContexteService);

  personnes = signal<AnnuaireJoueur[]>([]);
  chargement = signal(true);
  recherche = signal('');
  filtrePool = signal(false);          // true = n'afficher que les non-assignés
  busy = signal<string | null>(null);  // joueurId dont une action est en cours

  readonly equipes = this.contexte.equipesDispo;

  readonly nbPool = computed(() => this.personnes().filter(p => !p.assigne).length);

  readonly filtres = computed<AnnuaireJoueur[]>(() => {
    const q = this.recherche().trim().toLowerCase();
    const poolSeul = this.filtrePool();
    return this.personnes().filter(p => {
      if (poolSeul && p.assigne) return false;
      if (!q) return true;
      return `${p.prenom} ${p.nom}`.toLowerCase().includes(q)
          || `${p.nom} ${p.prenom}`.toLowerCase().includes(q);
    });
  });

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.chargement.set(true);
    this.service.getAnnuaire().subscribe({
      next: d => { this.personnes.set(d); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  /** Équipes du club non encore attribuées à cette personne (pour le menu « Assigner »). */
  equipesAssignables(p: AnnuaireJoueur) {
    const deja = new Set(p.equipes.map(e => e.id));
    return this.equipes().filter(e => !deja.has(e.id));
  }

  assigner(p: AnnuaireJoueur, equipeId: string): void {
    this.busy.set(p.joueurId);
    this.service.assigner(p.joueurId, equipeId).subscribe({
      next: () => { this.busy.set(null); this.charger(); },
      error: err => { this.busy.set(null); this.erreur(err, 'Assignation impossible'); },
    });
  }

  retirer(p: AnnuaireJoueur, equipeId: string): void {
    this.busy.set(p.joueurId);
    this.service.desassigner(p.joueurId, equipeId).subscribe({
      next: () => { this.busy.set(null); this.charger(); },
      error: err => { this.busy.set(null); this.erreur(err, 'Retrait impossible'); },
    });
  }

  creerFiche(): void {
    this.dialog.open(JoueurFormDialogComponent, { autoFocus: false, panelClass: 'rcp-dialog' })
      .afterClosed().subscribe(cree => { if (cree) this.charger(); });
  }

  /** L'annuaire ne porte qu'un résumé : on recharge la fiche complète avant d'ouvrir l'édition. */
  modifier(p: AnnuaireJoueur): void {
    this.busy.set(p.joueurId);
    this.service.getById(p.joueurId).subscribe({
      next: joueur => {
        this.busy.set(null);
        this.dialog.open(JoueurFormDialogComponent, { data: joueur, autoFocus: false, panelClass: 'rcp-dialog' })
          .afterClosed().subscribe(maj => { if (maj) this.charger(); });
      },
      error: err => { this.busy.set(null); this.erreur(err, 'Fiche introuvable'); },
    });
  }

  initiales(p: AnnuaireJoueur): string {
    return `${(p.prenom || '').charAt(0)}${(p.nom || '').charAt(0)}`.toUpperCase();
  }

  private erreur(err: any, defaut: string): void {
    const msg = err?.status === 409 ? 'Aucune saison en cours pour cette équipe' : (err?.error?.message || defaut);
    this.snack.open(msg, 'Fermer', { duration: 4000 });
  }
}
