import { Component, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Axe, CategorieAxe, Entretien, EntretienRequest, EntretienService, StatutEntretien, TypeEntretien,
} from '@core/services/entretien.service';

export interface EntretienDialogData {
  joueurId: string;
  joueurNom: string;
  axesExistants: Axe[];
  entretien?: Entretien;
  /** Pré-sélection du mode en création ('PLANIFIE' = action « Planifier » de la vue équipe). */
  modeInitial?: StatutEntretien;
  /** Édition d'un RDV PLANIFIE avec bascule directe en compte-rendu (« Réaliser »). */
  realiser?: boolean;
}

/**
 * Saisie rapide d'un entretien (création / édition), en deux modes :
 * — Compte-rendu (REALISE, défaut) : type + date + notes + axes (note 1–5, tendance, commentaire)
 *   + case « Partager avec le joueur » décochée par défaut.
 * — Planifier (PLANIFIE) : rendez-vous à venir — date (+ heure facultative) + notes de préparation ;
 *   pas d'axes ni de partage (le contenu se saisit et se partage à la réalisation). Le joueur est
 *   notifié du créneau. Rouvrir le RDV en mode compte-rendu le fait passer REALISE.
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
  /** Mode courant du formulaire : REALISE = compte-rendu, PLANIFIE = rendez-vous. */
  mode: StatutEntretien = 'REALISE';

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
    // Mode : édition → statut de l'entretien (ou compte-rendu si « Réaliser ») ; création → modeInitial.
    this.mode = e
      ? (this.data.realiser ? 'REALISE' : (e.statut ?? 'REALISE'))
      : (this.data.modeInitial ?? 'REALISE');
    this.form = this.fb.group({
      type: [e?.type ?? 'TERRAIN', Validators.required],
      dateEntretien: [e?.dateEntretien ?? new Date().toISOString().slice(0, 10), Validators.required],
      heure: [e?.heure ? e.heure.slice(0, 5) : ''],
      notes: [e?.notes ?? ''],
      videoUrl: [e?.videoUrl ?? ''],
      partager: [e?.partage ?? false],
      axes: this.fb.array([]),
    });
    // « Réaliser » un RDV daté dans le futur : ramène la date à aujourd'hui (garde backend date ≤ today).
    if (this.data.realiser && e && e.dateEntretien > this.today) {
      this.form.get('dateEntretien')!.setValue(this.today);
    }
    if (e) {
      for (const l of e.axes) {
        this.axes.push(this.ligneGroup({
          axeTravailId: l.axeTravailId, note: l.note ?? null,
          tendance: l.tendance ?? null, commentaire: l.commentaire ?? '',
        }));
      }
    }
  }

  private get today(): string { return new Date().toISOString().slice(0, 10); }

  /** Peut-on encore choisir le mode ? Oui en création ou sur un RDV ; un compte-rendu ne redevient pas RDV. */
  get modeChoisissable(): boolean {
    return !this.editMode || this.data.entretien?.statut === 'PLANIFIE';
  }

  get planif(): boolean { return this.mode === 'PLANIFIE'; }

  choisirMode(m: StatutEntretien): void {
    if (this.mode === m || !this.modeChoisissable) return;
    this.mode = m;
    // Bascule vers compte-rendu d'un RDV futur : ramène la date à aujourd'hui.
    if (m === 'REALISE' && this.form.value.dateEntretien > this.today) {
      this.form.get('dateEntretien')!.setValue(this.today);
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

    // En mode rendez-vous, pas d'axes ni de partage : le contenu se saisit à la réalisation.
    const lignes = this.planif ? []
      : this.axes.controls.map(c => c.value).filter(l => l.axeTravailId || (l.nouvelAxeLibelle || '').trim());
    const req: EntretienRequest = {
      joueurId: this.data.joueurId,
      type: this.form.value.type,
      dateEntretien: this.form.value.dateEntretien,
      statut: this.mode,
      heure: (this.form.value.heure || '').trim() || null,
      notes: (this.form.value.notes || '').trim() || null,
      videoUrl: (this.form.value.videoUrl || '').trim() || null,
      partager: !this.planif && !!this.form.value.partager,
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
        this.snack.open(
          this.planif
            ? (this.editMode ? 'Rendez-vous mis à jour — le joueur sera prévenu si déplacé' : 'Rendez-vous planifié — le joueur est prévenu')
            : (this.editMode ? 'Entretien mis à jour' : 'Entretien enregistré'),
          'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: e => {
        this.saving = false;
        const msg = e?.status === 409
          ? (this.planif
              ? 'Impossible : un rendez-vous se planifie aujourd\'hui ou plus tard.'
              : 'Impossible : un compte-rendu ne peut pas être daté dans le futur.')
          : 'Échec de l\'enregistrement';
        this.snack.open(msg, 'Fermer', { duration: 4000 });
      },
    });
  }

  annuler(): void { this.ref.close(false); }
}
