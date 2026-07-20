import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Bloc (temps de séance) détecté sur la photo. */
export interface BlocExtrait {
  libelle: string;
  dureeMinutes?: number | null;
  sequencage?: string | null;
  consignes?: string | null;
}

/** Champs avancés détectés (alignés sur ExerciceAvance). */
export interface AvanceExtrait {
  formatJoueurs?: string | null;
  terrainLongueurM?: number | null;
  terrainLargeurM?: number | null;
  sequencage?: string | null;
  butSystemeMarque?: string | null;
  reglesJeu?: string | null;
  variablesPedagogiques?: string | null;
}

export interface TexteExtrait {
  type?: 'SEANCE' | 'EXERCICE' | null;
  titre?: string | null;
  description?: string | null;
  objectif?: string | null;
  dureeMinutes?: number | null;
  materiel?: string | null;
  blocs: BlocExtrait[];
  dominantes: string[];       // codes du référentiel (validés serveur)
  sousPrincipes: string[];
  avance?: AvanceExtrait | null;
}

/** Résultat d'analyse : contenu texte + schéma au format éditeur (chargeable tel quel). */
export interface ImportPhotoResultat {
  journalId: string;
  texte: TexteExtrait;
  schemaJson?: string | null;
  nbElements: number;
  nbTraces: number;
}

/**
 * Import d'une séance/exercice depuis une photo. Le front n'appelle JAMAIS l'API
 * Anthropic : il envoie la photo au backend Java qui fait l'appel vision et
 * renvoie le contenu extrait, validé et converti.
 */
@Injectable({ providedIn: 'root' })
export class ImportPhotoService {

  private http = inject(HttpClient);

  analyser(photo: File): Observable<ImportPhotoResultat> {
    const form = new FormData();
    form.append('photo', photo);
    return this.http.post<ImportPhotoResultat>('/api/import-photo', form);
  }

  urlPhoto(journalId: string): string {
    return `/api/import-photo/${journalId}/photo`;
  }
}
