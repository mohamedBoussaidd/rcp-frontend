import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Exercice {
  id: string;
  nom: string;
  categorie?: string;
  dureeMinutes?: number;
  objectif?: string;
  intensite?: number;
  description?: string;
  schemaJson?: string;
  creeParId?: string;
  creeParNom?: string;
  equipeOrigineId?: string;
  equipeOrigineNom?: string;
  modifiable: boolean;
}

export interface ExerciceRequest {
  nom: string;
  categorie?: string;
  dureeMinutes?: number | null;
  objectif?: string;
  intensite?: number | null;
  description?: string;
}

export interface ExerciceLigne {
  exerciceId: string;
  nom: string;
  categorie?: string;
  dureeMinutes?: number;
  intensite?: number;
  objectif?: string;
  description?: string;
  schemaJson?: string;
  ordre: number;
}

export interface SeanceTechnique {
  id: string;
  equipeId: string;
  date: string;
  heureDebut?: string;
  titre?: string;
  objectif?: string;
  description?: string;
  statut: string;
  creeParNom?: string;
  dureeTotaleMinutes: number;
  intensiteMoyenne?: number;
  exercices: ExerciceLigne[];
}

export interface SeanceTechniqueRequest {
  date: string;
  heureDebut?: string | null;
  titre?: string;
  objectif?: string;
  description?: string;
  exerciceIds: string[];
}

export interface FormationCustom {
  id: string;
  nom: string;
  couleur?: string;
  positionsJson: string;
  creeParNom?: string;
  modifiable: boolean;
}

/** Schéma tactique de la bibliothèque (niveau club). */
export interface SchemaTactique {
  id: string;
  nom: string;
  categorie?: string;
  schemaJson: string;
  apercu?: string;
  creeParNom?: string;
  updatedAt: string;
  modifiable: boolean;
}

export interface SchemaTactiqueRequest {
  nom: string;
  categorie?: string;
  schemaJson: string;
  apercu?: string;
}

/** Section d'un plan de jeu (phase de jeu) : texte + éventuel schéma (copie). */
export interface SectionPlan {
  id: string;
  titre: string;
  texte?: string;
  schemaJson?: string;
  apercu?: string;
  ordre: number;
  updatedAt: string;
}

/** Plan de jeu (« document d'identité équipe »), unique par équipe. */
export interface PlanDeJeu {
  id: string;
  equipeId: string;
  modifiable: boolean;
  sections: SectionPlan[];
}

export interface SectionUpdateRequest {
  titre: string;
  texte?: string;
  schemaJson?: string;
  apercu?: string;
}

// ── Module Match (cycle de vie avant/après, niveau équipe) ──

/** Carte de match (liste). */
export interface MatchResume {
  id: string;
  adversaire: string;
  dateMatch?: string;
  competition?: string;
  domicile: boolean;
  resultat?: string;
  score?: string;
  gpsLie: boolean;
}

/** Schéma adverse attaché à un match (copie). */
export interface SchemaMatch {
  id: string;
  titre?: string;
  schemaJson: string;
  apercu?: string;
  ordre: number;
}

/** Statut d'un joueur dans la compo d'un match. */
export type CompoStatut = 'TITULAIRE' | 'REMPLACANT' | 'RESERVE' | 'REPOS' | 'SUSPENDU';

/** Placement d'un joueur dans la compo (x/y relatifs au terrain, utiles si titulaire). */
export interface CompoItem {
  joueurId: string;
  nom?: string;
  prenom?: string;
  postePrincipal?: string;
  x: number;
  y: number;
  statut: CompoStatut;
}

/** Joueur à surveiller pour un match (consigne de prépa). */
export type SurveilleCible = 'ADVERSE' | 'EQUIPE';
export interface Surveille {
  id: string;
  cible: SurveilleCible;
  joueurId?: string;
  nom?: string;
  note?: string;
}

/** Détail complet d'un match. */
export interface MatchDetail {
  id: string;
  equipeId: string;
  modifiable: boolean;
  adversaire: string;
  dateMatch?: string;
  competition?: string;
  domicile: boolean;
  consignes?: string;
  resultat?: string;
  score?: string;
  notesDebrief?: string;
  sessionGpsId?: string;
  schemas: SchemaMatch[];
  compo: CompoItem[];
  surveilles: Surveille[];
  updatedAt: string;
}

export interface MatchCreateRequest {
  adversaire: string;
  dateMatch?: string | null;
  competition?: string | null;
  domicile: boolean;
}

export interface MatchInfosRequest {
  adversaire: string;
  dateMatch?: string | null;
  competition?: string | null;
  domicile: boolean;
  consignes?: string | null;
}

export interface MatchDebriefRequest {
  resultat?: string | null;
  score?: string | null;
  notesDebrief?: string | null;
}

/** Option du sélecteur de session GPS (séance de l'équipe). */
export interface SessionGpsOption {
  id: string;
  date: string;
  libelle: string;
}

/** Récap des apparitions d'un joueur par statut sur tous les matchs de l'équipe. */
export interface JoueurCompoStats {
  joueurId: string;
  nom?: string;
  prenom?: string;
  postePrincipal?: string;
  titulaire: number;
  remplacant: number;
  reserve: number;
  repos: number;
  suspendu: number;
  total: number;
}

/** Charge GPS d'un joueur issue de la session liée. */
export interface ChargeJoueur {
  joueurId: string;
  nom: string;
  prenom: string;
  dureeMinutes?: number;
  distanceTotaleM?: number;
  distanceSprint24kmhM?: number;
  nbSprints24kmh?: number;
  vitesseMaxKmh?: number;
}

export const CATEGORIES_EXERCICE = [
  'echauffement', 'technique', 'tactique', 'conservation',
  'jeu_reduit', 'match_a_theme', 'finition', 'transition', 'coup_pied_arrete',
];

@Injectable({ providedIn: 'root' })
export class TechniqueService {

  constructor(private http: HttpClient) {}

  // ── Bibliotheque d'exercices ──
  listerExercices(): Observable<Exercice[]> {
    return this.http.get<Exercice[]>('/api/exercices');
  }
  creerExercice(req: ExerciceRequest): Observable<Exercice> {
    return this.http.post<Exercice>('/api/exercices', req);
  }
  modifierExercice(id: string, req: ExerciceRequest): Observable<Exercice> {
    return this.http.put<Exercice>(`/api/exercices/${id}`, req);
  }
  supprimerExercice(id: string): Observable<void> {
    return this.http.delete<void>(`/api/exercices/${id}`);
  }

  sauverSchema(exerciceId: string, schemaJson: string): Observable<Exercice> {
    return this.http.put<Exercice>(`/api/exercices/${exerciceId}/schema`, { schemaJson });
  }

  // ── Formations personnalisées ──
  listerFormations(): Observable<FormationCustom[]> {
    return this.http.get<FormationCustom[]>('/api/formations');
  }
  creerFormation(req: { nom: string; couleur?: string; positionsJson: string }): Observable<FormationCustom> {
    return this.http.post<FormationCustom>('/api/formations', req);
  }
  supprimerFormation(id: string): Observable<void> {
    return this.http.delete<void>(`/api/formations/${id}`);
  }

  // ── Bibliotheque de schemas tactiques (club) ──
  listerSchemas(): Observable<SchemaTactique[]> {
    return this.http.get<SchemaTactique[]>('/api/schemas');
  }
  creerSchema(req: SchemaTactiqueRequest): Observable<SchemaTactique> {
    return this.http.post<SchemaTactique>('/api/schemas', req);
  }
  modifierSchema(id: string, req: SchemaTactiqueRequest): Observable<SchemaTactique> {
    return this.http.put<SchemaTactique>(`/api/schemas/${id}`, req);
  }
  supprimerSchema(id: string): Observable<void> {
    return this.http.delete<void>(`/api/schemas/${id}`);
  }

  // ── Plan de jeu (document d'identite equipe) ──
  getPlanDeJeu(): Observable<PlanDeJeu> {
    return this.http.get<PlanDeJeu>('/api/plan-de-jeu');
  }
  ajouterSection(req: { titre: string; texte?: string }): Observable<SectionPlan> {
    return this.http.post<SectionPlan>('/api/plan-de-jeu/sections', req);
  }
  modifierSection(id: string, req: SectionUpdateRequest): Observable<SectionPlan> {
    return this.http.put<SectionPlan>(`/api/plan-de-jeu/sections/${id}`, req);
  }
  supprimerSection(id: string): Observable<void> {
    return this.http.delete<void>(`/api/plan-de-jeu/sections/${id}`);
  }
  reordonnerSections(ordreIds: string[]): Observable<PlanDeJeu> {
    return this.http.put<PlanDeJeu>('/api/plan-de-jeu/reordonner', { ordreIds });
  }

  // ── Module Match (cycle de vie avant/apres) ──
  listerMatchs(): Observable<MatchResume[]> {
    return this.http.get<MatchResume[]>('/api/matchs');
  }
  creerMatch(req: MatchCreateRequest): Observable<MatchDetail> {
    return this.http.post<MatchDetail>('/api/matchs', req);
  }
  getMatch(id: string): Observable<MatchDetail> {
    return this.http.get<MatchDetail>(`/api/matchs/${id}`);
  }
  modifierMatchInfos(id: string, req: MatchInfosRequest): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/infos`, req);
  }
  modifierMatchDebrief(id: string, req: MatchDebriefRequest): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/debrief`, req);
  }
  supprimerMatch(id: string): Observable<void> {
    return this.http.delete<void>(`/api/matchs/${id}`);
  }
  ajouterMatchSchema(id: string, req: { titre?: string; schemaJson: string; apercu?: string }): Observable<SchemaMatch> {
    return this.http.post<SchemaMatch>(`/api/matchs/${id}/schemas`, req);
  }
  modifierMatchSchema(schemaId: string, req: { titre?: string; schemaJson: string; apercu?: string }): Observable<SchemaMatch> {
    return this.http.put<SchemaMatch>(`/api/matchs/schemas/${schemaId}`, req);
  }
  supprimerMatchSchema(schemaId: string): Observable<void> {
    return this.http.delete<void>(`/api/matchs/schemas/${schemaId}`);
  }
  enregistrerCompo(id: string, placements: { joueurId: string; x: number; y: number; statut: CompoStatut }[]): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/compo`, { placements });
  }
  sessionsGps(): Observable<SessionGpsOption[]> {
    return this.http.get<SessionGpsOption[]>('/api/matchs/sessions-gps');
  }
  definirSessionGps(id: string, sessionGpsId: string | null): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/session-gps`, { sessionGpsId });
  }
  chargeGps(id: string): Observable<ChargeJoueur[]> {
    return this.http.get<ChargeJoueur[]>(`/api/matchs/${id}/charge-gps`);
  }
  statsCompo(): Observable<JoueurCompoStats[]> {
    return this.http.get<JoueurCompoStats[]>('/api/matchs/stats-compo');
  }
  joueursBlesses(): Observable<string[]> {
    return this.http.get<string[]>('/api/matchs/blesses');
  }
  ajouterSurveille(id: string, req: { cible: SurveilleCible; joueurId?: string | null; nom?: string | null; note?: string | null }): Observable<MatchDetail> {
    return this.http.post<MatchDetail>(`/api/matchs/${id}/surveilles`, req);
  }
  supprimerSurveille(surveilleId: string): Observable<MatchDetail> {
    return this.http.delete<MatchDetail>(`/api/matchs/surveilles/${surveilleId}`);
  }

  // ── Seances techniques ──
  listerSeances(debut?: string, fin?: string): Observable<SeanceTechnique[]> {
    let params = new HttpParams();
    if (debut) params = params.set('debut', debut);
    if (fin) params = params.set('fin', fin);
    return this.http.get<SeanceTechnique[]>('/api/seances-techniques', { params });
  }
  creerSeance(req: SeanceTechniqueRequest): Observable<SeanceTechnique> {
    return this.http.post<SeanceTechnique>('/api/seances-techniques', req);
  }
  modifierSeance(id: string, req: SeanceTechniqueRequest): Observable<SeanceTechnique> {
    return this.http.put<SeanceTechnique>(`/api/seances-techniques/${id}`, req);
  }
  realiserSeance(id: string): Observable<SeanceTechnique> {
    return this.http.patch<SeanceTechnique>(`/api/seances-techniques/${id}/realiser`, {});
  }
  supprimerSeance(id: string): Observable<void> {
    return this.http.delete<void>(`/api/seances-techniques/${id}`);
  }
}
