import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SeanceModeleService, SeanceModele, SeanceModeleRequest, PlanifieResponse,
} from '@core/services/seance-modele.service';
import {
  SeanceService, TypeBloc, TypeSeance, RefDominante, RefSousPrincipe, StaffRef,
} from '@core/services/seance.service';
import { TechniqueService, Exercice } from '@core/services/technique.service';
import { TerrainZonesComponent } from '@shared/components/terrain-zones/terrain-zones.component';
import { AuthService } from '@core/services/auth.service';
import {
  DosageDominantes, JaugeDominantesComponent, dosagesVides,
} from '@shared/components/jauge-dominantes/jauge-dominantes.component';

/** Bloc en cours d'édition (miroir du dialog de séance). */
interface BlocForm {
  libelle: string;
  type: TypeBloc | null;
  sequencage: string;
  dureeMinutes: number | null;
  /** Zones du terrain par défaut (1..8) — recopiées à la planification comme le reste. */
  zones: number[];
  staffIds: string[];
}

/**
 * Bibliothèque de séances-modèles (espace Coaching). Gabarits réutilisables : on les crée/édite
 * (créateur-only), on les duplique, et surtout on les « Planifie » pour générer une vraie séance
 * dans le calendrier. Pattern inline (panneaux togglés), calqué sur « Modèles de semaine ».
 */
@Component({
  selector: 'app-seances-modeles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TerrainZonesComponent, JaugeDominantesComponent],
  templateUrl: './seances-modeles.component.html',
  styleUrl: './seances-modeles.component.scss',
})
export class SeancesModelesComponent implements OnInit {

  private service = inject(SeanceModeleService);
  private seanceService = inject(SeanceService);
  private technique = inject(TechniqueService);
  private auth = inject(AuthService);

  modeles: SeanceModele[] = [];
  types: TypeSeance[] = [];
  exercices: Exercice[] = [];
  loading = true;
  message = '';

  // Édition (création ou modification du cadre + sélection d'exercices)
  edition: SeanceModeleRequest | null = null;
  editionId: string | null = null;
  selection: Exercice[] = [];
  exoListeOuverte = false;
  filtreExo = '';

  // ── Mode avancé (module seance_avancee), même gating que le dialog de séance ──
  ongletAvance: 'cadre' | 'objectifs' | 'deroule' = 'cadre';
  refDominantes: RefDominante[] = [];
  refSousPrincipes: RefSousPrincipe[] = [];
  staffClub: StaffRef[] = [];
  dominanteIds = new Set<string>();
  sousPrincipeIds = new Set<string>();
  blocs: BlocForm[] = [];

  /** Types de bloc (V66) — mêmes valeurs que le formulaire de séance, recopiées à la planification. */
  readonly typesBloc: { code: TypeBloc; libelle: string }[] = [
    { code: 'ECHAUFFEMENT',    libelle: 'Échauffement' },
    { code: 'SITUATION',       libelle: 'Situation' },
    { code: 'JEU',             libelle: 'Jeu' },
    { code: 'RETOUR_AU_CALME', libelle: 'Retour au calme' },
  ];

  /** Zones cochées sur la carte du bloc (l'événement est typé `number[]`, pas `Event`). */
  majZonesBloc(bloc: BlocForm, zones: number[]): void { bloc.zones = zones; }
  /** Index du bloc par exercice sélectionné (aligné sur `selection`). null = hors bloc. */
  blocParExo: (number | null)[] = [];

  readonly phasesProjet = [
    { code: 'OFF', libelle: 'Phase offensive' },
    { code: 'DEF', libelle: 'Phase défensive' },
    { code: 'T_OD', libelle: 'Transition off. → déf.' },
    { code: 'T_DO', libelle: 'Transition déf. → off.' },
    { code: 'CPA_OFF', libelle: 'Coups de pied arrêtés offensifs' },
    { code: 'CPA_DEF', libelle: 'Coups de pied arrêtés défensifs' },
  ];

  /** Dosage 0-5 des cinq axes du gabarit (V68), recopié à la planification. */
  dosages: DosageDominantes = dosagesVides();

  /**
   * Les rubriques avancées existent dès que le module `seance_avancee` est actif. Il n'y a plus
   * de préférence « mode avancé » à armer : le formulaire de séance et la fiche d'exercice ont
   * abandonné cet interrupteur, un gabarit ne pouvait pas rester le seul écran à le demander.
   */
  peutAvance(): boolean { return this.auth.has('seance_avancee:access'); }

  // Planification (instanciation en séance)
  planifId: string | null = null;
  planifNom = '';
  planifDate = '';
  planifHeure = '';
  planifResult: PlanifieResponse | null = null;

  ngOnInit(): void {
    this.seanceService.getTypeSeances().subscribe(t => this.types = t);
    this.technique.listerExercices().subscribe(ex =>
      this.exercices = ex.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '')));
    if (this.peutAvance()) {
      this.seanceService.getReferentielsSeanceAvancee().subscribe({
        next: r => { this.refDominantes = r.dominantes; this.refSousPrincipes = r.sousPrincipes; },
        error: () => {},
      });
      this.seanceService.getStaffClub().subscribe({ next: st => this.staffClub = st, error: () => {} });
    }
    this.charger();
  }

  charger(): void {
    this.loading = true;
    this.service.lister().subscribe({
      next: m => { this.modeles = m; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  // ── Édition ──
  nouveau(): void {
    this.editionId = null;
    this.selection = [];
    this.exoListeOuverte = false;
    this.ongletAvance = 'cadre';
    this.dosages = dosagesVides();
    this.dominanteIds.clear();
    this.sousPrincipeIds.clear();
    this.blocs = [];
    this.blocParExo = [];
    this.edition = {
      nom: '', typeSeanceId: this.types[0]?.id ?? '', objectif: '', dureeMinutes: null,
      objectifDistanceM: null, objectifIntensite: null, objectifDistanceHauteIntensiteM: null, description: '',
      objTactiqueOrg: '', objTactiqueFonc: '', objMental: '', objTechnique: '', objAthletique: '',
    };
  }

  modifier(m: SeanceModele): void {
    this.service.detail(m.id).subscribe(d => {
      this.editionId = m.id;
      this.exoListeOuverte = false;
      this.ongletAvance = 'cadre';
      this.edition = {
        nom: d.modele.nom,
        typeSeanceId: d.modele.typeSeanceId ?? this.types[0]?.id ?? '',
        objectif: d.modele.objectif ?? '',
        dureeMinutes: d.modele.dureeMinutes ?? null,
        objectifDistanceM: d.modele.objectifDistanceM ?? null,
        objectifIntensite: d.modele.objectifIntensite ?? null,
        objectifDistanceHauteIntensiteM: d.modele.objectifDistanceHauteIntensiteM ?? null,
        description: d.modele.description ?? '',
        objTactiqueOrg: d.modele.objTactiqueOrg ?? '',
        objTactiqueFonc: d.modele.objTactiqueFonc ?? '',
        objMental: d.modele.objMental ?? '',
        objTechnique: d.modele.objTechnique ?? '',
        objAthletique: d.modele.objAthletique ?? '',
      };
      this.dosages = {
        tactiqueOrg: d.modele.dominanteTactiqueOrgIntensite ?? 0,
        tactiqueFonc: d.modele.dominanteTactiqueFoncIntensite ?? 0,
        mental: d.modele.dominanteMentalIntensite ?? 0,
        technique: d.modele.dominanteTechniqueIntensite ?? 0,
        athletique: d.modele.dominanteAthletiqueIntensite ?? 0,
      };
      this.selection = d.exercices
        .map(l => this.exercices.find(e => e.id === l.exerciceId))
        .filter((e): e is Exercice => !!e);

      this.dominanteIds = new Set(d.dominanteIds ?? []);
      this.sousPrincipeIds = new Set(d.sousPrincipeIds ?? []);
      this.blocs = (d.blocs ?? []).map(b => ({
        libelle: b.libelle, type: b.type ?? null, sequencage: b.sequencage ?? '',
        dureeMinutes: b.dureeMinutes ?? null, zones: [...(b.zones ?? [])],
        staffIds: b.staff.map(st => st.id),
      }));
      // Rattachement : on retrouve l'index du bloc à partir de son identifiant serveur.
      const indexParBlocId = new Map((d.blocs ?? []).map((b, i) => [b.id, i]));
      this.blocParExo = d.exercices.map(l => (l.blocId != null ? indexParBlocId.get(l.blocId) ?? null : null));
    });
  }

  annulerEdition(): void {
    this.edition = null;
    this.editionId = null;
    this.selection = [];
    this.blocs = [];
    this.blocParExo = [];
    this.dominanteIds.clear();
    this.sousPrincipeIds.clear();
  }

  // ── Mode avancé : référentiels, blocs, rattachement ──

  dominantes(famille: 'SEANCE' | 'ATHLETIQUE'): RefDominante[] {
    return this.refDominantes.filter(d => d.famille === famille);
  }

  sousPrincipes(phase: string): RefSousPrincipe[] {
    return this.refSousPrincipes.filter(p => p.phase === phase);
  }

  toggleDominante(id: string): void {
    this.dominanteIds.has(id) ? this.dominanteIds.delete(id) : this.dominanteIds.add(id);
  }

  toggleSousPrincipe(id: string): void {
    this.sousPrincipeIds.has(id) ? this.sousPrincipeIds.delete(id) : this.sousPrincipeIds.add(id);
  }

  ajouterBloc(): void {
    this.blocs.push({
      libelle: `Bloc ${this.blocs.length + 1}`, type: null, sequencage: '', dureeMinutes: null,
      zones: [], staffIds: [],
    });
  }

  supprimerBloc(i: number): void {
    this.blocs.splice(i, 1);
    // Les exercices rangés dans ce bloc repassent hors bloc ; les suivants se décalent.
    this.blocParExo = this.blocParExo.map(b => (b === i ? null : b !== null && b > i ? b - 1 : b));
  }

  deplacerBloc(i: number, sens: -1 | 1): void {
    const j = i + sens;
    if (j < 0 || j >= this.blocs.length) return;
    [this.blocs[i], this.blocs[j]] = [this.blocs[j], this.blocs[i]];
    this.blocParExo = this.blocParExo.map(b => (b === i ? j : b === j ? i : b));
  }

  toggleStaffBloc(bloc: BlocForm, staffId: string): void {
    const k = bloc.staffIds.indexOf(staffId);
    k >= 0 ? bloc.staffIds.splice(k, 1) : bloc.staffIds.push(staffId);
  }

  /** Complément affiché sous le nom dans la puce (« Entraîneur · U19 »). */
  metaStaff(s: StaffRef): string {
    return [s.role, s.equipe].filter(v => !!v).join(' · ');
  }

  exercicesDuBloc(index: number): Exercice[] {
    return this.selection.filter((_, i) => this.blocParExo[i] === index);
  }

  // ── Sélection d'exercices ──
  toggleExoListe(): void { this.exoListeOuverte = !this.exoListeOuverte; }

  get exercicesFiltres(): Exercice[] {
    const q = this.filtreExo.trim().toLowerCase();
    return this.exercices.filter(e => !q || (e.nom || '').toLowerCase().includes(q));
  }

  estSelectionne(e: Exercice): boolean { return this.selection.some(x => x.id === e.id); }

  toggleSelection(e: Exercice): void {
    if (this.estSelectionne(e)) {
      this.retirer(e);
      return;
    }
    this.selection = [...this.selection, e];
    this.blocParExo = [...this.blocParExo, null];   // reste aligné sur `selection`
    this.recalculerDuree();
  }

  retirer(e: Exercice): void {
    const i = this.selection.findIndex(x => x.id === e.id);
    if (i < 0) return;
    this.selection = this.selection.filter((_, k) => k !== i);
    this.blocParExo = this.blocParExo.filter((_, k) => k !== i);
    this.recalculerDuree();
  }

  get dureeSelection(): number {
    return this.selection.reduce((s, e) => s + (e.dureeMinutes ?? 0), 0);
  }

  /** Durée du modèle = somme des durées des exercices (auto, modifiable ensuite). */
  recalculerDuree(): void {
    if (this.edition && this.dureeSelection > 0) this.edition.dureeMinutes = this.dureeSelection;
  }

  enregistrer(): void {
    if (!this.edition) return;
    if (!this.edition.nom.trim()) { this.message = 'Le nom est obligatoire.'; return; }
    if (!this.edition.typeSeanceId) { this.message = 'Le type de séance est obligatoire.'; return; }
    const req: SeanceModeleRequest = {
      nom: this.edition.nom.trim(),
      typeSeanceId: this.edition.typeSeanceId,
      objectif: this.edition.objectif || null,
      dureeMinutes: this.edition.dureeMinutes ?? null,
      objectifDistanceM: this.edition.objectifDistanceM ?? null,
      objectifIntensite: this.edition.objectifIntensite ?? null,
      objectifDistanceHauteIntensiteM: this.edition.objectifDistanceHauteIntensiteM ?? null,
      description: this.edition.description || null,
      ...(this.peutAvance() && {
        objTactiqueOrg: this.edition.objTactiqueOrg || null,
        objTactiqueFonc: this.edition.objTactiqueFonc || null,
        objMental: this.edition.objMental || null,
        objTechnique: this.edition.objTechnique || null,
        objAthletique: this.edition.objAthletique || null,
        dominanteTactiqueOrgIntensite: this.dosages.tactiqueOrg,
        dominanteTactiqueFoncIntensite: this.dosages.tactiqueFonc,
        dominanteMentalIntensite: this.dosages.mental,
        dominanteTechniqueIntensite: this.dosages.technique,
        dominanteAthletiqueIntensite: this.dosages.athletique,
      }),
    };
    const avance = this.peutAvance();
    const lignes = this.selection.map((e, i) => ({
      exerciceId: e.id,
      ...(avance && { blocIndex: this.blocParExo[i] ?? null }),
    }));
    const obs = this.editionId ? this.service.modifier(this.editionId, req) : this.service.creer(req);
    obs.subscribe({
      next: saved => {
        // En mode avancé, un seul appel pose les exercices ET les blocs/référentiels ;
        // sinon on garde l'endpoint historique (liste plate).
        const contenu = avance
          ? this.service.remplacerContenuAvance(saved.id, {
              blocs: this.blocs.map(b => ({
                libelle: b.libelle, type: b.type, sequencage: b.sequencage || null,
                dureeMinutes: b.dureeMinutes ?? null, zones: b.zones,
                staffIds: b.staffIds,
                // Les RÔLES restent propres à la séance : ils disent qui fait quoi un jour donné,
                // ce qu'un gabarit réutilisable ne peut pas savoir.
                staffRoles: [],
              })),
              exercices: lignes,
              dominanteIds: [...this.dominanteIds],
              sousPrincipeIds: [...this.sousPrincipeIds],
            })
          : this.service.remplacerExercices(saved.id, lignes);
        contenu.subscribe({
          next: () => { this.message = 'Modèle enregistré.'; this.annulerEdition(); this.charger(); },
          error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
        });
      },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  dupliquer(m: SeanceModele): void {
    this.service.dupliquer(m.id).subscribe(() => { this.message = 'Modèle dupliqué.'; this.charger(); });
  }

  supprimer(m: SeanceModele): void {
    if (!confirm(`Supprimer le modèle « ${m.nom} » ?`)) return;
    this.service.supprimer(m.id).subscribe({
      next: () => { this.message = 'Modèle supprimé.'; this.charger(); },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  // ── Planification ──
  ouvrirPlanifier(m: SeanceModele): void {
    this.planifId = m.id;
    this.planifNom = m.nom;
    this.planifDate = new Date().toISOString().slice(0, 10);
    this.planifHeure = '';
    this.planifResult = null;
  }

  annulerPlanifier(): void {
    this.planifId = null;
    this.planifResult = null;
  }

  lancerPlanifier(): void {
    if (!this.planifId || !this.planifDate) return;
    this.service.planifier(this.planifId, {
      date: this.planifDate,
      heureDebut: this.planifHeure || undefined,
    }).subscribe({
      next: r => { this.planifResult = r; this.message = 'Séance créée dans le calendrier.'; },
      error: e => { this.message = 'Échec : ' + (e?.error?.message ?? 'erreur'); },
    });
  }

  nomType(id?: string): string {
    return this.types.find(t => t.id === id)?.libelle ?? '—';
  }
}
