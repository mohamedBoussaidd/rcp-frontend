import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TypeSeance, SeanceCreate, SeanceService, LigneExerciceRequest } from '@core/services/seance.service';
import { TechniqueService, Exercice } from '@core/services/technique.service';

export interface DialogData {
  typeSeances: TypeSeance[];   // catalogue des types (select du formulaire)
  date: string;                // date par défaut (jour cliqué ou aujourd'hui)
  seance?: any;                // seance existante => mode edition (preremplissage)
}

/** Payload renvoyé : la séance + sa liste d'exercices (préparation). */
export type SeanceFormResult = SeanceCreate & { exercices: LigneExerciceRequest[] };

const SUGGESTIONS_COURT = ['Météo', 'Blessure', 'Fatigue collective', 'Décision staff'];
const SUGGESTIONS_LONG = ['Prolongations', 'Exercice supplémentaire', 'Décision staff'];
const SEUIL_ECART = 0.20;

@Component({
  selector: 'app-seance-form-dialog',
  standalone: true,
  templateUrl: './seance-form-dialog.component.html',
  styleUrl: './seance-form-dialog.component.scss',
  imports: [CommonModule, ReactiveFormsModule, MatTabsModule]
})
export class SeanceFormDialogComponent implements OnInit, OnDestroy {

  form!: FormGroup;
  readonly suggestionsEcourt = SUGGESTIONS_COURT;
  readonly suggestionsLong = SUGGESTIONS_LONG;

  alerteEcart: 'court' | 'long' | null = null;
  get editMode(): boolean { return !!this.dialogData.seance; }

  // ── Préparation : bibliothèque d'exercices + sélection ordonnée ──
  exercices: Exercice[] = [];
  selection: Exercice[] = [];
  /** Affiche la liste de la bibliothèque pour ajouter des exercices. */
  exoListeOuverte = false;

  private subs: Subscription[] = [];

  private fb = inject(FormBuilder);
  dialogRef = inject<MatDialogRef<SeanceFormDialogComponent>>(MatDialogRef);
  private seanceService = inject(SeanceService);
  private techniqueService = inject(TechniqueService);
  dialogData = inject<DialogData>(MAT_DIALOG_DATA);

  get typeSeances(): TypeSeance[] { return this.dialogData.typeSeances; }

  /** Type sélectionné dans le formulaire. */
  get selectedType(): TypeSeance | undefined {
    const id = this.form?.get('typeSeanceId')?.value;
    return this.typeSeances.find(t => t.id === id);
  }
  get estMatch(): boolean {
    const c = this.selectedType?.code;
    return c === 'MATCH' || c === 'MATCH_AMICAL';
  }
  get dureeTheorique(): number | null { return this.selectedType?.dureeTheoriqueMin ?? null; }

  /** Distance d'équipe suggérée = Σ des distances attendues des exercices physiques/mixtes. */
  get suggestionDistanceM(): number {
    return this.selection
      .filter(e => e.type === 'PHYSIQUE' || e.type === 'MIXTE')
      .reduce((s, e) => s + (e.distanceAttendueM ?? 0), 0);
  }
  get suggestionDistanceHiM(): number {
    return this.selection
      .filter(e => e.type === 'PHYSIQUE' || e.type === 'MIXTE')
      .reduce((s, e) => s + (e.distanceHauteIntensiteM ?? 0), 0);
  }
  get dureeSelection(): number {
    return this.selection.reduce((s, e) => s + (e.dureeMinutes ?? 0), 0);
  }

  estSelectionne(e: Exercice): boolean { return this.selection.some(x => x.id === e.id); }

  toggleSelection(e: Exercice): void {
    this.selection = this.estSelectionne(e)
      ? this.selection.filter(x => x.id !== e.id)
      : [...this.selection, e];
    this.recalculerDuree();
  }

  /** Durée de la séance = somme des durées des exercices (auto, modifiable ensuite). */
  recalculerDuree(): void {
    const total = this.dureeSelection;
    if (total > 0) {
      this.form.get('dureeMinutes')!.setValue(total);
    }
  }

  /** Pré-remplit les cibles d'équipe depuis le type sélectionné (modifiables ensuite). */
  private prefillCiblesDepuisType(): void {
    const t = this.selectedType;
    if (!t) return;
    this.form.patchValue({
      objectifDistanceM: t.objectifDistanceM ?? null,
      objectifDistanceHauteIntensiteM: t.objectifDistanceHauteIntensiteM ?? null,
      objectifIntensite: t.objectifIntensite ?? null,
    });
  }

  /** Applique les cibles du type sur les champs objectif (bouton manuel). */
  appliquerCiblesType(): void { this.prefillCiblesDepuisType(); }

  ngOnInit(): void {
    const s = this.dialogData.seance;
    const typeInitId = s?.typeSeance?.id
      ?? this.typeSeances[0]?.id
      ?? '';

    this.form = this.fb.group({
      typeSeanceId: [typeInitId, Validators.required],
      date: [this.dialogData.date, Validators.required],
      titre: [''],
      responsable: [''],
      heureDebut: [''],
      dureeMinutes: [null, [Validators.required, Validators.min(1)]],
      terrain: [''],
      conditionsMeteo: [''],
      temperature: [null],
      description: [''],
      raisonEcartDuree: [''],
      adversaire: [''],
      competition: [''],
      domicileExterieur: [''],
      // Objectif d'équipe (préparation)
      objectif: [''],
      objectifDistanceM: [null],
      objectifIntensite: [null],
      objectifDistanceHauteIntensiteM: [null],
    });

    if (s) {
      this.form.patchValue({
        titre: s.titre ?? '', responsable: s.responsable ?? '', heureDebut: s.heureDebut ?? '',
        dureeMinutes: s.dureeMinutes ?? this.dureeTheorique,
        terrain: s.terrain ?? '', conditionsMeteo: s.conditionsMeteo ?? '',
        temperature: s.temperature ?? null, description: s.description ?? '',
        adversaire: s.adversaire ?? '', competition: s.competition ?? '',
        domicileExterieur: s.domicileExterieur ?? '',
        objectif: s.objectif ?? '', objectifDistanceM: s.objectifDistanceM ?? null,
        objectifIntensite: s.objectifIntensite ?? null,
        objectifDistanceHauteIntensiteM: s.objectifDistanceHauteIntensiteM ?? null,
      });
    } else {
      this.form.get('dureeMinutes')!.setValue(this.dureeTheorique, { emitEvent: false });
      this.prefillCiblesDepuisType();   // cibles du type par défaut (création)
    }
    this.appliquerValidationMatch();

    // Bibliothèque d'exercices (sélection de la séance). En édition, on précharge le contenu.
    this.techniqueService.listerExercices().subscribe({
      next: ex => {
        this.exercices = ex;
        if (s) this.prechargerContenu();
      },
      error: () => {},
    });

    this.subs.push(this.form.get('dureeMinutes')!.valueChanges.subscribe(val => this.calculerAlerte(val)));
    // Changement de type : pré-remplit cibles, ajuste durée (si pas d'exercices), validation match, alerte.
    this.subs.push(this.form.get('typeSeanceId')!.valueChanges.subscribe(() => {
      this.prefillCiblesDepuisType();
      if (!this.editMode && this.dureeSelection === 0 && this.dureeTheorique) {
        this.form.get('dureeMinutes')!.setValue(this.dureeTheorique);
      }
      this.appliquerValidationMatch();
      this.calculerAlerte(this.form.get('dureeMinutes')!.value);
    }));
  }

  /** (Dés)active les validations adversaire/domicile selon le type sélectionné. */
  private appliquerValidationMatch(): void {
    const adv = this.form.get('adversaire')!;
    const dom = this.form.get('domicileExterieur')!;
    if (this.estMatch) {
      adv.setValidators(Validators.required);
      dom.setValidators(Validators.required);
    } else {
      adv.clearValidators();
      dom.clearValidators();
    }
    adv.updateValueAndValidity({ emitEvent: false });
    dom.updateValueAndValidity({ emitEvent: false });
  }

  /** Recharge les exercices déjà attachés à la séance (mode édition) pour préremplir la sélection. */
  private prechargerContenu(): void {
    this.seanceService.getContenu(this.dialogData.seance.id).subscribe({
      next: contenu => {
        this.selection = contenu.exercices
          .map(l => this.exercices.find(e => e.id === l.exerciceId))
          .filter((e): e is Exercice => !!e);
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  toggleExoListe(): void { this.exoListeOuverte = !this.exoListeOuverte; }

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
    const result: SeanceFormResult = {
      date: v.date,
      typeSeance: { id: v.typeSeanceId },
      dureeMinutes: v.dureeMinutes,
      titre: v.titre || undefined,
      responsable: v.responsable || undefined,
      heureDebut: v.heureDebut || undefined,
      terrain: v.terrain || undefined,
      conditionsMeteo: v.conditionsMeteo
        ? v.conditionsMeteo.toLowerCase()
        : undefined,
      temperature: v.temperature != null ? Number(v.temperature) : undefined,
      description: v.description || undefined,
      raisonEcartDuree: v.raisonEcartDuree || undefined,
      objectif: v.objectif || undefined,
      objectifDistanceM: v.objectifDistanceM != null ? Number(v.objectifDistanceM) : undefined,
      objectifIntensite: v.objectifIntensite != null ? Number(v.objectifIntensite) : undefined,
      objectifDistanceHauteIntensiteM: v.objectifDistanceHauteIntensiteM != null ? Number(v.objectifDistanceHauteIntensiteM) : undefined,
      ...(this.estMatch && {
        adversaire: v.adversaire,
        competition: v.competition || undefined,
        domicileExterieur: v.domicileExterieur,
      }),
      exercices: this.selection.map(e => ({ exerciceId: e.id })),
    };
    this.dialogRef.close(result);
  }
}
