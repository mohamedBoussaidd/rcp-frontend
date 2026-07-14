import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Affectation, PermissionCat, RoleDef, RolesService } from '@core/services/roles.service';
import { Equipe, Membre, MonClubService } from '@core/services/mon-club.service';

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
  equipes = signal<Equipe[]>([]);
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

  /** Filtre de recherche dans la matrice de permissions (habillage). */
  permSearch = signal('');
  readonly nbPermSel = computed(() => this.permSel().size);

  /** Modules filtrés par la recherche (ne masque pas la sélection sous-jacente). */
  readonly modulesAffiches = computed<ModuleGroup[]>(() => {
    const q = this.permSearch().trim().toLowerCase();
    const base = this.modules();
    if (!q) return base;
    return base
      .map(g => ({ module: g.module, perms: g.perms.filter(p => p.libelle.toLowerCase().includes(q)) }))
      .filter(g => g.perms.length > 0);
  });

  moduleSelCount(g: ModuleGroup): number { return g.perms.filter(p => this.permSel().has(p.code)).length; }
  moduleAllChecked(g: ModuleGroup): boolean { return g.perms.length > 0 && g.perms.every(p => this.permSel().has(p.code)); }
  toggleModule(g: ModuleGroup): void {
    const all = this.moduleAllChecked(g);
    this.permSel.update(s => {
      const n = new Set(s);
      for (const p of g.perms) { all ? n.delete(p.code) : n.add(p.code); }
      return n;
    });
  }

  // ── Attribution de rôles à un membre ──
  membreEditId = signal<string | null>(null);
  /** Rôles sélectionnés → équipe ciblée ('' = équipe du membre, ou tout le club s'il n'en a pas). */
  rolesSel = signal<Map<string, string>>(new Map());
  savingAffectation = signal(false);

  /** Membre dont la modale d'attribution est ouverte. */
  readonly membreEnEdition = computed(() => this.staff().find(m => m.id === this.membreEditId()) ?? null);

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
        this.equipes.set(d.equipes);
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

  /** Initiales pour l'avatar (habillage). */
  initiales(m: Membre): string { return ((m.prenom?.[0] ?? '') + (m.nom?.[0] ?? '')).toUpperCase(); }

  // ─────────────── Rôles custom ───────────────

  nouveauRole(): void {
    this.roleEditId.set('new');
    this.roleLibelle.set('');
    this.permSel.set(new Set());
    this.permSearch.set('');
  }

  editerRole(r: RoleDef): void {
    this.roleEditId.set(r.id);
    this.roleLibelle.set(r.libelle);
    this.permSel.set(new Set(r.permissions));
    this.permSearch.set('');
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
    this.rolesSel.set(new Map(this.rolesDuMembre(m).map(a => [a.roleId, a.equipeId ?? ''])));
  }

  annulerMembre(): void { this.membreEditId.set(null); }

  toggleRoleMembre(roleId: string): void {
    this.rolesSel.update(s => {
      const n = new Map(s);
      n.has(roleId) ? n.delete(roleId) : n.set(roleId, '');
      return n;
    });
  }

  roleMembreActif(roleId: string): boolean { return this.rolesSel().has(roleId); }

  /** Équipe ciblée par l'affectation du rôle ('' = équipe par défaut du membre). */
  equipeRole(roleId: string): string { return this.rolesSel().get(roleId) ?? ''; }

  choisirEquipeRole(roleId: string, equipeId: string): void {
    this.rolesSel.update(s => {
      const n = new Map(s);
      if (n.has(roleId)) n.set(roleId, equipeId);
      return n;
    });
  }

  nomEquipe(id?: string): string | null {
    return this.equipes().find(e => e.id === id)?.nom ?? null;
  }

  enregistrerMembre(m: Membre): void {
    // '' = pas d'équipe explicite → le back retombe sur l'équipe du membre (ou club entier sans équipe).
    const items = [...this.rolesSel().entries()]
      .map(([roleId, equipeId]) => equipeId ? { roleId, equipeId } : { roleId });
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
