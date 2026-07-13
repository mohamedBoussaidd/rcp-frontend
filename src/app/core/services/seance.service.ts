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
}

// ── Préparation : exercices de la séance (référence + overrides) ──

/** Override d'une ligne d'exercice envoyé au serveur (null = valeur par défaut de l'exercice). */
export interface LigneExerciceRequest {
  exerciceId: string;
  dureeMinutes?: number | null;
  intensite?: number | null;
  distanceAttendueM?: number | null;
  distanceHauteIntensiteM?: number | null;
  nbSprints?: number | null;
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
