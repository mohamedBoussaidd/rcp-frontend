import { Component, OnInit, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { JoueurService, Joueur } from '@core/services/joueur.service';

@Component({
  selector: 'app-joueur-supprimer-dialog',
  standalone: true,
  templateUrl: './joueur-supprimer-dialog.component.html',
  styleUrl: './joueur-supprimer-dialog.component.scss',
  imports: []
})
export class JoueurSupprimerDialogComponent implements OnInit {

  joueurs: Joueur[] = [];
  loading = true;
  confirmation: Joueur | null = null;
  enCours = false;

  private dialogRef = inject<MatDialogRef<JoueurSupprimerDialogComponent>>(MatDialogRef);
  private joueurService = inject(JoueurService);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.joueurService.getAllPourSuppression().subscribe({
      next: data => {
        this.joueurs = data.sort((a, b) =>
          `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Impossible de charger les joueurs', 'Fermer', { duration: 4000 });
      }
    });
  }

  demanderConfirmation(joueur: Joueur): void {
    this.confirmation = joueur;
  }

  annulerConfirmation(): void {
    this.confirmation = null;
  }

  confirmerSuppression(): void {
    if (!this.confirmation) return;
    this.enCours = true;
    const cible = this.confirmation;
    this.joueurService.delete(cible.id).subscribe({
      next: () => {
        this.joueurs = this.joueurs.filter(j => j.id !== cible.id);
        this.snackBar.open(`${cible.prenom} ${cible.nom} supprimé`, 'OK', { duration: 3000 });
        this.confirmation = null;
        this.enCours = false;
      },
      error: () => {
        this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 4000 });
        this.enCours = false;
      }
    });
  }

  fermer(): void {
    this.dialogRef.close(true);
  }
}
