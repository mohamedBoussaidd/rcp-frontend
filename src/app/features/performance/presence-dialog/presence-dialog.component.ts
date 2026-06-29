import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SeanceService, LignePresence, StatutPresence, Seance } from '@core/services/seance.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIcon } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { DatePipe, SlicePipe } from '@angular/common';

export interface PresenceDialogData {
  seance: Seance;
}

@Component({
  selector: 'app-presence-dialog',
  standalone: true,
  templateUrl: './presence-dialog.component.html',
  styleUrl: './presence-dialog.component.scss',
  imports: [MatIcon, FormsModule, DatePipe, SlicePipe],
})
export class PresenceDialogComponent implements OnInit {

  lignes: LignePresence[] = [];
  loading = true;
  saving = new Set<string>();

  readonly statuts: { val: StatutPresence; label: string; icon: string }[] = [
    { val: 'PRESENT', label: 'Présent',  icon: 'check_circle'    },
    { val: 'RETARD',  label: 'Retard',   icon: 'schedule'        },
    { val: 'EXCUSE',  label: 'Excusé',   icon: 'info'            },
    { val: 'ABSENT',  label: 'Absent',   icon: 'cancel'          },
  ];

  get seance(): Seance { return this.data.seance; }

  // Les blessés (dérivés du médical) sont comptés à part et exclus des présents.
  get nbPresents():  number { return this.lignes.filter(l => !l.blesse && l.statut === 'PRESENT').length; }
  get nbAbsents():   number { return this.lignes.filter(l => !l.blesse && l.statut === 'ABSENT').length;  }
  get nbExcuses():   number { return this.lignes.filter(l => !l.blesse && l.statut === 'EXCUSE').length;  }
  get nbRetards():   number { return this.lignes.filter(l => !l.blesse && l.statut === 'RETARD').length;  }
  get nbBlesses():   number { return this.lignes.filter(l => l.blesse).length;                           }
  get nbNonRens():   number { return this.lignes.filter(l => !l.statut).length;                          }

  dialogRef = inject<MatDialogRef<PresenceDialogComponent>>(MatDialogRef);
  data = inject<PresenceDialogData>(MAT_DIALOG_DATA);
  private seanceService = inject(SeanceService);
  private snack = inject(MatSnackBar);

  ngOnInit(): void {
    this.seanceService.getFeuille(this.seance.id).subscribe({
      next: f  => { this.lignes = f.lignes; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  setStatut(ligne: LignePresence, statut: StatutPresence): void {
    const prev = ligne.statut;
    ligne.statut = statut;
    this.saving.add(ligne.joueurId);
    this.seanceService.savePresenceJoueur(this.seance.id, ligne.joueurId, statut, ligne.note).subscribe({
      next: updated => { ligne.statut = updated.statut; this.saving.delete(ligne.joueurId); },
      error: () => {
        ligne.statut = prev;
        this.saving.delete(ligne.joueurId);
        this.snack.open('Erreur de sauvegarde', 'Fermer', { duration: 2500 });
      }
    });
  }

  marquerTousPresents(): void {
    const nonRens = this.lignes.filter(l => !l.statut);
    if (!nonRens.length) return;
    nonRens.forEach(l => l.statut = 'PRESENT');
    const payload = this.lignes.filter(l => l.statut)
      .map(l => ({ joueurId: l.joueurId, statut: l.statut!, note: l.note }));
    this.seanceService.saveFeuille(this.seance.id, payload).subscribe({
      next: f  => { this.lignes = f.lignes; },
      error: () => this.snack.open('Erreur de sauvegarde', 'Fermer', { duration: 2500 })
    });
  }

  saveNote(ligne: LignePresence): void {
    if (!ligne.statut) return;
    this.seanceService.savePresenceJoueur(this.seance.id, ligne.joueurId, ligne.statut, ligne.note).subscribe({ error: () => {} });
  }

  fermer(): void { this.dialogRef.close(); }
}
