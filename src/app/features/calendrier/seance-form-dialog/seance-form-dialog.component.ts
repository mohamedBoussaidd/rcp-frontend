import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  BlocRequest, GroupeRequest, GroupesAuto, JoueurRefSeance, Perimatch, RefDominante,
  RefSousPrincipe, SeanceCreate, SeanceService, StaffRef, TypeSeance, LigneExerciceRequest,
} from '@core/services/seance.service';
import { TechniqueService, Exercice } from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { PreferencesService } from '@core/services/preferences.service';
import { ImportPhotoResultat } from '@core/services/import-photo.service';
import { ImportPhotoDialogComponent } from '../../tactical/import-photo-dialog/import-photo-dialog.component';
import { InfoBulleComponent, INFOBULLES } from '@shared/components/info-bulle/info-bulle.component';
import { MatDialog } from '@angular/material/dialog';

export interface DialogData {
  typeSeances: TypeSeance[];   // catalogue des types (select du formulaire)
  date: string;                // date par défaut (jour cliqué ou aujourd'hui)
  seance?: any;                // seance existante => mode edition (preremplissage)
}

/** Bloc en cours d'édition (mode avancé) : les exercices y sont rattachés par index. */
export interface BlocForm {
  libelle: string;
  sequencage: string;
  dureeMinutes: number | null;
  zoneTerrain: string;
  staffIds: string[];
}

/** Groupe du jour en cours d'édition. `blocIndex` null = toute la séance. */
export interface GroupeForm {
  type: 'COULEUR' | 'LIBRE';
  libelle: string;
  couleur: string;
  blocIndex: number | null;
  joueurIds: string[];
}

/** Payload renvoyé : la séance + sa liste d'exercices (préparation) + le contenu avancé. */
export type SeanceFormResult = SeanceCreate & {
  exercices: LigneExerciceRequest[];
  avance?: {
    blocs: BlocRequest[];
    groupes: GroupeRequest[];
    dominanteIds: string[];
    sousPrincipeIds: string[];
  } | null;
};

const SUGGESTIONS_COURT = ['Météo', 'Blessure', 'Fatigue collective', 'Décision staff'];
const SUGGESTIONS_LONG = ['Prolongations', 'Exercice supplémentaire', 'Décision staff'];
const SEUIL_ECART = 0.20;

/** Couleurs proposées pour les équipes du jour. */
const COULEURS_GROUPE = ['bleu', 'rouge', 'jaune', 'vert', 'orange', 'violet'];

/** Libellés des phases du projet de jeu (PhaseKey moteur + CPA propres à la séance). */
const PHASES_PROJET: { code: string; libelle: string }[] = [
  { code: 'OFF',     libelle: 'Animation offensive — « on a le ballon »' },
  { code: 'T_DO',    libelle: 'Transition défensive — « on a perdu le ballon »' },
  { code: 'DEF',     libelle: 'Animation défensive — « on n\'a pas le ballon »' },
  { code: 'T_OD',    libelle: 'Transition offensive — « on a récupéré le ballon »' },
  { code: 'CPA_OFF', libelle: 'Coups de pied arrêtés offensifs' },
  { code: 'CPA_DEF', libelle: 'Coups de pied arrêtés défensifs' },
];

@Component({
  selector: 'app-seance-form-dialog',
  standalone: true,
  templateUrl: './seance-form-dialog.component.html',
  styleUrl: './seance-form-dialog.component.scss',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatTabsModule, InfoBulleComponent]
})
export class SeanceFormDialogComponent implements OnInit, OnDestroy {

  form!: FormGroup;
  readonly suggestionsEcourt = SUGGESTIONS_COURT;
  readonly suggestionsLong = SUGGESTIONS_LONG;
  readonly couleursGroupe = COULEURS_GROUPE;
  readonly phasesProjet = PHASES_PROJET;
  readonly aide = INFOBULLES;

  alerteEcart: 'court' | 'long' | null = null;
  get editMode(): boolean { return !!this.dialogData.seance; }

  // ── Préparation : bibliothèque d'exercices + sélection ordonnée ──
  exercices: Exercice[] = [];
  selection: Exercice[] = [];
  /** Affiche la liste de la bibliothèque pour ajouter des exercices. */
  exoListeOuverte = false;

  // ── Mode avancé ──
  /** Rattachement bloc de chaque exercice sélectionné (index aligné sur `selection`). */
  blocParExo: (number | null)[] = [];
  blocs: BlocForm[] = [];
  groupes: GroupeForm[] = [];
  groupeActif = signal<number | null>(null);
  /** Portée affichée dans l'onglet Effectifs : null = toute la séance, sinon index de bloc. */
  porteeActive = signal<number | null>(null);

  staffClub: StaffRef[] = [];
  groupesAuto: GroupesAuto | null = null;
  refDominantes: RefDominante[] = [];
  refSousPrincipes: RefSousPrincipe[] = [];
  dominanteIds = new Set<string>();
  sousPrincipeIds = new Set<string>();
  perimatch: Perimatch | null = null;

  private subs: Subscription[] = [];

  private fb = inject(FormBuilder);
  dialogRef = inject<MatDialogRef<SeanceFormDialogComponent>>(MatDialogRef);
  private seanceService = inject(SeanceService);
  private techniqueService = inject(TechniqueService);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);
  private prefs = inject(PreferencesService);
  private matDialog = inject(MatDialog);
  dialogData = inject<DialogData>(MAT_DIALOG_DATA);

  /** Peut importer depuis une photo (module import_photo_ia + rôle). */
  peutImportPhoto(): boolean { return this.auth.has('import_photo:use'); }

  /** Pré-remplit la séance depuis une photo analysée par l'IA (texte + blocs + référentiels). */
  importerDepuisPhoto(): void {
    const ref = this.matDialog.open(ImportPhotoDialogComponent, {
      width: '720px', maxWidth: '96vw', panelClass: 'app-dialog',
    });
    ref.afterClosed().subscribe((r: ImportPhotoResultat | null) => {
      if (!r) return;
      const t = r.texte;
      this.form.patchValue({
        titre: t.titre ?? this.form.get('titre')?.value,
        description: [t.description, t.materiel ? `Matériel : ${t.materiel}` : null]
          .filter(x => !!x).join('\n') || this.form.get('description')?.value,
        objectif: t.objectif ?? this.form.get('objectif')?.value,
        ...(t.dureeMinutes ? { dureeMinutes: t.dureeMinutes } : {}),
      });
      if (this.modeAvance()) {
        if (t.blocs.length) {
          this.blocs = t.blocs.map(b => ({
            libelle: b.libelle,
            sequencage: b.sequencage ?? '',
            dureeMinutes: b.dureeMinutes ?? null,
            zoneTerrain: '',
            staffIds: [],
          }));
          // Consignes de blocs : reportées dans les notes de la séance (pas de champ dédié).
          const consignes = t.blocs.filter(b => b.consignes)
            .map(b => `${b.libelle} : ${b.consignes}`).join('\n');
          if (consignes) {
            const desc = this.form.get('description')?.value || '';
            this.form.get('description')?.setValue(desc ? `${desc}\n${consignes}` : consignes);
          }
        }
        // Codes détectés → ids des référentiels (déjà chargés pour l'onglet Objectifs).
        this.dominanteIds = new Set(this.refDominantes
          .filter(d => t.dominantes.includes(d.code)).map(d => d.id));
        this.sousPrincipeIds = new Set(this.refSousPrincipes
          .filter(p => t.sousPrincipes.includes(p.code)).map(p => p.id));
      }
    });
  }

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

  /** Le mode avancé est-il disponible (module seance_avancee actif + rôle) ? */
  peutAvance(): boolean { return this.auth.has('seance_avancee:access'); }
  /** Mode avancé effectif : disponible ET activé par l'entraîneur (préférence serveur). */
  modeAvance(): boolean { return this.peutAvance() && this.prefs.modeAvanceSeance(); }
  basculerModeAvance(): void { this.prefs.basculerModeAvanceSeance(!this.prefs.modeAvanceSeance()); }

  /** Équipe de référence : celle de la séance (édition), sinon contexte actif, sinon la mienne. */
  private equipeReference(): string | null {
    const s = this.dialogData.seance;
    if (s?.equipeId) return s.equipeId;
    const actives = this.contexte.equipesActives();
    if (actives.length === 1) return actives[0];
    return this.auth.currentUser()?.equipeId ?? null;
  }

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
    const idx = this.selection.findIndex(x => x.id === e.id);
    if (idx >= 0) {
      this.selection = this.selection.filter((_, i) => i !== idx);
      this.blocParExo = this.blocParExo.filter((_, i) => i !== idx);
    } else {
      this.selection = [...this.selection, e];
      this.blocParExo = [...this.blocParExo, null];
    }
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
      // Mode avancé
      dureeEffectiveMinutes: [null],
      objTactiqueOrg: [''],
      objTactiqueFonc: [''],
      objMental: [''],
      objTechnique: [''],
      objAthletique: [''],
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
        dureeEffectiveMinutes: s.dureeEffectiveMinutes ?? null,
        objTactiqueOrg: s.objTactiqueOrg ?? '', objTactiqueFonc: s.objTactiqueFonc ?? '',
        objMental: s.objMental ?? '', objTechnique: s.objTechnique ?? '', objAthletique: s.objAthletique ?? '',
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

    // Mode avancé : préférence + référentiels + staff + groupes auto + badge J±X.
    this.prefs.charger();
    if (this.peutAvance()) {
      this.seanceService.getReferentielsSeanceAvancee().subscribe({
        next: r => { this.refDominantes = r.dominantes; this.refSousPrincipes = r.sousPrincipes; },
        error: () => {},
      });
      this.seanceService.getStaffClub().subscribe({ next: st => this.staffClub = st, error: () => {} });
      const equipe = this.equipeReference();
      if (equipe) {
        this.seanceService.getGroupesAuto(equipe).subscribe({ next: g => this.groupesAuto = g, error: () => {} });
      }
    }
    this.chargerPerimatch();
    this.subs.push(this.form.get('date')!.valueChanges.subscribe(() => this.chargerPerimatch()));

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

  /** Badge J±X (auto) : match le plus proche de la date pour l'équipe de référence. */
  private chargerPerimatch(): void {
    const equipe = this.equipeReference();
    const date = this.form.get('date')?.value;
    if (!equipe || !date) { this.perimatch = null; return; }
    this.seanceService.getPerimatch(equipe, date).subscribe({
      next: p => this.perimatch = p.jRelatif != null ? p : null,
      error: () => this.perimatch = null,
    });
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

  /** Recharge le contenu complet (exercices, blocs, groupes, référentiels) en mode édition. */
  private prechargerContenu(): void {
    this.seanceService.getContenu(this.dialogData.seance.id).subscribe({
      next: contenu => {
        const blocIndexParId = new Map<string, number>();
        this.blocs = (contenu.blocs ?? []).map((b, i) => {
          blocIndexParId.set(b.id, i);
          return {
            libelle: b.libelle, sequencage: b.sequencage ?? '', dureeMinutes: b.dureeMinutes ?? null,
            zoneTerrain: b.zoneTerrain ?? '', staffIds: b.staff.map(st => st.id),
          };
        });
        this.selection = [];
        this.blocParExo = [];
        for (const l of contenu.exercices) {
          const e = this.exercices.find(x => x.id === l.exerciceId);
          if (!e) continue;
          this.selection.push(e);
          this.blocParExo.push(l.blocId != null ? (blocIndexParId.get(l.blocId) ?? null) : null);
        }
        this.groupes = (contenu.groupes ?? []).map(g => ({
          type: g.type, libelle: g.libelle, couleur: g.couleur ?? 'bleu',
          blocIndex: g.blocId != null ? (blocIndexParId.get(g.blocId) ?? null) : null,
          joueurIds: g.joueurs.map(j => j.id),
        }));
        this.dominanteIds = new Set(contenu.dominanteIds ?? []);
        this.sousPrincipeIds = new Set(contenu.sousPrincipeIds ?? []);
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  toggleExoListe(): void { this.exoListeOuverte = !this.exoListeOuverte; }

  // ══════════ Onglet Objectifs & Projet de jeu ══════════

  dominantes(famille: 'SEANCE' | 'ATHLETIQUE'): RefDominante[] {
    return this.refDominantes.filter(d => d.famille === famille);
  }
  toggleDominante(id: string): void {
    this.dominanteIds.has(id) ? this.dominanteIds.delete(id) : this.dominanteIds.add(id);
  }
  sousPrincipes(phase: string): RefSousPrincipe[] {
    return this.refSousPrincipes.filter(p => p.phase === phase);
  }
  toggleSousPrincipe(id: string): void {
    this.sousPrincipeIds.has(id) ? this.sousPrincipeIds.delete(id) : this.sousPrincipeIds.add(id);
  }

  // ══════════ Onglet Déroulé (blocs) ══════════

  ajouterBloc(): void {
    this.blocs = [...this.blocs, {
      libelle: `Bloc ${this.blocs.length + 1}`, sequencage: '', dureeMinutes: null, zoneTerrain: '', staffIds: [],
    }];
  }

  supprimerBloc(index: number): void {
    this.blocs = this.blocs.filter((_, i) => i !== index);
    // Réindexe les rattachements : exercices et groupes du bloc supprimé redeviennent globaux.
    this.blocParExo = this.blocParExo.map(b => b == null ? null : (b === index ? null : (b > index ? b - 1 : b)));
    this.groupes = this.groupes.map(g => ({
      ...g,
      blocIndex: g.blocIndex == null ? null : (g.blocIndex === index ? null : (g.blocIndex > index ? g.blocIndex - 1 : g.blocIndex)),
    }));
    if (this.porteeActive() === index) this.porteeActive.set(null);
  }

  deplacerBloc(index: number, delta: -1 | 1): void {
    const cible = index + delta;
    if (cible < 0 || cible >= this.blocs.length) return;
    const blocs = [...this.blocs];
    [blocs[index], blocs[cible]] = [blocs[cible], blocs[index]];
    this.blocs = blocs;
    const remap = (b: number | null) => b === index ? cible : (b === cible ? index : b);
    this.blocParExo = this.blocParExo.map(remap);
    this.groupes = this.groupes.map(g => ({ ...g, blocIndex: remap(g.blocIndex) }));
  }

  toggleStaffBloc(bloc: BlocForm, staffId: string): void {
    const i = bloc.staffIds.indexOf(staffId);
    i >= 0 ? bloc.staffIds.splice(i, 1) : bloc.staffIds.push(staffId);
  }

  nomsStaff(bloc: BlocForm): string {
    return bloc.staffIds
      .map(id => {
        const s = this.staffClub.find(x => x.id === id);
        return s ? this.libelleStaff(s) : null;
      })
      .filter(n => !!n).join(', ');
  }

  /** « Nom · Rôle · Équipe » — indispensable : le même intervenant a un compte par équipe. */
  libelleStaff(s: StaffRef): string {
    return [s.nom, s.role, s.equipe].filter(v => !!v).join(' · ');
  }

  /** Complément affiché sous le nom dans la puce (« Entraîneur · U19 »). */
  metaStaff(s: StaffRef): string {
    return [s.role, s.equipe].filter(v => !!v).join(' · ');
  }

  exercicesDuBloc(index: number | null): { exo: Exercice; selIndex: number }[] {
    return this.selection
      .map((exo, selIndex) => ({ exo, selIndex }))
      .filter(x => this.blocParExo[x.selIndex] === index);
  }

  // ══════════ Onglet Effectifs (groupes du jour) ══════════

  ajouterGroupe(type: 'COULEUR' | 'LIBRE'): void {
    const couleursPrises = this.groupes.filter(g => g.blocIndex === this.porteeActive()).map(g => g.couleur);
    const couleur = COULEURS_GROUPE.find(c => !couleursPrises.includes(c)) ?? 'bleu';
    const libelle = type === 'COULEUR'
      ? `Équipe ${couleur}`
      : `Groupe ${this.groupes.length + 1}`;
    this.groupes = [...this.groupes, {
      type, libelle, couleur, blocIndex: this.porteeActive(), joueurIds: [],
    }];
    this.groupeActif.set(this.groupes.length - 1);
  }

  supprimerGroupe(index: number): void {
    this.groupes = this.groupes.filter((_, i) => i !== index);
    if (this.groupeActif() === index) this.groupeActif.set(null);
    else if ((this.groupeActif() ?? -1) > index) this.groupeActif.set(this.groupeActif()! - 1);
  }

  /** Groupes visibles pour la portée affichée (toute la séance ou un bloc précis). */
  groupesPortee(): { g: GroupeForm; index: number }[] {
    return this.groupes
      .map((g, index) => ({ g, index }))
      .filter(x => x.g.blocIndex === this.porteeActive());
  }

  /** Clic sur un joueur : bascule son appartenance au groupe actif (un seul groupe par portée). */
  affecterJoueur(joueurId: string): void {
    const actif = this.groupeActif();
    if (actif == null || !this.groupes[actif]) return;
    const groupe = this.groupes[actif];
    const dansGroupe = groupe.joueurIds.includes(joueurId);
    // Retire le joueur de tous les groupes de la même portée, puis l'ajoute si nouveau.
    for (const { g } of this.groupesPortee()) {
      g.joueurIds = g.joueurIds.filter(id => id !== joueurId);
    }
    if (!dansGroupe) groupe.joueurIds = [...groupe.joueurIds, joueurId];
  }

  /** Couleur du groupe du joueur dans la portée affichée (style du chip). */
  couleurJoueur(joueurId: string): string | null {
    for (const { g } of this.groupesPortee()) {
      if (g.joueurIds.includes(joueurId)) return g.couleur;
    }
    return null;
  }

  joueursDisponibles(): JoueurRefSeance[] {
    return this.groupesAuto?.disponibles ?? [];
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
    const avance = this.modeAvance();
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
      ...(this.peutAvance() && {
        dureeEffectiveMinutes: v.dureeEffectiveMinutes != null ? Number(v.dureeEffectiveMinutes) : undefined,
        objTactiqueOrg: v.objTactiqueOrg || undefined,
        objTactiqueFonc: v.objTactiqueFonc || undefined,
        objMental: v.objMental || undefined,
        objTechnique: v.objTechnique || undefined,
        objAthletique: v.objAthletique || undefined,
      }),
      exercices: this.selection.map((e, i) => ({
        exerciceId: e.id,
        blocIndex: avance ? this.blocParExo[i] : null,
      })),
      avance: avance ? {
        blocs: this.blocs.map(b => ({
          libelle: b.libelle, sequencage: b.sequencage || null, dureeMinutes: b.dureeMinutes,
          zoneTerrain: b.zoneTerrain || null, staffIds: b.staffIds,
        })),
        groupes: this.groupes
          .filter(g => g.joueurIds.length > 0)
          .map(g => ({
            blocIndex: g.blocIndex, type: g.type, libelle: g.libelle,
            couleur: g.couleur || null, joueurIds: g.joueurIds,
          })),
        dominanteIds: [...this.dominanteIds],
        sousPrincipeIds: [...this.sousPrincipeIds],
      } : null,
    };
    this.dialogRef.close(result);
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
}
