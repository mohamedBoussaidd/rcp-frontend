import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Issues possibles d'une gêne, quelle que soit sa source (ressenti du matin ou après-séance) :
 * ARCHIVEE (rien à faire), CONVERTIE (devient une blessure), MENAGEE (le joueur est aménagé sur
 * ses prochaines séances — seule issue qui redescend sur le terrain).
 */
export type ResolutionGene = 'ARCHIVEE' | 'CONVERTIE' | 'MENAGEE';

export interface Wellness {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  date: string;
  sommeil: number;
  fatigue: number;
  douleur: number;
  stress: number;
  humeur: number;
  scoreBienEtre: number;
  commentaire?: string;
  geneZone?: string;
  geneIntensite?: number;
  geneMoment?: string;
  geneTraitee?: boolean;
  /** Type de résolution une fois traitée : ARCHIVEE | CONVERTIE. */
  geneResolution?: ResolutionGene;
  geneTraiteeLe?: string;
}

export interface Rpe {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  seanceId: string;
  seanceType: 'PHYSIQUE' | 'TECHNIQUE';
  date: string;
  rpe: number;
  /** Durée RÉELLEMENT effectuée (base de la charge). */
  dureeMinutes?: number;
  charge?: number;
  /** Plaisir ressenti 1..10 — saisi en PWA depuis V91, ou importé du CSV (V69). */
  plaisir?: number;
  commentaire?: string;
  seanceTitre?: string;
  /** Durée planifiée : un écart avec `dureeMinutes` révèle une participation partielle. */
  dureePrevueMinutes?: number;
  geneZone?: string;
  geneIntensite?: number;
  geneMoment?: string;
  geneTraitee?: boolean;
  geneResolution?: ResolutionGene;
  geneTraiteeLe?: string;
}

/** Suivi subjectif (wellness + RPE) côté staff — lecture filtrée par équipe. */
@Injectable({ providedIn: 'root' })
export class SuiviSubjectifService {

  private http = inject(HttpClient);

  getWellness(joueurId?: string): Observable<Wellness[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<Wellness[]>('/api/wellness', { params });
  }

  getRpe(joueurId?: string): Observable<Rpe[]> {
    let params = new HttpParams();
    if (joueurId) params = params.set('joueurId', joueurId);
    return this.http.get<Rpe[]>('/api/rpe', { params });
  }

  /**
   * Marque la gêne d'une saisie comme traitée (staff médical / préparateur).
   * `resolution` = ARCHIVEE (archivage) ou CONVERTIE (convertie en blessure).
   */
  traiterGene(wellnessId: string, resolution: ResolutionGene = 'ARCHIVEE'): Observable<Wellness> {
    const params = new HttpParams().set('resolution', resolution);
    return this.http.patch<Wellness>(`/api/wellness/${wellnessId}/gene-traitee`, {}, { params });
  }

  /** Rouvre une gêne traitée (médical) : elle redevient active dans les alertes. */
  rouvrirGene(wellnessId: string): Observable<Wellness> {
    return this.http.patch<Wellness>(`/api/wellness/${wellnessId}/gene-rouvrir`, {});
  }

  /**
   * Traite la gêne déclarée dans un questionnaire POST-SÉANCE (V91). Depuis que la gêne peut
   * naître de deux sources, le staff doit pouvoir solder l'une comme l'autre — sans ça une
   * gêne d'entraînement resterait éternellement active dans les alertes.
   */
  traiterGeneRpe(rpeId: string, resolution: ResolutionGene = 'ARCHIVEE'): Observable<Rpe> {
    const params = new HttpParams().set('resolution', resolution);
    return this.http.patch<Rpe>(`/api/rpe/${rpeId}/gene-traitee`, {}, { params });
  }

  /** Rouvre une gêne post-séance traitée (médical). */
  rouvrirGeneRpe(rpeId: string): Observable<Rpe> {
    return this.http.patch<Rpe>(`/api/rpe/${rpeId}/gene-rouvrir`, {});
  }
}
