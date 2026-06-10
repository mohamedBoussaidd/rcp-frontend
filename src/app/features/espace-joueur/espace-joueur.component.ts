import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { EspaceJoueurService, MaPesee, DocumentMedical, Wellness, Rpe, RtpEtape } from '../../core/services/espace-joueur.service';
import { Joueur, GpsPoint } from '../../core/services/joueur.service';
import { Blessure } from '../../core/services/blessure.service';
import { Seance } from '../../core/services/seance.service';
import { SeanceTechnique } from '../../core/services/technique.service';

/** Ligne unifiée pour la liste « Séances prévues » (physique + technique). */
interface SeancePrevue {
  id: string;
  type: 'physique' | 'technique';
  date: string;
  heureDebut?: string;
  titre: string;
  sousTitre?: string;
  meta: string;
}

/** Séance passée que le joueur peut noter (RPE pas encore saisi). */
interface SeanceANoter {
  id: string;
  type: 'PHYSIQUE' | 'TECHNIQUE';
  date: string;
  titre: string;
  duree?: number;
}

@Component({
  selector: 'app-espace-joueur',
  standalone: true,
  templateUrl: './espace-joueur.component.html',
  styleUrl: './espace-joueur.component.scss',
  imports: [DatePipe, DecimalPipe, FormsModule, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class EspaceJoueurComponent implements OnInit {

  profil = signal<Joueur | null>(null);
  pesees = signal<MaPesee[]>([]);
  blessures = signal<Blessure[]>([]);
  rtpEtapes = signal<RtpEtape[]>([]);
  gps = signal<GpsPoint[]>([]);
  seances = signal<Seance[]>([]);
  seancesTech = signal<SeanceTechnique[]>([]);
  documents = signal<DocumentMedical[]>([]);
  wellness = signal<Wellness[]>([]);
  rpe = signal<Rpe[]>([]);
  loading = signal(true);
  nonLie = signal(false);

  // ── Wellness (ressenti quotidien, indice de Hooper) ──
  readonly WELLNESS_ITEMS: { key: 'sommeil' | 'fatigue' | 'douleur' | 'stress' | 'humeur'; label: string; bas: string; haut: string }[] = [
    { key: 'sommeil', label: 'Sommeil',     bas: 'très mauvais', haut: 'excellent' },
    { key: 'fatigue', label: 'Fatigue',     bas: 'épuisé',       haut: 'en forme' },
    { key: 'douleur', label: 'Courbatures', bas: 'intenses',     haut: 'aucune' },
    { key: 'stress',  label: 'Stress',      bas: 'très stressé', haut: 'détendu' },
    { key: 'humeur',  label: 'Humeur',      bas: 'très basse',   haut: 'excellente' },
  ];
  wellnessFormOuvert = signal(false);
  wForm = signal<{ sommeil: number; fatigue: number; douleur: number; stress: number; humeur: number; commentaire: string }>(
    { sommeil: 3, fatigue: 3, douleur: 3, stress: 3, humeur: 3, commentaire: '' });
  wEnvoi = signal(false);

  // ── Signalement de gêne (intégré au wellness) ──
  readonly ZONES_GENE = [
    'ischio_jambiers', 'quadriceps', 'mollet', 'cheville', 'genou',
    'hanche', 'dos', 'epaule', 'adducteurs', 'autre',
  ];
  readonly MOMENTS_GENE: { val: string; label: string }[] = [
    { val: 'EFFORT', label: "À l'effort" },
    { val: 'APRES',  label: 'Juste après' },
    { val: 'REPOS',  label: 'Au repos' },
  ];
  geneActive = signal(false);
  gForm = signal<{ zone: string; intensite: number; moment: string }>(
    { zone: 'cheville', intensite: 2, moment: 'EFFORT' });

  readonly wellnessAujourdhui = computed(() => {
    const auj = new Date().toISOString().slice(0, 10);
    return this.wellness().find(w => w.date === auj) ?? null;
  });

  // ── RPE de séance ──
  /** seanceId déjà notés. */
  private readonly rpeNotes = computed(() => new Set(this.rpe().map(r => r.seanceId)));

  /** Séances passées (≤ 14 j) non encore notées, à proposer au joueur. */
  readonly seancesANoter = computed<SeanceANoter[]>(() => {
    const auj = new Date().toISOString().slice(0, 10);
    const limite = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const notes = this.rpeNotes();

    const phys: SeanceANoter[] = this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date <= auj && s.date >= limite && !notes.has(s.id))
      .map(s => ({ id: s.id, type: 'PHYSIQUE', date: s.date, titre: s.titre || s.typeSeance?.libelle || 'Séance', duree: s.dureeMinutes }));

    const tech: SeanceANoter[] = this.seancesTech()
      .filter(s => s.statut !== 'ANNULEE' && s.date <= auj && s.date >= limite && !notes.has(s.id))
      .map(s => ({ id: s.id, type: 'TECHNIQUE', date: s.date, titre: s.titre || 'Séance technique', duree: s.dureeTotaleMinutes }));

    return [...phys, ...tech].sort((a, b) => b.date.localeCompare(a.date));
  });

  /** Valeur RPE sélectionnée (avant validation) par séance. */
  rpeBrouillon = signal<Record<string, number>>({});
  readonly NOTES_RPE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // ── Dépôt de document médical (formulaire inline) ──
  readonly CATEGORIES = [
    { val: 'certificat', label: 'Certificat' },
    { val: 'ordonnance', label: 'Ordonnance' },
    { val: 'imagerie', label: 'Imagerie' },
    { val: 'compte_rendu', label: 'Compte rendu' },
    { val: 'autre', label: 'Autre' },
  ];
  readonly ROLES_PARTAGE = [
    { val: 'ENTRAINEUR', label: 'Entraîneur' },
    { val: 'PREPARATEUR', label: 'Préparateur' },
    { val: 'PRESIDENT', label: 'Président' },
  ];

  depotOuvert = signal(false);
  fichierSel = signal<File | null>(null);
  categorieSel = signal('certificat');
  descriptionSel = signal('');
  partageSel = signal<string[]>([]);
  envoiEnCours = signal(false);
  erreurDepot = signal<string | null>(null);

  /** id du document dont on édite le partage (null = aucun). */
  partageEnEdition = signal<string | null>(null);

  // ── Parcours de reprise (lecture seule) ──
  readonly PARCOURS: { statut: string; label: string }[] = [
    { statut: 'INDISPONIBLE', label: 'Indisponible' },
    { statut: 'EN_REPRISE',   label: 'En reprise' },
    { statut: 'RETABLI',      label: 'Rétabli' },
  ];
  /** Blessure active (non rétablie), la plus récente. */
  readonly blessureActive = computed(() =>
    this.blessures()
      .filter(b => b.statut !== 'RETABLI')
      .sort((a, b) => (b.dateBlessure ?? '').localeCompare(a.dateBlessure ?? ''))[0] ?? null);
  readonly parcoursIndex = computed(() => {
    const b = this.blessureActive();
    return b ? this.PARCOURS.findIndex(p => p.statut === b.statut) : -1;
  });
  readonly rtpProgression = computed(() => {
    const e = this.rtpEtapes();
    return e.length === 0 ? 0 : Math.round(e.filter(x => x.statut === 'VALIDEE').length / e.length * 100);
  });
  readonly rtpEtapeCourante = computed(() =>
    this.rtpEtapes().find(e => e.statut === 'EN_COURS')
    ?? this.rtpEtapes().find(e => e.statut === 'A_FAIRE')
    ?? null);

  /**
   * Séances non annulées à partir d'aujourd'hui, triées chronologiquement (vue « prévues »).
   * Fusionne les séances physiques (préparateur) et techniques (entraîneur).
   */
  readonly seancesAVenir = computed<SeancePrevue[]>(() => {
    const auj = new Date().toISOString().slice(0, 10);

    const physiques: SeancePrevue[] = this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date >= auj)
      .map(s => ({
        id: s.id,
        type: 'physique',
        date: s.date,
        heureDebut: s.heureDebut,
        titre: s.titre || s.typeSeance?.libelle || 'Séance',
        sousTitre: s.adversaire ? `vs ${s.adversaire}` : undefined,
        meta: [s.typeSeance?.libelle, s.terrain, s.dureeMinutes ? `${s.dureeMinutes} min` : null]
          .filter(Boolean).join(' · '),
      }));

    const techniques: SeancePrevue[] = this.seancesTech()
      .filter(s => s.statut !== 'ANNULEE' && s.date >= auj)
      .map(s => ({
        id: s.id,
        type: 'technique',
        date: s.date,
        heureDebut: s.heureDebut,
        titre: s.titre || 'Séance technique',
        sousTitre: s.objectif || undefined,
        meta: [
          s.exercices?.length ? `${s.exercices.length} exercice${s.exercices.length > 1 ? 's' : ''}` : null,
          s.dureeTotaleMinutes ? `${s.dureeTotaleMinutes} min` : null,
        ].filter(Boolean).join(' · '),
      }));

    return [...physiques, ...techniques]
      .sort((a, b) => (a.date + (a.heureDebut ?? '')).localeCompare(b.date + (b.heureDebut ?? '')));
  });

  // ── Pagination (7 par page) : poids et dernières séances (GPS), plus récentes d'abord ──
  readonly TAILLE_PAGE = 7;
  peseesPage = signal(0);
  gpsPage = signal(0);

  private readonly gpsTries = computed(() =>
    this.gps().slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));

  readonly peseesNbPages = computed(() => Math.max(1, Math.ceil(this.pesees().length / this.TAILLE_PAGE)));
  readonly gpsNbPages = computed(() => Math.max(1, Math.ceil(this.gpsTries().length / this.TAILLE_PAGE)));
  readonly peseesAffichees = computed(() => {
    const i = this.peseesPage() * this.TAILLE_PAGE;
    return this.pesees().slice(i, i + this.TAILLE_PAGE);
  });
  readonly gpsAffichees = computed(() => {
    const i = this.gpsPage() * this.TAILLE_PAGE;
    return this.gpsTries().slice(i, i + this.TAILLE_PAGE);
  });

  pagePesees(d: number): void {
    this.peseesPage.update(p => Math.min(this.peseesNbPages() - 1, Math.max(0, p + d)));
  }
  pageGps(d: number): void {
    this.gpsPage.update(p => Math.min(this.gpsNbPages() - 1, Math.max(0, p + d)));
  }

  readonly dernierPoids = computed(() => this.pesees()[0]?.poids ?? null);
  readonly ecartCible = computed(() => {
    const p = this.profil();
    const dp = this.dernierPoids();
    if (!p || p.poidsFormeCible == null || dp == null) return null;
    return Math.round((dp - p.poidsFormeCible) * 10) / 10;
  });

  constructor(private service: EspaceJoueurService) {}

  ngOnInit(): void {
    this.service.getProfil().subscribe({
      next: p => { this.profil.set(p); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 409) this.nonLie.set(true);
      },
    });
    this.service.getPesees().subscribe({ next: d => this.pesees.set(d), error: () => {} });
    this.service.getBlessures().subscribe({
      next: d => {
        this.blessures.set(d);
        const active = this.blessureActive();
        if (active) {
          this.service.getEtapesRtp(active.id).subscribe({ next: e => this.rtpEtapes.set(e), error: () => {} });
        }
      },
      error: () => {},
    });
    this.service.getGps().subscribe({ next: d => this.gps.set(d), error: () => {} });
    this.service.getSeances().subscribe({ next: d => this.seances.set(d), error: () => {} });
    this.service.getSeancesTechniques().subscribe({ next: d => this.seancesTech.set(d), error: () => {} });
    this.service.getWellness().subscribe({ next: d => this.wellness.set(d), error: () => {} });
    this.service.getRpe().subscribe({ next: d => this.rpe.set(d), error: () => {} });
    this.chargerDocuments();
  }

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  // ──────────────────────────── Wellness ────────────────────────────

  ouvrirWellness(): void {
    const w = this.wellnessAujourdhui();
    this.wForm.set(w
      ? { sommeil: w.sommeil, fatigue: w.fatigue, douleur: w.douleur, stress: w.stress, humeur: w.humeur, commentaire: w.commentaire ?? '' }
      : { sommeil: 3, fatigue: 3, douleur: 3, stress: 3, humeur: 3, commentaire: '' });
    this.geneActive.set(!!w?.geneZone);
    this.gForm.set(w?.geneZone
      ? { zone: w.geneZone, intensite: w.geneIntensite ?? 2, moment: w.geneMoment ?? 'EFFORT' }
      : { zone: 'cheville', intensite: 2, moment: 'EFFORT' });
    this.wellnessFormOuvert.set(true);
  }
  annulerWellness(): void { this.wellnessFormOuvert.set(false); }

  setWItem(key: 'sommeil' | 'fatigue' | 'douleur' | 'stress' | 'humeur', val: number): void {
    this.wForm.update(f => ({ ...f, [key]: val }));
  }
  setWCommentaire(val: string): void {
    this.wForm.update(f => ({ ...f, commentaire: val }));
  }
  setGItem(key: 'zone' | 'intensite' | 'moment', val: string | number): void {
    this.gForm.update(f => ({ ...f, [key]: val }));
  }

  enregistrerWellness(): void {
    this.wEnvoi.set(true);
    const f = this.wForm();
    const g = this.geneActive() ? this.gForm() : null;
    this.service.saisirWellness({
      ...f,
      geneZone: g ? g.zone : null,
      geneIntensite: g ? g.intensite : null,
      geneMoment: g ? g.moment : null,
    }).subscribe({
      next: w => {
        // remplace la saisie du jour si elle existe, sinon l'ajoute en tête
        this.wellness.update(list => [w, ...list.filter(x => x.date !== w.date)]);
        this.wEnvoi.set(false);
        this.wellnessFormOuvert.set(false);
      },
      error: () => this.wEnvoi.set(false),
    });
  }

  // ──────────────────────────── RPE ────────────────────────────

  setRpeBrouillon(seanceId: string, val: number): void {
    this.rpeBrouillon.update(m => ({ ...m, [seanceId]: val }));
  }

  noterSeance(s: SeanceANoter): void {
    const note = this.rpeBrouillon()[s.id];
    if (!note) return;
    this.service.saisirRpe({ seanceId: s.id, seanceType: s.type, rpe: note, dureeMinutes: s.duree }).subscribe({
      next: r => {
        this.rpe.update(list => [r, ...list]);
        this.rpeBrouillon.update(m => { const c = { ...m }; delete c[s.id]; return c; });
      },
      error: () => {},
    });
  }

  // ──────────────────────────── Documents médicaux ────────────────────────────

  private chargerDocuments(): void {
    this.service.getDocumentsMedicaux().subscribe({ next: d => this.documents.set(d), error: () => {} });
  }

  categorieLabel(val: string): string {
    return this.CATEGORIES.find(c => c.val === val)?.label ?? val;
  }
  roleLabel(val: string): string {
    return this.ROLES_PARTAGE.find(r => r.val === val)?.label ?? val;
  }
  tailleLisible(octets: number): string {
    if (octets < 1024) return octets + ' o';
    if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
    return (Math.round(octets / (1024 * 1024) * 10) / 10) + ' Mo';
  }

  ouvrirDepot(): void {
    this.erreurDepot.set(null);
    this.depotOuvert.set(true);
  }
  annulerDepot(): void {
    this.depotOuvert.set(false);
    this.fichierSel.set(null);
    this.categorieSel.set('certificat');
    this.descriptionSel.set('');
    this.partageSel.set([]);
    this.erreurDepot.set(null);
  }

  onFichier(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fichierSel.set(input.files?.[0] ?? null);
  }

  togglePartageDepot(role: string): void {
    this.partageSel.update(roles =>
      roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role]);
  }

  deposer(): void {
    const fichier = this.fichierSel();
    if (!fichier) { this.erreurDepot.set('Choisissez un fichier.'); return; }
    if (fichier.size > 10 * 1024 * 1024) { this.erreurDepot.set('Fichier trop volumineux (max 10 Mo).'); return; }
    this.envoiEnCours.set(true);
    this.erreurDepot.set(null);
    this.service.deposerDocumentMedical(fichier, this.categorieSel(), this.descriptionSel(), this.partageSel())
      .subscribe({
        next: doc => {
          this.documents.update(list => [doc, ...list]);
          this.envoiEnCours.set(false);
          this.annulerDepot();
        },
        error: (err) => {
          this.envoiEnCours.set(false);
          this.erreurDepot.set(
            err.status === 415 ? 'Type non autorisé (PDF, JPG, PNG seulement).'
            : err.status === 413 ? 'Fichier trop volumineux (max 10 Mo).'
            : 'Échec du dépôt. Réessayez.');
        },
      });
  }

  telecharger(doc: DocumentMedical): void {
    this.service.telechargerDocumentMedical(doc.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nomOriginal;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {},
    });
  }

  supprimer(doc: DocumentMedical): void {
    if (!confirm(`Supprimer « ${doc.nomOriginal} » ?`)) return;
    this.service.supprimerDocumentMedical(doc.id).subscribe({
      next: () => this.documents.update(list => list.filter(d => d.id !== doc.id)),
      error: () => {},
    });
  }

  editerPartage(doc: DocumentMedical): void {
    this.partageEnEdition.set(this.partageEnEdition() === doc.id ? null : doc.id);
  }

  togglePartageDoc(doc: DocumentMedical, role: string): void {
    const roles = doc.partageRoles.includes(role)
      ? doc.partageRoles.filter(r => r !== role)
      : [...doc.partageRoles, role];
    this.service.modifierPartageDocument(doc.id, roles).subscribe({
      next: maj => this.documents.update(list => list.map(d => d.id === doc.id ? maj : d)),
      error: () => {},
    });
  }
}
