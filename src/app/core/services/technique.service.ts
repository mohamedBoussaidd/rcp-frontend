import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Type de contenu d'un exercice (porte ou non des attentes physiques). */
export type TypeExercice = 'PHYSIQUE' | 'TECHNIQUE' | 'MIXTE';

/** Niveau d'objectif pédagogique (mode avancé, fiche OL). */
export type NiveauObjectif =
  'TEMPS_DE_JEU' | 'PRINCIPE_ACTION' | 'REGLE_ACTION_COLLECTIVE' | 'REGLE_ACTION_INDIVIDUELLE' | 'MOYEN';

/** Échelle d'effectif concernée par l'objectif (mode avancé). */
export type EchelleEffectif = 'COLLECTIF' | 'INTERSECTORIEL' | 'SECTORIEL' | 'GROUPAL' | 'INDIVIDUEL';

/**
 * Champs du mode avancé d'un exercice (module seance_avancee) : cadre pédagogique +
 * organisation. Envoyés/appliqués seulement si l'utilisateur a `seance_avancee:access`.
 * La densité m²/joueur n'est JAMAIS stockée : calculée depuis dimensions ÷ nb joueurs.
 */
export interface ExerciceAvance {
  // V65 : `contextePedagogique` a rejoint la séance (il décrit un moment, pas un exercice de
  // bibliothèque) et `sequencage` a rejoint le bloc (paramètre d'exécution du jour).
  niveauObjectif?: NiveauObjectif | null;
  echelleEffectif?: EchelleEffectif | null;
  // V68 : chaque axe se DOSE de 0 à 5 (0 = non travaillé). Le texte `dominante*` associé n'est
  // plus qu'une note facultative qui précise l'axe — il ne le porte plus à lui seul.
  dominanteTactiqueOrgIntensite?: number | null;
  dominanteTactiqueFoncIntensite?: number | null;
  dominanteMentalIntensite?: number | null;
  dominanteTechniqueIntensite?: number | null;
  dominanteAthletiqueIntensite?: number | null;
  dominanteTactiqueOrg?: string | null;
  dominanteTactiqueFonc?: string | null;
  dominanteMental?: string | null;
  dominanteTechnique?: string | null;
  dominanteAthletique?: string | null;
  /** V65 : règles ET système de marque (« 1 but = 1 pt » est une règle). */
  reglesJeu?: string | null;
  variablesPedagogiques?: string | null;
  reperesPerceptifs?: string | null;
  comportementsAttendus?: string | null;
  terrainLongueurM?: number | null;
  terrainLargeurM?: number | null;
  formatJoueurs?: string | null;
  /** Pré-rempli depuis `formatJoueurs`, corrigeable à la main. */
  nbJoueursTotal?: number | null;
}

export interface Exercice {
  id: string;
  nom: string;
  /** V65 : forme de travail — remplace `categorie`, qui mélangeait forme, moment et thème. */
  forme?: FormeExercice | null;
  /** V65 : thèmes de jeu, pris dans le MÊME référentiel de sous-principes que la séance. */
  sousPrincipeIds?: string[];
  type?: TypeExercice;
  dureeMinutes?: number;
  objectif?: string;
  intensite?: number;
  description?: string;
  schemaJson?: string;
  // Attentes physiques (optionnelles, PHYSIQUE/MIXTE)
  distanceAttendueM?: number;
  distanceHauteIntensiteM?: number;
  nbSprints?: number;
  creeParId?: string;
  creeParNom?: string;
  equipeOrigineId?: string;
  equipeOrigineNom?: string;
  modifiable: boolean;
  avance?: ExerciceAvance;
}

export interface ExerciceRequest {
  nom: string;
  forme?: FormeExercice | null;
  sousPrincipeIds?: string[];
  type?: TypeExercice;
  dureeMinutes?: number | null;
  objectif?: string;
  intensite?: number | null;
  description?: string;
  distanceAttendueM?: number | null;
  distanceHauteIntensiteM?: number | null;
  nbSprints?: number | null;
  avance?: ExerciceAvance | null;
  /** Import photo d'origine (pièce jointe), posé à la création depuis une photo. */
  photoImportId?: string;
}

export interface ExerciceLigne {
  exerciceId: string;
  nom: string;
  forme?: FormeExercice | null;
  dureeMinutes?: number;
  intensite?: number;
  objectif?: string;
  description?: string;
  schemaJson?: string;
  ordre: number;
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
  /** Schéma FOURNI : posé par le super-admin, commun à tous les clubs, copiable mais pas éditable. */
  fourni: boolean;
}

export interface SchemaTactiqueRequest {
  nom: string;
  categorie?: string;
  schemaJson: string;
  apercu?: string;
  /** Crée un schéma fourni (global). Ignoré côté serveur si l'appelant n'est pas super-admin. */
  fourni?: boolean;
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
  publie: boolean;
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
  consigne?: string | null;
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
  heureMatch?: string;
  competition?: string;
  domicile: boolean;
  consignes?: string;
  lieuRdv?: string;
  heureRdv?: string;
  couleurMaillot?: string;
  infosLogistiques?: string;
  publie: boolean;
  publieAt?: string;
  compoVisible: boolean;
  resultat?: string;
  score?: string;
  notesDebrief?: string;
  sessionGpsId?: string;
  profilAdverseId?: string;
  schemas: SchemaMatch[];
  compo: CompoItem[];
  surveilles: Surveille[];
  suspendus: string[];
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
  heureMatch?: string | null;
  competition?: string | null;
  domicile: boolean;
  consignes?: string | null;
  lieuRdv?: string | null;
  heureRdv?: string | null;
  couleurMaillot?: string | null;
  infosLogistiques?: string | null;
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

/**
 * Forme de travail (V65). L'ancienne liste `CATEGORIES_EXERCICE` mélangeait trois natures :
 * un moment de séance (échauffement), des formes de travail (jeu réduit, match à thème) et des
 * thèmes de jeu (conservation, finition, transition, CPA) qui doublonnaient le référentiel des
 * sous-principes. Les thèmes ont rejoint ce référentiel ; il ne reste ici que la forme.
 */
export type FormeExercice = 'ECHAUFFEMENT' | 'ANALYTIQUE' | 'SITUATION' | 'JEU_REDUIT' | 'MATCH_A_THEME';

export const FORMES_EXERCICE: { code: FormeExercice; libelle: string }[] = [
  { code: 'ECHAUFFEMENT',  libelle: 'Échauffement' },
  { code: 'ANALYTIQUE',    libelle: 'Analytique' },
  { code: 'SITUATION',     libelle: 'Situation' },
  { code: 'JEU_REDUIT',    libelle: 'Jeu réduit' },
  { code: 'MATCH_A_THEME', libelle: 'Match à thème' },
];

@Injectable({ providedIn: 'root' })
export class TechniqueService {

  private http = inject(HttpClient);

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
  /** Duplique un exercice : nouvelle copie éditable attribuée à l'utilisateur courant. */
  dupliquerExercice(id: string): Observable<Exercice> {
    return this.http.post<Exercice>(`/api/exercices/${id}/dupliquer`, {});
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
  /** Duplique un schéma : nouvelle copie éditable attribuée à l'utilisateur courant. */
  dupliquerSchema(id: string): Observable<SchemaTactique> {
    return this.http.post<SchemaTactique>(`/api/schemas/${id}/dupliquer`, {});
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
  enregistrerCompo(id: string, placements: { joueurId: string; x: number; y: number; statut: CompoStatut; consigne?: string | null }[]): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/compo`, { placements });
  }
  publierMatch(id: string, publie: boolean, compoVisible: boolean): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/publier`, { publie, compoVisible });
  }
  definirSuspendus(id: string, joueurIds: string[]): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/suspendus`, { joueurIds });
  }
  compoDernierMatch(id: string): Observable<CompoItem[]> {
    return this.http.get<CompoItem[]>(`/api/matchs/${id}/compo-dernier-match`);
  }
  sessionsGps(): Observable<SessionGpsOption[]> {
    return this.http.get<SessionGpsOption[]>('/api/matchs/sessions-gps');
  }
  definirSessionGps(id: string, sessionGpsId: string | null): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/session-gps`, { sessionGpsId });
  }
  /** Attache (ou détache : null) un profil de règles adverses au match (moteur tactique). */
  definirProfilAdverse(id: string, profilAdverseId: string | null): Observable<MatchDetail> {
    return this.http.put<MatchDetail>(`/api/matchs/${id}/profil-adverse`, { profilAdverseId });
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
}
