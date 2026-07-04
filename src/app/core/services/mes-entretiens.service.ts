import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgendaEntretien, CategorieAxe, LigneAxe, StatutAxe, Tendance, TypeEntretien } from './entretien.service';

export interface MonAxe {
  id: string;
  libelle: string;
  categorie: CategorieAxe;
  statut: StatutAxe;
  derniereNoteStaff?: number | null;
  derniereTendanceStaff?: Tendance | null;
  maDerniereAutoEvalNote?: number | null;
  maDerniereAutoEvalDate?: string | null;
}

export interface MonEntretien {
  id: string;
  type: TypeEntretien;
  dateEntretien: string;
  notes?: string | null;
  videoUrl?: string | null;
  axes: LigneAxe[];
}

export interface AutoEval {
  id: string;
  axeTravailId: string;
  note: number;
  commentaire?: string | null;
  createdAt: string;
}

export interface AutoEvalRequest {
  axeTravailId: string;
  note: number;
  commentaire?: string | null;
}

/** Suivi individuel côté joueur (PWA) — endpoints self-scope sous /api/moi. */
@Injectable({ providedIn: 'root' })
export class MesEntretiensService {
  private http = inject(HttpClient);

  mesAxes(): Observable<MonAxe[]> {
    return this.http.get<MonAxe[]>('/api/moi/axes');
  }
  mesEntretiens(): Observable<MonEntretien[]> {
    return this.http.get<MonEntretien[]>('/api/moi/entretiens');
  }
  /** Mes rendez-vous d'entretien PLANIFIE de la période (type/date/heure — jamais les notes). */
  monAgenda(debut: string, fin: string): Observable<AgendaEntretien[]> {
    return this.http.get<AgendaEntretien[]>('/api/moi/entretiens/agenda',
      { params: new HttpParams().set('debut', debut).set('fin', fin) });
  }
  mesAutoEvaluations(): Observable<AutoEval[]> {
    return this.http.get<AutoEval[]>('/api/moi/auto-evaluations');
  }
  autoEvaluer(req: AutoEvalRequest): Observable<AutoEval> {
    return this.http.post<AutoEval>('/api/moi/auto-evaluations', req);
  }
}
