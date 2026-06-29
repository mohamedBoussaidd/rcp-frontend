import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssiduiteJoueur } from './joueur.service';

/** Une ligne du tableau d'historique en mode Équipe : un entraînement + ses compteurs. */
export interface LigneHistoriqueSeance {
  seanceId: string;
  date: string;
  titre: string;
  type?: string | null;
  effectif: number;
  presents: number;
  blesses: number;
  absents: number;
  excuses: number;
  retards: number;
  dispo: number;
  declaresJoueur: number;
  taux: number;
}

/** Réponse de l'historique en mode Équipe : fenêtre résolue + lignes par séance. */
export interface HistoriqueEquipe {
  saisonId?: string | null;
  saisonLibelle?: string | null;
  du: string;
  au: string;
  seances: LigneHistoriqueSeance[];
}

/** Filtres communs de la page dédiée Présence (tous optionnels). */
export interface HistoriqueFiltre {
  saisonId?: string | null;
  du?: string | null;   // ISO yyyy-MM-dd (prioritaire sur la saison)
  au?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PresenceService {

  private http = inject(HttpClient);
  private readonly base = '/api/presence';

  /** Historique mode Équipe : une ligne par entraînement de la fenêtre. */
  historiqueEquipe(filtre: HistoriqueFiltre = {}): Observable<HistoriqueEquipe> {
    return this.http.get<HistoriqueEquipe>(`${this.base}/historique/equipe`, { params: this.params(filtre) });
  }

  /** Historique mode Joueur : bilan + événements d'un joueur sur la fenêtre. */
  historiqueJoueur(joueurId: string, filtre: HistoriqueFiltre = {}): Observable<AssiduiteJoueur> {
    return this.http.get<AssiduiteJoueur>(`${this.base}/historique/joueur`, {
      params: this.params(filtre).set('joueurId', joueurId),
    });
  }

  /** Construit les query params, en omettant les filtres vides. */
  private params(f: HistoriqueFiltre): HttpParams {
    let p = new HttpParams();
    if (f.saisonId) p = p.set('saisonId', f.saisonId);
    if (f.du) p = p.set('du', f.du);
    if (f.au) p = p.set('au', f.au);
    return p;
  }
}
