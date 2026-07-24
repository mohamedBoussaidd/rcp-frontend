import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  EchelleEffectif, Exercice, ExerciceAvance, ExerciceRequest, FormeExercice, FORMES_EXERCICE,
  NiveauObjectif, TechniqueService, TypeExercice,
} from '@core/services/technique.service';
import { RefSousPrincipe, SeanceService } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { ImportPhotoResultat } from '@core/services/import-photo.service';
import { InfoBulleComponent, INFOBULLES } from '@shared/components/info-bulle/info-bulle.component';
import {
  AXES_DOMINANTES, AxeDominante, DosageDominantes, JaugeDominantesComponent, NotesDominantes,
  dosagesVides, notesVides,
} from '@shared/components/jauge-dominantes/jauge-dominantes.component';

/** Une des quatre précisions pédagogiques, repliée tant qu'on ne s'en sert pas. */
interface CarteTexte {
  cle: 'reglesJeu' | 'variablesPedagogiques' | 'reperesPerceptifs' | 'comportementsAttendus';
  libelle: string;
  icone: string;
  placeholder: string;
}

const CARTES_TEXTE: CarteTexte[] = [
  { cle: 'reglesJeu', libelle: 'Règles & système de marque', icone: '📋',
    placeholder: 'Comptage des points, conditions de validation…' },
  { cle: 'variablesPedagogiques', libelle: 'Variables pédagogiques', icone: '🎚️',
    placeholder: 'Ce que tu peux durcir ou alléger en cours de jeu…' },
  { cle: 'reperesPerceptifs', libelle: 'Repères perceptifs', icone: '👁️',
    placeholder: 'Indices à lire pour agir (position adverse, appuis…)' },
  { cle: 'comportementsAttendus', libelle: 'Comportements attendus', icone: '🎯',
    placeholder: 'Ce que le joueur doit faire concrètement…' },
];

const LIBELLES_INTENSITE = ['—', 'très faible', 'faible', 'modérée', 'élevée', 'maximale'];

/** Phases du projet de jeu, avec la couleur de leur pastille de groupe. */
const PHASES_PROJET: { code: string; libelle: string; couleur: string }[] = [
  { code: 'OFF',     libelle: 'Animation offensive',   couleur: 'var(--green-500)' },
  { code: 'T_DO',    libelle: 'Transition défensive',  couleur: 'var(--cuivre)' },
  { code: 'DEF',     libelle: 'Animation défensive',   couleur: 'var(--info)' },
  { code: 'T_OD',    libelle: 'Transition offensive',  couleur: 'var(--amber)' },
  { code: 'CPA_OFF', libelle: 'CPA offensifs',         couleur: 'var(--text-2)' },
  { code: 'CPA_DEF', libelle: 'CPA défensifs',         couleur: 'var(--text-3)' },
];

/**
 * Fiche d'exercice, sur sa propre page.
 *
 * Elle vivait avant en carte dépliée au-dessus de la bibliothèque, ce qui obligeait à choisir
 * entre voir le catalogue et remplir sa fiche. Deux colonnes désormais : la saisie à gauche,
 * l'aperçu de la fiche à droite — on voit se construire ce qu'on écrit, ce qui rend le coût de
 * remplissage lisible au lieu de le subir.
 *
 * La structure suit ce que la fiche exige vraiment : un bloc « Essentiel » toujours ouvert
 * (trois champs suffisent à ranger un exercice) et deux blocs repliés marqués facultatifs. Le
 * repli remplace l'ancienne case « Mode avancé » : le module `seance_avancee` décide toujours
 * de leur existence, mais on ne demande plus à l'utilisateur d'armer un interrupteur avant de
 * pouvoir écrire.
 */
@Component({
  selector: 'app-exercice-form',
  standalone: true,
  templateUrl: './exercice-form.component.html',
  styleUrl: './exercice-form.component.scss',
  imports: [FormsModule, InfoBulleComponent, JaugeDominantesComponent],
})
export class ExerciceFormComponent implements OnInit {

  readonly formes = FORMES_EXERCICE;
  readonly cartes = CARTES_TEXTE;
  readonly phasesProjet = PHASES_PROJET;
  readonly aide = INFOBULLES;
  readonly crans = [1, 2, 3, 4, 5];

  readonly types: { code: TypeExercice; libelle: string }[] = [
    { code: 'TECHNIQUE', libelle: 'Technique' },
    { code: 'PHYSIQUE', libelle: 'Physique' },
    { code: 'MIXTE', libelle: 'Mixte' },
  ];

  readonly niveauxObjectif: { code: NiveauObjectif; libelle: string }[] = [
    { code: 'TEMPS_DE_JEU', libelle: 'Temps de jeu' },
    { code: 'PRINCIPE_ACTION', libelle: `Principe d'action` },
    { code: 'REGLE_ACTION_COLLECTIVE', libelle: `Règle d'action collective` },
    { code: 'REGLE_ACTION_INDIVIDUELLE', libelle: `Règle d'action individuelle` },
    { code: 'MOYEN', libelle: 'Moyen' },
  ];

  readonly echellesEffectif: { code: EchelleEffectif; libelle: string }[] = [
    { code: 'COLLECTIF', libelle: 'Collectif' },
    { code: 'INTERSECTORIEL', libelle: 'Intersectoriel' },
    { code: 'SECTORIEL', libelle: 'Sectoriel' },
    { code: 'GROUPAL', libelle: 'Groupal' },
    { code: 'INDIVIDUEL', libelle: 'Individuel' },
  ];

  form: ExerciceRequest = this.vide();
  avance: ExerciceAvance = {};
  dosages: DosageDominantes = dosagesVides();
  notesDom: NotesDominantes = notesVides();
  sousPrincipeIds = new Set<string>();
  refSousPrincipes: RefSousPrincipe[] = [];

  readonly editionId = signal<string | null>(null);
  /** Fiche d'exercice GLOBAL (super-admin) : création via /globaux, retour vers l'écran admin. */
  readonly global = signal(false);
  readonly chargement = signal(true);
  readonly enregistrement = signal(false);
  readonly pedagoOuvert = signal(false);
  readonly orgaOuvert = signal(false);
  readonly cartesOuvertes = signal<Set<string>>(new Set());

  /** Le coach a corrigé le nombre de joueurs : on cesse de le recalculer sous ses doigts. */
  nbJoueursManuel = false;

  /** Schéma et pièce jointe issus d'un import photo, rattachés après création. */
  private schemaImporte: string | null = null;
  private photoImportId: string | null = null;

  private service = inject(TechniqueService);
  private seanceService = inject(SeanceService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  peutAvance(): boolean { return this.auth.has('seance_avancee:access'); }

  ngOnInit(): void {
    this.seanceService.getReferentielsSeanceAvancee().subscribe({
      next: r => this.refSousPrincipes = r.sousPrincipes,
      error: () => {},
    });

    this.global.set(this.route.snapshot.data['global'] === true);

    const id = this.route.snapshot.paramMap.get('id');
    // Pré-remplissage venu de l'import photo : la bibliothèque a fait analyser la fiche papier
    // puis nous a passé le résultat en état de navigation (rien à persister entre les deux).
    const prefill = history.state?.prefill as ImportPhotoResultat | undefined;

    if (id) {
      this.editionId.set(id);
      this.charger(id);
    } else {
      if (prefill) this.appliquerImportPhoto(prefill);
      this.chargement.set(false);
    }
  }

  private charger(id: string): void {
    // Pas d'endpoint unitaire : la liste est déjà filtrée par le scope du club et tient en un
    // appel. En ajouter un pour une fiche à la fois n'apporterait rien ici.
    const liste$ = this.global() ? this.service.listerExercicesGlobaux() : this.service.listerExercices();
    liste$.subscribe({
      next: liste => {
        const e = liste.find(x => x.id === id);
        if (!e) {
          this.snack.open('Exercice introuvable', 'Fermer', { duration: 3000 });
          this.retour();
          return;
        }
        this.remplirDepuis(e);
        this.chargement.set(false);
      },
      error: () => {
        this.chargement.set(false);
        this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 });
      },
    });
  }

  private remplirDepuis(e: Exercice): void {
    this.form = {
      nom: e.nom, forme: e.forme ?? null, type: e.type ?? 'TECHNIQUE',
      dureeMinutes: e.dureeMinutes ?? null, objectif: e.objectif ?? '',
      intensite: e.intensite ?? null, description: e.description ?? '',
      distanceAttendueM: e.distanceAttendueM ?? null,
      distanceHauteIntensiteM: e.distanceHauteIntensiteM ?? null,
      nbSprints: e.nbSprints ?? null,
    };
    this.avance = { ...(e.avance ?? {}) };
    this.dosages = {
      tactiqueOrg: this.avance.dominanteTactiqueOrgIntensite ?? 0,
      tactiqueFonc: this.avance.dominanteTactiqueFoncIntensite ?? 0,
      mental: this.avance.dominanteMentalIntensite ?? 0,
      technique: this.avance.dominanteTechniqueIntensite ?? 0,
      athletique: this.avance.dominanteAthletiqueIntensite ?? 0,
    };
    this.notesDom = {
      tactiqueOrg: this.avance.dominanteTactiqueOrg ?? '',
      tactiqueFonc: this.avance.dominanteTactiqueFonc ?? '',
      mental: this.avance.dominanteMental ?? '',
      technique: this.avance.dominanteTechnique ?? '',
      athletique: this.avance.dominanteAthletique ?? '',
    };
    this.sousPrincipeIds = new Set(e.sousPrincipeIds ?? []);
    // Un exercice enregistré porte un compte validé par un humain : on ne le recalcule pas.
    this.nbJoueursManuel = e.avance?.nbJoueursTotal != null;
    // Les sections déjà nourries s'ouvrent d'elles-mêmes : on ne cache pas ce qui existe.
    if (this.resumePedago() !== null) this.pedagoOuvert.set(true);
    if (this.resumeOrga() !== null) this.orgaOuvert.set(true);
  }

  private appliquerImportPhoto(r: ImportPhotoResultat): void {
    const t = r.texte;
    this.form = {
      ...this.vide(),
      nom: t.titre ?? '',
      dureeMinutes: t.dureeMinutes ?? null,
      objectif: t.objectif ?? '',
      description: [t.description, t.materiel ? `Matériel : ${t.materiel}` : null,
        ...t.blocs.map(b => `${b.libelle}${b.dureeMinutes ? ` (${b.dureeMinutes}')` : ''}${b.consignes ? ` — ${b.consignes}` : ''}`)]
        .filter(x => !!x).join('\n'),
    };
    const a = t.avance;
    if (a && this.peutAvance()) {
      this.avance = {
        formatJoueurs: a.formatJoueurs ?? null,
        terrainLongueurM: a.terrainLongueurM ?? null,
        terrainLargeurM: a.terrainLargeurM ?? null,
        // V65 : l'IA lit encore « but/système de marque » et « séquençage » sur la fiche papier.
        // Le premier rejoint les règles (c'en est une), le second la description — il n'a plus
        // sa place sur l'exercice, il se saisit désormais sur le bloc de séance.
        reglesJeu: [a.butSystemeMarque, a.reglesJeu].filter(x => !!x).join(' · ') || null,
        variablesPedagogiques: a.variablesPedagogiques ?? null,
      };
      this.avance.nbJoueursTotal = this.nbJoueursDeduit();
      if (a.sequencage) {
        this.form.description = [this.form.description, `Séquençage : ${a.sequencage}`]
          .filter(x => !!x).join('\n');
      }
      if (this.resumeOrga() !== null) this.orgaOuvert.set(true);
    }
    this.schemaImporte = r.schemaJson ?? null;
    this.photoImportId = r.journalId;
    this.snack.open('Formulaire pré-rempli depuis la photo — vérifie et ajuste avant d\'enregistrer',
      'OK', { duration: 4000 });
  }

  // ── Essentiel ──────────────────────────────────────────────────────────

  choisirForme(code: FormeExercice): void {
    this.form.forme = this.form.forme === code ? null : code;
  }

  choisirType(code: TypeExercice): void { this.form.type = code; }

  choisirIntensite(n: number): void {
    this.form.intensite = this.form.intensite === n ? null : n;
  }

  get montrerPhysique(): boolean {
    return this.form.type === 'PHYSIQUE' || this.form.type === 'MIXTE';
  }

  libelleIntensite(): string { return LIBELLES_INTENSITE[this.form.intensite ?? 0]; }

  sousPrincipesDe(phase: string): RefSousPrincipe[] {
    return this.refSousPrincipes.filter(p => p.phase === phase);
  }

  toggleSousPrincipe(id: string): void {
    this.sousPrincipeIds.has(id) ? this.sousPrincipeIds.delete(id) : this.sousPrincipeIds.add(id);
  }

  libelleForme(code?: FormeExercice | null): string {
    return this.formes.find(f => f.code === code)?.libelle ?? 'Forme à choisir';
  }

  libelleType(): string {
    return this.types.find(t => t.code === this.form.type)?.libelle ?? '';
  }

  // ── Pédagogie ──────────────────────────────────────────────────────────

  choisirNiveau(code: NiveauObjectif): void {
    this.avance.niveauObjectif = this.avance.niveauObjectif === code ? null : code;
  }

  choisirEchelle(code: EchelleEffectif): void {
    this.avance.echelleEffectif = this.avance.echelleEffectif === code ? null : code;
  }

  valeurCarte(c: CarteTexte): string { return (this.avance[c.cle] as string | null) ?? ''; }

  saisirCarte(c: CarteTexte, v: string): void { this.avance[c.cle] = v; }

  carteOuverte(c: CarteTexte): boolean {
    return this.cartesOuvertes().has(c.cle) || !!this.valeurCarte(c);
  }

  basculerCarte(c: CarteTexte): void {
    // Une carte remplie ne se replie pas : masquer du texte saisi le ferait croire perdu.
    if (this.valeurCarte(c)) return;
    const s = new Set(this.cartesOuvertes());
    s.has(c.cle) ? s.delete(c.cle) : s.add(c.cle);
    this.cartesOuvertes.set(s);
  }

  /** Axes réellement dosés, du plus fort au plus faible — l'aperçu ne montre que ceux-là. */
  axesDoses(): AxeDominante[] {
    return (Object.keys(this.dosages) as AxeDominante[])
      .filter(k => this.dosages[k] > 0)
      .sort((a, b) => this.dosages[b] - this.dosages[a]);
  }

  libelleAxe(a: AxeDominante): string {
    return AXES_DOMINANTES.find(x => x.cle === a)?.court ?? a;
  }

  /** Résumé de la section repliée. null = rien à dire, on affiche l'invitation. */
  resumePedago(): string | null {
    const bits: string[] = [];
    if (this.avance.niveauObjectif) {
      bits.push(this.niveauxObjectif.find(n => n.code === this.avance.niveauObjectif)!.libelle);
    }
    const n = this.axesDoses().length;
    if (n > 0) bits.push(`${n} dominante${n > 1 ? 's' : ''}`);
    const remplies = this.cartes.filter(c => this.valeurCarte(c)).length;
    if (remplies > 0) bits.push(`${remplies} précision${remplies > 1 ? 's' : ''}`);
    return bits.length ? bits.join(' · ') : null;
  }

  // ── Organisation ───────────────────────────────────────────────────────

  nbJoueursDeduit(): number | null {
    const f = this.avance.formatJoueurs?.toLowerCase().trim();
    if (!f) return null;
    const nombres = (f.match(/\d+/g) ?? []).reduce((s, n) => s + Number(n), 0);
    const renforts = (f.match(/joker|gardien|\bgb\b/g) ?? []).length;
    const total = nombres + renforts;
    return total > 0 ? total : null;
  }

  formatJoueursChange(): void {
    if (this.nbJoueursManuel) return;
    this.avance.nbJoueursTotal = this.nbJoueursDeduit();
  }

  recalculerNbJoueurs(): void {
    this.nbJoueursManuel = false;
    this.avance.nbJoueursTotal = this.nbJoueursDeduit();
  }

  densite(): number | null {
    const a = this.avance;
    if (!a.terrainLongueurM || !a.terrainLargeurM || !a.nbJoueursTotal) return null;
    return Math.round((a.terrainLongueurM * a.terrainLargeurM / a.nbJoueursTotal) * 10) / 10;
  }

  resumeOrga(): string | null {
    const bits: string[] = [];
    const a = this.avance;
    if (a.terrainLongueurM && a.terrainLargeurM) bits.push(`${a.terrainLongueurM}×${a.terrainLargeurM} m`);
    if (a.nbJoueursTotal) bits.push(`${a.nbJoueursTotal} joueurs`);
    return bits.length ? bits.join(' · ') : null;
  }

  // ── Aperçu ─────────────────────────────────────────────────────────────

  readonly titreAffiche = computed(() => this.form.nom || 'Exercice sans nom');

  nbThemes(): number { return this.sousPrincipeIds.size; }

  /**
   * Une phrase, contextuelle, qui dit ce qui manque plutôt que d'énumérer des règles. Elle
   * remplace l'astérisque « champ obligatoire » : le nom suffit à enregistrer, tout le reste
   * s'ajoute plus tard.
   */
  conseil(): string {
    if (!this.form.nom) {
      return 'Commence par un nom : c’est le seul champ vraiment utile pour retrouver l’exercice.';
    }
    if (this.nbThemes() === 0) {
      return 'Ajoute 1 ou 2 thèmes de jeu : c’est ce qui rend l’exercice retrouvable dans la bibliothèque.';
    }
    if (this.peutAvance() && this.axesDoses().length === 0) {
      return 'Envie de préciser l’intention ? Les dominantes se dosent en un geste dans Pédagogie.';
    }
    return 'Belle fiche. Elle est prête à être piochée dans une séance.';
  }

  // ── Enregistrement ─────────────────────────────────────────────────────

  retour(): void {
    if (this.global()) { this.router.navigate(['/admin/exercices-globaux']); return; }
    this.router.navigate(['/planning-technique'], { queryParams: { section: 'exercices' } });
  }

  enregistrer(): void {
    if (!this.form.nom || this.enregistrement()) return;
    this.enregistrement.set(true);

    // Le bloc avancé part toujours quand l'utilisateur y a droit : les valeurs rechargées à
    // l'édition sont ainsi préservées même si la section est restée repliée.
    const avance: ExerciceAvance | null = this.peutAvance() ? {
      ...this.avance,
      dominanteTactiqueOrgIntensite: this.dosages.tactiqueOrg,
      dominanteTactiqueFoncIntensite: this.dosages.tactiqueFonc,
      dominanteMentalIntensite: this.dosages.mental,
      dominanteTechniqueIntensite: this.dosages.technique,
      dominanteAthletiqueIntensite: this.dosages.athletique,
      dominanteTactiqueOrg: this.notesDom.tactiqueOrg || null,
      dominanteTactiqueFonc: this.notesDom.tactiqueFonc || null,
      dominanteMental: this.notesDom.mental || null,
      dominanteTechnique: this.notesDom.technique || null,
      dominanteAthletique: this.notesDom.athletique || null,
    } : null;

    const req: ExerciceRequest = {
      ...this.form,
      sousPrincipeIds: [...this.sousPrincipeIds],
      avance,
      photoImportId: this.photoImportId ?? undefined,
    };

    const id = this.editionId();
    const obs = id
      ? this.service.modifierExercice(id, req)
      : (this.global() ? this.service.creerExerciceGlobal(req) : this.service.creerExercice(req));
    obs.subscribe({
      next: cree => {
        const schema = this.schemaImporte;
        this.schemaImporte = null;
        this.photoImportId = null;
        const fini = () => {
          this.enregistrement.set(false);
          this.snack.open(id ? 'Exercice enregistré' : 'Exercice créé', 'Fermer', { duration: 2500 });
          this.retour();
        };
        // Schéma détecté sur la photo : rattaché juste après la création.
        if (schema && !id) {
          this.service.sauverSchema(cree.id, schema).subscribe({ next: fini, error: fini });
        } else {
          fini();
        }
      },
      error: () => {
        this.enregistrement.set(false);
        this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 });
      },
    });
  }

  private vide(): ExerciceRequest {
    return {
      nom: '', forme: null, sousPrincipeIds: [], type: 'TECHNIQUE', dureeMinutes: null,
      objectif: '', intensite: null, description: '',
      distanceAttendueM: null, distanceHauteIntensiteM: null, nbSprints: null,
    };
  }
}
