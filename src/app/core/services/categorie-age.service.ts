import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CategorieAge {
  id: string;
  code: string;
  libelle: string;
  ageMin?: number | null;
  ageMax?: number | null;
  ordre: number;
  actif: boolean;
}

export interface CategorieAgeRequest {
  code: string;
  libelle: string;
  ageMin?: number | null;
  ageMax?: number | null;
  ordre?: number | null;
  actif?: boolean | null;
}

/**
 * Catégories d'âge configurables par club (Paramètres). Les bornes sont exprimées en ÂGE
 * ATTEINT DANS LA SAISON (pas en année de naissance) — pas de retouche nécessaire chaque saison.
 */
@Injectable({ providedIn: 'root' })
export class CategorieAgeService {
  private http = inject(HttpClient);

  lister(): Observable<CategorieAge[]> {
    return this.http.get<CategorieAge[]>('/api/categories-age');
  }
  creer(req: CategorieAgeRequest): Observable<CategorieAge> {
    return this.http.post<CategorieAge>('/api/categories-age', req);
  }
  modifier(id: string, req: CategorieAgeRequest): Observable<CategorieAge> {
    return this.http.put<CategorieAge>(`/api/categories-age/${id}`, req);
  }
}
