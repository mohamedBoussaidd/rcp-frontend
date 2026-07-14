import { Component, OnInit, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { JoueurService, Joueur } from '@core/services/joueur.service';
import { JoueurFormDialogComponent } from '../joueur-form-dialog/joueur-form-dialog.component';

@Component({
  selector: 'app-joueur-modifier-dialog',
  standalone: true,
  templateUrl: './joueur-modifier-dialog.component.html',
  styleUrl: './joueur-modifier-dialog.component.scss',
  imports: []
})
export class JoueurModifierDialogComponent implements OnInit {

  joueurs: Joueur[] = [];
  loading = true;
  /** Au moins une fiche modifiée pendant ce dialog → le parent recharge ses données. */
  private modifie = false;

  private dialogRef = inject<MatDialogRef<JoueurModifierDialogComponent>>(MatDialogRef);
  private dialog = inject(MatDialog);
  private joueurService = inject(JoueurService);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    // Même population que le dialog de suppression : toutes les fiches du périmètre, inactives
    // incluses (permet de réactiver une fiche en changeant son statut).
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

  modifier(joueur: Joueur): void {
    this.dialog.open(JoueurFormDialogComponent, {
      data: joueur,
      width: '560px', maxWidth: '95vw', panelClass: 'app-dialog',
    }).afterClosed().subscribe((maj: Joueur | undefined) => {
      if (!maj) return;
      this.modifie = true;
      this.joueurs = this.joueurs.map(j => j.id === maj.id ? maj : j);
    });
  }

  fermer(): void {
    this.dialogRef.close(this.modifie);
  }
}
