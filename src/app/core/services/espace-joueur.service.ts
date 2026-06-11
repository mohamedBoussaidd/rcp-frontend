import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Joueur, GpsPoint } from './joueur.service';
import { Blessure } from './blessure.service';
import { Seance, ContenuSeance } from './seance.service';

export interface MaPesee {
  date: string;
  poids: number;
  commentaire?: string;
}

export interface RtpEtape {
  id: string;
  blessureId: string;
  ordre: number;
  libelle: string;
  statut: 'A_FAIRE' | 'EN_COURS' | 'VALIDEE';
  dateValidation?: string;
}

export interface Wellness {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  date: string;
  sommeil: number;
  fatigue: number;
  douleur: number;
  stress: number;
  humeur: number;
  scoreBienEtre: number;
  commentaire?: string;
  geneZone?: string;
  geneIntensite?: number;
  geneMoment?: string;
  createdAt?: string;
}

export interface WellnessRequest {
  date?: string;
  sommeil: number;
  fatigue: number;
  douleur: number;
  stress: number;
  humeur: number;
  commentaire?: string;
  geneZone?: string | null;
  geneIntensite?: number | null;
  geneMoment?: string | null;
}

export interface Rpe {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  seanceId: string;
  seanceType: 'PHYSIQUE' | 'TECHNIQUE';
  date: string;
  rpe: number;
  dureeMinutes?: number;
  charge?: number;
  commentaire?: string;
  createdAt?: string;
}

export interface RpeRequest {
  seanceId: string;
  seanceType: 'PHYSIQUE' | 'TECHNIQUE';
  rpe: number;
  dureeMinutes?: number;
  commentaire?: string;
}

export interface DocumentMedical {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  nomOriginal: string;
  typeMime: string;
  tailleOctets: number;
  categorie: string;
  description?: string;
  partageRoles: string[];
  dateDepot: string;
}

@Injectable({ providedIn: 'root' })
export class EspaceJoueurService {
  private readonly base = '/api/moi';

  constructor(private http: HttpClient) {}

  getProfil(): Observable<Joueur> {
    return this.http.get<Joueur>(`${this.base}/profil`);
  }

  getPesees(): Observable<MaPesee[]> {
    return this.http.get<MaPesee[]>(`${this.base}/pesees`);
  }

  getBlessures(): Observable<Blessure[]> {
    return this.http.get<Blessure[]>(`${this.base}/blessures`);
  }

  /** Protocole de reprise (RTP) d'une de mes blessures — lecture seule. */
  getEtapesRtp(blessureId: string): Observable<RtpEtape[]> {
    return this.http.get<RtpEtape[]>(`${this.base}/blessures/${blessureId}/rtp`);
  }

  getGps(): Observable<GpsPoint[]> {
    return this.http.get<GpsPoint[]>(`${this.base}/gps`);
  }

  /** Séances de mon équipe (lecture seule). Avec période : vue calendrier. */
  getSeances(debut?: string, fin?: string): Observable<Seance[]> {
    const q = debut && fin ? `?debut=${debut}&fin=${fin}` : '';
    return this.http.get<Seance[]>(`${this.base}/seances${q}`);
  }

  /** Contenu (exercices + schémas) d'une séance de mon équipe (lecture seule). */
  getContenuSeance(seanceId: string): Observable<ContenuSeance> {
    return this.http.get<ContenuSeance>(`${this.base}/seances/${seanceId}/exercices`);
  }

  // ── Wellness (ressenti quotidien) ──
  getWellness(): Observable<Wellness[]> {
    return this.http.get<Wellness[]>(`${this.base}/wellness`);
  }
  saisirWellness(req: WellnessRequest): Observable<Wellness> {
    return this.http.post<Wellness>(`${this.base}/wellness`, req);
  }

  // ── RPE de séance ──
  getRpe(): Observable<Rpe[]> {
    return this.http.get<Rpe[]>(`${this.base}/rpe`);
  }
  saisirRpe(req: RpeRequest): Observable<Rpe> {
    return this.http.post<Rpe>(`${this.base}/rpe`, req);
  }

  // ── Documents médicaux ──
  getDocumentsMedicaux(): Observable<DocumentMedical[]> {
    return this.http.get<DocumentMedical[]>(`${this.base}/documents-medicaux`);
  }

  /** Dépose un document : fichier + catégorie + description ? + rôles de partage. */
  deposerDocumentMedical(fichier: File, categorie: string, description: string, partageRoles: string[]): Observable<DocumentMedical> {
    const form = new FormData();
    form.append('fichier', fichier);
    form.append('categorie', categorie);
    if (description) form.append('description', description);
    for (const r of partageRoles) form.append('partageRoles', r);
    return this.http.post<DocumentMedical>(`${this.base}/documents-medicaux`, form);
  }

  telechargerDocumentMedical(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents-medicaux/${id}/fichier`, { responseType: 'blob' });
  }

  modifierPartageDocument(id: string, partageRoles: string[]): Observable<DocumentMedical> {
    return this.http.patch<DocumentMedical>(`${this.base}/documents-medicaux/${id}/partage`, { partageRoles });
  }

  supprimerDocumentMedical(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents-medicaux/${id}`);
  }
}
