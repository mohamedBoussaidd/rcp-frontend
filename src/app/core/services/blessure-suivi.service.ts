import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProtocoleModele } from './protocole-modele.service';

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
  jDebut?: number;
  jFin?: number;
  description?: string;
}

/** Suivi d'une blessure : journal d'évolution + protocole de retour au jeu (RTP). */
@Injectable({ providedIn: 'root' })
export class BlessureSuiviService {
  private http = inject(HttpClient);
  private readonly base = '/api/blessures';

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
  /** Modèle suggéré selon type/zone/gravité (204 → null si aucun modèle éligible). */
  suggestion(blessureId: string): Observable<ProtocoleModele | null> {
    return this.http.get<ProtocoleModele | null>(`${this.base}/${blessureId}/rtp/suggestion`);
  }
  /** Initialise en clonant le modèle choisi (sans modeleId : le modèle suggéré côté back). */
  initialiserRtp(blessureId: string, modeleId?: string): Observable<RtpEtape[]> {
    const params = modeleId ? `?modeleId=${modeleId}` : '';
    return this.http.post<RtpEtape[]>(`${this.base}/${blessureId}/rtp${params}`, {});
  }
  ajouterEtape(blessureId: string, etape: { libelle: string; jDebut?: number | null; jFin?: number | null; description?: string | null }): Observable<RtpEtape> {
    return this.http.post<RtpEtape>(`${this.base}/${blessureId}/rtp/etapes`, etape);
  }
  /** Édition partielle : statut et/ou contenu (chaque champ absent = inchangé). */
  modifierEtape(blessureId: string, etapeId: string,
                maj: { statut?: StatutEtape; libelle?: string; jDebut?: number | null; jFin?: number | null; description?: string | null }): Observable<RtpEtape> {
    return this.http.patch<RtpEtape>(`${this.base}/${blessureId}/rtp/${etapeId}`, maj);
  }
  majEtape(blessureId: string, etapeId: string, statut: StatutEtape): Observable<RtpEtape> {
    return this.modifierEtape(blessureId, etapeId, { statut });
  }
  supprimerEtape(blessureId: string, etapeId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${blessureId}/rtp/${etapeId}`);
  }
  reordonner(blessureId: string, etapeIds: string[]): Observable<RtpEtape[]> {
    return this.http.put<RtpEtape[]>(`${this.base}/${blessureId}/rtp/ordre`, { etapeIds });
  }
  /** Capitalise le protocole en cours en nouveau modèle du club (critères pré-remplis). */
  enregistrerCommeModele(blessureId: string, nom: string, description?: string): Observable<ProtocoleModele> {
    return this.http.post<ProtocoleModele>(`${this.base}/${blessureId}/rtp/enregistrer-modele`, { nom, description });
  }
  supprimerRtp(blessureId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${blessureId}/rtp`);
  }
}
