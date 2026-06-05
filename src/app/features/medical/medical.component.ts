import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Blessure, BlessureRequest, BlessureService, StatutBlessure } from '../../core/services/blessure.service';
import { BlessureNote, RtpEtape, StatutEtape, BlessureSuiviService } from '../../core/services/blessure-suivi.service';
import { DocumentMedical, DocumentMedicalService } from '../../core/services/document-medical.service';
import { Wellness, Rpe, SuiviSubjectifService } from '../../core/services/suivi-subjectif.service';
import { PredictionService, ResumeJoueur } from '../../core/services/prediction.service';
import { Joueur, JoueurService } from '../../core/services/joueur.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-medical',
  standalone: true,
  templateUrl: './medical.component.html',
  styleUrl: './medical.component.scss',
  imports: [FormsModule, DatePipe, RouterLink, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class MedicalComponent implements OnInit {

  readonly types    = ['musculaire', 'articulaire', 'osseux', 'tendineux', 'ligamentaire', 'autre'];
  readonly zones    = ['ischio_jambiers', 'quadriceps', 'mollet', 'cheville', 'genou', 'hanche', 'dos', 'epaule', 'adducteurs', 'autre'];
  readonly cotes    = ['gauche', 'droit', 'les_deux'];
  readonly gravites = ['leger', 'modere', 'grave'];
  readonly causes   = ['surcharge', 'contact', 'terrain', 'fatigue_accumulee', 'recidive', 'autre'];
  readonly STATUTS_BLESSURE: { val: StatutBlessure; label: string }[] = [
    { val: 'INDISPONIBLE', label: 'Indisponible' },
    { val: 'EN_REPRISE',   label: 'En reprise' },
    { val: 'RETABLI',      label: 'Rétabli' },
  ];

  blessures = signal<Blessure[]>([]);
  joueurs = signal<Joueur[]>([]);
  loading = signal(true);

  // ── Documents médicaux ──
  documents = signal<DocumentMedical[]>([]);
  filtreJoueurDoc = signal('');
  readonly CATEGORIES_DOC: Record<string, string> = {
    certificat: 'Certificat', ordonnance: 'Ordonnance', imagerie: 'Imagerie',
    compte_rendu: 'Compte rendu', autre: 'Autre',
  };
  readonly ROLES_DOC: Record<string, string> = {
    ENTRAINEUR: 'Entraîneur', PREPARATEUR: 'Préparateur', PRESIDENT: 'Président',
  };

  // ── Suivi subjectif (wellness + RPE) ──
  wellness = signal<Wellness[]>([]);
  rpe = signal<Rpe[]>([]);
  filtreJoueurSuivi = signal('');
  readonly WELLNESS_ITEMS: { key: keyof Pick<Wellness, 'sommeil' | 'fatigue' | 'douleur' | 'stress' | 'humeur'>; label: string }[] = [
    { key: 'sommeil', label: 'Sommeil' },
    { key: 'fatigue', label: 'Fatigue' },
    { key: 'douleur', label: 'Courbatures' },
    { key: 'stress', label: 'Stress' },
    { key: 'humeur', label: 'Humeur' },
  ];

  showForm = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  form: BlessureRequest = this.formVide();
  /** id de la gêne en cours de conversion en blessure (marquée traitée à l'enregistrement). */
  geneEnConversion = signal<string | null>(null);

  // ── Suivi d'une blessure (journal + RTP) ──
  suiviBlessure = signal<Blessure | null>(null);
  notes = signal<BlessureNote[]>([]);
  rtp = signal<RtpEtape[]>([]);
  noteTexte = signal('');
  readonly ETAPE_LABELS: Record<StatutEtape, string> = {
    A_FAIRE: 'À faire', EN_COURS: 'En cours', VALIDEE: 'Validée',
  };

  /** Progression RTP en % (étapes validées / total). */
  get rtpProgression(): number {
    const t = this.rtp();
    if (t.length === 0) return 0;
    return Math.round(t.filter(e => e.statut === 'VALIDEE').length / t.length * 100);
  }

  // ── Bilan & alertes ──
  joueursRisque = signal<ResumeJoueur[]>([]);
  /** Wellness non filtré (toute l'équipe) pour les alertes de gêne. */
  wellnessAlertes = signal<Wellness[]>([]);
  readonly SEUIL_RETOUR_IMMINENT = 7; // jours
  readonly MOMENTS_GENE: Record<string, string> = {
    EFFORT: "à l'effort", APRES: 'juste après', REPOS: 'au repos',
  };

  /** Gênes non traitées signalées sur les 7 derniers jours (détection précoce). */
  get genesSignalees(): Wellness[] {
    const limite = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    return this.wellnessAlertes()
      .filter(w => w.geneZone && !w.geneTraitee && w.date >= limite)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  momentGeneLabel(v?: string): string { return v ? (this.MOMENTS_GENE[v] ?? v) : ''; }

  /** Gênes traitées (archivées ou converties) — historique pour médical / préparateur. */
  get genesHistorique(): Wellness[] {
    return this.wellnessAlertes()
      .filter(w => w.geneZone && w.geneTraitee)
      .sort((a, b) => (b.geneTraiteeLe ?? b.date).localeCompare(a.geneTraiteeLe ?? a.date));
  }
  resolutionGeneLabel(r?: string): string {
    return r === 'CONVERTIE' ? 'Convertie en blessure' : 'Archivée';
  }

  /** Qui peut traiter / convertir une gêne (médical, préparateur, super-admin). */
  get peutTraiterGene(): boolean {
    return this.auth.hasRole('MEDICAL', 'PREPARATEUR', 'SUPER_ADMIN');
  }
  /** Qui voit l'historique des gênes (médical, préparateur, super-admin). */
  get peutVoirHistoriqueGenes(): boolean {
    return this.auth.hasRole('MEDICAL', 'PREPARATEUR', 'SUPER_ADMIN');
  }
  /** Qui peut rouvrir une gêne traitée (médical seul revient sur la décision). */
  get peutRouvrirGene(): boolean {
    return this.auth.hasRole('MEDICAL', 'SUPER_ADMIN');
  }

  traiterGene(w: Wellness): void {
    if (!confirm('Archiver cette gêne ? Elle quittera les alertes mais restera dans l\'historique.')) return;
    this.suiviService.traiterGene(w.id, 'ARCHIVEE').subscribe({
      next: maj => this.wellnessAlertes.update(l => l.map(x => x.id === w.id ? maj : x)),
      error: () => this.snack.open('Action impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Rouvre une gêne traitée : elle réapparaît dans les alertes (médical). */
  rouvrirGene(w: Wellness): void {
    this.suiviService.rouvrirGene(w.id).subscribe({
      next: maj => this.wellnessAlertes.update(l => l.map(x => x.id === w.id ? maj : x)),
      error: () => this.snack.open('Action impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Pré-remplit le formulaire blessure depuis la gêne ; la gêne sera traitée à l'enregistrement. */
  convertirGeneEnBlessure(w: Wellness): void {
    if (!w.geneZone) return;
    this.editingId.set(null);
    this.form = {
      ...this.formVide(),
      joueurId: w.joueurId,
      dateBlessure: w.date,
      zoneCorporelle: w.geneZone,
    };
    this.geneEnConversion.set(w.id);
    this.showForm.set(true);
  }

  get statsTotal(): number { return this.blessures().length; }
  get statsEnCours(): number { return this.blessures().filter(b => b.statut !== 'RETABLI').length; }
  get statsRecidivePct(): number {
    const t = this.blessures();
    return t.length === 0 ? 0 : Math.round(t.filter(b => b.recidive).length / t.length * 100);
  }
  /** Jours d'indisponibilité cumulés (retour effectif ou aujourd'hui si en cours). */
  get statsJoursPerdus(): number {
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return this.blessures().reduce((tot, b) => {
      if (!b.dateBlessure) return tot;
      const debut = new Date(b.dateBlessure + 'T00:00:00');
      const fin = b.dateRetourEffectif ? new Date(b.dateRetourEffectif + 'T00:00:00') : auj;
      const jours = Math.round((fin.getTime() - debut.getTime()) / 86400000);
      return tot + Math.max(0, jours);
    }, 0);
  }
  /** Répartition par zone corporelle, triée par fréquence. */
  get statsParZone(): { zone: string; count: number }[] {
    const map = new Map<string, number>();
    for (const b of this.blessures()) {
      const z = b.zoneCorporelle || 'autre';
      map.set(z, (map.get(z) ?? 0) + 1);
    }
    return [...map.entries()].map(([zone, count]) => ({ zone, count })).sort((a, b) => b.count - a.count);
  }
  get statsZoneMax(): number {
    return this.statsParZone.reduce((m, z) => Math.max(m, z.count), 0);
  }
  get statsParGravite(): { leger: number; modere: number; grave: number } {
    const t = this.blessures();
    return {
      leger:  t.filter(b => b.gravite === 'leger').length,
      modere: t.filter(b => b.gravite === 'modere').length,
      grave:  t.filter(b => b.gravite === 'grave').length,
    };
  }

  /** Blessures non rétablies dont le retour prévu est dans les 7 prochains jours. */
  get retoursImminents(): Blessure[] {
    return this.blessures().filter(b => {
      if (b.statut === 'RETABLI' || !b.dateRetourPrevue) return false;
      const j = this.joursAvantRetour(b.dateRetourPrevue);
      return j !== null && j >= 0 && j <= this.SEUIL_RETOUR_IMMINENT;
    }).sort((a, b) => (a.dateRetourPrevue ?? '').localeCompare(b.dateRetourPrevue ?? ''));
  }
  /** Blessures non rétablies dont le retour prévu est dépassé. */
  get retoursEnRetard(): Blessure[] {
    return this.blessures().filter(b => {
      if (b.statut === 'RETABLI' || !b.dateRetourPrevue) return false;
      const j = this.joursAvantRetour(b.dateRetourPrevue);
      return j !== null && j < 0;
    }).sort((a, b) => (a.dateRetourPrevue ?? '').localeCompare(b.dateRetourPrevue ?? ''));
  }
  get joueursRisqueEleve(): ResumeJoueur[] {
    return this.joueursRisque().filter(j => j.niveau_risque === 'ELEVE' || j.niveau_fatigue === 'ALERTE');
  }
  /** Y a-t-il au moins une alerte à afficher ? */
  get aDesAlertes(): boolean {
    return this.retoursImminents.length > 0 || this.retoursEnRetard.length > 0
      || this.joueursRisqueEleve.length > 0 || this.genesSignalees.length > 0;
  }

  constructor(
    private blessureService: BlessureService,
    private documentService: DocumentMedicalService,
    private suiviService: SuiviSubjectifService,
    private blessureSuiviService: BlessureSuiviService,
    private predictionService: PredictionService,
    private joueurService: JoueurService,
    private snack: MatSnackBar,
    public auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
    this.charger();
    this.chargerDocuments();
    this.chargerSuivi();
    this.predictionService.getResumeEquipe().subscribe({ next: d => this.joueursRisque.set(d), error: () => {} });
    this.suiviService.getWellness().subscribe({ next: d => this.wellnessAlertes.set(d), error: () => {} });
  }

  charger(): void {
    this.loading.set(true);
    this.blessureService.lister().subscribe({
      next: b => { this.blessures.set(b); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  nouveau(): void {
    this.editingId.set(null);
    this.geneEnConversion.set(null);
    this.form = this.formVide();
    this.showForm.set(true);
  }

  editer(b: Blessure): void {
    this.editingId.set(b.id);
    this.form = {
      joueurId: b.joueurId, dateBlessure: b.dateBlessure, dateRetourEffectif: b.dateRetourEffectif ?? '',
      dateRetourPrevue: b.dateRetourPrevue ?? '', statut: b.statut,
      typeBlessure: b.typeBlessure, zoneCorporelle: b.zoneCorporelle, cote: b.cote,
      gravite: b.gravite, causeProbable: b.causeProbable, recidive: b.recidive, commentaire: b.commentaire,
    };
    this.showForm.set(true);
  }

  annuler(): void { this.showForm.set(false); this.editingId.set(null); this.geneEnConversion.set(null); }

  enregistrer(): void {
    if (!this.form.joueurId || !this.form.dateBlessure) return;
    this.saving.set(true);
    const payload: BlessureRequest = { ...this.form, dateRetourEffectif: this.form.dateRetourEffectif || null };
    const id = this.editingId();
    const obs = id ? this.blessureService.modifier(id, payload) : this.blessureService.creer(payload);
    obs.subscribe({
      next: () => {
        // Conversion d'une gêne : on la marque traitée une fois la blessure créée.
        const geneId = this.geneEnConversion();
        if (geneId) {
          this.suiviService.traiterGene(geneId, 'CONVERTIE').subscribe({
            next: maj => this.wellnessAlertes.update(l => l.map(x => x.id === geneId ? maj : x)),
            error: () => {},
          });
          this.geneEnConversion.set(null);
        }
        this.saving.set(false); this.showForm.set(false); this.editingId.set(null); this.charger();
      },
      error: () => { this.saving.set(false); this.snack.open('Erreur lors de l\'enregistrement', 'Fermer', { duration: 3000 }); },
    });
  }

  supprimer(b: Blessure): void {
    if (!confirm('Supprimer cette blessure ?')) return;
    this.blessureService.supprimer(b.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ──────────────────────────── Documents médicaux ────────────────────────────

  chargerDocuments(): void {
    this.documentService.lister(this.filtreJoueurDoc() || undefined).subscribe({
      next: d => this.documents.set(d),
      error: () => {},
    });
  }

  onFiltreJoueurDoc(joueurId: string): void {
    this.filtreJoueurDoc.set(joueurId);
    this.chargerDocuments();
  }

  categorieDocLabel(val: string): string { return this.CATEGORIES_DOC[val] ?? val; }
  roleDocLabel(val: string): string { return this.ROLES_DOC[val] ?? val; }
  tailleLisible(octets: number): string {
    if (octets < 1024) return octets + ' o';
    if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
    return (Math.round(octets / (1024 * 1024) * 10) / 10) + ' Mo';
  }

  telechargerDoc(doc: DocumentMedical): void {
    this.documentService.telecharger(doc.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nomOriginal;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimerDoc(doc: DocumentMedical): void {
    if (!confirm(`Supprimer « ${doc.nomOriginal} » ?`)) return;
    this.documentService.supprimer(doc.id).subscribe({
      next: () => this.documents.update(list => list.filter(d => d.id !== doc.id)),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ──────────────────────────── Suivi subjectif ────────────────────────────

  chargerSuivi(): void {
    const id = this.filtreJoueurSuivi() || undefined;
    this.suiviService.getWellness(id).subscribe({ next: d => this.wellness.set(d), error: () => {} });
    this.suiviService.getRpe(id).subscribe({ next: d => this.rpe.set(d), error: () => {} });
  }

  onFiltreJoueurSuivi(joueurId: string): void {
    this.filtreJoueurSuivi.set(joueurId);
    this.chargerSuivi();
  }

  /** Classe couleur selon le score de bien-être (vert/orange/rouge). */
  scoreClass(score: number): string {
    return score >= 66 ? 'score-ok' : score >= 40 ? 'score-moyen' : 'score-bas';
  }
  /** Classe couleur selon le RPE (1..10). */
  rpeClass(rpe: number): string {
    return rpe >= 8 ? 'score-bas' : rpe >= 5 ? 'score-moyen' : 'score-ok';
  }

  joliLabel(v?: string): string {
    return v ? v.replace(/_/g, ' ') : '—';
  }

  graviteClass(g?: string): string {
    return g === 'grave' ? 'g-grave' : g === 'modere' ? 'g-modere' : g === 'leger' ? 'g-leger' : '';
  }

  private formVide(): BlessureRequest {
    return {
      joueurId: '', dateBlessure: new Date().toISOString().slice(0, 10), dateRetourEffectif: '',
      dateRetourPrevue: '', statut: 'INDISPONIBLE',
      typeBlessure: '', zoneCorporelle: '', cote: '', gravite: '', causeProbable: '', recidive: false, commentaire: '',
    };
  }

  // ──────────────────────────── Infirmerie ────────────────────────────

  /** Blessures non rétablies (indisponibles + en reprise), retour le plus proche d'abord. */
  get infirmerie(): Blessure[] {
    return this.blessures()
      .filter(b => b.statut !== 'RETABLI')
      .sort((a, b) => (a.dateRetourPrevue ?? '9999').localeCompare(b.dateRetourPrevue ?? '9999'));
  }

  get nbIndisponibles(): number {
    return this.blessures().filter(b => b.statut === 'INDISPONIBLE').length;
  }
  get nbEnReprise(): number {
    return this.blessures().filter(b => b.statut === 'EN_REPRISE').length;
  }

  statutBlessureLabel(v?: string): string {
    return this.STATUTS_BLESSURE.find(s => s.val === v)?.label ?? v ?? '—';
  }
  statutBlessureClass(v?: string): string {
    return v === 'EN_REPRISE' ? 'st-reprise' : v === 'RETABLI' ? 'st-retabli' : 'st-indispo';
  }

  /** Jours avant le retour prévu (négatif si dépassé), null si pas de date. */
  joursAvantRetour(dateRetourPrevue?: string): number | null {
    if (!dateRetourPrevue) return null;
    const cible = new Date(dateRetourPrevue + 'T00:00:00');
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return Math.round((cible.getTime() - auj.getTime()) / 86400000);
  }

  // ──────────────────────────── Suivi blessure (journal + RTP) ────────────────────────────

  ouvrirSuivi(b: Blessure): void {
    if (this.suiviBlessure()?.id === b.id) { this.fermerSuivi(); return; }
    this.suiviBlessure.set(b);
    this.noteTexte.set('');
    this.blessureSuiviService.listerNotes(b.id).subscribe({ next: d => this.notes.set(d), error: () => {} });
    this.blessureSuiviService.listerRtp(b.id).subscribe({ next: d => this.rtp.set(d), error: () => {} });
  }
  fermerSuivi(): void {
    this.suiviBlessure.set(null);
    this.notes.set([]);
    this.rtp.set([]);
  }

  ajouterNote(): void {
    const b = this.suiviBlessure();
    const texte = this.noteTexte().trim();
    if (!b || !texte) return;
    this.blessureSuiviService.ajouterNote(b.id, texte).subscribe({
      next: n => { this.notes.update(l => [n, ...l]); this.noteTexte.set(''); },
      error: () => this.snack.open('Ajout impossible', 'Fermer', { duration: 3000 }),
    });
  }
  supprimerNote(n: BlessureNote): void {
    const b = this.suiviBlessure();
    if (!b) return;
    this.blessureSuiviService.supprimerNote(b.id, n.id).subscribe({
      next: () => this.notes.update(l => l.filter(x => x.id !== n.id)),
      error: () => {},
    });
  }

  initRtp(): void {
    const b = this.suiviBlessure();
    if (!b) return;
    this.blessureSuiviService.initialiserRtp(b.id).subscribe({
      next: d => this.rtp.set(d),
      error: () => this.snack.open('Protocole déjà initialisé', 'Fermer', { duration: 3000 }),
    });
  }
  /** Fait avancer une étape : À faire → En cours → Validée → À faire. */
  cyclerEtape(e: RtpEtape): void {
    const b = this.suiviBlessure();
    if (!b) return;
    const suivant: StatutEtape = e.statut === 'A_FAIRE' ? 'EN_COURS' : e.statut === 'EN_COURS' ? 'VALIDEE' : 'A_FAIRE';
    this.blessureSuiviService.majEtape(b.id, e.id, suivant).subscribe({
      next: maj => this.rtp.update(l => l.map(x => x.id === e.id ? maj : x)),
      error: () => {},
    });
  }
  supprimerRtp(): void {
    const b = this.suiviBlessure();
    if (!b || !confirm('Supprimer le protocole de reprise ?')) return;
    this.blessureSuiviService.supprimerRtp(b.id).subscribe({
      next: () => this.rtp.set([]),
      error: () => {},
    });
  }
  etapeClass(statut: StatutEtape): string {
    return statut === 'VALIDEE' ? 'et-validee' : statut === 'EN_COURS' ? 'et-encours' : 'et-afaire';
  }
}
