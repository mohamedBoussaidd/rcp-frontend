import { Component, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Axe, CategorieAxe, Entretien, EntretienRequest, EntretienService, TypeEntretien,
} from '@core/services/entretien.service';

export interface EntretienDialogData {
  joueurId: string;
  joueurNom: string;
  axesExistants: Axe[];
  entretien?: Entretien;
}

/**
 * Saisie rapide d'un entretien (création / édition). Type + date + notes + lien vidéo, et une
 * section « axes » : chaque ligne cible un axe existant OU en crée un à la volée, avec note 1–5,
 * tendance (3 états) et commentaire. Case « Partager avec le joueur » décochée par défaut.
 */
@Component({
  selector: 'app-entretien-dialog',
  standalone: true,
  templateUrl: './entretien-dialog.component.html',
  styleUrl: './entretien-dialog.component.scss',
  imports: [ReactiveFormsModule],
})
export class EntretienDialogComponent {

  private fb = inject(FormBuilder);
  private service = inject(EntretienService);
  private snack = inject(MatSnackBar);
  private ref = inject(MatDialogRef<EntretienDialogComponent>);
  data = inject<EntretienDialogData>(MAT_DIALOG_DATA);

  saving = false;
  editMode = false;

  readonly TYPES: { value: TypeEntretien; label: string; emoji: string }[] = [
    { value: 'TERRAIN',    label: 'Terrain',    emoji: '🥅' },
    { value: 'VIDEO',      label: 'Vidéo',      emoji: '🎬' },
    { value: 'DISCUSSION', label: 'Discussion', emoji: '💬' },
  ];

  readonly CATEGORIES: { value: CategorieAxe; label: string }[] = [
    { value: 'TECHNIQUE', label: 'Technique' },
    { value: 'TACTIQUE',  label: 'Tactique' },
    { value: 'MENTAL',    label: 'Mental' },
    { value: 'PHYSIQUE',  label: 'Physique' },
  ];

  readonly TENDANCES = [
    { value: 'EN_PROGRES', label: 'En progrès' },
    { value: 'STAGNE',     label: 'Stagne' },
    { value: 'REGRESSE',   label: 'Régresse' },
  ];

  form: FormGroup;

  constructor() {
    const e = this.data.entretien;
    this.editMode = !!e;
    this.form = this.fb.group({
      type: [e?.type ?? 'TERRAIN', Validators.required],
      dateEntretien: [e?.dateEntretien ?? new Date().toISOString().slice(0, 10), Validators.required],
      notes: [e?.notes ?? ''],
      videoUrl: [e?.videoUrl ?? ''],
      partager: [e?.partage ?? false],
      axes: this.fb.array([]),
    });
    if (e) {
      for (const l of e.axes) {
        this.axes.push(this.ligneGroup({
          axeTravailId: l.axeTravailId, note: l.note ?? null,
          tendance: l.tendance ?? null, commentaire: l.commentaire ?? '',
        }));
      }
    }
  }

  get axes(): FormArray { return this.form.get('axes') as FormArray; }
  get lignesFG(): FormGroup[] { return this.axes.controls as FormGroup[]; }

  private ligneGroup(v?: { axeTravailId?: string | null; note?: number | null; tendance?: string | null; commentaire?: string }): FormGroup {
    return this.fb.group({
      axeTravailId: [v?.axeTravailId ?? ''],       // '' = nouvel axe
      nouvelAxeLibelle: [''],
      nouvelAxeCategorie: ['TECHNIQUE'],
      note: [v?.note ?? null],
      tendance: [v?.tendance ?? null],
      commentaire: [v?.commentaire ?? ''],
    });
  }

  ajouterLigne(): void { this.axes.push(this.ligneGroup()); }
  retirerLigne(i: number): void { this.axes.removeAt(i); }

  catLabel(c?: string | null): string {
    return this.CATEGORIES.find(x => x.value === c)?.label ?? '';
  }

  estNouvelAxe(i: number): boolean {
    return !this.axes.at(i).get('axeTravailId')!.value;
  }

  setNote(i: number, note: number): void {
    const ctrl = this.axes.at(i).get('note')!;
    ctrl.setValue(ctrl.value === note ? null : note);
  }

  setTendance(i: number, t: string): void {
    const ctrl = this.axes.at(i).get('tendance')!;
    ctrl.setValue(ctrl.value === t ? null : t);
  }

  enregistrer(): void {
    if (this.form.invalid || this.saving) { this.form.markAllAsTouched(); return; }
    this.saving = true;

    const lignes = this.axes.controls.map(c => c.value).filter(l => l.axeTravailId || (l.nouvelAxeLibelle || '').trim());
    const req: EntretienRequest = {
      joueurId: this.data.joueurId,
      type: this.form.value.type,
      dateEntretien: this.form.value.dateEntretien,
      notes: (this.form.value.notes || '').trim() || null,
      videoUrl: (this.form.value.videoUrl || '').trim() || null,
      partager: !!this.form.value.partager,
      axes: lignes.map(l => ({
        axeTravailId: l.axeTravailId || null,
        nouvelAxeLibelle: l.axeTravailId ? null : (l.nouvelAxeLibelle || '').trim() || null,
        nouvelAxeCategorie: l.axeTravailId ? null : l.nouvelAxeCategorie,
        note: l.note ?? null,
        tendance: l.tendance ?? null,
        commentaire: (l.commentaire || '').trim() || null,
      })),
    };

    const obs = this.editMode
      ? this.service.modifierEntretien(this.data.entretien!.id, req)
      : this.service.creerEntretien(req);

    obs.subscribe({
      next: () => {
        this.snack.open(this.editMode ? 'Entretien mis à jour' : 'Entretien enregistré', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: () => {
        this.saving = false;
        this.snack.open('Échec de l\'enregistrement', 'Fermer', { duration: 4000 });
      },
    });
  }

  annuler(): void { this.ref.close(false); }
}
