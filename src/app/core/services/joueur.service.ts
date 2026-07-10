import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

export interface VitesseJoueur {
  joueurId: string;
  vmaxKmh: number | null;
  vmoyKmh: number | null;
}

export interface GpsPoint {
  seanceId: string;
  date: string;
  typeCode: string;
  typeLibelle: string;
  dureeMinutes: number | null;
  distanceTotaleM: number | null;
  distance15kmhM: number | null;
  distance19kmhM: number | null;
  distanceSprint24kmhM: number | null;
  distanceSprint28kmhM: number | null;
  nbSprints24kmh: number | null;
  vitesseMaxKmh: number | null;
  nbAccelerations: number | null;
  nbFreinages: number | null;
  ratioDistanceMin: number | null;
  conditionsMeteo: string | null;
  temperature: number | null;
}

export interface Joueur {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance?: string;
  sexe?: string;
  poidsActuel?: number;
  poidsFormeCible?: number;
  taille?: number;
  piedFort?: string;
  postePrincipal?: string;
  posteSecondaire?: string;
  profilAthletique?: string;
  statut: string;
  dateArriveeClub?: string;
  clubId?: string | null;
}

/** Référence d'équipe pour l'annuaire. */
export interface EquipeRef { id: string; nom: string; }

/** Ligne d'annuaire club : personne + ses équipes (effectif EN_COURS). `assigne=false` → pool. */
export interface AnnuaireJoueur {
  joueurId: string;
  nom: string;
  prenom: string;
  poste?: string | null;
  equipes: EquipeRef[];
  assigne: boolean;
}

/** Un événement d'assiduité (absence/excuse/retard passé). */
export interface EvenementAssiduite {
  seanceId: string;
  date: string;
  titre: string;
  statut: 'PRESENT' | 'ABSENT' | 'EXCUSE' | 'RETARD';
  note?: string;
  source?: string;
}

/** Résumé léger d'assiduité par joueur (colonne triable de l'effectif). */
export interface AssiduiteResume {
  joueurId: string;
  taux: number;
  absents: number;
  retards: number;
  excuses: number;
  recents: number;
}

/** Bilan d'assiduité d'un joueur sur la saison active (entraînements). */
export interface AssiduiteJoueur {
  joueurId: string;
  saisonId?: string;
  saisonLibelle?: string;
  nbSeances: number;
  presents: number;
  absents: number;
  excuses: number;
  retards: number;
  taux: number;
  recents: number;
  historique: EvenementAssiduite[];
}

@Injectable({
  providedIn: 'root'
})
export class JoueurService {

  private http = inject(HttpClient);

  private readonly base = '/api/joueurs';

  getAll(): Observable<Joueur[]> {
    return this.http.get<Joueur[]>(this.base);
  }

  getById(id: string): Observable<Joueur> {
    return this.http.get<Joueur>(`${this.base}/${id}`);
  }

  /** Crée une fiche. `equipeId` (optionnel) inscrit la personne à l'effectif de la saison EN_COURS. */
  create(joueur: Partial<Joueur>, equipeId?: string | null): Observable<Joueur> {
    let params = new HttpParams();
    if (equipeId) params = params.set('equipeId', equipeId);
    return this.http.post<Joueur>(this.base, joueur, { params });
  }

  update(id: string, joueur: Partial<Joueur>): Observable<Joueur> {
    return this.http.put<Joueur>(`${this.base}/${id}`, joueur);
  }

  getAllPourSuppression(): Observable<Joueur[]> {
    return this.http.get<Joueur[]>(`${this.base}/tous`);
  }

  /** Annuaire club : toutes les personnes + leurs équipes (effectif EN_COURS) + pool des non-assignés. */
  getAnnuaire(): Observable<AnnuaireJoueur[]> {
    return this.http.get<AnnuaireJoueur[]>(`${this.base}/annuaire`);
  }

  /** Assigne une personne à l'effectif d'une équipe (saison EN_COURS). */
  assigner(joueurId: string, equipeId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${joueurId}/equipes/${equipeId}`, {});
  }

  /** Retire une personne de l'effectif d'une équipe (saison EN_COURS). */
  desassigner(joueurId: string, equipeId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${joueurId}/equipes/${equipeId}`);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getHistoriqueGps(id: string): Observable<GpsPoint[]> {
    return this.http.get<GpsPoint[]>(`${this.base}/${id}/gps`);
  }

  /** Bilan d'assiduité du joueur (entraînements de la saison active) : taux, compteurs, historique. */
  getAssiduite(id: string): Observable<AssiduiteJoueur> {
    return this.http.get<AssiduiteJoueur>(`${this.base}/${id}/assiduite`);
  }

  /** Assiduité (résumé léger) de tout l'effectif du périmètre, pour la colonne triable. */
  getAssiduiteEquipe(): Observable<AssiduiteResume[]> {
    return this.http.get<AssiduiteResume[]>(`${this.base}/assiduite-equipe`);
  }

  /** Fiche vitesse (vmax/vmoy km/h) des joueurs de l'équipe. Mise en cache (1 appel réseau). */
  private vitesses$?: Observable<VitesseJoueur[]>;
  getVitesses(): Observable<VitesseJoueur[]> {
    if (!this.vitesses$) {
      this.vitesses$ = this.http.get<VitesseJoueur[]>(`${this.base}/vitesses`).pipe(shareReplay(1));
    }
    return this.vitesses$;
  }
}
