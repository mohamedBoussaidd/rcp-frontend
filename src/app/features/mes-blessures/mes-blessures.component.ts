import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { EspaceJoueurService, DocumentMedical, RtpEtape } from '@core/services/espace-joueur.service';
import { Blessure } from '@core/services/blessure.service';

/**
 * Vue JOUEUR « Mes blessures » : historique de ses blessures en cartes, avec le
 * protocole de reprise (RTP) dépliable, + ses documents médicaux. Lecture seule
 * (le staff gère les blessures via le menu Médical). Données scopées par le token.
 */
@Component({
  selector: 'app-mes-blessures',
  standalone: true,
  templateUrl: './mes-blessures.component.html',
  styleUrl: './mes-blessures.component.scss',
  imports: [DatePipe, FormsModule, MatIcon],
})
export class MesBlessuresComponent implements OnInit {

  private service = inject(EspaceJoueurService);

  loading = signal(true);
  nonLie = signal(false);
  blessures = signal<Blessure[]>([]);
  documents = signal<DocumentMedical[]>([]);

  /** Carte dépliée (id de blessure) + cache des étapes RTP par blessure. */
  ouvert = signal<string | null>(null);
  rtpParBlessure = signal<Record<string, RtpEtape[]>>({});

  readonly STATUTS: Record<string, string> = {
    INDISPONIBLE: 'Indisponible', EN_REPRISE: 'En reprise', RETABLI: 'Rétabli',
  };
  readonly ETAPE_LABELS: Record<string, string> = {
    A_FAIRE: 'À faire', EN_COURS: 'En cours', VALIDEE: 'Validée',
  };

  // ── Documents médicaux ──
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
  partageEnEdition = signal<string | null>(null);

  /** Blessures triées (en cours d'abord, puis plus récentes). */
  readonly blessuresTriees = computed(() =>
    [...this.blessures()].sort((a, b) => {
      if (a.enCours !== b.enCours) return a.enCours ? -1 : 1;
      return (b.dateBlessure ?? '').localeCompare(a.dateBlessure ?? '');
    }));

  ngOnInit(): void {
    this.service.getBlessures().subscribe({
      next: d => { this.blessures.set(d); this.loading.set(false); },
      error: err => { this.loading.set(false); if (err.status === 409) this.nonLie.set(true); },
    });
    this.chargerDocuments();
  }

  // ──────────────────────────── Blessures ────────────────────────────

  basculer(b: Blessure): void {
    if (this.ouvert() === b.id) { this.ouvert.set(null); return; }
    this.ouvert.set(b.id);
    if (!this.rtpParBlessure()[b.id]) {
      this.service.getEtapesRtp(b.id).subscribe({
        next: e => this.rtpParBlessure.update(m => ({ ...m, [b.id]: e })),
        error: () => this.rtpParBlessure.update(m => ({ ...m, [b.id]: [] })),
      });
    }
  }

  etapes(blessureId: string): RtpEtape[] { return this.rtpParBlessure()[blessureId] ?? []; }

  rtpProgression(blessureId: string): number {
    const e = this.etapes(blessureId);
    return e.length === 0 ? 0 : Math.round(e.filter(x => x.statut === 'VALIDEE').length / e.length * 100);
  }

  statutLabel(v?: string): string { return v ? (this.STATUTS[v] ?? v) : '—'; }
  statutClasse(v?: string): string {
    return v === 'RETABLI' ? 'ok' : v === 'EN_REPRISE' ? 'moyen' : 'bad';
  }
  etapeClasse(s: string): string { return s === 'VALIDEE' ? 'ok' : s === 'EN_COURS' ? 'moyen' : ''; }
  graviteClasse(g?: string): string { return g === 'grave' ? 'bad' : g === 'modere' ? 'moyen' : 'ok'; }

  joursAvantRetour(d?: string): number | null {
    if (!d) return null;
    const cible = new Date(d + 'T00:00:00'); const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return Math.round((cible.getTime() - auj.getTime()) / 86400000);
  }
  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  // ──────────────────────────── Documents médicaux ────────────────────────────

  private chargerDocuments(): void {
    this.service.getDocumentsMedicaux().subscribe({ next: d => this.documents.set(d), error: () => {} });
  }
  categorieLabel(val: string): string { return this.CATEGORIES.find(c => c.val === val)?.label ?? val; }
  roleLabel(val: string): string { return this.ROLES_PARTAGE.find(r => r.val === val)?.label ?? val; }
  tailleLisible(octets: number): string {
    if (octets < 1024) return octets + ' o';
    if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
    return (Math.round(octets / (1024 * 1024) * 10) / 10) + ' Mo';
  }

  ouvrirDepot(): void { this.erreurDepot.set(null); this.depotOuvert.set(true); }
  annulerDepot(): void {
    this.depotOuvert.set(false); this.fichierSel.set(null); this.categorieSel.set('certificat');
    this.descriptionSel.set(''); this.partageSel.set([]); this.erreurDepot.set(null);
  }
  onFichier(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fichierSel.set(input.files?.[0] ?? null);
  }
  togglePartageDepot(role: string): void {
    this.partageSel.update(roles => roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role]);
  }
  deposer(): void {
    const fichier = this.fichierSel();
    if (!fichier) { this.erreurDepot.set('Choisissez un fichier.'); return; }
    if (fichier.size > 10 * 1024 * 1024) { this.erreurDepot.set('Fichier trop volumineux (max 10 Mo).'); return; }
    this.envoiEnCours.set(true); this.erreurDepot.set(null);
    this.service.deposerDocumentMedical(fichier, this.categorieSel(), this.descriptionSel(), this.partageSel())
      .subscribe({
        next: doc => { this.documents.update(list => [doc, ...list]); this.envoiEnCours.set(false); this.annulerDepot(); },
        error: err => {
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
        const a = document.createElement('a'); a.href = url; a.download = doc.nomOriginal; a.click();
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
      ? doc.partageRoles.filter(r => r !== role) : [...doc.partageRoles, role];
    this.service.modifierPartageDocument(doc.id, roles).subscribe({
      next: maj => this.documents.update(list => list.map(d => d.id === doc.id ? maj : d)),
      error: () => {},
    });
  }
}
