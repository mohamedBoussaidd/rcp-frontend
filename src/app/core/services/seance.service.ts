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
