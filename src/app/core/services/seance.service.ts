import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
}

export interface FeuillePresence {
  seanceId: string;
  lignes: LignePresence[];
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

  constructor(private http: HttpClient) {}

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

  savePresenceJoueur(seanceId: string, joueurId: string, statut: StatutPresence, note?: string): Observable<LignePresence> {
    return this.http.put<LignePresence>(`${this.base}/${seanceId}/presence/${joueurId}`, { statut, note });
  }

  saveFeuille(seanceId: string, lignes: { joueurId: string; statut: StatutPresence; note?: string }[]): Observable<FeuillePresence> {
    return this.http.put<FeuillePresence>(`${this.base}/${seanceId}/presence`, { lignes });
  }

  getDonneesGps(seanceId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${seanceId}/donnees`);
  }

  uploadExcel(file: File, date: string, typeSeance: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    form.append('date', date);
    form.append('typeSeance', typeSeance);
    return this.http.post<any>('/api/import/excel', form);
  }

  uploadExcelBySeance(file: File, seanceId: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    form.append('seanceId', seanceId);
    return this.http.post<any>('/api/import/excel', form);
  }

  analyserExcel(file: File, seanceId: string): Observable<AnalyseImportResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('seanceId', seanceId);
    return this.http.post<AnalyseImportResponse>('/api/import/excel/analyser', form);
  }

  confirmerImport(body: ConfirmerImportRequest): Observable<ResultatImport> {
    return this.http.post<ResultatImport>('/api/import/excel/confirmer', body);
  }
}

export interface LigneGpsImport {
  prenomFichier: string;
  joueurId?: string;
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
  seanceId: string;
  lignes: LigneGpsImport[];
  joueursInconnus: string[];
}

export interface ResolutionImport {
  prenomFichier: string;
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
