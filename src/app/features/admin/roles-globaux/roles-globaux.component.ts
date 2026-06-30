import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionCat, RoleDef, RolesService } from '@core/services/roles.service';

interface ModuleGroup { module: string; perms: PermissionCat[]; }

/**
 * Écran SUPER_ADMIN « Rôles globaux » : édite les permissions des rôles PRÉDÉFINIS (communs à
 * tous les clubs) et gère des rôles globaux custom réutilisables. Aucune attribution ici :
 * les présidents attribuent ces rôles dans leur propre club (/mon-club).
 */
@Component({
  selector: 'app-roles-globaux',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './roles-globaux.component.html',
  styleUrl: './roles-globaux.component.scss',
})
export class RolesGlobauxComponent implements OnInit {

  private rolesSvc = inject(RolesService);
  private snack = inject(MatSnackBar);

  loading = signal(true);
  roles = signal<RoleDef[]>([]);
  catalogue = signal<PermissionCat[]>([]);

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

  // ── Édition d'un rôle (matrice) ──
  roleEditId = signal<string | 'new' | null>(null);
  roleLibelle = signal('');
  permSel = signal<Set<string>>(new Set());
  editSysteme = signal(false);
  editCode = signal('');
  savingRole = signal(false);

  /** Filtre de recherche dans la matrice de permissions (habillage). */
  permSearch = signal('');

  /** Nombre de permissions sélectionnées (compteur « x / total »). */
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

  ngOnInit(): void {
    this.rolesSvc.catalogueGlobal().subscribe({ next: c => this.catalogue.set(c) });
    this.charger();
  }

  private charger(): void {
    this.loading.set(true);
    this.rolesSvc.listerGlobaux().subscribe({
      next: r => { this.roles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  nouveauRole(): void {
    this.roleEditId.set('new');
    this.roleLibelle.set('');
    this.permSel.set(new Set());
    this.editSysteme.set(false);
    this.editCode.set('');
    this.permSearch.set('');
  }

  editerRole(r: RoleDef): void {
    this.roleEditId.set(r.id);
    this.roleLibelle.set(r.libelle);
    this.permSel.set(new Set(r.permissions));
    this.editSysteme.set(r.systeme);
    this.editCode.set(r.code);
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
    const id = this.roleEditId();
    // Garde-fou : modifier un rôle prédéfini impacte TOUS les clubs.
    if (id !== 'new' && this.editSysteme()
        && !confirm('Ce rôle est prédéfini : la modification s’applique à TOUS les clubs. Continuer ?')) {
      return;
    }
    const req = { libelle, permissions: [...this.permSel()] };
    this.savingRole.set(true);
    const obs = id === 'new' ? this.rolesSvc.creerGlobal(req) : this.rolesSvc.modifierGlobal(id!, req);
    obs.subscribe({
      next: () => { this.savingRole.set(false); this.roleEditId.set(null); this.charger(); },
      error: () => {
        this.savingRole.set(false);
        this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3500 });
      },
    });
  }

  supprimerRole(r: RoleDef): void {
    if (!confirm(`Supprimer le rôle global « ${r.libelle} » ?`)) return;
    this.rolesSvc.supprimerGlobal(r.id).subscribe({
      next: () => this.charger(),
      error: err => this.snack.open(
        err.status === 409 ? 'Rôle attribué à des membres — retirez-le d\'abord' : 'Suppression impossible',
        'Fermer', { duration: 3500 }),
    });
  }
}
