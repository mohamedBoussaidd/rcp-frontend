import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Blessure, BlessureRequest, BlessureService, StatutBlessure } from '@core/services/blessure.service';
import { BlessureNote, RtpEtape, StatutEtape, BlessureSuiviService } from '@core/services/blessure-suivi.service';
import { DocumentMedical, DocumentMedicalService } from '@core/services/document-medical.service';
import { Wellness, Rpe, SuiviSubjectifService } from '@core/services/suivi-subjectif.service';
import { PredictionService, ResumeJoueur } from '@core/services/prediction.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { AuthService } from '@core/services/auth.service';
import { ChartComponent, ApexChart, ApexAxisChartSeries, ApexNonAxisChartSeries, ApexXAxis, ApexYAxis, ApexStroke, ApexFill, ApexPlotOptions, ApexDataLabels, ApexLegend, ApexGrid, ApexMarkers } from 'ng-apexcharts';

@Component({
  selector: 'app-medical',
  standalone: true,
  templateUrl: './medical.component.html',
  styleUrl: './medical.component.scss',
  imports: [FormsModule, DatePipe, LowerCasePipe, RouterLink, ChartComponent],
})
export class MedicalComponent implements OnInit {

  /** Section active pilotée par ?section= (alertes par défaut). */
  private route = inject(ActivatedRoute);
  readonly section = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('section') ?? 'alertes')),
    { initialValue: 'alertes' },
  );

  readonly zones: { val: string; label: string }[] = [
    { val: 'cheville',       label: 'Cheville' },
    { val: 'genou',          label: 'Genou' },
    { val: 'ischio_jambier', label: 'Ischio-jambier' },
    { val: 'quadriceps',     label: 'Quadriceps' },
    { val: 'adducteur',      label: 'Adducteur' },
    { val: 'mollet',         label: 'Mollet' },
    { val: 'aine',           label: 'Aine' },
    { val: 'dos',            label: 'Dos' },
    { val: 'epaule',         label: 'Épaule' },
    { val: 'poignet',        label: 'Poignet' },
    { val: 'pied',           label: 'Pied' },
    { val: 'hanche',         label: 'Hanche' },
    { val: 'tendon_achille', label: "Tendon d'Achille" },
    { val: 'cervicales',     label: 'Cervicales' },
  ];
  readonly types: { val: string; label: string }[] = [
    { val: 'entorse',           label: 'Entorse' },
    { val: 'dechirure',         label: 'Déchirure' },
    { val: 'contracture',       label: 'Contracture' },
    { val: 'elongation',        label: 'Élongation' },
    { val: 'fracture',          label: 'Fracture' },
    { val: 'luxation',          label: 'Luxation' },
    { val: 'tendinite',         label: 'Tendinite' },
    { val: 'contusion',         label: 'Contusion' },
    { val: 'lesion_musculaire', label: 'Lésion musculaire' },
    { val: 'autre',             label: 'Autre' },
  ];
  readonly cotes: { val: string; label: string }[] = [
    { val: 'gauche',   label: 'Gauche' },
    { val: 'droit',    label: 'Droit' },
    { val: 'les_deux', label: 'Bilatéral' },
  ];
  readonly gravites: { val: string; label: string; sub: string }[] = [
    { val: 'leger',  label: 'Mineure', sub: 'Quelques jours' },
    { val: 'modere', label: 'Modérée', sub: '1–3 semaines' },
    { val: 'grave',  label: 'Sévère',  sub: 'Plusieurs semaines' },
  ];
  readonly causes: { val: string; label: string }[] = [
    { val: 'match',        label: 'Match' },
    { val: 'entrainement', label: 'Entraînement' },
    { val: 'hors_sport',   label: 'Hors sport' },
    { val: 'inconnue',     label: 'Inconnue' },
  ];
  readonly STATUTS_BLESSURE: { val: StatutBlessure; label: string }[] = [
    { val: 'INDISPONIBLE', label: 'Indisponible' },
    { val: 'EN_REPRISE',   label: 'En reprise' },
    { val: 'RETABLI',      label: 'Rétabli' },
  ];

  blessures = signal<Blessure[]>([]);
  joueurs   = signal<Joueur[]>([]);
  loading   = signal(true);

  documents          = signal<DocumentMedical[]>([]);
  filtreJoueurDoc    = signal('');
  rechercheDoc       = signal('');
  filtreCategorieDoc = signal('');

  /** Métadonnées d'affichage par catégorie de document (libellé, couleur, icône). */
  readonly CAT_META: Record<string, { label: string; color: string; icon: string }> = {
    irm:           { label: 'IRM',           color: '#8b5cf6', icon: '🩻' },
    radio:         { label: 'Radio',         color: '#6366f1', icon: '🩻' },
    echographie:   { label: 'Échographie',   color: '#0ea5e9', icon: '🩻' },
    bilan_sanguin: { label: 'Bilan sanguin', color: '#e11d48', icon: '🩸' },
    certificat:    { label: 'Certificat',    color: '#3b82f6', icon: '📄' },
    ordonnance:    { label: 'Ordonnance',    color: '#16a34a', icon: '💊' },
    autre:         { label: 'Autre',         color: '#64748b', icon: '📎' },
  };
  readonly CATEGORIES_DOC_LIST = ['irm', 'radio', 'echographie', 'bilan_sanguin', 'certificat', 'ordonnance', 'autre'];
  catMeta(v?: string): { label: string; color: string; icon: string } {
    return this.CAT_META[v ?? ''] ?? { label: this.joliLabel(v), color: '#64748b', icon: '📎' };
  }

  readonly ROLES_DOC_LIST = [
    { val: 'ENTRAINEUR', label: 'Entraîneur' },
    { val: 'PREPARATEUR', label: 'Préparateur' },
    { val: 'PRESIDENT', label: 'Président' },
  ];
  readonly ROLES_DOC: Record<string, string> = {
    ENTRAINEUR: 'Entraîneur', PREPARATEUR: 'Préparateur', PRESIDENT: 'Président',
  };

  /** Upload staff. */
  showDocForm = signal(false);
  docFile     = signal<File | null>(null);
  savingDoc   = signal(false);
  docForm: { joueurId: string; categorie: string; description: string; partageRoles: string[] } =
    { joueurId: '', categorie: 'certificat', description: '', partageRoles: [] };

  get documentsFiltres(): DocumentMedical[] {
    const q = this.rechercheDoc().toLowerCase().trim();
    const cat = this.filtreCategorieDoc();
    return this.documents().filter(d => {
      if (cat && d.categorie !== cat) return false;
      if (!q) return true;
      const hay = `${d.nomOriginal} ${d.description ?? ''} ${d.joueurPrenom} ${d.joueurNom} ${this.catMeta(d.categorie).label}`.toLowerCase();
      return hay.includes(q);
    });
  }

  /** « Tous » si partagé avec les 3 rôles staff, sinon « Restreint ». */
  accesLibelle(d: DocumentMedical): 'Tous' | 'Restreint' { return (d.partageRoles?.length ?? 0) >= 3 ? 'Tous' : 'Restreint'; }

  tempsRelatif(d?: string): string {
    if (!d) return '';
    const j = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (j < 1) return "aujourd'hui";
    if (j === 1) return 'hier';
    if (j < 30) return `il y a ${j} j`;
    const m = Math.floor(j / 30);
    if (m < 12) return `il y a ${m} mois`;
    const a = Math.floor(j / 365);
    return `il y a ${a} an${a > 1 ? 's' : ''}`;
  }

  ouvrirDepotDoc(): void {
    this.docForm = { joueurId: this.filtreJoueurDoc() || '', categorie: 'certificat', description: '', partageRoles: [] };
    this.docFile.set(null);
    this.showDocForm.set(true);
  }
  annulerDepotDoc(): void { this.showDocForm.set(false); this.docFile.set(null); }
  onDocFile(e: Event): void { this.docFile.set((e.target as HTMLInputElement).files?.[0] ?? null); }
  togglePartageDoc(role: string): void {
    const arr = this.docForm.partageRoles;
    const i = arr.indexOf(role);
    if (i >= 0) arr.splice(i, 1); else arr.push(role);
  }
  enregistrerDoc(): void {
    const f = this.docFile();
    if (!f || !this.docForm.joueurId) return;
    this.savingDoc.set(true);
    this.documentService.deposer(this.docForm.joueurId, f, this.docForm.categorie, this.docForm.description, this.docForm.partageRoles).subscribe({
      next: () => { this.savingDoc.set(false); this.showDocForm.set(false); this.docFile.set(null); this.chargerDocuments(); },
      error: () => { this.savingDoc.set(false); this.snack.open("Échec de l'envoi du document", 'Fermer', { duration: 3000 }); },
    });
  }

  wellness          = signal<Wellness[]>([]);
  rpe               = signal<Rpe[]>([]);
  filtreJoueurSuivi = signal('');
  readonly WELLNESS_ITEMS: { key: keyof Pick<Wellness, 'sommeil' | 'fatigue' | 'douleur' | 'stress' | 'humeur'>; label: string }[] = [
    { key: 'sommeil', label: 'Sommeil' },
    { key: 'fatigue', label: 'Fatigue' },
    { key: 'douleur', label: 'Courbatures' },
    { key: 'stress',  label: 'Stress' },
    { key: 'humeur',  label: 'Humeur' },
  ];

  showForm        = signal(false);
  editingId       = signal<string | null>(null);
  saving          = signal(false);
  form: BlessureRequest = this.formVide();
  geneEnConversion = signal<string | null>(null);

  /** Refonte Blessures : vue grille/liste, étapes de la modale, onglet du drawer. */
  vueBlessures = signal<'grille' | 'liste'>('grille');
  formStep     = signal(1);
  suiviTab     = signal<'resume' | 'protocole' | 'journal'>('resume');

  private joueursMap = computed(() => new Map(this.joueurs().map(j => [j.id, j])));

  etapeSuivante(): void   { this.formStep.update(s => Math.min(3, s + 1)); }
  etapePrecedente(): void { this.formStep.update(s => Math.max(1, s - 1)); }

  initiales(prenom?: string, nom?: string): string {
    return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '?';
  }
  posteJoueur(id: string): string {
    const p = this.joueursMap().get(id)?.postePrincipal;
    return p ? this.joliLabel(p) : '';
  }
  labelDe(list: { val: string; label: string }[], val?: string): string {
    if (!val) return '—';
    return list.find(x => x.val === val)?.label ?? this.joliLabel(val);
  }

  joursDepuis(b: Blessure): number {
    const debut = new Date(b.dateBlessure + 'T00:00:00');
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((auj.getTime() - debut.getTime()) / 86400000));
  }
  dureeEstimee(b: Blessure): number | null {
    if (!b.dateRetourPrevue) return null;
    const debut = new Date(b.dateBlessure + 'T00:00:00');
    const fin   = new Date(b.dateRetourPrevue + 'T00:00:00');
    return Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 86400000));
  }
  progressionTemps(b: Blessure): number {
    if (b.statut === 'RETABLI') return 100;
    const duree = this.dureeEstimee(b);
    if (!duree) return 0;
    return Math.min(100, Math.round(this.joursDepuis(b) / duree * 100));
  }
  progressionClass(pct: number): string { return pct >= 80 ? 'pg-ok' : pct >= 40 ? 'pg-warn' : 'pg-bad'; }

  get nbRetablisRecents(): number {
    const limite = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return this.blessures().filter(b => b.statut === 'RETABLI' && (b.dateRetourEffectif ?? '') >= limite).length;
  }
  get blessuresRetablies(): Blessure[] {
    return this.blessures().filter(b => b.statut === 'RETABLI')
      .sort((a, b) => (b.dateRetourEffectif ?? '').localeCompare(a.dateRetourEffectif ?? ''));
  }

  /** Changement rapide de statut depuis le drawer (renvoie le payload complet attendu par l'API). */
  changerStatut(b: Blessure, statut: StatutBlessure): void {
    if (b.statut === statut) return;
    const payload: BlessureRequest = {
      joueurId: b.joueurId, dateBlessure: b.dateBlessure,
      dateRetourEffectif: b.dateRetourEffectif || null, dateRetourPrevue: b.dateRetourPrevue || null,
      statut, typeBlessure: b.typeBlessure, zoneCorporelle: b.zoneCorporelle, cote: b.cote,
      gravite: b.gravite, causeProbable: b.causeProbable, recidive: b.recidive,
      commentaire: b.commentaire, notesMedicales: b.notesMedicales,
    };
    this.blessureService.modifier(b.id, payload).subscribe({
      next: maj => { this.suiviBlessure.set(maj); this.charger(); },
      error: ()  => this.snack.open('Changement de statut impossible', 'Fermer', { duration: 3000 }),
    });
  }

  suiviBlessure = signal<Blessure | null>(null);
  notes         = signal<BlessureNote[]>([]);
  rtp           = signal<RtpEtape[]>([]);
  noteTexte     = signal('');
  readonly ETAPE_LABELS: Record<StatutEtape, string> = {
    A_FAIRE: 'À faire', EN_COURS: 'En cours', VALIDEE: 'Validée',
  };

  get rtpProgression(): number {
    const t = this.rtp();
    if (t.length === 0) return 0;
    return Math.round(t.filter(e => e.statut === 'VALIDEE').length / t.length * 100);
  }

  joueursRisque     = signal<ResumeJoueur[]>([]);
  wellnessAlertes   = signal<Wellness[]>([]);
  readonly SEUIL_RETOUR_IMMINENT = 7;
  readonly MOMENTS_GENE: Record<string, string> = { EFFORT: "à l'effort", APRES: 'juste après', REPOS: 'au repos' };

  get genesSignalees(): Wellness[] {
    const limite = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    return this.wellnessAlertes().filter(w => w.geneZone && !w.geneTraitee && w.date >= limite).sort((a, b) => b.date.localeCompare(a.date));
  }
  get genesHistorique(): Wellness[] {
    return this.wellnessAlertes().filter(w => w.geneZone && w.geneTraitee).sort((a, b) => (b.geneTraiteeLe ?? b.date).localeCompare(a.geneTraiteeLe ?? a.date));
  }

  momentGeneLabel(v?: string): string   { return v ? (this.MOMENTS_GENE[v] ?? v) : ''; }
  resolutionGeneLabel(r?: string): string { return r === 'CONVERTIE' ? 'Convertie en blessure' : 'Archivée'; }

  get peutTraiterGene(): boolean      { return this.auth.canTraiterGene(); }
  get peutVoirHistoriqueGenes(): boolean { return this.auth.canTraiterGene(); }
  get peutRouvrirGene(): boolean      { return this.auth.canRouvrirGene(); }

  traiterGene(w: Wellness): void {
    if (!confirm('Archiver cette gêne ?')) return;
    this.suiviService.traiterGene(w.id, 'ARCHIVEE').subscribe({
      next: maj => this.wellnessAlertes.update(l => l.map(x => x.id === w.id ? maj : x)),
      error: ()  => this.snack.open('Action impossible', 'Fermer', { duration: 3000 }),
    });
  }
  rouvrirGene(w: Wellness): void {
    this.suiviService.rouvrirGene(w.id).subscribe({
      next: maj => this.wellnessAlertes.update(l => l.map(x => x.id === w.id ? maj : x)),
      error: ()  => this.snack.open('Action impossible', 'Fermer', { duration: 3000 }),
    });
  }
  convertirGeneEnBlessure(w: Wellness): void {
    if (!w.geneZone) return;
    this.editingId.set(null);
    this.form = { ...this.formVide(), joueurId: w.joueurId, dateBlessure: w.date, zoneCorporelle: w.geneZone };
    this.geneEnConversion.set(w.id);
    this.formStep.set(1);
    this.showForm.set(true);
  }

  get statsTotal(): number    { return this.blessures().length; }
  get statsEnCours(): number  { return this.blessures().filter(b => b.statut !== 'RETABLI').length; }
  get statsRecidivePct(): number {
    const t = this.blessures();
    return t.length === 0 ? 0 : Math.round(t.filter(b => b.recidive).length / t.length * 100);
  }
  get statsJoursPerdus(): number {
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return this.blessures().reduce((tot, b) => {
      if (!b.dateBlessure) return tot;
      const debut = new Date(b.dateBlessure + 'T00:00:00');
      const fin   = b.dateRetourEffectif ? new Date(b.dateRetourEffectif + 'T00:00:00') : auj;
      return tot + Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 86400000));
    }, 0);
  }
  get statsParZone(): { zone: string; count: number }[] {
    const map = new Map<string, number>();
    for (const b of this.blessures()) { const z = b.zoneCorporelle || 'autre'; map.set(z, (map.get(z) ?? 0) + 1); }
    return [...map.entries()].map(([zone, count]) => ({ zone, count })).sort((a, b) => b.count - a.count);
  }
  get statsZoneMax(): number { return this.statsParZone.reduce((m, z) => Math.max(m, z.count), 0); }
  get statsParGravite(): { leger: number; modere: number; grave: number } {
    const t = this.blessures();
    return { leger: t.filter(b => b.gravite === 'leger').length, modere: t.filter(b => b.gravite === 'modere').length, grave: t.filter(b => b.gravite === 'grave').length };
  }
  get retoursImminents(): Blessure[] {
    return this.blessures().filter(b => { if (b.statut === 'RETABLI' || !b.dateRetourPrevue) return false; const j = this.joursAvantRetour(b.dateRetourPrevue); return j !== null && j >= 0 && j <= this.SEUIL_RETOUR_IMMINENT; }).sort((a, b) => (a.dateRetourPrevue ?? '').localeCompare(b.dateRetourPrevue ?? ''));
  }
  get retoursEnRetard(): Blessure[] {
    return this.blessures().filter(b => { if (b.statut === 'RETABLI' || !b.dateRetourPrevue) return false; const j = this.joursAvantRetour(b.dateRetourPrevue); return j !== null && j < 0; }).sort((a, b) => (a.dateRetourPrevue ?? '').localeCompare(b.dateRetourPrevue ?? ''));
  }
  get joueursRisqueEleve(): ResumeJoueur[] { return this.joueursRisque().filter(j => j.niveau_risque === 'ELEVE' || j.niveau_fatigue === 'ALERTE'); }
  get aDesAlertes(): boolean { return this.retoursImminents.length > 0 || this.retoursEnRetard.length > 0 || this.joueursRisqueEleve.length > 0 || this.genesSignalees.length > 0; }
  get infirmerie(): Blessure[] { return this.blessures().filter(b => b.statut !== 'RETABLI').sort((a, b) => (a.dateRetourPrevue ?? '9999').localeCompare(b.dateRetourPrevue ?? '9999')); }
  get nbIndisponibles(): number { return this.blessures().filter(b => b.statut === 'INDISPONIBLE').length; }
  get nbEnReprise(): number     { return this.blessures().filter(b => b.statut === 'EN_REPRISE').length; }

  private blessureService = inject(BlessureService);
  private documentService = inject(DocumentMedicalService);
  private suiviService = inject(SuiviSubjectifService);
  private blessureSuiviService = inject(BlessureSuiviService);
  private predictionService = inject(PredictionService);
  private joueurService = inject(JoueurService);
  private snack = inject(MatSnackBar);
  auth = inject(AuthService);

  ngOnInit(): void {
    this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
    this.charger(); this.chargerDocuments(); this.chargerSuivi();
    this.predictionService.getResumeEquipe().subscribe({ next: d => this.joueursRisque.set(d), error: () => {} });
    this.suiviService.getWellness().subscribe({ next: d => this.wellnessAlertes.set(d), error: () => {} });
  }

  charger(): void {
    this.loading.set(true);
    this.blessureService.lister().subscribe({
      next: b => { this.blessures.set(b); this.loading.set(false); },
      error: ()  => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  nouveau(): void  { this.editingId.set(null); this.geneEnConversion.set(null); this.form = this.formVide(); this.formStep.set(1); this.showForm.set(true); }
  annuler(): void  { this.showForm.set(false); this.editingId.set(null); this.geneEnConversion.set(null); this.formStep.set(1); }
  editer(b: Blessure): void {
    this.editingId.set(b.id);
    this.form = { joueurId: b.joueurId, dateBlessure: b.dateBlessure, dateRetourEffectif: b.dateRetourEffectif ?? '', dateRetourPrevue: b.dateRetourPrevue ?? '', statut: b.statut, typeBlessure: b.typeBlessure, zoneCorporelle: b.zoneCorporelle, cote: b.cote, gravite: b.gravite, causeProbable: b.causeProbable, recidive: b.recidive, commentaire: b.commentaire, notesMedicales: b.notesMedicales };
    this.formStep.set(1);
    this.showForm.set(true);
  }
  enregistrer(): void {
    if (!this.form.joueurId || !this.form.dateBlessure) return;
    this.saving.set(true);
    const payload: BlessureRequest = { ...this.form, dateRetourEffectif: this.form.dateRetourEffectif || null };
    const id  = this.editingId();
    const obs = id ? this.blessureService.modifier(id, payload) : this.blessureService.creer(payload);
    obs.subscribe({
      next: () => {
        const geneId = this.geneEnConversion();
        if (geneId) { this.suiviService.traiterGene(geneId, 'CONVERTIE').subscribe({ next: maj => this.wellnessAlertes.update(l => l.map(x => x.id === geneId ? maj : x)), error: () => {} }); this.geneEnConversion.set(null); }
        this.saving.set(false); this.showForm.set(false); this.editingId.set(null); this.charger();
      },
      error: () => { this.saving.set(false); this.snack.open("Erreur lors de l'enregistrement", 'Fermer', { duration: 3000 }); },
    });
  }
  supprimer(b: Blessure): void {
    if (!confirm('Supprimer cette blessure ?')) return;
    this.blessureService.supprimer(b.id).subscribe({ next: () => this.charger(), error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }) });
  }

  chargerDocuments(): void { this.documentService.lister(this.filtreJoueurDoc() || undefined).subscribe({ next: d => this.documents.set(d), error: () => {} }); }
  onFiltreJoueurDoc(id: string): void  { this.filtreJoueurDoc.set(id); this.chargerDocuments(); }
  categorieDocLabel(val: string): string { return this.catMeta(val).label; }
  roleDocLabel(val: string): string      { return this.ROLES_DOC[val] ?? val; }
  tailleLisible(o: number): string {
    if (o < 1024) return o + ' o';
    if (o < 1024 * 1024) return Math.round(o / 1024) + ' Ko';
    return (Math.round(o / (1024 * 1024) * 10) / 10) + ' Mo';
  }
  telechargerDoc(doc: DocumentMedical): void {
    this.documentService.telecharger(doc.id).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = doc.nomOriginal; a.click(); URL.revokeObjectURL(url); },
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }
  supprimerDoc(doc: DocumentMedical): void {
    if (!confirm(`Supprimer « ${doc.nomOriginal} » ?`)) return;
    this.documentService.supprimer(doc.id).subscribe({ next: () => this.documents.update(l => l.filter(d => d.id !== doc.id)), error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }) });
  }

  chargerSuivi(): void {
    const id = this.filtreJoueurSuivi() || undefined;
    this.suiviService.getWellness(id).subscribe({ next: d => this.wellness.set(d), error: () => {} });
    this.suiviService.getRpe(id).subscribe({ next: d => this.rpe.set(d), error: () => {} });
  }
  onFiltreJoueurSuivi(id: string): void { this.filtreJoueurSuivi.set(id); this.chargerSuivi(); }

  scoreClass(score: number): string { return score >= 66 ? 'score-ok' : score >= 40 ? 'score-moyen' : 'score-bas'; }
  rpeClass(rpe: number): string     { return rpe >= 8 ? 'score-bas' : rpe >= 5 ? 'score-moyen' : 'score-ok'; }
  joliLabel(v?: string): string     { return v ? v.replace(/_/g, ' ') : '—'; }
  graviteClass(g?: string): string  { return g === 'grave' ? 'g-grave' : g === 'modere' ? 'g-modere' : g === 'leger' ? 'g-leger' : ''; }

  statutBlessureLabel(v?: string): string { return this.STATUTS_BLESSURE.find(s => s.val === v)?.label ?? v ?? '—'; }
  statutBlessureClass(v?: string): string { return v === 'EN_REPRISE' ? 'st-reprise' : v === 'RETABLI' ? 'st-retabli' : 'st-indispo'; }
  joursAvantRetour(d?: string): number | null {
    if (!d) return null;
    const cible = new Date(d + 'T00:00:00'); const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return Math.round((cible.getTime() - auj.getTime()) / 86400000);
  }

  ouvrirSuivi(b: Blessure): void {
    if (this.suiviBlessure()?.id === b.id) { this.fermerSuivi(); return; }
    this.suiviBlessure.set(b); this.noteTexte.set(''); this.suiviTab.set('resume');
    this.blessureSuiviService.listerNotes(b.id).subscribe({ next: d => this.notes.set(d), error: () => {} });
    this.blessureSuiviService.listerRtp(b.id).subscribe({ next: d => this.rtp.set(d), error: () => {} });
  }
  fermerSuivi(): void { this.suiviBlessure.set(null); this.notes.set([]); this.rtp.set([]); }

  ajouterNote(): void {
    const b = this.suiviBlessure(); const texte = this.noteTexte().trim();
    if (!b || !texte) return;
    this.blessureSuiviService.ajouterNote(b.id, texte).subscribe({ next: n => { this.notes.update(l => [n, ...l]); this.noteTexte.set(''); }, error: () => this.snack.open('Ajout impossible', 'Fermer', { duration: 3000 }) });
  }
  supprimerNote(n: BlessureNote): void {
    const b = this.suiviBlessure(); if (!b) return;
    this.blessureSuiviService.supprimerNote(b.id, n.id).subscribe({ next: () => this.notes.update(l => l.filter(x => x.id !== n.id)), error: () => {} });
  }
  initRtp(): void {
    const b = this.suiviBlessure(); if (!b) return;
    this.blessureSuiviService.initialiserRtp(b.id).subscribe({ next: d => this.rtp.set(d), error: () => this.snack.open('Protocole déjà initialisé', 'Fermer', { duration: 3000 }) });
  }
  cyclerEtape(e: RtpEtape): void {
    const b = this.suiviBlessure(); if (!b) return;
    const suivant: StatutEtape = e.statut === 'A_FAIRE' ? 'EN_COURS' : e.statut === 'EN_COURS' ? 'VALIDEE' : 'A_FAIRE';
    this.blessureSuiviService.majEtape(b.id, e.id, suivant).subscribe({ next: maj => this.rtp.update(l => l.map(x => x.id === e.id ? maj : x)), error: () => {} });
  }
  supprimerRtp(): void {
    const b = this.suiviBlessure(); if (!b || !confirm('Supprimer le protocole de reprise ?')) return;
    this.blessureSuiviService.supprimerRtp(b.id).subscribe({ next: () => this.rtp.set([]), error: () => {} });
  }
  etapeClass(statut: StatutEtape): string { return statut === 'VALIDEE' ? 'et-validee' : statut === 'EN_COURS' ? 'et-encours' : 'et-afaire'; }

  // ──────────────────────────── BILAN ────────────────────────────

  /** Catégories du donut « gravité » par durée réelle (+ part Inconnue si pas de date de retour). */
  readonly DUREE_CATS = [
    { label: 'Légère (< 7j)',      color: '#16a34a' },
    { label: 'Modérée (7–28j)',    color: '#f97316' },
    { label: 'Grave (> 28j)',      color: '#ef4444' },
    { label: 'Très grave (> 84j)', color: '#8b5cf6' },
    { label: 'Inconnue',           color: '#cbd5e1' },
  ];
  private readonly MOIS_SAISON = ['Août', 'Sep.', 'Oct.', 'Nov.', 'Déc.', 'Jan.', 'Fév.', 'Mars', 'Avr.', 'Mai', 'Juin'];

  /** Durée d'une blessure en jours (retour effectif sinon prévu) ; null si aucune date de retour. */
  dureeBlessure(b: Blessure): number | null {
    const fin = b.dateRetourEffectif ?? b.dateRetourPrevue;
    if (!fin) return null;
    const d0 = new Date(b.dateBlessure + 'T00:00:00');
    const d1 = new Date(fin + 'T00:00:00');
    return Math.max(0, Math.round((d1.getTime() - d0.getTime()) / 86400000));
  }

  get saisonDebutAnnee(): number {
    const n = new Date(); return n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1;
  }
  get saisonLabel(): string {
    const a = this.saisonDebutAnnee; return `${a}/${String((a + 1) % 100).padStart(2, '0')}`;
  }
  get matchsEstimes(): number { return Math.round(this.statsJoursPerdus / 11); }

  /** Répartition par durée → donut (counts pour la légende, series/labels/colors pour ApexCharts). */
  bilanGravite = computed(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const b of this.blessures()) {
      const d = this.dureeBlessure(b);
      if (d === null) counts[4]++;
      else if (d < 7) counts[0]++;
      else if (d <= 28) counts[1]++;
      else if (d <= 84) counts[2]++;
      else counts[3]++;
    }
    return {
      counts,
      series: counts as ApexNonAxisChartSeries,
      labels: this.DUREE_CATS.map(c => c.label),
      colors: this.DUREE_CATS.map(c => c.color),
    };
  });

  /** Évolution mensuelle sur la saison (Août → Juin) : total + récidives. */
  bilanEvolution = computed(() => {
    const debut = this.saisonDebutAnnee;
    const total = new Array(11).fill(0);
    const recid = new Array(11).fill(0);
    for (const b of this.blessures()) {
      if (!b.dateBlessure) continue;
      const d = new Date(b.dateBlessure + 'T00:00:00');
      const m = d.getMonth(); const y = d.getFullYear();
      let idx: number;
      if (y === debut && m >= 7) idx = m - 7;
      else if (y === debut + 1 && m <= 5) idx = m + 5;
      else continue;
      total[idx]++;
      if (b.recidive) recid[idx]++;
    }
    return {
      series: [
        { name: 'Total blessures', data: total },
        { name: 'Récidives',       data: recid },
      ] as ApexAxisChartSeries,
      xaxis: { categories: this.MOIS_SAISON, labels: { style: { colors: '#94a3b8' } } } as ApexXAxis,
    };
  });

  /** Barres horizontales « répartition par zone ». */
  bilanZonesBar = computed(() => {
    const z = this.statsParZone;
    return {
      series: [{ name: 'Blessures', data: z.map(x => x.count) }] as ApexAxisChartSeries,
      xaxis: { categories: z.map(x => this.labelDe(this.zones, x.zone)), labels: { style: { colors: '#94a3b8' } } } as ApexXAxis,
    };
  });

  /** Top 5 joueurs les plus touchés. */
  get joueursTouches(): { id: string; nom: string; prenom: string; poste: string; count: number }[] {
    const map = new Map<string, number>();
    for (const b of this.blessures()) map.set(b.joueurId, (map.get(b.joueurId) ?? 0) + 1);
    return [...map.entries()].map(([id, count]) => {
      const j = this.joueursMap().get(id);
      return { id, count, nom: j?.nom ?? '', prenom: j?.prenom ?? '', poste: j?.postePrincipal ?? '' };
    }).sort((a, b) => b.count - a.count).slice(0, 5);
  }
  posteAbbr(p?: string): string { return p ? this.joliLabel(p).slice(0, 3).toUpperCase() : ''; }

  // Configs ApexCharts statiques
  readonly donutChart: ApexChart       = { type: 'donut', height: 240, background: 'transparent', fontFamily: 'Manrope, sans-serif' };
  readonly donutPlot: ApexPlotOptions  = { pie: { donut: { size: '68%' } } };
  readonly donutDataLabels: ApexDataLabels = { enabled: false };
  readonly donutLegend: ApexLegend     = { show: false };
  readonly donutStroke: ApexStroke     = { width: 3, colors: ['#ffffff'] };

  readonly evoChart: ApexChart         = { type: 'area', height: 280, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif' };
  readonly evoStroke: ApexStroke       = { curve: 'smooth', width: 2 };
  readonly evoFill: ApexFill           = { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.04, stops: [0, 100] } };
  readonly evoDataLabels: ApexDataLabels = { enabled: false };
  readonly evoMarkers: ApexMarkers     = { size: 4, strokeWidth: 0, hover: { size: 6 } };
  readonly evoColors                   = ['#1A9C4D', '#B91C1C'];
  readonly evoLegend: ApexLegend       = { show: true, position: 'top', horizontalAlign: 'right' };
  readonly evoYaxis: ApexYAxis         = { min: 0, forceNiceScale: true, labels: { style: { colors: '#94a3b8' } } };

  readonly zonesChart: ApexChart       = { type: 'bar', height: 300, toolbar: { show: false }, background: 'transparent', fontFamily: 'Manrope, sans-serif' };
  readonly zonesPlot: ApexPlotOptions  = { bar: { horizontal: true, borderRadius: 4, barHeight: '62%' } };
  readonly zonesColors                 = ['#1A9C4D'];
  readonly zonesDataLabels: ApexDataLabels = { enabled: false };
  readonly zonesGrid: ApexGrid         = { borderColor: '#eef1f6', strokeDashArray: 4 };

  private formVide(): BlessureRequest {
    return { joueurId: '', dateBlessure: new Date().toISOString().slice(0, 10), dateRetourEffectif: '', dateRetourPrevue: '', statut: 'INDISPONIBLE', typeBlessure: '', zoneCorporelle: '', cote: '', gravite: '', causeProbable: '', recidive: false, commentaire: '', notesMedicales: '' };
  }
}
