import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Blessure, BlessureRequest, BlessureService, StatutBlessure } from '../../core/services/blessure.service';
import { DocumentMedical, DocumentMedicalService } from '../../core/services/document-medical.service';
import { Wellness, Rpe, SuiviSubjectifService } from '../../core/services/suivi-subjectif.service';
import { Joueur, JoueurService } from '../../core/services/joueur.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-medical',
  standalone: true,
  templateUrl: './medical.component.html',
  styleUrl: './medical.component.scss',
  imports: [FormsModule, DatePipe, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
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

  constructor(
    private blessureService: BlessureService,
    private documentService: DocumentMedicalService,
    private suiviService: SuiviSubjectifService,
    private joueurService: JoueurService,
    private snack: MatSnackBar,
    public auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
    this.charger();
    this.chargerDocuments();
    this.chargerSuivi();
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

  annuler(): void { this.showForm.set(false); this.editingId.set(null); }

  enregistrer(): void {
    if (!this.form.joueurId || !this.form.dateBlessure) return;
    this.saving.set(true);
    const payload: BlessureRequest = { ...this.form, dateRetourEffectif: this.form.dateRetourEffectif || null };
    const id = this.editingId();
    const obs = id ? this.blessureService.modifier(id, payload) : this.blessureService.creer(payload);
    obs.subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.editingId.set(null); this.charger(); },
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
}
