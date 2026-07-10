import { Injectable, computed, inject, signal } from '@angular/core';
import {
  EspaceJoueurService, Wellness, Rpe, WellnessRequest, RpeRequest,
  MaPesee, RtpEtape, DocumentMedical, MaDeclaration,
} from '@core/services/espace-joueur.service';
import { Joueur } from '@core/services/joueur.service';
import { Conseil } from '@core/services/conseil.service';
import { Blessure } from '@core/services/blessure.service';
import { Seance, ContenuSeance, StatutPresence } from '@core/services/seance.service';
import { Observable, of, tap, catchError, throwError } from 'rxjs';
import { OfflineQueueService } from './offline-queue.service';

export type HooperKey = 'fatigue' | 'sommeil' | 'stress' | 'douleur' | 'humeur';

/** Brouillon de saisie de la gêne (mannequin). */
export interface GeneForm {
  zone: string;
  intensite: number;
  moment: string;
}

/** Séance proposée à la notation sRPE. */
export interface SeanceANoter {
  id: string;
  date: string;
  titre: string;
  duree?: number;
}

/** Point de la série 7 jours : barre Hooper (/50) + point RPE (/10). */
export interface JourSerie {
  date: string;
  jour: string;
  hooper: number | null;
  rpe: number | null;
  aujourdhui: boolean;
}

/**
 * État partagé de l'espace joueur mobile (PWA). Chargé une fois, lu par tous les
 * écrans. Réutilise {@link EspaceJoueurService} et reprend la logique métier
 * éprouvée du suivi subjectif (upsert wellness 1/jour, gêne optionnelle qui
 * conserve le Hooper, séances à noter).
 */
@Injectable({ providedIn: 'root' })
export class JoueurStore {

  private api = inject(EspaceJoueurService);
  private offline = inject(OfflineQueueService);

  readonly profil = signal<Joueur | null>(null);
  readonly wellness = signal<Wellness[]>([]);
  readonly rpe = signal<Rpe[]>([]);
  readonly conseils = signal<Conseil[]>([]);
  readonly seances = signal<Seance[]>([]);
  readonly pesees = signal<MaPesee[]>([]);
  readonly blessures = signal<Blessure[]>([]);
  readonly documents = signal<DocumentMedical[]>([]);
  readonly declarations = signal<MaDeclaration[]>([]);
  readonly loading = signal(true);
  readonly nonLie = signal(false);

  /** Cache des étapes RTP par blessure (chargées à la demande). */
  private rtpCache = signal<Record<string, RtpEtape[]>>({});

  private chargement = false;

  /** Charge l'ensemble des données du joueur (idempotent). */
  ensureLoaded(): void {
    if (this.chargement) return;
    this.chargement = true;
    this.loading.set(true);

    this.api.getProfil().subscribe({
      next: p => { this.profil.set(p); this.loading.set(false); },
      error: err => { this.loading.set(false); if (err.status === 409) this.nonLie.set(true); },
    });
    this.api.getWellness().subscribe({ next: d => this.wellness.set(d), error: () => { } });
    this.api.getRpe().subscribe({ next: d => this.rpe.set(d), error: () => { } });
    this.api.getConseils().subscribe({ next: d => this.conseils.set(d), error: () => { } });
    this.api.getSeances().subscribe({ next: d => this.seances.set(d), error: () => { } });
    this.api.getPesees().subscribe({ next: d => this.pesees.set(d), error: () => { } });
    this.api.getBlessures().subscribe({ next: d => this.blessures.set(d), error: () => { } });
    this.api.getDocumentsMedicaux().subscribe({ next: d => this.documents.set(d), error: () => { } });
    this.api.getMesDeclarations().subscribe({ next: d => this.declarations.set(d), error: () => { } });
  }

  // ──────────────────────── Dérivés (état du jour) ────────────────────────

  /** Saisie wellness d'aujourd'hui (une seule par jour). */
  readonly wellnessDuJour = computed<Wellness | null>(() => {
    const auj = this.dateISO(new Date());
    return this.wellness().find(w => w.date === auj) ?? null;
  });

  /** Le wellness du jour est validé → Hooper verrouillé, seule la gêne reste éditable. */
  readonly wellnessFait = computed(() => !!this.wellnessDuJour());

  /** Une gêne est-elle déclarée aujourd'hui ? */
  readonly geneDuJour = computed(() => !!this.wellnessDuJour()?.geneZone);

  /** Total Hooper d'une saisie (5..50, plus bas = mieux). */
  hooperTotal(w: Wellness): number {
    return w.sommeil + w.fatigue + w.douleur + w.stress + w.humeur;
  }

  /** Séances passées (≤14 j) non encore notées, pour le sélecteur sRPE. */
  readonly seancesANoter = computed<SeanceANoter[]>(() => {
    const auj = this.dateISO(new Date());
    const limite = this.dateISO(new Date(Date.now() - 14 * 86400000));
    const notes = new Set(this.rpe().map(r => r.seanceId));
    return this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date <= auj && s.date >= limite && !notes.has(s.id))
      .map(s => ({ id: s.id, date: s.date, titre: s.titre || s.typeSeance?.libelle || 'Séance', duree: s.dureeMinutes }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  /** Combien de séances restent à noter (pour le badge home). */
  readonly nbSeancesANoter = computed(() => this.seancesANoter().length);

  /** Série des 7 derniers jours : barre Hooper + point RPE. */
  readonly serie7j = computed<JourSerie[]>(() => {
    const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const auj = this.dateISO(new Date());
    const wByDate = new Map(this.wellness().map(w => [w.date, w]));
    const rpeByDate = new Map<string, number>();
    for (const r of this.rpe()) rpeByDate.set(r.date, Math.max(rpeByDate.get(r.date) ?? 0, r.rpe));
    const out: JourSerie[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = this.dateISO(d);
      const w = wByDate.get(iso);
      out.push({
        date: iso,
        jour: jours[d.getDay()],
        hooper: w ? this.hooperTotal(w) : null,
        rpe: rpeByDate.get(iso) ?? null,
        aujourdhui: iso === auj,
      });
    }
    return out;
  });

  // ──────────────────────── Blessures / RTP ────────────────────────

  /** Blessures triées : en cours d'abord, puis plus récentes. */
  readonly blessuresTriees = computed(() =>
    [...this.blessures()].sort((a, b) => {
      if (a.enCours !== b.enCours) return a.enCours ? -1 : 1;
      return (b.dateBlessure ?? '').localeCompare(a.dateBlessure ?? '');
    }));

  /** Blessure active (non rétablie) la plus récente, pour la home. */
  readonly blessureActive = computed<Blessure | null>(() =>
    this.blessures()
      .filter(b => b.statut !== 'RETABLI')
      .sort((a, b) => (b.dateBlessure ?? '').localeCompare(a.dateBlessure ?? ''))[0] ?? null);

  etapesRtp(blessureId: string): RtpEtape[] { return this.rtpCache()[blessureId] ?? []; }

  /** Charge (une fois) les étapes RTP d'une blessure dans le cache. */
  chargerRtp(blessureId: string): void {
    if (this.rtpCache()[blessureId]) return;
    this.api.getEtapesRtp(blessureId).subscribe({
      next: e => this.rtpCache.update(m => ({ ...m, [blessureId]: e })),
      error: () => this.rtpCache.update(m => ({ ...m, [blessureId]: [] })),
    });
  }

  rtpProgression(blessureId: string): number {
    const e = this.etapesRtp(blessureId);
    return e.length === 0 ? 0 : Math.round(e.filter(x => x.statut === 'VALIDEE').length / e.length * 100);
  }

  // ──────────────────────── Séances à venir ────────────────────────

  /** Séances planifiées à partir d'aujourd'hui, triées chronologiquement (réalisées/annulées exclues). */
  readonly prochainesSeances = computed<Seance[]>(() => {
    const auj = this.dateISO(new Date());
    return this.seances()
      .filter(s => s.statut === 'PLANIFIEE' && s.date >= auj)
      .sort((a, b) => (a.date + (a.heureDebut ?? '')).localeCompare(b.date + (b.heureDebut ?? '')));
  });

  /** La toute prochaine séance (carte home). */
  readonly prochaineSeance = computed<Seance | null>(() => this.prochainesSeances()[0] ?? null);

  contenuSeance(seanceId: string): Observable<ContenuSeance> {
    return this.api.getContenuSeance(seanceId);
  }

  /** Statut déjà déclaré par le joueur pour une séance (null = rien déclaré → présent par défaut). */
  maDeclaration(seanceId: string): StatutPresence | null {
    return this.declarations().find(d => d.seanceId === seanceId)?.statut ?? null;
  }

  /** Je me déclare présent/absent pour une séance ; met à jour le cache local en optimiste. */
  declarerPresence(seanceId: string, statut: StatutPresence, commentaire?: string): Observable<unknown> {
    return this.api.declarerPresence(seanceId, statut, commentaire).pipe(
      tap(() => this.declarations.update(list =>
        [{ seanceId, statut, note: commentaire }, ...list.filter(d => d.seanceId !== seanceId)])),
    );
  }

  // ──────────────────────── Poids ────────────────────────

  /** Pesées triées par date décroissante (plus récente d'abord). */
  readonly peseesTriees = computed<MaPesee[]>(() =>
    [...this.pesees()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));

  readonly dernierPoids = computed<number | null>(() => this.peseesTriees()[0]?.poids ?? null);

  /** Écart au poids de forme cible (kg), arrondi au dixième. */
  readonly ecartCible = computed<number | null>(() => {
    const p = this.profil();
    const dp = this.dernierPoids();
    if (!p || p.poidsFormeCible == null || dp == null) return null;
    return Math.round((dp - p.poidsFormeCible) * 10) / 10;
  });

  // ──────────────────────── Documents médicaux ────────────────────────

  deposerDocument(fichier: File, categorie: string, description: string, partageRoles: string[]): Observable<DocumentMedical> {
    return this.api.deposerDocumentMedical(fichier, categorie, description, partageRoles).pipe(
      tap(doc => this.documents.update(list => [doc, ...list])),
    );
  }

  telechargerDocument(id: string): Observable<Blob> {
    return this.api.telechargerDocumentMedical(id);
  }

  supprimerDocument(id: string): Observable<void> {
    return this.api.supprimerDocumentMedical(id).pipe(
      tap(() => this.documents.update(list => list.filter(d => d.id !== id))),
    );
  }

  // ──────────────────────── Actions ────────────────────────

  /**
   * Enregistre le wellness du jour (POST upsert joueur+date). Sert à la première
   * validation (Hooper + gêne) ET à la mise à jour de la gêne en cours de journée
   * (dans ce cas `hooper` reprend les valeurs déjà validées, donc inchangées).
   */
  saisirWellness(hooper: Record<HooperKey, number>, commentaire: string, gene: GeneForm | null): Observable<Wellness> {
    const req: WellnessRequest = {
      ...hooper,
      commentaire,
      geneZone: gene ? gene.zone : null,
      geneIntensite: gene ? gene.intensite : null,
      geneMoment: gene ? gene.moment : null,
    };
    return this.api.saisirWellness(req).pipe(
      tap(w => this.wellness.update(list => [w, ...list.filter(x => x.date !== w.date)])),
      catchError(err => {
        if (!this.offline.estErreurReseau(err)) return throwError(() => err);
        // Hors-ligne : on met en file et on confirme localement (resync auto plus tard).
        this.offline.enqueue({ kind: 'wellness', payload: req });
        const synth = this.synthWellness(req);
        this.wellness.update(list => [synth, ...list.filter(x => x.date !== synth.date)]);
        return of(synth);
      }),
    );
  }

  saisirRpe(seanceId: string, intensite: number, dureeMinutes?: number): Observable<Rpe> {
    const req: RpeRequest = { seanceId, seanceType: 'PHYSIQUE', rpe: intensite, dureeMinutes };
    return this.api.saisirRpe(req).pipe(
      tap(r => this.rpe.update(list => [r, ...list.filter(x => x.seanceId !== r.seanceId)])),
      catchError(err => {
        if (!this.offline.estErreurReseau(err)) return throwError(() => err);
        this.offline.enqueue({ kind: 'rpe', payload: req });
        const synth = this.synthRpe(req);
        this.rpe.update(list => [synth, ...list.filter(x => x.seanceId !== synth.seanceId)]);
        return of(synth);
      }),
    );
  }

  /** Réponse optimiste construite localement quand la saisie part hors-ligne. */
  private synthWellness(req: WellnessRequest): Wellness {
    return {
      id: `offline-${crypto.randomUUID()}`,
      joueurId: this.profil()?.id ?? '',
      date: req.date ?? this.dateISO(new Date()),
      sommeil: req.sommeil, fatigue: req.fatigue, douleur: req.douleur, stress: req.stress, humeur: req.humeur,
      scoreBienEtre: req.sommeil + req.fatigue + req.douleur + req.stress + req.humeur,
      commentaire: req.commentaire,
      geneZone: req.geneZone ?? undefined,
      geneIntensite: req.geneIntensite ?? undefined,
      geneMoment: req.geneMoment ?? undefined,
    };
  }

  private synthRpe(req: RpeRequest): Rpe {
    return {
      id: `offline-${crypto.randomUUID()}`,
      joueurId: this.profil()?.id ?? '',
      seanceId: req.seanceId,
      seanceType: req.seanceType,
      date: this.dateISO(new Date()),
      rpe: req.rpe,
      dureeMinutes: req.dureeMinutes,
      charge: req.dureeMinutes ? req.rpe * req.dureeMinutes : undefined,
    };
  }

  // ──────────────────────── Utilitaires ────────────────────────

  dateISO(d: Date): string {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
}
