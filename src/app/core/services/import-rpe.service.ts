import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AvertissementImport, JoueurInconnu, ResolutionImport } from '@core/services/seance.service';

/** Une ligne du fichier RPE post-séance, convertie et appariée à une fiche. */
export interface LigneRpeImport {
  numeroLigne?: number;
  identiteFichier: string;
  joueurId?: string;
  joueurNomAffiche?: string;
  rpe?: number;
  plaisir?: number;
  dureeMinutes?: number;
  /** sRPE = rpe × durée (aperçu). */
  charge?: number;
  repondu: boolean;
}

export interface AnalyseImportRpeResponse {
  statut: 'PRET';
  seanceId: string;
  dureeSeance?: number;
  lignes: LigneRpeImport[];
  avertissements: AvertissementImport[];
  joueursInconnus: JoueurInconnu[];
  nbRepondants: number;
  nbSansReponse: number;
}

export interface ConfirmerImportRpeRequest {
  seanceId: string;
  resolutions: ResolutionImport[];
  lignes: LigneRpeImport[];
}

export interface ResultatImportRpe {
  seanceId: string;
  inseres: number;
  ignores: number;
}

/**
 * Import du RPE/ressenti post-séance (fichier questionnaire). Deux temps calqués sur l'import GPS
 * mais SANS mapping (format fixe, colonnes détectées par en-tête) : analyser → confirmer.
 */
@Injectable({ providedIn: 'root' })
export class ImportRpeService {
  private http = inject(HttpClient);

  analyser(opts: { seanceId: string; file?: File; texte?: string }): Observable<AnalyseImportRpeResponse> {
    const form = new FormData();
    if (opts.file) form.append('file', opts.file);
    if (opts.texte) form.append('texte', opts.texte);
    form.append('seanceId', opts.seanceId);
    return this.http.post<AnalyseImportRpeResponse>('/api/import-rpe/analyser', form);
  }

  confirmer(body: ConfirmerImportRpeRequest): Observable<ResultatImportRpe> {
    return this.http.post<ResultatImportRpe>('/api/import-rpe/confirmer', body);
  }
}
