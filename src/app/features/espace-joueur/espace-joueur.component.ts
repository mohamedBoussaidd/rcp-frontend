import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { EspaceJoueurService, MaPesee, DocumentMedical } from '../../core/services/espace-joueur.service';
import { Joueur, GpsPoint } from '../../core/services/joueur.service';
import { Blessure } from '../../core/services/blessure.service';
import { Seance } from '../../core/services/seance.service';

@Component({
  selector: 'app-espace-joueur',
  standalone: true,
  templateUrl: './espace-joueur.component.html',
  styleUrl: './espace-joueur.component.scss',
  imports: [DatePipe, DecimalPipe, FormsModule, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class EspaceJoueurComponent implements OnInit {

  profil = signal<Joueur | null>(null);
  pesees = signal<MaPesee[]>([]);
  blessures = signal<Blessure[]>([]);
  gps = signal<GpsPoint[]>([]);
  seances = signal<Seance[]>([]);
  documents = signal<DocumentMedical[]>([]);
  loading = signal(true);
  nonLie = signal(false);

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

  /** Séances non annulées à partir d'aujourd'hui, triées chronologiquement (vue « prévues »). */
  readonly seancesAVenir = computed(() => {
    const auj = new Date().toISOString().slice(0, 10);
    return this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date >= auj)
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
    this.service.getBlessures().subscribe({ next: d => this.blessures.set(d), error: () => {} });
    this.service.getGps().subscribe({ next: d => this.gps.set(d), error: () => {} });
    this.service.getSeances().subscribe({ next: d => this.seances.set(d), error: () => {} });
    this.chargerDocuments();
  }

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

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
