import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AvertissementImport, JoueurInconnu, ResolutionImport } from '@core/services/seance.service';

/**
 * Une ligne de l'export « playermonitoring » (ressenti quotidien / Hooper), déjà CONVERTIE à la
 * convention de l'app (1 = bon → 10 = mauvais) et appariée à une fiche. Les valeurs portées ici
 * sont celles qui seront écrites en base.
 */
export interface LigneHooperImport {
  numeroLigne?: number;
  identiteFichier: string;
  joueurId?: string;
  joueurNomAffiche?: string;
  /** Date du ressenti (issue de « Date de la séance »). */
  date?: string;
  sommeil?: number;
  fatigue?: number;
  douleur?: number;
  stress?: number;
  humeur?: number;
  geneZone?: string;
  geneIntensite?: number;
  repondu: boolean;
}

export interface AnalyseImportHooperResponse {
  statut: 'PRET';
  equipeId: string;
  lignes: LigneHooperImport[];
  avertissements: AvertissementImport[];
  joueursInconnus: JoueurInconnu[];
  nbRepondants: number;
  nbSansReponse: number;
}

export interface ConfirmerImportHooperRequest {
  equipeId: string;
  resolutions: ResolutionImport[];
  lignes: LigneHooperImport[];
}

export interface ResultatImportHooper {
  equipeId: string;
  inseres: number;
  ignores: number;
}

/**
 * Import du ressenti quotidien (indice de Hooper) depuis un export « playermonitoring ». Deux temps
 * calqués sur l'import RPE mais clé = équipe + date du fichier (pas de séance) : analyser → confirmer.
 */
@Injectable({ providedIn: 'root' })
export class ImportHooperService {
  private http = inject(HttpClient);

  analyser(opts: { equipeId: string; file?: File; texte?: string }): Observable<AnalyseImportHooperResponse> {
    const form = new FormData();
    if (opts.file) form.append('file', opts.file);
    if (opts.texte) form.append('texte', opts.texte);
    form.append('equipeId', opts.equipeId);
    return this.http.post<AnalyseImportHooperResponse>('/api/import-hooper/analyser', form);
  }

  confirmer(body: ConfirmerImportHooperRequest): Observable<ResultatImportHooper> {
    return this.http.post<ResultatImportHooper>('/api/import-hooper/confirmer', body);
  }
}
