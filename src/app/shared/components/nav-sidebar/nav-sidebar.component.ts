import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from '@core/services/theme.service';
import { SidebarService } from '@core/services/sidebar.service';
import { AuthService, Role } from '@core/services/auth.service';
import { BarreContexteComponent } from '../barre-contexte/barre-contexte.component';

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN:   'Super-admin',
  PRESIDENT:     'Président',
  ENTRAINEUR:    'Entraîneur',
  PREPARATEUR:   'Préparateur',
  MEDICAL:       'Staff médical',
  ADMINISTRATIF: 'Administratif',
  JOUEUR:        'Joueur',
};

interface SubNavItem {
  label: string;
  link: string;          // routerLink (chemin)
  section?: string;      // valeur du query param ?section=
  default?: boolean;     // sous-item actif quand aucune section n'est précisée
  roles?: Role[];
  perms?: string[];      // visible AUSSI si l'utilisateur détient une de ces permissions (multi-rôle)
  disabled?: boolean;
}

interface NavModule {
  key: string;
  label: string;
  icon: string;
  link: string;              // route primaire (clic sur le module)
  presidentLink?: string;    // route primaire alternative pour PRESIDENT
  query?: Params;            // query params par défaut du module
  matches: string[];         // préfixes d'URL qui activent ce module
  roles: Role[];
  perms?: string[];          // visible AUSSI via permission (union multi-rôle)
  subnav: SubNavItem[];
}

const ALL_MODULES: NavModule[] = [
  {
    key: 'dashboard', label: 'Dashboard', icon: 'dashboard',
    link: '/dashboard', matches: ['/dashboard'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'],
    subnav: [],
  },
  {
    key: 'planning', label: 'Planning', icon: 'calendar_month',
    link: '/calendrier', matches: ['/calendrier', '/planning-technique'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'JOUEUR'],
    subnav: [
      { label: 'Séances',          link: '/calendrier' },
      { label: 'Schémas',          link: '/planning-technique', section: 'schemas',   roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['schemas:write'] },
      { label: 'Exercices',        link: '/planning-technique', section: 'exercices', default: true, roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['exercices:write'] },
      { label: 'Plan de jeu',      link: '/planning-technique', section: 'planjeu',   roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['plandejeu:write'] },
      { label: 'Match',            link: '/planning-technique', section: 'match',     roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['matchs:write'] },
    ],
  },
  {
    key: 'gps', label: 'GPS', icon: 'fitness_center',
    link: '/vue-seance', matches: ['/vue-seance', '/etat-effectif', '/charge-equipe', '/suivi-subjectif', '/pesees', '/import', '/methodologie', '/parametres'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'],
    perms: ['pesees:write', 'gps:import'],
    subnav: [
      { label: 'État de l\'effectif', link: '/etat-effectif' },
      { label: 'Charge de l\'équipe', link: '/charge-equipe' },
      { label: 'Vue séance',        link: '/vue-seance' },
      { label: 'Suivi subjectif',   link: '/suivi-subjectif' },
      // { label: 'Comparaison',       link: '/vue-seance', section: 'comparaison', disabled: true },
      // { label: 'Historique joueur', link: '/vue-seance', section: 'historique', disabled: true },
      { label: 'Pesées',            link: '/pesees',       roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'], perms: ['pesees:write'] },
      { label: 'Paramètres',        link: '/parametres',   roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR'], perms: ['configuration:write'] },
      { label: 'Import Excel',      link: '/import',       roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['gps:import'] },
      { label: 'Méthodologie',      link: '/methodologie', roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'] },
    ],
  },
  {
    key: 'medical', label: 'Médical', icon: 'healing',
    link: '/medical', query: { section: 'alertes' }, matches: ['/medical', '/mon-espace', '/suivi-subjectif', '/mes-blessures'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'JOUEUR'],
    subnav: [
      { label: 'Alertes',                       link: '/medical', section: 'alertes', default: true, roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
      { label: 'Blessures',                     link: '/medical', section: 'blessures', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
      { label: 'Bilan blessures',               link: '/medical', section: 'bilan', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
      { label: 'Documents',                     link: '/medical', section: 'documents', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
      { label: 'Mon suivi',                     link: '/suivi-subjectif', roles: ['JOUEUR'] },
      { label: 'Mes blessures',                 link: '/mes-blessures', roles: ['JOUEUR'] },
      { label: 'Mon espace',                    link: '/mon-espace', roles: ['JOUEUR'] },
    ],
  },
  {
    key: 'admin', label: 'Admin', icon: 'admin_panel_settings',
    link: '/admin/clubs', presidentLink: '/mon-club',
    matches: ['/admin', '/mon-club'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'],
    perms: ['club:manage'],
    subnav: [
      { label: 'Clubs',          link: '/admin/clubs', roles: ['SUPER_ADMIN'] },
      { label: 'Comptes du club', link: '/mon-club',   roles: ['SUPER_ADMIN'] },
      { label: 'Mon club',       link: '/mon-club',    roles: ['PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['club:manage'] },
    ],
  },
];

@Component({
  selector: 'app-nav-sidebar',
  standalone: true,
  templateUrl: './nav-sidebar.component.html',
  styleUrl: './nav-sidebar.component.scss',
  imports: [RouterLink, MatIcon, BarreContexteComponent],
})
export class NavSidebarComponent {

  public themeService = inject(ThemeService);
  public sidebarService = inject(SidebarService);
  private auth = inject(AuthService);
  private router = inject(Router);

  profileOpen = signal(false);

  /** URL courante (chemin + query), réactive aux navigations. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => (e as NavigationEnd).urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Décompose l'URL courante en { path, section }. */
  private readonly parsed = computed(() => {
    const url = this.currentUrl();
    const [path, query] = url.split('?');
    const section = new URLSearchParams(query ?? '').get('section');
    return { path, section };
  });

  /**
   * Visible si le rôle (legacy) correspond — comportement historique, zéro régression pour les
   * mono-rôle — OU si l'utilisateur détient une des permissions listées (union multi-rôle).
   */
  private visible(roles: Role[] | undefined, perms: string[] | undefined, userRole: Role): boolean {
    if (!roles && !perms) return true;
    const byRole = !!roles && roles.includes(userRole);
    const byPerm = !!perms && perms.some(p => this.auth.has(p));
    return byRole || byPerm;
  }

  readonly navModules = computed<NavModule[]>(() => {
    const user = this.auth.currentUser();
    if (!user) return [];
    return ALL_MODULES.filter(m => this.visible(m.roles, m.perms, user.role));
  });

  /** Route primaire du module (alternative président si définie). */
  moduleLink(m: NavModule): string {
    const user = this.auth.currentUser();
    // Lien primaire alternatif (/mon-club) pour le staff non super-admin.
    if (m.presidentLink && user && user.role !== 'SUPER_ADMIN') return m.presidentLink;
    return m.link;
  }

  moduleQuery(m: NavModule): Params {
    return m.query ?? {};
  }

  /**
   * Module actif d'après l'URL courante — restreint aux modules visibles par le rôle.
   * Ainsi une route partagée (ex. /suivi-subjectif présent dans GPS et Médical) s'active
   * sur le 1er module visible : GPS pour le staff physique, Médical pour le joueur.
   */
  private readonly activeModule = computed<NavModule | null>(() => {
    const { path } = this.parsed();
    return this.navModules().find(m => m.matches.some(p => path.startsWith(p))) ?? null;
  });

  isModuleActive(m: NavModule): boolean {
    return this.activeModule()?.key === m.key;
  }

  /** Sous-menu du module actif, filtré par rôle. */
  readonly activeSubnav = computed<SubNavItem[]>(() => {
    const user = this.auth.currentUser();
    const mod = this.activeModule();
    if (!user || !mod) return [];
    return mod.subnav.filter(s => this.visible(s.roles, s.perms, user.role));
  });

  isSubActive(item: SubNavItem): boolean {
    const { path, section } = this.parsed();
    if (path !== item.link) return false;
    if (!item.section) return !section;
    return section === item.section || (!section && !!item.default);
  }

  subQuery(item: SubNavItem): Params {
    return item.section ? { section: item.section } : {};
  }

  get user() { return this.auth.currentUser; }

  roleLabel(role: Role): string { return ROLE_LABELS[role] ?? role; }

  deconnexion(): void {
    this.profileOpen.set(false);
    this.sidebarService.close();
    this.auth.logout();
  }

  toggleProfile(): void { this.profileOpen.update(v => !v); }
  closeProfile(): void  { this.profileOpen.set(false); }
}
