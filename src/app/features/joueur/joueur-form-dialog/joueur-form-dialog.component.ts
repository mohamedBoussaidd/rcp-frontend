import { Component, Inject, Optional } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelect, MatOption } from '@angular/material/select';
import { JoueurService, Joueur } from '@core/services/joueur.service';

@Component({
  selector: 'app-joueur-form-dialog',
  standalone: true,
  templateUrl: './joueur-form-dialog.component.html',
  styleUrl: './joueur-form-dialog.component.scss',
  imports: [ReactiveFormsModule, MatSelect, MatOption]
})
export class JoueurFormDialogComponent {

  form: FormGroup;
  saving   = false;
  editMode = false;
  titre    = 'Nouveau joueur';

  postes = [
    { value: 'GK',  label: 'Gardien' },
    { value: 'DC',  label: 'Défenseur central' },
    { value: 'LB',  label: 'Latéral gauche' },
    { value: 'RB',  label: 'Latéral droit' },
    { value: 'MDC', label: 'Milieu défensif' },
    { value: 'MC',  label: 'Milieu central' },
    { value: 'MG',  label: 'Milieu gauche' },
    { value: 'MD',  label: 'Milieu droit' },
    { value: 'AG',  label: 'Ailier gauche' },
    { value: 'AD',  label: 'Ailier droit' },
    { value: 'ATT', label: 'Attaquant' },
  ];

  piedsForts = [
    { value: 'droit',      label: 'Droit' },
    { value: 'gauche',     label: 'Gauche' },
    { value: 'ambidextre', label: 'Ambidextre' },
  ];

  profils = [
    { value: 'explosif_leger',       label: 'Explosif léger' },
    { value: 'pivot_costaud',        label: 'Pivot costaud' },
    { value: 'box_to_box',           label: 'Box to box' },
    { value: 'sentinelle',           label: 'Sentinelle' },
    { value: 'lateral_offensif',     label: 'Latéral offensif' },
    { value: 'central_rapide',       label: 'Central rapide' },
    { value: 'central_costaud',      label: 'Central costaud' },
    { value: 'renard_surfaces',      label: 'Renard des surfaces' },
    { value: 'attaquant_profondeur', label: 'Attaquant en profondeur' },
  ];

  statuts = [
    { value: 'actif',    label: 'Actif' },
    { value: 'blesse',   label: 'Blessé' },
    { value: 'suspendu', label: 'Suspendu' },
    { value: 'prete',    label: 'Prêté' },
    { value: 'inactif',  label: 'Inactif' },
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<JoueurFormDialogComponent>,
    private joueurService: JoueurService,
    private snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: Joueur | null
  ) {
    const j = data;
    this.editMode = !!j?.id;
    this.titre    = this.editMode ? `Modifier — ${j!.prenom} ${j!.nom}` : 'Nouveau joueur';

    this.form = this.fb.group({
      prenom:           [j?.prenom           ?? '',     Validators.required],
      nom:              [j?.nom              ?? '',     Validators.required],
      dateNaissance:    [j?.dateNaissance     ?? null],
      dateArriveeClub:  [j?.dateArriveeClub   ?? null],
      piedFort:         [j?.piedFort          ?? null],
      statut:           [j?.statut            ?? 'actif', Validators.required],
      postePrincipal:   [j?.postePrincipal    ?? null],
      posteSecondaire:  [j?.posteSecondaire   ?? null],
      profilAthletique: [j?.profilAthletique  ?? null],
      poidsActuel:      [j?.poidsActuel       ?? null],
      poidsFormeCible:  [j?.poidsFormeCible   ?? null],
      taille:           [j?.taille            ?? null],
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const payload = this.cleanNullStrings(this.form.value);

    const op$ = this.editMode
      ? this.joueurService.update(this.data!.id, payload)
      : this.joueurService.create(payload);

    const msg = this.editMode ? 'Joueur mis à jour' : 'Joueur créé avec succès';

    op$.subscribe({
      next: joueur => {
        this.snackBar.open(`${joueur.prenom} ${joueur.nom} — ${msg}`, 'OK', { duration: 3000 });
        this.dialogRef.close(joueur);
      },
      error: () => {
        this.saving = false;
        this.snackBar.open('Erreur lors de la sauvegarde', 'Fermer', { duration: 4000 });
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private cleanNullStrings(value: any): any {
    const result: any = {};
    for (const key of Object.keys(value)) {
      result[key] = value[key] === '' ? null : value[key];
    }
    return result;
  }
}
