import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Affectation, PermissionCat, RoleDef, RolesService } from '@core/services/roles.service';
import { Membre, MonClubService } from '@core/services/mon-club.service';

interface ModuleGroup { module: string; perms: PermissionCat[]; }

/**
 * Onglet « Rôles & accès » : gestion des rôles custom du club (matrice de permissions)
 * et attribution d'un ou plusieurs rôles aux membres du staff. Réservé à club:manage.
 */
@Component({
  selector: 'app-roles-acces',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './roles-acces.component.html',
  styleUrl: './roles-acces.component.scss',
})
export class RolesAccesComponent implements OnInit {

  private rolesSvc = inject(RolesService);
  private clubSvc = inject(MonClubService);
  private snack = inject(MatSnackBar);

  loading = signal(true);
  roles = signal<RoleDef[]>([]);
  catalogue = signal<PermissionCat[]>([]);
  membres = signal<Membre[]>([]);
  /** Affectations par membre (cache), chargées au démarrage. */
  affs = signal<Record<string, Affectation[]>>({});

  /** Permissions regroupées par module pour la matrice. */
  readonly modules = computed<ModuleGroup[]>(() => {
    const map = new Map<string, PermissionCat[]>();
    for (const p of this.catalogue()) {
      const arr = map.get(p.module) ?? [];
      arr.push(p);
      map.set(p.module, arr);
    }
    return [...map.entries()].map(([module, perms]) => ({ module, perms }));
  });

  /** Membres du staff (le joueur garde son espace perso, hors RBAC). */
  readonly staff = computed(() => this.membres().filter(m => m.role !== 'JOUEUR'));

  // ── Édition d'un rôle custom (matrice) ──
  roleEditId = signal<string | 'new' | null>(null);
  roleLibelle = signal('');
  permSel = signal<Set<string>>(new Set());
  savingRole = signal(false);

  // ── Attribution de rôles à un membre ──
  membreEditId = signal<string | null>(null);
  rolesSel = signal<Set<string>>(new Set());
  savingAffectation = signal(false);

  ngOnInit(): void {
    this.rolesSvc.catalogue().subscribe({ next: c => this.catalogue.set(c) });
    this.charger();
  }

  private charger(): void {
    this.loading.set(true);
    this.rolesSvc.lister().subscribe({ next: r => this.roles.set(r), error: () => {} });
    this.clubSvc.getMonClub().subscribe({
      next: d => {
        this.membres.set(d.membres);
        this.loading.set(false);
        d.membres.filter(m => m.role !== 'JOUEUR').forEach(m => this.chargerAff(m.id));
      },
      error: () => this.loading.set(false),
    });
  }

  private chargerAff(membreId: string): void {
    this.rolesSvc.affectations(membreId).subscribe({
      next: a => this.affs.update(map => ({ ...map, [membreId]: a })),
    });
  }

  rolesDuMembre(m: Membre): Affectation[] { return this.affs()[m.id] ?? []; }

  // ─────────────── Rôles custom ───────────────

  nouveauRole(): void {
    this.roleEditId.set('new');
    this.roleLibelle.set('');
    this.permSel.set(new Set());
  }

  editerRole(r: RoleDef): void {
    this.roleEditId.set(r.id);
    this.roleLibelle.set(r.libelle);
    this.permSel.set(new Set(r.permissions));
  }

  annulerRole(): void { this.roleEditId.set(null); }

  togglePerm(code: string): void {
    this.permSel.update(s => {
      const n = new Set(s);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  permActive(code: string): boolean { return this.permSel().has(code); }

  enregistrerRole(): void {
    const libelle = this.roleLibelle().trim();
    if (!libelle) { this.snack.open('Donnez un nom au rôle', 'Fermer', { duration: 2500 }); return; }
    const req = { libelle, permissions: [...this.permSel()] };
    const id = this.roleEditId();
    this.savingRole.set(true);
    const obs = id === 'new' ? this.rolesSvc.creer(req) : this.rolesSvc.modifier(id!, req);
    obs.subscribe({
      next: () => { this.savingRole.set(false); this.roleEditId.set(null); this.rechargerRoles(); },
      error: err => {
        this.savingRole.set(false);
        this.snack.open(err.status === 403 ? 'Permission non autorisée' : 'Enregistrement impossible', 'Fermer', { duration: 3500 });
      },
    });
  }

  supprimerRole(r: RoleDef): void {
    if (!confirm(`Supprimer le rôle « ${r.libelle} » ?`)) return;
    this.rolesSvc.supprimer(r.id).subscribe({
      next: () => this.rechargerRoles(),
      error: err => this.snack.open(
        err.status === 409 ? 'Rôle attribué à des membres — retirez-le d\'abord' : 'Suppression impossible',
        'Fermer', { duration: 3500 }),
    });
  }

  private rechargerRoles(): void {
    this.rolesSvc.lister().subscribe({ next: r => this.roles.set(r) });
  }

  // ─────────────── Attribution membres ───────────────

  gererMembre(m: Membre): void {
    this.membreEditId.set(m.id);
    this.rolesSel.set(new Set(this.rolesDuMembre(m).map(a => a.roleId)));
  }

  annulerMembre(): void { this.membreEditId.set(null); }

  toggleRoleMembre(roleId: string): void {
    this.rolesSel.update(s => {
      const n = new Set(s);
      n.has(roleId) ? n.delete(roleId) : n.add(roleId);
      return n;
    });
  }

  roleMembreActif(roleId: string): boolean { return this.rolesSel().has(roleId); }

  enregistrerMembre(m: Membre): void {
    const items = [...this.rolesSel()].map(roleId => ({ roleId }));
    this.savingAffectation.set(true);
    this.rolesSvc.definirRoles(m.id, items).subscribe({
      next: a => {
        this.savingAffectation.set(false);
        this.affs.update(map => ({ ...map, [m.id]: a }));
        this.membreEditId.set(null);
        this.rechargerRoles(); // met à jour les compteurs d'affectation
        this.snack.open('Rôles mis à jour', 'Fermer', { duration: 2500 });
      },
      error: err => {
        this.savingAffectation.set(false);
        this.snack.open(err.status === 403 ? 'Rôle non autorisé' : 'Mise à jour impossible', 'Fermer', { duration: 3500 });
      },
    });
  }
}
