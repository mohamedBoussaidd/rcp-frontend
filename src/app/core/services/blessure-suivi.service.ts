import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BlessureNote {
  id: string;
  blessureId: string;
  date: string;
  texte: string;
  deposePar?: string;
  createdAt?: string;
}

export type StatutEtape = 'A_FAIRE' | 'EN_COURS' | 'VALIDEE';

export interface RtpEtape {
  id: string;
  blessureId: string;
  ordre: number;
  libelle: string;
  statut: StatutEtape;
  dateValidation?: string;
}

/** Suivi d'une blessure : journal d'évolution + protocole de retour au jeu (RTP). */
@Injectable({ providedIn: 'root' })
export class BlessureSuiviService {
  private readonly base = '/api/blessures';

  constructor(private http: HttpClient) {}

  // ── Journal ──
  listerNotes(blessureId: string): Observable<BlessureNote[]> {
    return this.http.get<BlessureNote[]>(`${this.base}/${blessureId}/notes`);
  }
  ajouterNote(blessureId: string, texte: string, date?: string): Observable<BlessureNote> {
    return this.http.post<BlessureNote>(`${this.base}/${blessureId}/notes`, { texte, date });
  }
  supprimerNote(blessureId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${blessureId}/notes/${noteId}`);
  }

  // ── Protocole RTP ──
  listerRtp(blessureId: string): Observable<RtpEtape[]> {
    return this.http.get<RtpEtape[]>(`${this.base}/${blessureId}/rtp`);
  }
  initialiserRtp(blessureId: string): Observable<RtpEtape[]> {
    return this.http.post<RtpEtape[]>(`${this.base}/${blessureId}/rtp`, {});
  }
  majEtape(blessureId: string, etapeId: string, statut: StatutEtape): Observable<RtpEtape> {
    return this.http.patch<RtpEtape>(`${this.base}/${blessureId}/rtp/${etapeId}`, { statut });
  }
  supprimerRtp(blessureId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${blessureId}/rtp`);
  }
}
