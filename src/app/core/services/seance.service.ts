import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

export interface TypeSeance {
  id: string;
  code: string;
  libelle: string;
  intensiteTheorique?: number;
  dureeTheoriqueMin?: number;
  objectifPrincipal?: string;
  // Cibles d'équipe par défaut (propres au club actif) — pré-remplissent le formulaire
  objectifDistanceM?: number;
  objectifDistanceHauteIntensiteM?: number;
  objectifIntensite?: number;
}

/** Cibles paramétrables d'un type de séance (club actif). */
export interface CiblesTypeRequest {
  objectifDistanceM?: number | null;
  objectifDistanceHauteIntensiteM?: number | null;
  objectifIntensite?: number | null;
}

export interface Seance {
  id: string;
  date: string;
  titre?: string;
  statut: 'PLANIFIEE' | 'REALISEE' | 'ANNULEE';
  typeSeance: TypeSeance;
  heureDebut?: string;
  dureeMinutes?: number;
  terrain?: string;
  conditionsMeteo?: string;
  temperature?: number;
  adversaire?: string;
  competition?: string;
  domicileExterieur?: 'DOMICILE' | 'EXTERIEUR';
  scoreMatch?: string;
  description?: string;
  // Nom de l'encadrant en charge (affiché en vue Liste)
  responsable?: string;
  // Objectif d'équipe (préparation) — pré-rempli par Σ exercices physiques, modifiable
  objectif?: string;
  objectifDistanceM?: number;
  objectifIntensite?: number;
  objectifDistanceHauteIntensiteM?: number;
  // ── Mode avancé (module seance_avancee), tout optionnel ──
  dureeEffectiveMinutes?: number;
  objTactiqueOrg?: string;
  objTactiqueFonc?: string;
  objMental?: string;
  objTechnique?: string;
  objAthletique?: string;
}

// ── Préparation : exercices de la séance (référence + overrides) ──

/** Override d'une ligne d'exercice envoyé au serveur (null = valeur par défaut de l'exercice).
 *  `blocIndex` (mode avancé) : index du bloc dans le même payload, null = hors bloc. */
export interface LigneExerciceRequest {
  exerciceId: string;
  dureeMinutes?: number | null;
  intensite?: number | null;
  distanceAttendueM?: number | null;
  distanceHauteIntensiteM?: number | null;
  nbSprints?: number | null;
  blocIndex?: number | null;
}

/** Ligne d'exercice telle qu'affichée : valeurs effectives (override sinon défaut) + libellés. */
export interface ExerciceLigneSeance {
  exerciceId: string;
  nom: string;
  categorie?: string;
  type?: string;
  ordre: number;
  dureeMinutes?: number;
  intensite?: number;
  objectif?: string;
  description?: string;
  schemaJson?: string;
  distanceAttendueM?: number;
  distanceHauteIntensiteM?: number;
  nbSprints?: number;
  blocId?: string | null;
}

// ── Mode avancé : blocs, groupes, référentiels ──

/** `role`/`equipe` départagent les homonymes (un compte staff par équipe). `equipe` null = club seul. */
export interface StaffRef { id: string; nom: string; role?: string | null; equipe?: string | null; }
export interface JoueurRefSeance { id: string; nom: string; prenom?: string; }

export interface BlocSeanceDto {
  id: string;
  ordre: number;
  libelle: string;
  sequencage?: string;
  dureeMinutes?: number;
  zoneTerrain?: string;
  staff: StaffRef[];
}

/** Groupe du jour stocké (COULEUR / LIBRE). `blocId` null = toute la séance. */
export interface GroupeSeanceDto {
  id: string;
  blocId?: string | null;
  type: 'COULEUR' | 'LIBRE';
  libelle: string;
  couleur?: string;
  ordre: number;
  joueurs: JoueurRefSeance[];
}

export interface BlocRequest {
  libelle: string;
  sequencage?: string | null;
  dureeMinutes?: number | null;
  zoneTerrain?: string | null;
  staffIds: string[];
}

export interface GroupeRequest {
  blocIndex?: number | null;
  type: 'COULEUR' | 'LIBRE';
  libelle: string;
  couleur?: string | null;
  joueurIds: string[];
}

/** Remplacement complet du contenu avancé (PUT /contenu, module seance_avancee). */
export interface ContenuAvanceRequest {
  blocs: BlocRequest[];
  exercices: LigneExerciceRequest[];
  groupes: GroupeRequest[];
  dominanteIds: string[];
  sousPrincipeIds: string[];
}

/** Contenu d'une séance : exercices + agrégats (servent à pré-remplir l'objectif d'équipe). */
export interface ContenuSeance {
  seanceId: string;
  exercices: ExerciceLigneSeance[];
  dureeTotaleMinutes: number;
  intensiteMoyenne?: number;
  distanceTotaleAttendueM?: number;
  distanceHauteIntensiteTotaleM?: number;
  nbSprintsTotal?: number;
  blocs: BlocSeanceDto[];
  groupes: GroupeSeanceDto[];
  dominanteIds: string[];
  sousPrincipeIds: string[];
}

// ── Référentiels du mode avancé (globaux, seedés V61) ──

export interface RefDominante { id: string; code: string; libelle: string; famille: 'SEANCE' | 'ATHLETIQUE'; ordre: number; }
export interface RefSousPrincipe { id: string; code: string; libelle: string; phase: 'OFF' | 'DEF' | 'T_OD' | 'T_DO' | 'CPA_OFF' | 'CPA_DEF'; ordre: number; }
export interface ReferentielsSeance { dominantes: RefDominante[]; sousPrincipes: RefSousPrincipe[]; }

// ── Fiche séance (résumé), périodisation, groupes auto ──

export interface Perimatch {
  jRelatif?: number | null;
  libelle?: string | null;
  dateMatch?: string | null;
  adversaire?: string | null;
  scoreMatch?: string | null;
  prochain: boolean;
}

export interface GroupesAuto {
  blesses: JoueurRefSeance[];
  reathletisation: JoueurRefSeance[];
  disponibles: JoueurRefSeance[];
}

export interface RefItem { code: string; libelle: string; groupe: string; }

export interface BlocResume { bloc: BlocSeanceDto; exercices: ExerciceLigneSeance[]; }

export interface ResumeSeance {
  seanceId: string;
  titre?: string;
  statut: string;
  date: string;
  heureDebut?: string;
  dureeMinutes?: number;
  dureeEffectiveMinutes?: number;
  terrain?: string;
  responsable?: string;
  typeCode?: string;
  typeLibelle?: string;
  equipeNom?: string;
  perimatch: Perimatch;
  dominantes: RefItem[];
  sousPrincipes: RefItem[];
  objectifs: { tactiqueOrg?: string; tactiqueFonc?: string; mental?: string; technique?: string; athletique?: string };
  objectifDistanceM?: number;
  objectifDistanceHauteIntensiteM?: number;
  objectifIntensite?: number;
  blocs: BlocResume[];
  exercicesSansBloc: ExerciceLigneSeance[];
  groupes: GroupeSeanceDto[];
  groupesAuto: GroupesAuto;
  absents: JoueurRefSeance[];
}

// ── Fiche séance version joueur (filtrée serveur, /api/moi) ──

export interface ExerciceJoueurFiche { nom: string; dureeMinutes?: number; schemaJson?: string; }

export interface BlocJoueurFiche {
  libelle: string;
  sequencage?: string;
  dureeMinutes?: number;
  zoneTerrain?: string;
  exercices: ExerciceJoueurFiche[];
}

export interface MonGroupeFiche { libelle: string; couleur?: string; blocLibelle?: string; coequipiers: string[]; }

export interface FicheSeanceJoueur {
  seanceId: string;
  titre?: string;
  date: string;
  heureDebut?: string;
  dureeMinutes?: number;
  terrain?: string;
  typeLibelle?: string;
  blocs: BlocJoueurFiche[];
  exercicesSansBloc: ExerciceJoueurFiche[];
  mesGroupes: MonGroupeFiche[];
}

// ── Présence ──
export type StatutPresence = 'PRESENT' | 'ABSENT' | 'EXCUSE' | 'RETARD';

export interface LignePresence {
  joueurId: string;
  prenom: string;
  nom: string;
  poste?: string;
  statut: StatutPresence | null;
  note?: string;
  /** Dérivé du statut médical : le joueur est blessé (affiché à part, non compté en absence). */
  blesse?: boolean;
  /** Origine de la saisie : 'STAFF' (appel) ou 'JOUEUR' (auto-déclaration PWA), null si non renseigné. */
  source?: 'STAFF' | 'JOUEUR' | null;
}

export interface FeuillePresence {
  seanceId: string;
  lignes: LignePresence[];
}

/** Résumé chiffré de l'appel d'une séance (dashboard / pastille « X/Y dispo »). */
export interface ResumeAppel {
  seanceId: string;
  effectif: number;
  presents: number;
  blesses: number;
  absents: number;
  excuses: number;
  retards: number;
  dispo: number;
}

export interface SeanceCreate {
  date: string;
  titre?: string;
  statut?: string;
  typeSeance: { id: string };
  heureDebut?: string;
  dureeMinutes: number;
  terrain?: string;
  conditionsMeteo?: string;
  temperature?: number;
  adversaire?: string;
  competition?: string;
  domicileExterieur?: string;
  description?: string;
  raisonEcartDuree?: string;
  responsable?: string;
  // Objectif d'équipe (préparation)
  objectif?: string;
  objectifDistanceM?: number;
  objectifIntensite?: number;
  objectifDistanceHauteIntensiteM?: number;
}

@Injectable({ providedIn: 'root' })
export class SeanceService {

  private readonly base = '/api/seances';
  private readonly baseTypes = '/api/type-seances';

  private http = inject(HttpClient);

  getAll(): Observable<Seance[]> {
    return this.http.get<Seance[]>(this.base);
  }

  getSemaine(debut: string, fin: string): Observable<Seance[]> {
    return this.http.get<Seance[]>(`${this.base}?debut=${debut}&fin=${fin}`);
  }

  create(seance: SeanceCreate): Observable<Seance> {
    return this.http.post<Seance>(this.base, seance);
  }

  update(id: string, patch: Partial<Seance>): Observable<Seance> {
    return this.http.put<Seance>(`${this.base}/${id}`, patch);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  marquerRealisee(id: string): Observable<Seance> {
    return this.http.patch<Seance>(`${this.base}/${id}/realiser`, {});
  }

  /** Retour arrière : repasse une séance réalisée en planifiée (409 si données GPS attachées). */
  annulerRealisation(id: string): Observable<Seance> {
    return this.http.patch<Seance>(`${this.base}/${id}/devalider`, {});
  }

  getTypeSeances(): Observable<TypeSeance[]> {
    return this.http.get<TypeSeance[]>(this.baseTypes);
  }

  /** Paramètre les cibles d'un type de séance pour le club actif. */
  setCiblesType(typeId: string, req: CiblesTypeRequest): Observable<TypeSeance> {
    return this.http.put<TypeSeance>(`${this.baseTypes}/${typeId}/cibles`, req);
  }

  // ── Préparation : exercices de la séance ──
  getContenu(seanceId: string): Observable<ContenuSeance> {
    return this.http.get<ContenuSeance>(`${this.base}/${seanceId}/exercices`);
  }

  remplacerExercices(seanceId: string, exercices: LigneExerciceRequest[]): Observable<ContenuSeance> {
    return this.http.put<ContenuSeance>(`${this.base}/${seanceId}/exercices`, { exercices });
  }

  // ── Mode avancé : contenu complet, fiche, périodisation, groupes ──

  /** Remplacement complet du contenu avancé (blocs + lignes + groupes + référentiels). */
  remplacerContenuAvance(seanceId: string, req: ContenuAvanceRequest): Observable<ContenuSeance> {
    return this.http.put<ContenuSeance>(`${this.base}/${seanceId}/contenu`, req);
  }

  getResume(seanceId: string): Observable<ResumeSeance> {
    return this.http.get<ResumeSeance>(`${this.base}/${seanceId}/resume`);
  }

  /** Badge J±X pour une équipe et une date (fenêtre ±10 j sur les matchs du calendrier). */
  getPerimatch(equipeId: string, date: string): Observable<Perimatch> {
    return this.http.get<Perimatch>(`${this.base}/perimatch`, { params: { equipeId, date } });
  }

  /** Groupes calculés (blessés / réathlétisation / disponibles) pour l'onglet Effectifs. */
  getGroupesAuto(equipeId: string): Observable<GroupesAuto> {
    return this.http.get<GroupesAuto>(`${this.base}/groupes-auto`, { params: { equipeId } });
  }

  /** Comptes staff du club (sélecteur d'affectation des blocs). */
  getStaffClub(): Observable<StaffRef[]> {
    return this.http.get<StaffRef[]>(`${this.base}/staff-club`);
  }

  /** Notifie le staff de l'équipe (in-app + push) avec un lien vers la fiche. */
  partagerAuStaff(seanceId: string): Observable<{ notifies: number }> {
    return this.http.post<{ notifies: number }>(`${this.base}/${seanceId}/partage-staff`, {});
  }

  getReferentielsSeanceAvancee(): Observable<ReferentielsSeance> {
    return this.http.get<ReferentielsSeance>('/api/referentiels/seance-avancee');
  }

  // ── Présence ──
  getFeuille(seanceId: string): Observable<FeuillePresence> {
    return this.http.get<FeuillePresence>(`${this.base}/${seanceId}/presence`);
  }

  /** Résumés d'appel (effectif/dispo/présents…) de plusieurs séances, pour le dashboard. */
  getResumes(seanceIds: string[]): Observable<ResumeAppel[]> {
    if (!seanceIds.length) return of([]);
    return this.http.get<ResumeAppel[]>(`${this.base}/presence/resumes`, { params: { ids: seanceIds.join(',') } });
  }

  savePresenceJoueur(seanceId: string, joueurId: string, statut: StatutPresence, note?: string): Observable<LignePresence> {
    return this.http.put<LignePresence>(`${this.base}/${seanceId}/presence/${joueurId}`, { statut, note });
  }

  saveFeuille(seanceId: string, lignes: { joueurId: string; statut: StatutPresence; note?: string }[]): Observable<FeuillePresence> {
    return this.http.put<FeuillePresence>(`${this.base}/${seanceId}/presence`, { lignes });
  }

  getDonneesGps(seanceId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${seanceId}/donnees`);
  }

  /**
   * Import GPS flexible : fichier (.xlsx/.csv) OU texte collé. Sans mappings, le back applique
   * le profil reconnu (statut PRET) ou renvoie colonnes + suggestions (statut MAPPING_REQUIS) ;
   * avec mappings (écran validé), il convertit et peut enregistrer le profil du club.
   */
  analyserImport(opts: AnalyseImportOptions): Observable<AnalyseImportResponse> {
    const form = new FormData();
    if (opts.file) form.append('file', opts.file);
    if (opts.texte) form.append('texte', opts.texte);
    form.append('seanceId', opts.seanceId);
    if (opts.mappings) form.append('mappings', JSON.stringify(opts.mappings));
    if (opts.formatIdentite) form.append('formatIdentite', opts.formatIdentite);
    if (opts.enregistrerProfil) form.append('enregistrerProfil', 'true');
    if (opts.nomProfil) form.append('nomProfil', opts.nomProfil);
    return this.http.post<AnalyseImportResponse>('/api/import/analyser', form);
  }

  confirmerImport(body: ConfirmerImportRequest): Observable<ResultatImport> {
    return this.http.post<ResultatImport>('/api/import/confirmer', body);
  }

  getProfilsImport(seanceId: string): Observable<ProfilImport[]> {
    return this.http.get<ProfilImport[]>('/api/import/profils', { params: { seanceId } });
  }
}

// ── Import GPS flexible ──

export type MetriqueImport =
  'IDENTITE' | 'DATE_SEANCE' | 'DUREE' | 'DISTANCE_TOTALE' |
  'DISTANCE_Z15' | 'DISTANCE_Z19' | 'DISTANCE_Z24' | 'DISTANCE_Z28' |
  'NB_SPRINTS' | 'VITESSE_MAX' | 'NB_ACCELERATIONS' | 'NB_FREINAGES' | 'RATIO_DISTANCE_MIN';

/** Association colonne du fichier (en-tête normalisé) → métrique interne. */
export interface MappingColonne {
  entete: string;
  metrique: MetriqueImport;
  facteur?: number;                              // multiplicateur d'unité (km→m : 1000)
  seuilReel?: number;                            // seuil réel du fichier (ex. 19.8)
  semantique?: 'CUMUL' | 'BANDE';                // BANDE = plage re-cumulée à la conversion
  formatDuree?: 'HMS' | 'MINUTES' | 'SECONDES';
}

export interface ColonneDetectee {
  entete: string;
  enteteNormalise: string;
  apercu: string[];
  suggestion?: MappingColonne;
}

export interface AvertissementImport {
  niveau: 'FICHIER' | 'COLONNE' | 'LIGNE';
  numeroLigne?: number;
  colonne?: string;
  message: string;
}

export interface JoueurInconnu {
  identiteFichier: string;
  prenomSuggere?: string;
  nomSuggere?: string;
}

export interface ProfilImport {
  id: string;
  nom: string;
  global: boolean;                               // profil fournisseur (lecture seule)
  formatIdentite: string;
  mappings: MappingColonne[];
}

export interface AnalyseImportOptions {
  seanceId: string;
  file?: File;
  texte?: string;
  mappings?: MappingColonne[];
  formatIdentite?: string;
  enregistrerProfil?: boolean;
  nomProfil?: string;
}

export interface LigneGpsImport {
  numeroLigne?: number;
  identiteFichier: string;
  joueurId?: string;
  joueurNomAffiche?: string;
  dureeMinutes?: number;
  distanceTotaleM?: number;
  distance15kmhM?: number;
  distance19kmhM?: number;
  distanceSprint24kmhM?: number;
  distanceSprint28kmhM?: number;
  nbSprints24kmh?: number;
  vitesseMaxKmh?: number;
  nbAccelerations?: number;
  nbFreinages?: number;
  ratioDistanceMin?: number;
}

export interface AnalyseImportResponse {
  statut: 'MAPPING_REQUIS' | 'PRET';
  seanceId: string;
  signatureEntetes?: string;
  formatIdentiteSuggere?: string;
  colonnes: ColonneDetectee[];
  profilsDisponibles: ProfilImport[];
  profilUtilise?: ProfilImport;
  lignes: LigneGpsImport[];
  avertissements: AvertissementImport[];
  joueursInconnus: JoueurInconnu[];
}

export interface ResolutionImport {
  identiteFichier: string;
  action: 'CREATE' | 'MERGE' | 'IGNORE';
  joueurExistantId?: string;
  prenom?: string;
  nom?: string;
  poste?: string;
}

export interface ConfirmerImportRequest {
  seanceId: string;
  resolutions: ResolutionImport[];
  lignes: LigneGpsImport[];
}

export interface ResultatImport {
  seanceId: string;
  inseres: number;
  ignores: number;
}
