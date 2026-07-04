import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type CategorieAxe = 'TECHNIQUE' | 'TACTIQUE' | 'MENTAL' | 'PHYSIQUE';
export type StatutAxe = 'EN_COURS' | 'ACQUIS' | 'ABANDONNE';
export type TypeEntretien = 'VIDEO' | 'TERRAIN' | 'DISCUSSION';
export type Tendance = 'EN_PROGRES' | 'STAGNE' | 'REGRESSE';
/** Cycle de vie : rendez-vous à venir → compte-rendu. Seul REALISE alimente les agrégats. */
export type StatutEntretien = 'PLANIFIE' | 'REALISE';

export interface Axe {
  id: string;
  joueurId: string;
  libelle: string;
  categorie: CategorieAxe;
  statut: StatutAxe;
  nbEntretiens: number;
  derniereNote?: number | null;
  derniereTendance?: Tendance | null;
  derniereAutoEvalNote?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AxeRequest {
  libelle: string;
  categorie: CategorieAxe;
  statut?: StatutAxe;
}

export interface LigneAxeRequest {
  axeTravailId?: string | null;
  nouvelAxeLibelle?: string | null;
  nouvelAxeCategorie?: CategorieAxe | null;
  note?: number | null;
  tendance?: Tendance | null;
  commentaire?: string | null;
}

export interface LigneAxe {
  id: string;
  axeTravailId: string;
  axeLibelle?: string;
  categorie?: CategorieAxe;
  note?: number | null;
  tendance?: Tendance | null;
  commentaire?: string | null;
}

export interface Entretien {
  id: string;
  joueurId: string;
  type: TypeEntretien;
  dateEntretien: string;
  heure?: string | null;          // 'HH:mm:ss' — facultative (jour seul possible)
  statut: StatutEntretien;
  menePar?: string;
  meneParNom?: string | null;
  notes?: string | null;
  visibilite: 'STAFF' | 'PARTAGE_JOUEUR';
  partage: boolean;
  seanceId?: string | null;
  schemaTactiqueId?: string | null;
  videoUrl?: string | null;
  axes: LigneAxe[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EntretienRequest {
  joueurId: string;
  type: TypeEntretien;
  dateEntretien: string;
  statut?: StatutEntretien;       // absent = REALISE (flux compte-rendu historique)
  heure?: string | null;
  notes?: string | null;
  videoUrl?: string | null;
  seanceId?: string | null;
  schemaTactiqueId?: string | null;
  partager: boolean;
  axes: LigneAxeRequest[];
}

export interface VisibiliteResponse {
  id: string;
  visibilite: 'STAFF' | 'PARTAGE_JOUEUR';
  partage: boolean;
  notificationEnvoyee: boolean;
}

export interface SynthesePoint {
  date: string;
  note?: number | null;
  tendance?: Tendance | null;
}

export interface SyntheseAxe {
  axeId: string;
  libelle: string;
  categorie: CategorieAxe;
  statut: StatutAxe;
  nbEntretiens: number;
  serie: SynthesePoint[];
  derniereAutoEvalNote?: number | null;
  derniereAutoEvalDate?: string | null;
}

export interface Synthese {
  joueurId: string;
  axes: SyntheseAxe[];
}

export interface EquipeLigne {
  joueurId: string;
  nom: string;
  prenom: string;
  postePrincipal?: string | null;
  dernierEntretien?: string | null;
  prochainRdv?: string | null;    // date du prochain entretien PLANIFIE
  nb30j: number;
  nb90j: number;
  nbVideo: number;
  nbTerrain: number;
  nbDiscussion: number;
}

/** Événement « entretien » pour le calendrier (couche RDV). */
export interface AgendaEntretien {
  id: string;
  joueurId: string;
  joueurNom?: string | null;
  joueurPrenom?: string | null;
  type: TypeEntretien;
  dateEntretien: string;
  heure?: string | null;
  statut: StatutEntretien;
}

/** Suivi individuel & entretiens — côté staff. Les endpoints joueur vivent dans le service PWA. */
@Injectable({ providedIn: 'root' })
export class EntretienService {
  private http = inject(HttpClient);

  // ── Axes ──
  listerAxes(joueurId: string): Observable<Axe[]> {
    return this.http.get<Axe[]>('/api/axes', { params: new HttpParams().set('joueurId', joueurId) });
  }
  creerAxe(joueurId: string, req: AxeRequest): Observable<Axe> {
    return this.http.post<Axe>('/api/axes', req, { params: new HttpParams().set('joueurId', joueurId) });
  }
  modifierAxe(id: string, req: AxeRequest): Observable<Axe> {
    return this.http.put<Axe>(`/api/axes/${id}`, req);
  }
  supprimerAxe(id: string): Observable<void> {
    return this.http.delete<void>(`/api/axes/${id}`);
  }

  // ── Entretiens ──
  listerEntretiens(joueurId: string, type?: string, debut?: string, fin?: string): Observable<Entretien[]> {
    let params = new HttpParams().set('joueurId', joueurId);
    if (type) params = params.set('type', type);
    if (debut) params = params.set('debut', debut);
    if (fin) params = params.set('fin', fin);
    return this.http.get<Entretien[]>('/api/entretiens', { params });
  }
  synthese(joueurId: string): Observable<Synthese> {
    return this.http.get<Synthese>('/api/entretiens/synthese', { params: new HttpParams().set('joueurId', joueurId) });
  }
  vueEquipe(): Observable<EquipeLigne[]> {
    return this.http.get<EquipeLigne[]>('/api/entretiens/equipe');
  }
  /** Agenda calendrier : entretiens (RDV + comptes-rendus) de la période, portée équipe. */
  agenda(debut: string, fin: string): Observable<AgendaEntretien[]> {
    return this.http.get<AgendaEntretien[]>('/api/entretiens/agenda',
      { params: new HttpParams().set('debut', debut).set('fin', fin) });
  }
  creerEntretien(req: EntretienRequest): Observable<Entretien> {
    return this.http.post<Entretien>('/api/entretiens', req);
  }
  modifierEntretien(id: string, req: EntretienRequest): Observable<Entretien> {
    return this.http.put<Entretien>(`/api/entretiens/${id}`, req);
  }
  supprimerEntretien(id: string): Observable<void> {
    return this.http.delete<void>(`/api/entretiens/${id}`);
  }
  basculerVisibilite(id: string): Observable<VisibiliteResponse> {
    return this.http.patch<VisibiliteResponse>(`/api/entretiens/${id}/visibilite`, {});
  }
}
