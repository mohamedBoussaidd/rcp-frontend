import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Joueur, GpsPoint } from './joueur.service';
import { Blessure } from './blessure.service';
import { Seance, ContenuSeance, FicheSeanceJoueur, StatutPresence, LignePresence } from './seance.service';
import { Conseil } from './conseil.service';

/** Ce que le joueur a déjà déclaré pour une séance (pré-remplissage des boutons PWA). */
export interface MaDeclaration {
  seanceId: string;
  statut: StatutPresence;
  note?: string;
}

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

// ── Matchs partagés (lecture seule, vue joueur) ──
export interface MatchJoueurResume {
  id: string;
  adversaire: string;
  dateMatch?: string;
  heureMatch?: string;
  competition?: string;
  domicile: boolean;
  monStatut?: string | null;   // null = non convoqué
}

export interface CompoItemJoueur {
  joueurId: string;
  nom?: string;
  prenom?: string;
  postePrincipal?: string;
  x: number;
  y: number;
  statut: 'TITULAIRE' | 'REMPLACANT' | 'RESERVE' | 'REPOS' | 'SUSPENDU';
  consigne?: string | null;
}

export interface NomJoueur {
  joueurId: string;
  nom?: string;
  prenom?: string;
  postePrincipal?: string;
}

export interface SchemaMatchJoueur {
  id: string;
  titre?: string;
  schemaJson: string;
  apercu?: string;
  ordre: number;
}

export interface SurveilleJoueur {
  id: string;
  cible: 'ADVERSE' | 'EQUIPE';
  joueurId?: string;
  nom?: string;
  note?: string;
}

export interface MatchJoueurDetail {
  id: string;
  adversaire: string;
  monEquipeNom?: string;
  dateMatch?: string;
  heureMatch?: string;
  competition?: string;
  domicile: boolean;
  lieuRdv?: string;
  heureRdv?: string;
  couleurMaillot?: string;
  infosLogistiques?: string;
  consignes?: string;
  monStatut?: string | null;
  maConsigne?: string | null;
  compoVisible: boolean;
  compo: CompoItemJoueur[];
  nonConvoques: NomJoueur[];
  schemas: SchemaMatchJoueur[];
  surveilles: SurveilleJoueur[];
}

@Injectable({ providedIn: 'root' })
export class EspaceJoueurService {
  private readonly base = '/api/moi';

  private http = inject(HttpClient);

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

  /** Fiche séance version joueur, filtrée serveur : déroulé (blocs + schémas) + MON groupe.
   *  Jamais d'objectifs pédagogiques, dominantes, projet de jeu ni affectation staff. */
  getFicheSeance(seanceId: string): Observable<FicheSeanceJoueur> {
    return this.http.get<FicheSeanceJoueur>(`${this.base}/seances/${seanceId}/fiche`);
  }

  // ── Présence (auto-déclaration) ──
  /** Mes déclarations déjà saisies, pour pré-remplir les boutons. */
  getMesDeclarations(): Observable<MaDeclaration[]> {
    return this.http.get<MaDeclaration[]>(`${this.base}/presences`);
  }

  /** Je me déclare présent/absent pour une séance (+ commentaire optionnel). */
  declarerPresence(seanceId: string, statut: StatutPresence, commentaire?: string): Observable<LignePresence> {
    return this.http.post<LignePresence>(`${this.base}/seances/${seanceId}/presence`, { statut, commentaire });
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

  // ── Conseils du staff (lecture) ──
  getConseils(): Observable<Conseil[]> {
    return this.http.get<Conseil[]>(`${this.base}/conseils`);
  }

  // ── Matchs partagés (lecture seule) ──
  getMatchs(): Observable<MatchJoueurResume[]> {
    return this.http.get<MatchJoueurResume[]>(`${this.base}/matchs`);
  }
  getMatchDetail(id: string): Observable<MatchJoueurDetail> {
    return this.http.get<MatchJoueurDetail>(`${this.base}/matchs/${id}`);
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
