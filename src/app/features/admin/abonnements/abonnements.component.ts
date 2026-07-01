import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LowerCasePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import {
  ClubAbonnement, ModuleCatalogue, Pack, PackService, PackUpsert,
} from '@core/services/pack.service';
import { Club, ClubService } from '@core/services/club.service';

/**
 * Administration commerciale (SUPER_ADMIN) : catalogue de packs (avec prix éditable) et affectation
 * pack + modules à chaque club. Complète l'écran « Clubs » (création/gestion) sans le modifier.
 */
@Component({
  selector: 'app-abonnements',
  standalone: true,
  templateUrl: './abonnements.component.html',
  styleUrl: './abonnements.component.scss',
  imports: [FormsModule, LowerCasePipe],
})
export class AbonnementsComponent implements OnInit {

  private packService = inject(PackService);
  private clubService = inject(ClubService);
  private snack = inject(MatSnackBar);

  packs = signal<Pack[]>([]);
  catalogue = signal<ModuleCatalogue[]>([]);
  clubs = signal<Club[]>([]);
  loading = signal(true);

  /** Abonnement chargé par club (à l'ouverture de la ligne). */
  abonnements = signal<Record<string, ClubAbonnement>>({});
  clubOuvert = signal<string | null>(null);

  /** Modules activables (hors socle), ordonnés — pour les matrices. */
  readonly activables = computed(() => this.catalogue().filter(m => !m.socle));
  readonly socles = computed(() => this.catalogue().filter(m => m.socle));

  /* ── Modale pack ── */
  showPackForm = signal(false);
  editingPackCode = signal<string | null>(null);
  savingPack = signal(false);
  packForm = this.packFormVide();

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    forkJoin({
      packs: this.packService.packs(),
      modules: this.packService.modules(),
      clubs: this.clubService.lister(),
    }).subscribe({
      next: ({ packs, modules, clubs }) => {
        this.packs.set(packs);
        this.catalogue.set(modules);
        this.clubs.set(clubs);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.erreur('Erreur de chargement'); },
    });
  }

  libellePack(code?: string | null): string {
    if (!code) return 'Aucun pack';
    return this.packs().find(p => p.code === code)?.libelle ?? code;
  }

  libelleModule(code: string): string {
    return this.catalogue().find(m => m.code === code)?.libelle ?? code;
  }

  /* ══ Clubs : affectation pack + surcharges ══ */

  toggleClub(c: Club): void {
    if (this.clubOuvert() === c.id) { this.clubOuvert.set(null); return; }
    this.clubOuvert.set(c.id);
    if (!this.abonnements()[c.id]) this.chargerAbonnement(c.id);
  }

  private chargerAbonnement(clubId: string): void {
    this.packService.abonnement(clubId).subscribe({
      next: ab => this.abonnements.update(m => ({ ...m, [clubId]: ab })),
      error: () => this.erreur('Abonnement introuvable'),
    });
  }

  abonnement(clubId: string): ClubAbonnement | undefined { return this.abonnements()[clubId]; }

  changerPack(clubId: string, packCode: string): void {
    this.packService.assignerPack(clubId, packCode).subscribe({
      next: ab => { this.abonnements.update(m => ({ ...m, [clubId]: ab })); this.ok('Pack attribué'); },
      error: (e) => this.erreur(e?.error?.message ?? 'Attribution impossible'),
    });
  }

  toggleModule(clubId: string, moduleCode: string, actif: boolean): void {
    this.packService.definirModule(clubId, moduleCode, actif).subscribe({
      next: ab => this.abonnements.update(m => ({ ...m, [clubId]: ab })),
      error: (e) => this.erreur(e?.error?.message ?? 'Modification impossible'),
    });
  }

  sourceLabel(source: string): string {
    switch (source) {
      case 'SOCLE': return 'Socle';
      case 'PACK': return 'Pack';
      case 'MANUEL_ON': return 'Ajout';
      case 'MANUEL_OFF': return 'Retiré';
      default: return 'Inactif';
    }
  }

  /* ══ Packs : CRUD ══ */

  ouvrirNouveauPack(): void {
    this.editingPackCode.set(null);
    this.packForm = this.packFormVide();
    this.showPackForm.set(true);
  }

  ouvrirEditionPack(p: Pack): void {
    this.editingPackCode.set(p.code);
    this.packForm = {
      libelle: p.libelle,
      description: p.description ?? '',
      prixMensuel: p.prixMensuel ?? null,
      ordre: p.ordre,
      actif: p.actif,
      modules: new Set(p.modules),
    };
    this.showPackForm.set(true);
  }

  fermerPackForm(): void { this.showPackForm.set(false); }

  togglePackModule(code: string): void {
    const s = new Set(this.packForm.modules);
    s.has(code) ? s.delete(code) : s.add(code);
    this.packForm = { ...this.packForm, modules: s };
  }

  enregistrerPack(): void {
    if (!this.packForm.libelle.trim()) { this.erreur('Le libellé est obligatoire'); return; }
    this.savingPack.set(true);
    const req: PackUpsert = {
      libelle: this.packForm.libelle.trim(),
      description: this.packForm.description,
      prixMensuel: this.packForm.prixMensuel,
      ordre: this.packForm.ordre,
      actif: this.packForm.actif,
      modules: [...this.packForm.modules],
    };
    const code = this.editingPackCode();
    const obs = code ? this.packService.majPack(code, req) : this.packService.creerPack(req);
    obs.subscribe({
      next: () => { this.savingPack.set(false); this.showPackForm.set(false); this.ok(code ? 'Pack modifié' : 'Pack créé'); this.charger(); },
      error: (e) => { this.savingPack.set(false); this.erreur(e?.error?.message ?? 'Enregistrement impossible'); },
    });
  }

  supprimerPack(p: Pack): void {
    if (p.predefini) { this.erreur('Un pack prédéfini ne peut pas être supprimé'); return; }
    if (!confirm(`Supprimer le pack « ${p.libelle} » ?`)) return;
    this.packService.supprimerPack(p.code).subscribe({
      next: () => { this.ok('Pack supprimé'); this.charger(); },
      error: (e) => this.erreur(e?.error?.message ?? 'Suppression impossible'),
    });
  }

  private packFormVide() {
    return { libelle: '', description: '', prixMensuel: null as number | null, ordre: 0, actif: true, modules: new Set<string>() };
  }

  private ok(msg: string): void { this.snack.open(msg, 'Fermer', { duration: 2500 }); }
  private erreur(msg: string): void { this.snack.open(msg, 'Fermer', { duration: 3500 }); }
}
