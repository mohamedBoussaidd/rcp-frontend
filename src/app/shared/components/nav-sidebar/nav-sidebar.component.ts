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
  module?: string;       // masqué si ce MODULE fonctionnel n'est pas actif pour le club (pack)
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
  module?: string;           // masqué si ce MODULE n'est pas actif (couche pack/abonnement)
  modulesAny?: string[];     // conteneur : visible si AU MOINS un de ces modules est actif
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
    link: '/calendrier', matches: ['/calendrier', '/planning-technique', '/modeles-semaine', '/saisons', '/comparaison-saisons'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'JOUEUR'],
    subnav: [
      { label: 'Séances',          link: '/calendrier' },
      { label: 'Schémas',          link: '/planning-technique', section: 'schemas',   roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['schemas:write'], module: 'tactique' },
      { label: 'Exercices',        link: '/planning-technique', section: 'exercices', default: true, roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['exercices:write'], module: 'tactique' },
      { label: 'Plan de jeu',      link: '/planning-technique', section: 'planjeu',   roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['plandejeu:write'], module: 'tactique' },
      { label: 'Match',            link: '/planning-technique', section: 'match',     roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['matchs:write'], module: 'match' },
      { label: 'Diaporama',        link: '/planning-technique', section: 'diaporama', roles: ['SUPER_ADMIN', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['diaporama:write'], module: 'diaporama' },
      { label: 'Saisons',          link: '/saisons', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['saison:manage'] },
      { label: 'Modèles de semaine', link: '/modeles-semaine', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['seances:write'] },
      { label: 'Comparaison saisons', link: '/comparaison-saisons', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
    ],
  },
  {
    key: 'performance', label: 'Performance', icon: 'fitness_center',
    link: '/vue-seance', matches: ['/vue-seance', '/etat-effectif', '/charge-equipe', '/suivi-subjectif', '/pesees', '/import', '/methodologie', '/parametres'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'],
    perms: ['pesees:write', 'gps:import'],
    modulesAny: ['gps', 'prepa_physique', 'wellness', 'pesees'],
    subnav: [
      { label: 'État de l\'effectif', link: '/etat-effectif', module: 'prepa_physique' },
      { label: 'Charge d\'entrainement', link: '/charge-equipe', module: 'gps' },
      { label: 'Vue séance',        link: '/vue-seance', module: 'gps' },
      { label: 'RPE/sRPE',   link: '/suivi-subjectif', module: 'wellness' },
      // { label: 'Comparaison',       link: '/vue-seance', section: 'comparaison', disabled: true },
      // { label: 'Historique joueur', link: '/vue-seance', section: 'historique', disabled: true },
      { label: 'Pesées',            link: '/pesees',       roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'], perms: ['pesees:write'], module: 'pesees' },
      { label: 'Paramètres',        link: '/parametres',   roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR'], perms: ['configuration:write'] },
      { label: 'Import GPS',      link: '/import',       roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['gps:import'], module: 'gps' },
      { label: 'Méthodologie',      link: '/methodologie', roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'], module: 'prepa_physique' },
    ],
  },
  {
    key: 'presence', label: 'Présence', icon: 'fact_check',
    link: '/presence', matches: ['/presence'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'],
    perms: ['presence:write'],
    module: 'presence',
    subnav: [],
  },
  {
    key: 'suivi', label: 'Suivi individuel', icon: 'psychology',
    link: '/suivi-entretiens', matches: ['/suivi-entretiens'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'],
    perms: ['entretien:read'],
    module: 'suivi_individuel',
    subnav: [],
  },
  {
    key: 'annuaire', label: 'Annuaire', icon: 'groups',
    link: '/annuaire', matches: ['/annuaire'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR'],
    perms: ['joueurs:write'],
    subnav: [],
  },
  {
    key: 'documents-admin', label: 'Licences & documents', icon: 'assignment_turned_in',
    link: '/documents-admin', matches: ['/documents-admin'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'],
    perms: ['docadmin:read'],
    module: 'documents_admin',
    subnav: [],
  },
  {
    key: 'medical', label: 'Médical', icon: 'healing',
    link: '/medical', query: { section: 'alertes' }, matches: ['/medical', '/mon-espace', '/suivi-subjectif', '/mes-blessures'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'JOUEUR'],
    module: 'medical',
    subnav: [
      { label: 'Alertes',                       link: '/medical', section: 'alertes', default: true, roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      { label: 'Blessures',                     link: '/medical', section: 'blessures', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      { label: 'Bilan blessures',               link: '/medical', section: 'bilan', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      { label: 'Documents',                     link: '/medical', section: 'documents', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      { label: 'Mon suivi',                     link: '/suivi-subjectif', roles: ['JOUEUR'], module: 'wellness' },
      { label: 'Mes blessures',                 link: '/mes-blessures', roles: ['JOUEUR'], module: 'medical' },
      { label: 'Mon espace',                    link: '/mon-espace', roles: ['JOUEUR'] },
    ],
  },
  {
    key: 'admin', label: 'Admin', icon: 'admin_panel_settings',
    link: '/admin/clubs', presidentLink: '/mon-club',
    matches: ['/admin', '/mon-club'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR'],
    perms: ['club:manage', 'membres:manage'],
    subnav: [
      { label: 'Clubs',          link: '/admin/clubs', roles: ['SUPER_ADMIN'] },
      { label: 'Packs & modules', link: '/admin/abonnements', roles: ['SUPER_ADMIN'] },
      { label: 'Rôles globaux',  link: '/admin/roles-globaux', roles: ['SUPER_ADMIN'] },
      { label: 'Comptes du club', link: '/mon-club',   roles: ['SUPER_ADMIN'] },
      { label: 'Mon club',       link: '/mon-club',    roles: ['PRESIDENT', 'ENTRAINEUR'], perms: ['club:manage', 'membres:manage'] },
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

  /**
   * Visible du point de vue MODULE (couche pack/abonnement) : `module` = ce module doit être actif ;
   * `modulesAny` = au moins un des modules doit l'être (conteneurs mixtes comme « Performance »).
   * Sans contrainte de module → toujours visible.
   */
  private moduleVisible(module?: string, modulesAny?: string[]): boolean {
    if (module && !this.auth.hasModule(module)) return false;
    if (modulesAny && !modulesAny.some(m => this.auth.hasModule(m))) return false;
    return true;
  }

  readonly navModules = computed<NavModule[]>(() => {
    const user = this.auth.currentUser();
    if (!user) return [];
    return ALL_MODULES.filter(m =>
      this.visible(m.roles, m.perms, user.role) && this.moduleVisible(m.module, m.modulesAny));
  });

  /**
   * Cible d'atterrissage du conteneur (chemin + query), résolue selon les MODULES actifs.
   * Un conteneur mixte comme « Performance » a un lien par défaut (ex. /vue-seance, GPS) qui peut
   * être fermé par le pack : si l'écran par défaut n'est pas souscrit, on vise le 1er sous-item
   * réellement ouvert (module actif + rôle), pour ne jamais atterrir sur une route bloquée par le
   * moduleGuard. Pour un club complet, l'écran par défaut reste accessible → comportement inchangé.
   */
  private landingTarget(m: NavModule): { link: string; query: Params } {
    const user = this.auth.currentUser();
    // Lien primaire alternatif (/mon-club) pour le staff non super-admin.
    if (m.presidentLink && user && user.role !== 'SUPER_ADMIN') return { link: m.presidentLink, query: {} };

    const defaut = { link: m.link, query: m.query ?? {} };
    if (user && m.subnav.length) {
      const accessible = (s: SubNavItem) =>
        this.visible(s.roles, s.perms, user.role) && this.moduleVisible(s.module);
      const parDefaut = m.subnav.find(s => s.link === m.link);
      if (parDefaut && accessible(parDefaut)) return defaut;
      const premier = m.subnav.find(accessible);
      if (premier) return { link: premier.link, query: premier.section ? { section: premier.section } : {} };
    }
    return defaut;
  }

  /** Route primaire du module (alternative président si définie ; repli sur 1er écran souscrit). */
  moduleLink(m: NavModule): string {
    return this.landingTarget(m).link;
  }

  moduleQuery(m: NavModule): Params {
    return this.landingTarget(m).query;
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
    const visibles = mod.subnav.filter(s =>
      this.visible(s.roles, s.perms, user.role) && this.moduleVisible(s.module));
    // Dédoublonne les items menant à la même destination (même lien + section) : ex. « Comptes du
    // club » (super-admin) et « Mon club » (président) pointent tous deux sur /mon-club, et un
    // super-admin — qui détient toutes les permissions — les voyait s'afficher ET s'activer tous
    // les deux. On garde le 1er visible pour n'avoir qu'une entrée active.
    const vues = new Set<string>();
    return visibles.filter(s => {
      const cle = s.link + '?' + (s.section ?? '');
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
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
