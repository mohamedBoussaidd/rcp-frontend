import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NiveauEnvoi } from './notification-chat.service';

export interface NotifConfig {
  seuilAcwrHaut: number; seuilAcwrBas: number; seuilReadinessMin: number;
  seuilWellnessFatigue: number; seuilWellnessDouleur: number; seuilWellnessStress: number;
  seuilWellnessSommeil: number; seuilWellnessHumeur: number;
  seuilPoidsCourt: number; seuilPoidsMoyen: number; seuilCompletionMin: number;
  digestActif: boolean; digestMatinHeure: string; digestSoirHeure: string;
  digestJours: string; digestPoidsJours: string;
  rappelWellnessActif: boolean; rappelWellnessHeure: string; rappelWellnessJours: string;
  rappelRpeActif: boolean; rappelRpeDelaiHeures: number;
  rappelSeanceActif: boolean;
}

export interface Routage { type: string; roles: string; actif: boolean; }
export interface DroitEnvoi { joueurId: string; joueurNom: string; niveau: NiveauEnvoi; }
export interface Preference {
  type: string; categorie: string; actif: boolean;
  verrouilleParStaff: boolean; modifiable: boolean;
}

export interface LigneJoueur { joueurId: string; nom: string; actifs: Record<string, boolean>; }
export interface EquipeMatrice { types: string[]; joueurs: LigneJoueur[]; }

/** Configuration des notifications (staff) + préférences (soi-même / joueur ciblé). */
@Injectable({ providedIn: 'root' })
export class NotificationConfigService {

  private http = inject(HttpClient);
  private readonly base = '/api/notifications';

  // ── Config équipe ──
  getConfig(): Observable<NotifConfig> { return this.http.get<NotifConfig>(`${this.base}/config`); }
  updateConfig(c: NotifConfig): Observable<NotifConfig> { return this.http.put<NotifConfig>(`${this.base}/config`, c); }

  getRoutage(): Observable<Routage[]> { return this.http.get<Routage[]>(`${this.base}/routage`); }
  updateRoutage(r: Routage[]): Observable<Routage[]> { return this.http.put<Routage[]>(`${this.base}/routage`, r); }

  getDroits(): Observable<DroitEnvoi[]> { return this.http.get<DroitEnvoi[]>(`${this.base}/droits`); }
  setDroit(joueurId: string, niveau: NiveauEnvoi): Observable<DroitEnvoi> {
    return this.http.put<DroitEnvoi>(`${this.base}/droits/${joueurId}`, { niveau });
  }

  // ── Préférences ──
  mesPreferences(): Observable<Preference[]> { return this.http.get<Preference[]>(`${this.base}/preferences/me`); }
  majMaPreference(type: string, actif: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/preferences/me`, { type, actif });
  }
  preferencesJoueur(joueurId: string): Observable<Preference[]> {
    return this.http.get<Preference[]>(`${this.base}/preferences/joueur/${joueurId}`);
  }
  majPreferenceJoueur(joueurId: string, type: string, actif: boolean, verrouilleParStaff: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/preferences/joueur/${joueurId}`, { type, actif, verrouilleParStaff });
  }

  // ── Matrice « par joueur » ──
  getMatrice(): Observable<EquipeMatrice> {
    return this.http.get<EquipeMatrice>(`${this.base}/preferences/equipe`);
  }
  setTypeEquipe(type: string, actif: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/preferences/equipe/type`, { type, actif });
  }
}
