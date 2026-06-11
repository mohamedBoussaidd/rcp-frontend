import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TypeSeance, SeanceCreate } from '@core/services/seance.service';

export interface DialogData {
  typeSeance: TypeSeance;
  date: string;
  seance?: any;   // seance existante => mode edition (preremplissage)
}

const SUGGESTIONS_COURT = ['Météo', 'Blessure', 'Fatigue collective', 'Décision staff'];
const SUGGESTIONS_LONG = ['Prolongations', 'Exercice supplémentaire', 'Décision staff'];
const SEUIL_ECART = 0.20;

@Component({
  selector: 'app-seance-form-dialog',
  standalone: true,
  templateUrl: './seance-form-dialog.component.html',
  styleUrl: './seance-form-dialog.component.scss',
  imports: [CommonModule, ReactiveFormsModule, MatSelectModule]
})
export class SeanceFormDialogComponent implements OnInit, OnDestroy {

  form!: FormGroup;
  readonly estMatch: boolean;
  readonly dureeTheorique: number | null;
  readonly suggestionsEcourt = SUGGESTIONS_COURT;
  readonly suggestionsLong = SUGGESTIONS_LONG;

  alerteEcart: 'court' | 'long' | null = null;
  get editMode(): boolean { return !!this.dialogData.seance; }

  private sub!: Subscription;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<SeanceFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public dialogData: DialogData
  ) {
    this.estMatch = ['MATCH', 'MATCH_AMICAL'].includes(dialogData.typeSeance.code);
    this.dureeTheorique = dialogData.typeSeance.dureeTheoriqueMin ?? null;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      titre: [''],
      heureDebut: [''],
      dureeMinutes: [this.dureeTheorique, [Validators.required, Validators.min(1)]],
      terrain: [''],
      conditionsMeteo: [''],
      temperature: [null],
      description: [''],
      raisonEcartDuree: [''],
      adversaire: ['', this.estMatch ? Validators.required : null],
      competition: [''],
      domicileExterieur: ['', this.estMatch ? Validators.required : null],
    });

    if (this.dialogData.seance) {
      const s = this.dialogData.seance;
      this.form.patchValue({
        titre: s.titre ?? '', heureDebut: s.heureDebut ?? '',
        dureeMinutes: s.dureeMinutes ?? this.dureeTheorique,
        terrain: s.terrain ?? '', conditionsMeteo: s.conditionsMeteo ?? '',
        temperature: s.temperature ?? null, description: s.description ?? '',
        adversaire: s.adversaire ?? '', competition: s.competition ?? '',
        domicileExterieur: s.domicileExterieur ?? '',
      });
    }

    this.sub = this.form.get('dureeMinutes')!.valueChanges.subscribe(val => {
      this.calculerAlerte(val);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private calculerAlerte(duree: number | null): void {
    if (!this.dureeTheorique || !duree || duree <= 0) {
      this.alerteEcart = null;
      return;
    }
    const ratio = (duree - this.dureeTheorique) / this.dureeTheorique;
    if (ratio < -SEUIL_ECART) this.alerteEcart = 'court';
    else if (ratio > SEUIL_ECART) this.alerteEcart = 'long';
    else this.alerteEcart = null;

    if (!this.alerteEcart) {
      this.form.get('raisonEcartDuree')!.setValue('', { emitEvent: false });
    }
  }

  appliquerSuggestion(texte: string): void {
    this.form.get('raisonEcartDuree')!.setValue(texte);
  }

  annuler(): void {
    this.dialogRef.close(null);
  }

  valider(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const seance: SeanceCreate = {
      date: this.dialogData.date,
      typeSeance: { id: this.dialogData.typeSeance.id },
      dureeMinutes: v.dureeMinutes,
      titre: v.titre || undefined,
      heureDebut: v.heureDebut || undefined,
      terrain: v.terrain || undefined,
      conditionsMeteo: v.conditionsMeteo
        ? v.conditionsMeteo.toLowerCase()
        : undefined,
      temperature: v.temperature != null ? Number(v.temperature) : undefined,
      description: v.description || undefined,
      raisonEcartDuree: v.raisonEcartDuree || undefined,
      ...(this.estMatch && {
        adversaire: v.adversaire,
        competition: v.competition || undefined,
        domicileExterieur: v.domicileExterieur,
      })
    };
    this.dialogRef.close(seance);
  }
}
