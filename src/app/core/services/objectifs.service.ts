import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// ── Vocabulaire ──────────────────────────────────────────────────────────────

/**
 * Une métrique de charge. `nature` sépare deux façons de comparer : `CUMUL` s'additionne sur la
 * semaine, `EXPOSITION` est un pic (« a-t-il atteint 90 % de son record ? »), jamais un total.
 */
export interface Metrique {
  code: string;
  libelle: string;
  unite: string;                       // m | sprints | %
  nature: 'CUMUL' | 'EXPOSITION';
  principale: boolean;                 // les 3 de tête ; les autres vivent sous un dépliant
  ordre: number;
}

export interface PosteRef { code: string; libelle: string; ordre: number; }

export interface ReferentielResume {
  id: string;
  clubId: string | null;
  nom: string;
  niveau: string | null;
  version: number;
  statut: 'BROUILLON' | 'PUBLIE' | 'ARCHIVE';
  plateforme: boolean;
  modifiable: boolean;
  sourceId: string | null;
  parentId: string | null;
  nbAdoptions: number;
  updatedAt: string;
}

export interface ValeurRef {
  poste: string;
  contexte: 'MATCH' | 'SEMAINE';
  metrique: string;
  valeurMin: number | null;
  valeurMax: number | null;
}

export interface CatalogueReferentiels {
  metriques: Metrique[];
  postes: PosteRef[];
  contextes: string[];
  referentiels: ReferentielResume[];
}

export interface ReferentielDetail { entete: ReferentielResume; valeurs: ValeurRef[]; }

export interface EcartLigne {
  poste: string; contexte: string; metrique: string;
  avantMin: number | null; avantMax: number | null;
  apresMin: number | null; apresMax: number | null;
}
export interface EcartResponse {
  avantId: string; avantNom: string; apresId: string; apresNom: string; lignes: EcartLigne[];
}

export interface Adoption {
  id: string;
  equipeId: string | null;
  equipeNom: string;
  referentielId: string;
  referentielNom: string | null;
  version: number;
  /** Non nul = une version plus récente est publiée. Le club migre quand il veut. */
  versionDisponibleId: string | null;
  versionDisponibleNom: string | null;
}

export interface Resolution {
  equipeId: string | null;
  referentiel: ReferentielResume | null;
  origine: 'EQUIPE' | 'CLUB' | 'AUCUN';
}

export interface UsageReferentiel {
  referentielId: string; nom: string; niveau: string | null;
  version: number; statut: string; nbClubs: number;
}
export interface ClubUtilisateur {
  clubId: string; clubNom: string; equipeId: string | null; equipeNom: string;
}

// ── Modèles d'objectif ───────────────────────────────────────────────────────

export type Priorite = 'SECONDAIRE' | 'IMPORTANT' | 'INTOUCHABLE';

/** Niveau d'une métrique sur une phase, en % de la cible du référentiel. */
export interface PhaseValeur {
  metrique: string;
  pctDebut: number | null;
  pctFin: number | null;
  priorite: Priorite;
}

export interface Phase {
  id: string | null;
  ordre: number;
  nom: string;
  /** Part RELATIVE de la durée, jamais un nombre de semaines. */
  poidsDuree: number;
  valeurs: PhaseValeur[];
}

export interface ModeleResume {
  id: string; nom: string; typePeriode: string;
  nbPhases: number; nbUtilisations: number; updatedAt: string;
}
export interface ModeleDetail { entete: ModeleResume; phases: Phase[]; }

// ── Objectifs de période ─────────────────────────────────────────────────────

export interface ValeurPeriode {
  noSemaine: number | null;
  dateLundi: string | null;
  poste: string | null;
  metrique: string;
  valeurMin: number | null;
  valeurMax: number | null;
  priorite: Priorite;
  phaseNom: string | null;
  modifieManuellement: boolean;
}

export interface ObjectifPeriodeResume {
  id: string; periodeId: string; periodeLibelle: string | null; typePeriode: string | null;
  dateDebut: string | null; dateFin: string | null; nbSemaines: number;
  modeleId: string | null; modeleNom: string | null;
  referentielId: string | null; referentielNom: string | null;
  phasesResume: string | null; avertissement: string | null; updatedAt: string;
}
export interface ObjectifPeriodeDetail {
  entete: ObjectifPeriodeResume; valeurs: ValeurPeriode[];
}

export interface Apercu {
  nbSemaines: number;
  phasesResume: string | null;
  /** Non nul quand la période est trop courte : une phase a été supprimée, et on le dit. */
  avertissement: string | null;
  valeurs: ValeurPeriode[];
}

export interface EtatPeriode {
  periodeId: string; libelle: string; typePeriode: string;
  dateDebut: string; dateFin: string; nbSemaines: number;
  objectifsDefinis: boolean; objectifId: string | null; modeleNom: string | null;
}

export type ChoixArbitrage = 'ALLEGER' | 'ASSUMER' | 'RELISSER';

/** Un delta produit par un arbitrage, sur une semaine et une métrique. */
export interface ReportArbitrage {
  dateLundiCible: string;
  metrique: string;
  delta: number;
}

/**
 * État « double match » d'une semaine : ce que dit le calendrier, ce qui a été décidé, et ce que
 * la décision a produit. Un seul appel pour peindre la modale.
 */
export interface SemaineArbitrage {
  equipeId: string;
  dateLundi: string;
  nbMatchs: number;
  datesMatchs: string[];
  choix: ChoixArbitrage | null;
  note: string | null;
  /** Fin de la période : le report ne la franchit jamais. */
  periodeFin: string | null;
  reports: ReportArbitrage[];
  semainesCibles: string[];
  referentielAdopte: boolean;
  /** Charge d'un match d'après le référentiel — l'ampleur d'un report. */
  matchDistanceM: number | null;
  avertissement: string | null;
}

/**
 * Référentiels de charge, modèles d'objectif et objectifs accrochés aux périodes.
 *
 * <p>Trois objets distincts, et il faut les garder distincts : le RÉFÉRENTIEL est une norme
 * fournie (« ce qui est normal pour ce poste à ce niveau »), le MODÈLE est une forme réutilisable
 * en pourcentages, l'OBJECTIF DE PÉRIODE est l'instance figée sur des dates.
 */
@Injectable({ providedIn: 'root' })
export class ObjectifsService {

  private http = inject(HttpClient);
  private readonly ref = '/api/referentiels';
  private readonly admin = '/api/admin/referentiels';
  private readonly obj = '/api/objectifs';

  // ── Référentiels, côté club ──

  catalogue(): Observable<CatalogueReferentiels> {
    return this.http.get<CatalogueReferentiels>(this.ref);
  }

  detailReferentiel(id: string): Observable<ReferentielDetail> {
    return this.http.get<ReferentielDetail>(`${this.ref}/${id}`);
  }

  ecart(avant: string, apres: string): Observable<EcartResponse> {
    return this.http.get<EcartResponse>(`${this.ref}/ecart`,
      { params: new HttpParams().set('avant', avant).set('apres', apres) });
  }

  /** Copie un référentiel du catalogue chez le club, pour l'adapter. */
  dupliquer(sourceId: string, nom?: string, niveau?: string): Observable<ReferentielDetail> {
    return this.http.post<ReferentielDetail>(`${this.ref}/dupliquer`, { sourceId, nom, niveau });
  }

  enregistrerValeurs(id: string, valeurs: ValeurRef[]): Observable<ReferentielDetail> {
    return this.http.put<ReferentielDetail>(`${this.ref}/${id}/valeurs`, valeurs);
  }

  adoptions(): Observable<Adoption[]> {
    return this.http.get<Adoption[]>(`${this.ref}/adoptions`);
  }

  adopter(referentielId: string, equipeId: string | null): Observable<Adoption> {
    return this.http.post<Adoption>(`${this.ref}/adoptions`, { referentielId, equipeId });
  }

  retirerAdoption(id: string): Observable<void> {
    return this.http.delete<void>(`${this.ref}/adoptions/${id}`);
  }

  resolution(equipeId?: string | null): Observable<Resolution> {
    let p = new HttpParams();
    if (equipeId) p = p.set('equipeId', equipeId);
    return this.http.get<Resolution>(`${this.ref}/resolution`, { params: p });
  }

  // ── Référentiels, côté super-admin ──

  listerPlateforme(): Observable<ReferentielResume[]> {
    return this.http.get<ReferentielResume[]>(this.admin);
  }

  detailAdmin(id: string): Observable<ReferentielDetail> {
    return this.http.get<ReferentielDetail>(`${this.admin}/${id}`);
  }

  creerPlateforme(nom: string, niveau: string): Observable<ReferentielDetail> {
    return this.http.post<ReferentielDetail>(this.admin, { nom, niveau, valeurs: [] });
  }

  /** Ouvre une nouvelle version d'un référentiel publié (copie en brouillon). */
  nouvelleVersion(id: string): Observable<ReferentielDetail> {
    return this.http.post<ReferentielDetail>(`${this.admin}/${id}/versions`, {});
  }

  enregistrerValeursAdmin(id: string, valeurs: ValeurRef[]): Observable<ReferentielDetail> {
    return this.http.put<ReferentielDetail>(`${this.admin}/${id}/valeurs`, valeurs);
  }

  publier(id: string): Observable<ReferentielResume> {
    return this.http.post<ReferentielResume>(`${this.admin}/${id}/publier`, {});
  }

  ecartAdmin(avant: string, apres: string): Observable<EcartResponse> {
    return this.http.get<EcartResponse>(`${this.admin}/ecart`,
      { params: new HttpParams().set('avant', avant).set('apres', apres) });
  }

  usage(): Observable<UsageReferentiel[]> {
    return this.http.get<UsageReferentiel[]>(`${this.admin}/usage`);
  }

  clubsUtilisateurs(id: string): Observable<ClubUtilisateur[]> {
    return this.http.get<ClubUtilisateur[]>(`${this.admin}/${id}/clubs`);
  }

  // ── Modèles d'objectif ──

  modeles(typePeriode?: string): Observable<ModeleResume[]> {
    let p = new HttpParams();
    if (typePeriode) p = p.set('typePeriode', typePeriode);
    return this.http.get<ModeleResume[]>(`${this.obj}/modeles`, { params: p });
  }

  modele(id: string): Observable<ModeleDetail> {
    return this.http.get<ModeleDetail>(`${this.obj}/modeles/${id}`);
  }

  creerModele(nom: string, typePeriode: string, phases: Phase[]): Observable<ModeleDetail> {
    return this.http.post<ModeleDetail>(`${this.obj}/modeles`, { nom, typePeriode, phases });
  }

  majModele(id: string, nom: string, typePeriode: string, phases: Phase[]): Observable<ModeleDetail> {
    return this.http.put<ModeleDetail>(`${this.obj}/modeles/${id}`, { nom, typePeriode, phases });
  }

  supprimerModele(id: string): Observable<void> {
    return this.http.delete<void>(`${this.obj}/modeles/${id}`);
  }

  // ── Objectifs de période ──

  etatPeriodes(saisonId: string, equipeId: string): Observable<EtatPeriode[]> {
    return this.http.get<EtatPeriode[]>(`${this.obj}/periodes`,
      { params: new HttpParams().set('saisonId', saisonId).set('equipeId', equipeId) });
  }

  objectifPeriode(periodeId: string): Observable<ObjectifPeriodeDetail> {
    return this.http.get<ObjectifPeriodeDetail>(`${this.obj}/periodes/${periodeId}`);
  }

  /** Aperçu SANS écriture : montre la trajectoire et l'avertissement avant de valider. */
  apercu(periodeId: string, modeleId: string, referentielId?: string | null): Observable<Apercu> {
    return this.http.post<Apercu>(`${this.obj}/periodes/apercu`,
      { periodeId, modeleId, referentielId: referentielId ?? null });
  }

  instancier(periodeId: string, modeleId: string,
             referentielId?: string | null): Observable<ObjectifPeriodeDetail> {
    return this.http.post<ObjectifPeriodeDetail>(`${this.obj}/periodes/instancier`,
      { periodeId, modeleId, referentielId: referentielId ?? null });
  }

  enregistrerObjectifPeriode(periodeId: string,
                             valeurs: ValeurPeriode[]): Observable<ObjectifPeriodeDetail> {
    return this.http.put<ObjectifPeriodeDetail>(`${this.obj}/periodes/${periodeId}/valeurs`, valeurs);
  }

  supprimerObjectifPeriode(periodeId: string): Observable<void> {
    return this.http.delete<void>(`${this.obj}/periodes/${periodeId}`);
  }

  // ── Semaine à deux matchs ──
  // L'équipe n'est jamais passée : le back la prend dans le contexte actif (409 si multi-équipes).

  arbitrageSemaine(date: string): Observable<SemaineArbitrage> {
    return this.http.get<SemaineArbitrage>(`${this.obj}/arbitrage-semaine`,
      { params: new HttpParams().set('date', date) });
  }

  arbitrer(dateLundi: string, choix: ChoixArbitrage, note?: string | null): Observable<SemaineArbitrage> {
    return this.http.put<SemaineArbitrage>(`${this.obj}/arbitrage-semaine`,
      { dateLundi, choix, note: note ?? null });
  }

  annulerArbitrage(date: string): Observable<SemaineArbitrage> {
    return this.http.delete<SemaineArbitrage>(`${this.obj}/arbitrage-semaine`,
      { params: new HttpParams().set('date', date) });
  }
}
