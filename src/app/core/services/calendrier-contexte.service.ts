import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/** Un jour de la période : le ressenti y est-il attendu, et combien l'ont rempli ? */
export interface JourRessenti {
  date: string;
  wellnessAttendu: boolean;
  saisis: number;
  effectif: number;
  /** Vrai si le joueur connecté a rempli ce jour-là (toujours faux côté staff). */
  moiFait: boolean;
}

/** Retours sRPE agrégés d'une séance (pastille de sa carte). */
export interface SeanceRessenti {
  seanceId: string;
  nbReponses: number;
  rpeMoyen?: number;
  chargeMoyenne?: number;
  nbGenes: number;
  nbPartiels: number;
  moiFait: boolean;
}

/** Anniversaire : jour et mois seulement — ni date de naissance ni âge ne circulent. */
export interface Anniversaire {
  personneId: string;
  nom: string;
  prenom: string;
  jour: number;
  mois: number;
  staff: boolean;
}

export interface ContexteCalendrier {
  jours: JourRessenti[];
  seances: SeanceRessenti[];
  anniversaires: Anniversaire[];
}

const VIDE: ContexteCalendrier = { jours: [], seances: [], anniversaires: [] };

/**
 * Couche « contexte » affichée par-dessus le calendrier. UN appel par période — les lectures
 * existantes (`/api/wellness`, `/api/rpe`) renvoient tout l'historique sans filtre de dates et
 * ne peuvent pas servir un calendrier.
 *
 * Best-effort par construction : un module inactif ou une permission manquante donne 403, et le
 * calendrier doit continuer d'afficher ses séances sans couche de contexte plutôt que d'échouer.
 */
@Injectable({ providedIn: 'root' })
export class CalendrierContexteService {

  private http = inject(HttpClient);

  /** Vue staff : agrégats d'équipe. */
  contexte(debut: string, fin: string): Observable<ContexteCalendrier> {
    return this.charger('/api/calendrier/contexte', debut, fin);
  }

  /** Vue joueur : son propre état de remplissage. */
  monContexte(debut: string, fin: string): Observable<ContexteCalendrier> {
    return this.charger('/api/moi/calendrier/contexte', debut, fin);
  }

  private charger(url: string, debut: string, fin: string): Observable<ContexteCalendrier> {
    const params = new HttpParams().set('debut', debut).set('fin', fin);
    return this.http.get<ContexteCalendrier>(url, { params }).pipe(catchError(() => of(VIDE)));
  }
}
