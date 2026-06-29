import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type PeriodeType = 'PREPARATION' | 'COMPETITION' | 'TREVE' | 'REPRISE' | 'INTERSAISON';
export type StatutSaison = 'PREPARATION' | 'EN_COURS' | 'CLOTUREE';

export interface Periode {
  id?: string;
  type: PeriodeType;
  libelle?: string | null;
  dateDebut: string;   // ISO yyyy-MM-dd
  dateFin: string;
  ordre: number;
}

export interface Saison {
  id: string;
  clubId: string;
  /** Équipe à laquelle se rapportent périodes/effectif (null si non résolue). */
  equipeId?: string | null;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutSaison;
  periodeCourante?: Periode | null;
  periodes: Periode[];
  effectifCount: number;
}

export interface SaisonRequest {
  libelle: string;
  dateDebut: string;
  dateFin: string;
  statut?: StatutSaison;
  genererPeriodes: boolean;
}

export interface EffectifMembre {
  joueurId: string;
  nom: string;
  prenom: string;
  poste?: string | null;
  statut?: string | null;
  numeroMaillot?: number | null;
  dateEntree?: string | null;
  dateSortie?: string | null;
}

export interface ReconductionLigne {
  joueurId: string;
  nom: string;
  prenom: string;
  poste?: string | null;
  suggerer: boolean;
  blesse: boolean;
}

export interface ReconductionProposition {
  saisonPrecedenteId?: string | null;
  saisonPrecedenteLibelle?: string | null;
  lignes: ReconductionLigne[];
}

export interface ReconductionResultat {
  effectif: EffectifMembre[];
  comptesDesactives: number;
  comptesReactives: number;
}

export interface BilanSaison {
  saisonId: string;
  libelle: string;
  statut: StatutSaison;
  dateDebut: string;
  dateFin: string;
  jours: number;
  effectifCount: number;
  nbSeances: number;
  nbBlessures: number;
}

@Injectable({ providedIn: 'root' })
export class SaisonService {

  private readonly base = '/api/saisons';
  private http = inject(HttpClient);

  getAll(): Observable<Saison[]> {
    return this.http.get<Saison[]>(this.base);
  }

  /** Saison EN_COURS de l'équipe active + période courante (bandeau dashboard). */
  getCourante(): Observable<Saison | null> {
    return this.http.get<Saison | null>(`${this.base}/courante`);
  }

  get(id: string): Observable<Saison> {
    return this.http.get<Saison>(`${this.base}/${id}`);
  }

  ouvrir(req: SaisonRequest): Observable<Saison> {
    return this.http.post<Saison>(this.base, req);
  }

  update(id: string, req: SaisonRequest): Observable<Saison> {
    return this.http.put<Saison>(`${this.base}/${id}`, req);
  }

  cloturer(id: string): Observable<Saison> {
    return this.http.post<Saison>(`${this.base}/${id}/cloturer`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  genererPeriodes(id: string): Observable<Saison> {
    return this.http.post<Saison>(`${this.base}/${id}/periodes/defaut`, {});
  }

  remplacerPeriodes(id: string, periodes: Periode[]): Observable<Saison> {
    return this.http.put<Saison>(`${this.base}/${id}/periodes`, { periodes });
  }

  getEffectif(id: string): Observable<EffectifMembre[]> {
    return this.http.get<EffectifMembre[]>(`${this.base}/${id}/effectif`);
  }

  definirEffectif(id: string, joueurIds: string[]): Observable<EffectifMembre[]> {
    return this.http.put<EffectifMembre[]>(`${this.base}/${id}/effectif`, { joueurIds });
  }

  getReconduction(id: string): Observable<ReconductionProposition> {
    return this.http.get<ReconductionProposition>(`${this.base}/${id}/reconduction`);
  }

  appliquerReconduction(id: string, joueurIds: string[]): Observable<ReconductionResultat> {
    return this.http.post<ReconductionResultat>(`${this.base}/${id}/reconduction`, { joueurIds });
  }

  getBilan(id: string): Observable<BilanSaison> {
    return this.http.get<BilanSaison>(`${this.base}/${id}/bilan`);
  }
}
