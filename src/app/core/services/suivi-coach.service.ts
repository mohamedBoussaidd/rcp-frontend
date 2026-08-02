import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Relation entraîneur ↔ joueur (V98) : fil de vie, objectifs individuels, notes du staff.
 *
 * <p>Servi sous `/api/suivi-coach/**` et non sous `/api/joueurs/**` : ce préfixe est déjà gardé
 * par `joueurs:read`, qui aurait rendu la permission `suivi_coach:*` inopérante.
 */
export interface ObjectifJoueur {
  id: string;
  titre: string;
  description?: string | null;
  echeance?: string | null;
  statut: 'EN_COURS' | 'ATTEINT' | 'ABANDONNE';
  /** Échéance dépassée alors que l'objectif est toujours en cours. */
  enRetard: boolean;
  auteur?: string | null;
  creeLe?: string | null;
}

export interface NoteJoueur {
  id: string;
  texte: string;
  dateNote: string;
  auteur?: string | null;
}

export interface EvenementVie {
  date: string;
  type: 'BLESSURE' | 'RETOUR' | 'MATCH' | 'ENTRETIEN' | 'OBJECTIF' | 'NOTE';
  titre: string;
  detail?: string | null;
  ton: 'ok' | 'warn' | 'bad' | 'neutre';
}

export interface FilDeVie {
  joueurId: string;
  debut: string;
  fin: string;
  evenements: EvenementVie[];
}

@Injectable({ providedIn: 'root' })
export class SuiviCoachService {

  private http = inject(HttpClient);
  private base = '/api/suivi-coach';

  filDeVie(joueurId: string, depuis?: string): Observable<FilDeVie> {
    const q = depuis ? `?depuis=${depuis}` : '';
    return this.http.get<FilDeVie>(`${this.base}/joueurs/${joueurId}/fil-de-vie${q}`);
  }

  objectifs(joueurId: string): Observable<ObjectifJoueur[]> {
    return this.http.get<ObjectifJoueur[]>(`${this.base}/joueurs/${joueurId}/objectifs`);
  }

  creerObjectif(joueurId: string, req: { titre: string; description?: string | null; echeance?: string | null; statut?: string }): Observable<ObjectifJoueur> {
    return this.http.post<ObjectifJoueur>(`${this.base}/joueurs/${joueurId}/objectifs`, req);
  }

  modifierObjectif(objectifId: string, req: { titre: string; description?: string | null; echeance?: string | null; statut?: string }): Observable<ObjectifJoueur> {
    return this.http.put<ObjectifJoueur>(`${this.base}/objectifs/${objectifId}`, req);
  }

  supprimerObjectif(objectifId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/objectifs/${objectifId}`);
  }

  notes(joueurId: string): Observable<NoteJoueur[]> {
    return this.http.get<NoteJoueur[]>(`${this.base}/joueurs/${joueurId}/notes`);
  }

  creerNote(joueurId: string, req: { texte: string; dateNote?: string | null }): Observable<NoteJoueur> {
    return this.http.post<NoteJoueur>(`${this.base}/joueurs/${joueurId}/notes`, req);
  }

  supprimerNote(noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/notes/${noteId}`);
  }
}
