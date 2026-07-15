import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AnnuaireJoueur, JoueurService } from '@core/services/joueur.service';
import { BulletinLigne, Contrat, ContratRequest, ContratService, ContratStats } from '@core/services/contrat.service';
import { ContexteService } from '@core/services/contexte.service';

/**
 * Contrats & fiches de paye (contrats:manage — Président/Administratif).
 * Onglet Contrats : vue club filtrée par équipe (effectif saison), échéances, PDF signé.
 * Onglet Fiches de paye : dépôt par période → « Distribuer » → suivi déposé/notifié/téléchargé.
 */
@Component({
  selector: 'app-contrats',
  standalone: true,
  templateUrl: './contrats.component.html',
  styleUrl: './contrats.component.scss',
  imports: [FormsModule, DatePipe],
})
export class ContratsComponent implements OnInit {

  private contratService = inject(ContratService);
  private joueurService = inject(JoueurService);
  private snack = inject(MatSnackBar);
  contexte = inject(ContexteService);

  readonly onglet = signal<'contrats' | 'paie'>('contrats');
  readonly annuaire = signal<AnnuaireJoueur[]>([]);
  readonly TYPES_CONTRAT = ['Professionnel', 'Fédéral', 'CDD', 'CDI', 'Service civique', 'Bénévole', 'Autre'];

  // ── Contrats ──
  readonly contrats = signal<Contrat[]>([]);
  readonly stats = signal<ContratStats | null>(null);
  readonly filtreEquipe = signal('');
  showForm = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  form: ContratRequest = this.formVide();

  readonly contratsFiltres = computed(() => {
    const eq = this.filtreEquipe();
    if (!eq) return this.contrats();
    return this.contrats().filter(c => c.equipeId === eq);
  });

  // ── Paie ──
  readonly periode = signal(new Date().toISOString().slice(0, 7));
  readonly lignes = signal<BulletinLigne[]>([]);
  readonly distribuant = signal(false);
  depotJoueurId = '';
  depotFile: File | null = null;
  readonly deposant = signal(false);

  readonly nbNonNotifies = computed(() => this.lignes().filter(l => !l.notifieLe).length);

  ngOnInit(): void {
    this.chargerContrats();
    this.joueurService.getAnnuaire().subscribe({ next: a => this.annuaire.set(a), error: () => {} });
    this.chargerLignes();
  }

  // ──────────────── Contrats ────────────────

  chargerContrats(): void {
    this.contratService.lister().subscribe({ next: c => this.contrats.set(c), error: () => {} });
    this.contratService.stats().subscribe({ next: s => this.stats.set(s), error: () => {} });
  }

  nomPersonne(joueurId: string): string {
    const p = this.annuaire().find(a => a.joueurId === joueurId);
    return p ? `${p.prenom} ${p.nom}` : '';
  }

  nouveau(): void { this.editingId.set(null); this.form = this.formVide(); this.showForm.set(true); }
  editer(c: Contrat): void {
    this.editingId.set(c.id);
    this.form = { joueurId: c.joueurId, typeContrat: c.typeContrat, dateDebut: c.dateDebut, dateFin: c.dateFin ?? '', notes: c.notes ?? '' };
    this.showForm.set(true);
  }
  annuler(): void { this.showForm.set(false); this.editingId.set(null); }

  enregistrer(): void {
    if (!this.form.joueurId || !this.form.typeContrat || !this.form.dateDebut) return;
    this.saving.set(true);
    const payload: ContratRequest = { ...this.form, dateFin: this.form.dateFin || null, notes: this.form.notes || null };
    const id = this.editingId();
    const obs = id ? this.contratService.modifier(id, payload) : this.contratService.creer(payload);
    obs.subscribe({
      next: () => { this.saving.set(false); this.annuler(); this.chargerContrats(); },
      error: () => { this.saving.set(false); this.snack.open("Erreur lors de l'enregistrement", 'Fermer', { duration: 3000 }); },
    });
  }

  supprimer(c: Contrat): void {
    if (!confirm(`Supprimer le contrat de ${c.joueurPrenom} ${c.joueurNom} ?`)) return;
    this.contratService.supprimer(c.id).subscribe({
      next: () => this.chargerContrats(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  joindrePdf(c: Contrat, e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.contratService.deposerFichier(c.id, f).subscribe({
      next: () => this.chargerContrats(),
      error: () => this.snack.open("Échec de l'envoi du document", 'Fermer', { duration: 3000 }),
    });
  }

  telechargerPdf(c: Contrat): void {
    this.contratService.telechargerFichier(c.id).subscribe({
      next: blob => this.sauver(blob, c.nomOriginal || 'contrat.pdf'),
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  statutBadge(c: Contrat): { label: string; cls: string } {
    if (!c.actif && c.dateFin && c.joursRestants !== null && c.joursRestants! < 0) return { label: 'Expiré', cls: 'ct-badge--off' };
    if (!c.actif) return { label: 'À venir', cls: 'ct-badge--info' };
    if (c.joursRestants !== null && c.joursRestants !== undefined && c.joursRestants <= 90) {
      return { label: `Expire dans ${c.joursRestants} j`, cls: 'ct-badge--warn' };
    }
    return { label: 'Actif', cls: 'ct-badge--ok' };
  }

  // ──────────────── Paie ────────────────

  changerPeriode(p: string): void { this.periode.set(p); this.chargerLignes(); }
  chargerLignes(): void {
    this.contratService.lignes(this.periode()).subscribe({ next: l => this.lignes.set(l), error: () => {} });
  }

  onDepotFile(e: Event): void { this.depotFile = (e.target as HTMLInputElement).files?.[0] ?? null; }

  deposerBulletin(): void {
    if (!this.depotJoueurId || !this.depotFile) return;
    this.deposant.set(true);
    this.contratService.deposerBulletin(this.depotJoueurId, this.periode(), this.depotFile).subscribe({
      next: () => {
        this.deposant.set(false); this.depotJoueurId = ''; this.depotFile = null;
        this.chargerLignes();
      },
      error: () => { this.deposant.set(false); this.snack.open("Échec du dépôt", 'Fermer', { duration: 3000 }); },
    });
  }

  distribuer(): void {
    if (!confirm(`Distribuer les ${this.nbNonNotifies()} bulletin(s) de la période ? Les personnes seront notifiées.`)) return;
    this.distribuant.set(true);
    this.contratService.distribuer(this.periode()).subscribe({
      next: r => {
        this.distribuant.set(false);
        this.snack.open(`${r.distribues} bulletin(s) distribué(s), ${r.notifies} notifié(s)`, 'Fermer', { duration: 4000 });
        this.chargerLignes();
      },
      error: () => { this.distribuant.set(false); this.snack.open('Distribution impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  telechargerBulletin(l: BulletinLigne): void {
    this.contratService.telechargerBulletin(l.id).subscribe({
      next: blob => this.sauver(blob, l.nomOriginal),
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimerBulletin(l: BulletinLigne): void {
    if (!confirm(`Supprimer le bulletin de ${l.joueurPrenom} ${l.joueurNom} ?`)) return;
    this.contratService.supprimerBulletin(l.id).subscribe({
      next: () => this.chargerLignes(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private sauver(blob: Blob, nom: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom; a.click();
    URL.revokeObjectURL(url);
  }

  private formVide(): ContratRequest {
    return { joueurId: '', typeContrat: '', dateDebut: new Date().toISOString().slice(0, 10), dateFin: '', notes: '' };
  }
}
