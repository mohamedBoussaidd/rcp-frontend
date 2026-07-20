import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  BlocRequest, GroupeRequest, GroupesAuto, JoueurRefSeance, Perimatch, RefDominante,
  RefSousPrincipe, RoleBloc, Seance, SeanceCreate, SeanceService, StaffRef, TypeBloc, TypeSeance,
  LigneExerciceRequest,
} from '@core/services/seance.service';
import { TerrainZonesComponent } from '@shared/components/terrain-zones/terrain-zones.component';
import {
  AXES_DOMINANTES, AxeDominante, DosageDominantes, JaugeDominantesComponent, dosagesVides,
} from '@shared/components/jauge-dominantes/jauge-dominantes.component';
import { TechniqueService, Exercice } from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
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
  type: TypeBloc | null;
  sequencage: string;
  dureeMinutes: number | null;
  /** Zones du terrain occupées (1..8). */
  zones: number[];
  staffIds: string[];
  /** Rôles par personne : `roles['<id staff>'] = ['MENEUR', 'ARBITRE']`. Cumul libre. */
  roles: Record<string, string[]>;
  /** Le coach a corrigé la durée à la main : on cesse de la recalculer sous ses doigts. */
  dureeManuelle?: boolean;
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

/** Les cinq étapes du rail, dans l'ordre de construction d'une séance. */
export type OngletSeance = 'seance' | 'charge' | 'objectifs' | 'deroule' | 'effectifs';

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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, InfoBulleComponent,
            TerrainZonesComponent, JaugeDominantesComponent]
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

  /**
   * Onglet actif du rail. Un rail plutôt que des onglets Material : il affiche en permanence
   * les cinq étapes ET leur état de remplissage, ce qu'une barre d'onglets ne peut pas faire.
   * Construire une séance n'est pas naviguer entre cinq écrans indépendants — c'est suivre une
   * progression, et elle doit se voir.
   */
  onglet = signal<OngletSeance>('seance');

  /** Dosage 0-5 des cinq axes pédagogiques (V68) — déduit des exercices, corrigeable. */
  dosages: DosageDominantes = dosagesVides();
  /** Axes que le coach a dosés lui-même : la déduction ne les écrase plus. */
  private axesTouches = new Set<AxeDominante>();

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
        // V65 : plus de champ `titre` — le titre lu sur la photo alimente l'objectif, qui est
        // désormais le seul endroit où l'on nomme l'intention de la séance.
        objectif: t.objectif ?? t.titre ?? this.form.get('objectif')?.value,
        description: [t.description, t.materiel ? `Matériel : ${t.materiel}` : null]
          .filter(x => !!x).join('\n') || this.form.get('description')?.value,
        ...(t.dureeMinutes ? { dureeMinutes: t.dureeMinutes } : {}),
      });
      if (this.peutAvance()) {
        if (t.blocs.length) {
          this.blocs = t.blocs.map(b => ({
            libelle: b.libelle,
            // L'IA lit une fiche papier : ni le type de bloc, ni les zones, ni les rôles n'y
            // figurent de façon fiable. Le coach les pose lui-même sur la carte.
            type: null,
            sequencage: b.sequencage ?? '',
            dureeMinutes: b.dureeMinutes ?? null,
            zones: [],
            staffIds: [],
            roles: {},
            dureeManuelle: b.dureeMinutes != null,
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

  /**
   * Le mode avancé est-il disponible (module seance_avancee actif + rôle) ?
   *
   * Il n'y a plus d'interrupteur à armer : les onglets avancés existent ou n'existent pas selon
   * le module. Demander en plus à l'utilisateur d'activer une préférence pour voir ce qu'il a
   * payé n'avait aucun sens — et laissait des séances à moitié remplies quand il l'oubliait.
   */
  peutAvance(): boolean { return this.auth.has('seance_avancee:access'); }

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
    this.rafraichirDureesBlocs();
    this.appliquerSuggestionsDominantes();
    this.appliquerDosagesDeduits();
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
      // V65 : plus de `titre` saisi — il doublonnait le libellé du type et l'objectif. Il reste
      // en base comme libellé DÉRIVÉ (posé par planifier(), MatchService, modèles de semaine).
      contexte: [''],
      contexteSeanceId: [''],
      responsableId: [''],
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
        contexte: s.contexte ?? '', contexteSeanceId: s.contexteSeanceId ?? '',
        responsableId: s.responsableId ?? '', heureDebut: s.heureDebut ?? '',
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
      // Dosages enregistrés : ce sont des arbitrages déjà rendus, la déduction ne doit plus
      // passer par-dessus — d'où le marquage de tous les axes comme « touchés ».
      this.dosages = {
        tactiqueOrg: s.dominanteTactiqueOrgIntensite ?? 0,
        tactiqueFonc: s.dominanteTactiqueFoncIntensite ?? 0,
        mental: s.dominanteMentalIntensite ?? 0,
        technique: s.dominanteTechniqueIntensite ?? 0,
        athletique: s.dominanteAthletiqueIntensite ?? 0,
      };
      if (this.axesDoses().length > 0) {
        (Object.keys(this.dosages) as AxeDominante[]).forEach(a => this.axesTouches.add(a));
      }
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

    // Le staff sert au responsable de séance (tous modes), pas seulement à l'affectation des blocs.
    this.seanceService.getStaffClub().subscribe({ next: st => this.staffClub = st, error: () => {} });
    this.chargerSeancesOrigine();

    // Mode avancé : référentiels + groupes auto + badge J±X.
    if (this.peutAvance()) {
      this.seanceService.getReferentielsSeanceAvancee().subscribe({
        next: r => {
          this.refDominantes = r.dominantes;
          this.refSousPrincipes = r.sousPrincipes;
          this.rolesBloc = r.rolesBloc ?? [];
          // En édition, les dominantes ont déjà été arbitrées : on ne repropose rien au chargement,
          // seulement quand le coach touche au contenu (sinon une puce retirée reviendrait seule).
          if (!this.editMode) this.appliquerSuggestionsDominantes();
        },
        error: () => {},
      });
      const equipe = this.equipeReference();
      if (equipe) {
        this.seanceService.getGroupesAuto(equipe).subscribe({ next: g => this.groupesAuto = g, error: () => {} });
      }
    }
    this.chargerPerimatch();
    this.subs.push(this.form.get('date')!.valueChanges.subscribe(() => this.chargerPerimatch()));

    this.subs.push(this.form.get('dureeMinutes')!.valueChanges.subscribe(val => this.calculerAlerte(val)));
    // La durée effective est l'autre terme de la comparaison : elle doit relancer l'alerte.
    this.subs.push(this.form.get('dureeEffectiveMinutes')!.valueChanges
      .subscribe(() => this.calculerAlerte(this.form.get('dureeMinutes')!.value)));
    // Les objectifs pédagogiques alimentent les dominantes déduites.
    for (const champ of ['objTactiqueOrg', 'objTactiqueFonc', 'objMental', 'objTechnique', 'objAthletique']) {
      this.subs.push(this.form.get(champ)!.valueChanges.subscribe(() => this.appliquerSuggestionsDominantes()));
    }
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

  /**
   * Séances proposées dans « Suite à » : celles de la même équipe, antérieures ou du jour,
   * matchs d'abord (c'est de là que vient un problème neuf fois sur dix), puis les plus récentes.
   * Limité à 30 : au-delà, un événement est trop ancien pour motiver la séance du jour.
   */
  seancesOrigine: Seance[] = [];

  private chargerSeancesOrigine(): void {
    const equipe = this.equipeReference();
    const date = this.form.get('date')?.value;
    this.seanceService.getAll().subscribe({
      next: liste => {
        this.seancesOrigine = liste
          .filter(x => x.id !== this.dialogData.seance?.id)
          .filter(x => !equipe || !x.equipeId || x.equipeId === equipe)
          .filter(x => !date || x.date <= date)
          .sort((a, b) => {
            const ma = this.estMatchSeance(a) ? 0 : 1;
            const mb = this.estMatchSeance(b) ? 0 : 1;
            return ma !== mb ? ma - mb : b.date.localeCompare(a.date);
          })
          .slice(0, 30);
      },
      error: () => { this.seancesOrigine = []; },
    });
  }

  private estMatchSeance(s: Seance): boolean {
    return !!s.adversaire || s.typeSeance?.code === 'MATCH' || s.typeSeance?.code === 'MATCH_AMICAL';
  }

  /** Libellé du sélecteur « Suite à » : « ⚽ Clermont — 18/07 (1-3) » ou « Séance — 15/07 ». */
  libelleOrigine(s: Seance): string {
    const jour = s.date ? s.date.split('-').reverse().slice(0, 2).join('/') : '';
    const quoi = this.estMatchSeance(s)
      ? `⚽ ${s.adversaire || 'Match'}`
      : (s.titre || s.typeSeance?.libelle || 'Séance');
    const score = s.scoreMatch ? ` (${s.scoreMatch})` : '';
    return `${quoi} — ${jour}${score}`;
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
          const roles: Record<string, string[]> = {};
          for (const st of b.staff) {
            if (st.roleBloc?.length) roles[st.id] = [...st.roleBloc];
          }
          return {
            libelle: b.libelle, type: b.type ?? null, sequencage: b.sequencage ?? '',
            dureeMinutes: b.dureeMinutes ?? null, zones: [...(b.zones ?? [])],
            staffIds: b.staff.map(st => st.id), roles,
            // Une durée déjà enregistrée a été validée par un humain : on ne la recalcule pas.
            dureeManuelle: b.dureeMinutes != null,
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

  // ══════════ Rail de navigation ══════════

  /** Étapes du rail : libellé, repère et pastille « cette étape porte quelque chose ». */
  etapes(): { cle: OngletSeance; num: string; libelle: string; repere: string; rempli: boolean }[] {
    const base = [
      { cle: 'seance' as const, num: '1', libelle: 'Séance', repere: 'contexte → objectif',
        rempli: !!this.form?.get('objectif')?.value },
      { cle: 'charge' as const, num: '2', libelle: 'Charge & conditions', repere: 'distance, météo',
        rempli: !!this.form?.get('objectifDistanceM')?.value || !!this.form?.get('conditionsMeteo')?.value },
    ];
    if (!this.peutAvance()) return base;
    return [
      ...base,
      { cle: 'objectifs' as const, num: '3', libelle: 'Objectifs & jeu', repere: 'dominantes, principes',
        rempli: this.axesDoses().length > 0 || this.sousPrincipeIds.size > 0 },
      { cle: 'deroule' as const, num: '4', libelle: 'Déroulé', repere: 'blocs, zones, staff',
        rempli: this.blocs.length > 0 },
      { cle: 'effectifs' as const, num: '5', libelle: 'Effectifs', repere: 'groupes, portée',
        rempli: this.groupes.length > 0 },
    ];
  }

  // ══════════ Aperçu live ══════════

  /** Ce que la séance dit d'elle-même, en une ligne, sous le titre. */
  get objectifTitre(): string {
    return this.form?.get('objectif')?.value || 'Séance sans objectif';
  }

  get dateLisible(): string {
    const d = this.form?.get('date')?.value;
    if (!d) return '—';
    const dt = new Date(`${d}T00:00:00`);
    return isNaN(dt.getTime())
      ? d
      : dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /**
   * La chaîne « contexte → objectif → déroulé » affichée en tête. Elle existait déjà dans les
   * données depuis V65 mais restait invisible, éclatée entre trois champs distants : le coach
   * ne voyait pas que sa séance répond à un problème. La rendre littérale, c'est tout l'objet.
   */
  chaine(): { tag: string; valeur: string; ton: 'info' | 'vert' | 'neutre' }[] {
    return [
      { tag: 'CONTEXTE', valeur: this.form?.get('contexte')?.value || '—', ton: 'info' },
      { tag: 'OBJECTIF', valeur: this.form?.get('objectif')?.value || '—', ton: 'vert' },
      { tag: 'DÉROULÉ', ton: 'neutre',
        valeur: `${this.blocs.length} bloc${this.blocs.length > 1 ? 's' : ''} · ${this.dureeSelection} min` },
    ];
  }

  /** Une phrase qui dit ce qui manque, plutôt qu'une liste de champs obligatoires. */
  conseil(): string {
    if (!this.form?.get('objectif')?.value) {
      return 'Donne un objectif clair : c’est le fil que liront ton staff et toi sur le terrain.';
    }
    if (this.peutAvance() && this.blocs.length === 0) {
      return 'Ajoute des blocs dans le Déroulé pour construire la séance minute par minute.';
    }
    if (this.zonesEnConflit().length > 0) {
      return 'Deux blocs partagent une zone — soit ils s’enchaînent, soit il faut décaler.';
    }
    return 'Séance solide. Le déroulé et les effectifs sont prêts pour la fiche terrain.';
  }

  // ══════════ Onglet Objectifs & Projet de jeu ══════════

  readonly axes = AXES_DOMINANTES;

  axesDoses(): AxeDominante[] {
    return (Object.keys(this.dosages) as AxeDominante[]).filter(k => this.dosages[k] > 0);
  }

  /**
   * Dosage déduit des exercices choisis : pour chaque axe, on retient le maximum rencontré.
   * La moyenne diluerait — un seul exercice très mental suffit à rendre la séance mentale,
   * il ne devient pas « un peu mental » parce qu'il est entouré de gammes techniques.
   */
  private dosagesDeduits(): DosageDominantes {
    const d = dosagesVides();
    const max = (a: number, b?: number | null) => Math.max(a, b ?? 0);
    for (const e of this.selection) {
      const a = e.avance;
      d.tactiqueOrg  = max(d.tactiqueOrg,  a?.dominanteTactiqueOrgIntensite);
      d.tactiqueFonc = max(d.tactiqueFonc, a?.dominanteTactiqueFoncIntensite);
      d.mental       = max(d.mental,       a?.dominanteMentalIntensite);
      d.technique    = max(d.technique,    a?.dominanteTechniqueIntensite);
      d.athletique   = max(d.athletique,   a?.dominanteAthletiqueIntensite);
    }
    return d;
  }

  /** L'axe affiche-t-il encore la valeur déduite (badge ⚡ auto) ou un choix du coach ? */
  axeAuto(a: AxeDominante): boolean {
    return !this.axesTouches.has(a) && this.dosagesDeduits()[a] > 0;
  }

  /** Applique la déduction sans jamais écraser un axe que le coach a dosé lui-même. */
  private appliquerDosagesDeduits(): void {
    const deduits = this.dosagesDeduits();
    for (const a of Object.keys(deduits) as AxeDominante[]) {
      if (!this.axesTouches.has(a)) this.dosages[a] = deduits[a];
    }
  }

  majDosages(d: DosageDominantes): void {
    for (const a of Object.keys(d) as AxeDominante[]) {
      if (d[a] !== this.dosages[a]) this.axesTouches.add(a);
    }
    this.dosages = d;
  }

  dominantes(famille: 'SEANCE' | 'ATHLETIQUE'): RefDominante[] {
    return this.refDominantes.filter(d => d.famille === famille);
  }

  /** Dominantes que le coach a explicitement cochées ou décochées : on ne les repropose plus. */
  private dominantesTouchees = new Set<string>();

  toggleDominante(id: string): void {
    this.dominantesTouchees.add(id);
    this.dominanteIds.has(id) ? this.dominanteIds.delete(id) : this.dominanteIds.add(id);
  }

  /**
   * Codes de dominantes déduits du contenu réel de la séance : les objectifs pédagogiques
   * renseignés et les dominantes des exercices choisis. C'était jusqu'ici la troisième saisie
   * de la même information — cocher « Technique » juste au-dessus d'une ligne « Technique »
   * déjà remplie. Elle devient donc calculée, et reste corrigeable.
   */
  private codesDominantesDeduits(): Set<string> {
    const codes = new Set<string>();
    const v = this.form?.value ?? {};
    const rempli = (x: unknown) => typeof x === 'string' && x.trim().length > 0;

    if (rempli(v.objTactiqueOrg) || rempli(v.objTactiqueFonc)) codes.add('tactique');
    if (rempli(v.objMental)) codes.add('mental');
    if (rempli(v.objTechnique)) codes.add('technique');
    if (rempli(v.objAthletique)) codes.add('physique');

    for (const e of this.selection) {
      const a = e.avance;
      if (rempli(a?.dominanteTactiqueOrg) || rempli(a?.dominanteTactiqueFonc)) codes.add('tactique');
      if (rempli(a?.dominanteMental)) codes.add('mental');
      if (rempli(a?.dominanteTechnique)) codes.add('technique');
      if (rempli(a?.dominanteAthletique)) codes.add('physique');
      if (e.type === 'PHYSIQUE' || e.type === 'MIXTE') codes.add('physique');
      if (e.type === 'TECHNIQUE' || e.type === 'MIXTE') codes.add('technique');
    }
    return codes;
  }

  /** Ids des dominantes actuellement suggérées (pour afficher le badge ⚡ auto sur la puce). */
  dominantesSuggerees(): Set<string> {
    const codes = this.codesDominantesDeduits();
    return new Set(this.refDominantes.filter(d => codes.has(d.code)).map(d => d.id));
  }

  /** Ajoute les suggestions sans jamais écraser un choix explicite du coach. */
  private appliquerSuggestionsDominantes(): void {
    for (const id of this.dominantesSuggerees()) {
      if (!this.dominantesTouchees.has(id)) this.dominanteIds.add(id);
    }
  }
  sousPrincipes(phase: string): RefSousPrincipe[] {
    return this.refSousPrincipes.filter(p => p.phase === phase);
  }
  toggleSousPrincipe(id: string): void {
    this.sousPrincipeIds.has(id) ? this.sousPrincipeIds.delete(id) : this.sousPrincipeIds.add(id);
  }

  // ══════════ Onglet Déroulé (blocs) ══════════

  /** Types de bloc : le premier tri mental d'un coach quand il construit son déroulé. */
  readonly typesBloc: { code: TypeBloc; libelle: string }[] = [
    { code: 'ECHAUFFEMENT',    libelle: 'Échauffement' },
    { code: 'SITUATION',       libelle: 'Situation' },
    { code: 'JEU',             libelle: 'Jeu' },
    { code: 'RETOUR_AU_CALME', libelle: 'Retour au calme' },
  ];

  /** Référentiel figé des rôles de bloc (▶ mène, ⚖ arbitre, ⚽ ballons, ⏱, 👁, 🩺). */
  rolesBloc: RoleBloc[] = [];

  ajouterBloc(): void {
    this.blocs = [...this.blocs, {
      libelle: `Bloc ${this.blocs.length + 1}`, type: null, sequencage: '',
      dureeMinutes: null, zones: [], staffIds: [], roles: {},
    }];
  }

  // ── Zones du terrain ──

  zonesBloc(bloc: BlocForm, zones: number[]): void {
    bloc.zones = zones;
  }

  /**
   * Zones occupées par PLUSIEURS blocs. C'est la raison d'être du découpage : avec l'ancien
   * texte libre, deux ateliers posés au même endroit restaient invisibles jusqu'au terrain.
   * Avertissement seulement — c'est parfois voulu (un bloc qui succède à un autre au même endroit).
   */
  zonesEnConflit(): number[] {
    const compte = new Map<number, number>();
    for (const b of this.blocs) {
      for (const z of new Set(b.zones)) compte.set(z, (compte.get(z) ?? 0) + 1);
    }
    return [...compte.entries()].filter(([, n]) => n > 1).map(([z]) => z).sort((a, b) => a - b);
  }

  blocEnConflit(bloc: BlocForm): boolean {
    const conflits = this.zonesEnConflit();
    return bloc.zones.some(z => conflits.includes(z));
  }

  // ── Rôles du staff sur un bloc ──

  aRole(bloc: BlocForm, staffId: string, code: string): boolean {
    return (bloc.roles[staffId] ?? []).includes(code);
  }

  /**
   * Bascule un rôle. Deux règles appliquées ici :
   * poser un rôle affecte automatiquement la personne au bloc (sinon on cocherait un rôle pour
   * quelqu'un d'absent), et <b>un seul MENEUR par bloc</b> — le désigner retire le précédent
   * plutôt que d'afficher une erreur, parce que c'est ce que le coach veut dire.
   */
  toggleRole(bloc: BlocForm, staffId: string, code: string): void {
    const actuels = bloc.roles[staffId] ?? [];
    if (actuels.includes(code)) {
      bloc.roles[staffId] = actuels.filter(r => r !== code);
      return;
    }
    if (code === 'MENEUR') {
      for (const autre of Object.keys(bloc.roles)) {
        bloc.roles[autre] = (bloc.roles[autre] ?? []).filter(r => r !== 'MENEUR');
      }
    }
    bloc.roles[staffId] = [...actuels, code];
    if (!bloc.staffIds.includes(staffId)) bloc.staffIds.push(staffId);
  }

  /** Durée du bloc déduite de ses exercices — même principe que la durée de séance. */
  dureeDeduiteBloc(index: number): number {
    return this.exercicesDuBloc(index).reduce((s, x) => s + (x.exo.dureeMinutes ?? 0), 0);
  }

  /** Le bloc annonce une durée qui ne colle pas à ses exercices : on le dit, sans l'imposer. */
  ecartDureeBloc(index: number): number | null {
    const bloc = this.blocs[index];
    const somme = this.dureeDeduiteBloc(index);
    if (!bloc?.dureeMinutes || somme === 0) return null;
    const ecart = bloc.dureeMinutes - somme;
    return Math.abs(ecart) >= 5 ? ecart : null;
  }

  /** Recalcule les durées des blocs que le coach n'a pas fixées lui-même. */
  rafraichirDureesBlocs(): void {
    this.blocs.forEach((b, i) => {
      if (b.dureeManuelle) return;
      const somme = this.dureeDeduiteBloc(i);
      b.dureeMinutes = somme > 0 ? somme : null;
    });
  }

  supprimerBloc(index: number): void {
    this.blocs = this.blocs.filter((_, i) => i !== index);
    // Réindexe les rattachements : exercices et groupes du bloc supprimé redeviennent globaux.
    this.blocParExo = this.blocParExo.map(b => b == null ? null : (b === index ? null : (b > index ? b - 1 : b)));
    this.groupes = this.groupes.map(g => ({
      ...g,
      blocIndex: g.blocIndex == null ? null : (g.blocIndex === index ? null : (g.blocIndex > index ? g.blocIndex - 1 : g.blocIndex)),
    }));
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
    if (i >= 0) {
      bloc.staffIds.splice(i, 1);
      // Retirer quelqu'un du bloc doit retirer ses rôles : un arbitre absent n'arbitre rien.
      delete bloc.roles[staffId];
    } else {
      bloc.staffIds.push(staffId);
    }
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

  /**
   * Exercices de la séance pas encore rangés dans un bloc — proposés en « + » sous chaque bloc.
   *
   * Remplace la liste « Rangement des exercices » qui vivait en bas de l'onglet : elle
   * obligeait à faire l'aller-retour entre le bloc qu'on construit et un tableau de selects
   * distant, sans jamais voir les deux ensemble. On range là où l'on regarde.
   */
  exercicesARanger(): { exo: Exercice; selIndex: number }[] {
    return this.exercicesDuBloc(null);
  }

  rangerDansBloc(selIndex: number, blocIndex: number): void {
    this.blocParExo[selIndex] = blocIndex;
    this.rafraichirDureesBlocs();
  }

  sortirDuBloc(selIndex: number): void {
    this.blocParExo[selIndex] = null;
    this.rafraichirDureesBlocs();
  }

  /** Météo : chaque choix annonce la correction qu'il applique à la distance attendue. */
  readonly meteos: { code: string; icone: string; libelle: string; correction: string }[] = [
    { code: 'beau',              icone: '☀️', libelle: 'Soleil',   correction: '±0 %' },
    { code: 'nuageux',           icone: '⛅', libelle: 'Nuageux',  correction: '±0 %' },
    { code: 'pluie',             icone: '🌧️', libelle: 'Pluie',    correction: '−3 %' },
    { code: 'vent_fort',         icone: '💨', libelle: 'Vent fort', correction: '−3 %' },
    { code: 'neige',             icone: '❄️', libelle: 'Neige',    correction: '−12 %' },
    { code: 'ARRET_INTEMPERIE',  icone: '🛑', libelle: 'Arrêt intempérie', correction: 'hors baseline' },
  ];

  choisirMeteo(code: string): void {
    const c = this.form.get('conditionsMeteo')!;
    c.setValue(c.value === code ? '' : code);
  }

  // ══════════ Onglet Effectifs (groupes du jour) ══════════

  /**
   * La PORTÉE se choisit désormais sur chaque groupe (« vaut pour toute la séance » ou « vaut
   * pour le bloc 3 »), et non plus sur un sélecteur global au-dessus de la liste.
   *
   * Le sélecteur global obligeait à comprendre qu'il filtrait la liste : on créait une équipe
   * sans voir qu'elle n'existait que pour le bloc affiché, et les équipes des autres blocs
   * disparaissaient sans prévenir. Portée sur la carte, elle se lit sur le groupe qu'elle
   * concerne — et la liste montre enfin tous les groupes du jour d'un coup.
   */
  ajouterGroupe(type: 'COULEUR' | 'LIBRE'): void {
    const couleursPrises = this.groupes.map(g => g.couleur);
    const couleur = COULEURS_GROUPE.find(c => !couleursPrises.includes(c)) ?? 'bleu';
    const libelle = type === 'COULEUR'
      ? `Équipe ${couleur}`
      : `Groupe ${this.groupes.length + 1}`;
    this.groupes = [...this.groupes, { type, libelle, couleur, blocIndex: null, joueurIds: [] }];
  }

  supprimerGroupe(index: number): void {
    this.groupes = this.groupes.filter((_, i) => i !== index);
  }

  /** Portées proposées sur une carte de groupe : la séance entière, ou l'un des blocs. */
  porteesPossibles(): { valeur: number | null; libelle: string }[] {
    return [
      { valeur: null, libelle: 'Toute la séance' },
      ...this.blocs.map((b, i) => ({ valeur: i, libelle: `Bloc ${i + 1} · ${b.libelle}` })),
    ];
  }

  libellePortee(g: GroupeForm): string {
    if (g.blocIndex == null) return 'Ce groupe reste valable toute la séance.';
    const b = this.blocs[g.blocIndex];
    return `Ce groupe ne vaut que pour le bloc ${g.blocIndex + 1}${b ? ` · ${b.libelle}` : ''}.`;
  }

  /**
   * Clic sur un joueur dans une carte de groupe : il y entre, et sort des autres groupes de la
   * MÊME portée — un joueur ne peut pas être à la fois chez les Rouges et chez les Bleus sur
   * le même temps de jeu. Deux portées différentes restent en revanche compatibles (un joueur
   * peut être « Rouges » toute la séance et « Atelier gardiens » sur le bloc 2).
   */
  basculerJoueur(index: number, joueurId: string): void {
    const groupe = this.groupes[index];
    if (!groupe) return;
    const dedans = groupe.joueurIds.includes(joueurId);
    for (const g of this.groupes) {
      if (g.blocIndex === groupe.blocIndex) {
        g.joueurIds = g.joueurIds.filter(id => id !== joueurId);
      }
    }
    if (!dedans) groupe.joueurIds = [...groupe.joueurIds, joueurId];
  }

  dansGroupe(g: GroupeForm, joueurId: string): boolean {
    return g.joueurIds.includes(joueurId);
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
    const avance = this.peutAvance();
    const result: SeanceFormResult = {
      date: v.date,
      typeSeance: { id: v.typeSeanceId },
      dureeMinutes: v.dureeMinutes,
      responsableId: v.responsableId || undefined,
      contexte: v.contexte || undefined,
      contexteSeanceId: v.contexteSeanceId || undefined,
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
        dominanteTactiqueOrgIntensite: this.dosages.tactiqueOrg,
        dominanteTactiqueFoncIntensite: this.dosages.tactiqueFonc,
        dominanteMentalIntensite: this.dosages.mental,
        dominanteTechniqueIntensite: this.dosages.technique,
        dominanteAthletiqueIntensite: this.dosages.athletique,
      }),
      exercices: this.selection.map((e, i) => ({
        exerciceId: e.id,
        blocIndex: avance ? this.blocParExo[i] : null,
      })),
      avance: avance ? {
        blocs: this.blocs.map(b => ({
          libelle: b.libelle, type: b.type, sequencage: b.sequencage || null,
          dureeMinutes: b.dureeMinutes, zones: b.zones, staffIds: b.staffIds,
          // Les rôles sont mis à plat : une ligne par (personne, rôle), cumul libre.
          staffRoles: Object.entries(b.roles).flatMap(([utilisateurId, codes]) =>
            (codes ?? []).map(role => ({ utilisateurId, role }))),
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

  /**
   * Référence de comparaison de la durée. Dès qu'une durée EFFECTIVE est constatée, c'est elle
   * qui est comparée à la durée prévue — c'est le seul écart qui appelle une explication. Tant
   * qu'elle est vide (à la planification), on retombe sur la durée théorique du type.
   */
  get compareEffective(): boolean {
    return this.peutAvance() && !!this.form?.get('dureeEffectiveMinutes')?.value;
  }

  private calculerAlerte(duree: number | null): void {
    const effective = Number(this.form?.get('dureeEffectiveMinutes')?.value) || null;
    const reference = effective ?? this.dureeTheorique;
    if (!reference || !duree || duree <= 0) {
      this.alerteEcart = null;
      return;
    }
    // Écart de la référence par rapport au prévu : « écourtée » = on a fait moins que prévu.
    const ratio = effective != null
      ? (effective - duree) / duree
      : (duree - reference) / reference;
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
