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
  // ── 01 · Planning : calendrier du club + cadre de la saison (lecture partagée, Administratif inclus) ──
  {
    key: 'planning', label: 'Planning', icon: 'calendar_month',
    link: '/calendrier', matches: ['/calendrier', '/modeles-semaine', '/saisons'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'ADMINISTRATIF', 'JOUEUR'],
    perms: ['seances:read'],
    subnav: [
      { label: 'Calendrier',         link: '/calendrier', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'ADMINISTRATIF', 'JOUEUR'] },
      { label: 'Générer une séance (IA)', link: '/generer-seance', roles: ['SUPER_ADMIN', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['seances:write'] },
      { label: 'Modèles de semaine', link: '/modeles-semaine', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['seances:write'] },
      { label: 'Saisons',            link: '/saisons', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['saison:manage'] },
    ],
  },
  // ── 02 · Coaching : zone tactique/terrain de l'entraîneur — gate dédié `coaching:access` ──
  // Le Préparateur n'a PAS `coaching:access` → il sort proprement de Coaching (fin du leak
  // `seances:write`). Le menu est un conteneur : chaque sous-écran garde son propre module (pack).
  {
    key: 'coaching', label: 'Coaching', icon: 'sports_soccer',
    link: '/coaching', matches: ['/coaching', '/planning-technique', '/seances-modeles', '/comparaison-saisons'],
    roles: ['SUPER_ADMIN'],
    perms: ['coaching:access'],
    subnav: [
      { label: 'Vue d\'ensemble',     link: '/coaching', roles: ['SUPER_ADMIN'], perms: ['coaching:access'] },
      // « Modèles de séance » et non « Séances » : cet écran est la bibliothèque de GABARITS,
      // les séances planifiées vivent dans le Calendrier — le libellé générique faisait chercher
      // ici les séances créées au planning.
      { label: 'Modèles de séance',   link: '/seances-modeles', roles: ['SUPER_ADMIN'], perms: ['seances_modeles:access'], module: 'seances_modeles' },
      { label: 'Schémas',             link: '/planning-technique', section: 'schemas',   roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['schemas:write'], module: 'tactique' },
      { label: 'Exercices',           link: '/planning-technique', section: 'exercices', roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['exercices:write'], module: 'tactique' },
      { label: 'Plan de jeu',         link: '/planning-technique', section: 'planjeu',   roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['plandejeu:write'], module: 'tactique' },
      { label: 'Match',               link: '/planning-technique', section: 'match',     roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['matchs:write'], module: 'match' },
      { label: 'Diaporama',           link: '/planning-technique', section: 'diaporama', roles: ['SUPER_ADMIN', 'ENTRAINEUR'], perms: ['diaporama:write'], module: 'diaporama' },
      { label: 'Comparaison saisons', link: '/comparaison-saisons', roles: ['SUPER_ADMIN'], perms: ['coaching:access'] },
    ],
  },
  // ── 03 · Performance : préparation physique (+ overview préparateur) ──
  {
    key: 'performance', label: 'Performance', icon: 'fitness_center',
    link: '/performance', matches: ['/performance', '/vue-seance', '/etat-effectif', '/charge-equipe', '/suivi-subjectif', '/pesees', '/import', '/import-rpe', '/import-hooper', '/methodologie', '/parametres'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'],
    perms: ['pesees:write', 'gps:import'],
    modulesAny: ['gps', 'prepa_physique', 'wellness', 'pesees'],
    subnav: [
      { label: 'Vue d\'ensemble',   link: '/performance', roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'] },
      { label: 'État de l\'effectif', link: '/etat-effectif', module: 'prepa_physique' },
      { label: 'Charge d\'entrainement', link: '/charge-equipe', module: 'gps' },
      { label: 'Vue séance',        link: '/vue-seance', module: 'gps' },
      { label: 'RPE/sRPE',          link: '/suivi-subjectif', module: 'wellness' },
      { label: 'Pesées',            link: '/pesees',       roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'], perms: ['pesees:write'], module: 'pesees' },
      { label: 'Paramètres',        link: '/parametres',   roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR'], perms: ['configuration:write'] },
      { label: 'Import GPS',        link: '/import',       roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['gps:import'], module: 'gps' },
      { label: 'Import RPE',        link: '/import-rpe',   roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['rpe:import'], module: 'wellness' },
      { label: 'Import ressenti',   link: '/import-hooper', roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['hooper:import'], module: 'wellness' },
      { label: 'Méthodologie',      link: '/methodologie', roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'], module: 'prepa_physique' },
    ],
  },
  // ── 04 · Suivi des membres : présence + entretiens individuels ──
  // Gate 100 % par permission (plus par rôle) : le Médical n'a plus `entretien:read` (V53) et n'a
  // pas `presence:write` → menu masqué ; l'Administratif entre via `entretien:read` (V53).
  {
    key: 'suivi-membres', label: 'Suivi des membres', icon: 'supervisor_account',
    link: '/presence', matches: ['/presence', '/suivi-entretiens'],
    roles: ['SUPER_ADMIN'],
    perms: ['presence:write', 'entretien:read'],
    subnav: [
      { label: 'Présence',    link: '/presence', roles: ['SUPER_ADMIN'], perms: ['presence:write'], module: 'presence' },
      { label: 'Entretiens',  link: '/suivi-entretiens', roles: ['SUPER_ADMIN'], perms: ['entretien:read'], module: 'suivi_individuel' },
    ],
  },
  // ── 05 · Médical (inchangé) ──
  {
    key: 'medical', label: 'Médical', icon: 'healing',
    link: '/medical', query: { section: 'alertes' }, matches: ['/medical', '/mon-espace', '/suivi-subjectif', '/mes-blessures'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'ADMINISTRATIF', 'JOUEUR'],
    module: 'medical',
    subnav: [
      { label: 'Alertes',                       link: '/medical', section: 'alertes', default: true, roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      // Administratif : accès blessures pour la qualification arrêt/accident + déclarations (V57).
      { label: 'Blessures',                     link: '/medical', section: 'blessures', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'ADMINISTRATIF'], module: 'medical' },
      { label: 'Protocoles',                    link: '/medical', section: 'protocoles', roles: ['SUPER_ADMIN', 'PRESIDENT', 'MEDICAL'], module: 'medical' },
      { label: 'Bilan blessures',               link: '/medical', section: 'bilan', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      { label: 'Documents',                     link: '/medical', section: 'documents', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], module: 'medical' },
      { label: 'Mon suivi',                     link: '/suivi-subjectif', roles: ['JOUEUR'], module: 'wellness' },
      { label: 'Mes blessures',                 link: '/mes-blessures', roles: ['JOUEUR'], module: 'medical' },
      { label: 'Mon espace',                    link: '/mon-espace', roles: ['JOUEUR'] },
    ],
  },
  // ── 06 · Administration : données administratives des membres (+ overview administratif) ──
  {
    key: 'administration', label: 'Administration', icon: 'badge',
    link: '/administration', matches: ['/administration', '/annuaire', '/documents-admin', '/contrats'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'],
    perms: ['docadmin:read', 'joueurs:write', 'contrats:manage'],
    subnav: [
      { label: 'Vue d\'ensemble',       link: '/administration', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF'] },
      { label: 'Catégories d\'âge',      link: '/administration/categories-age', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF'], perms: ['docadmin:read'] },
      { label: 'Annuaire',              link: '/annuaire', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR'], perms: ['joueurs:write'] },
      { label: 'Licences & documents',  link: '/documents-admin', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], perms: ['docadmin:read'], module: 'documents_admin' },
      // Confidentiel : Président/Administratif uniquement (contrats:manage), module contrats (V59).
      { label: 'Contrats & paie',       link: '/contrats', roles: ['SUPER_ADMIN'], perms: ['contrats:manage'], module: 'contrats' },
    ],
  },
  // ── 07 · Gestion du club : configuration (comptes, équipes, rôles, apparence) ──
  {
    key: 'gestion-club', label: 'Gestion du club', icon: 'admin_panel_settings',
    link: '/admin/clubs', matches: ['/admin', '/mon-club', '/tableau-president'],
    roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'ADMINISTRATIF'],
    perms: ['club:manage', 'membres:manage'],
    subnav: [
      { label: 'Mon tableau de bord', link: '/tableau-president', roles: ['PRESIDENT'] },
      { label: 'Clubs',          link: '/admin/clubs', roles: ['SUPER_ADMIN'] },
      { label: 'Packs & modules', link: '/admin/abonnements', roles: ['SUPER_ADMIN'] },
      { label: 'Rôles globaux',  link: '/admin/roles-globaux', roles: ['SUPER_ADMIN'] },
      { label: 'Paramètres IA',  link: '/admin/parametres-ia', roles: ['SUPER_ADMIN'] },
      { label: 'Maintenance',    link: '/admin/maintenance', roles: ['SUPER_ADMIN'] },
      { label: 'IA (clés & modèles)', link: '/admin/ia', roles: ['SUPER_ADMIN'] },
      { label: 'Exercices globaux', link: '/admin/exercices-globaux', roles: ['SUPER_ADMIN'] },
      { label: 'Schémas globaux', link: '/admin/schemas-globaux', roles: ['SUPER_ADMIN'] },
      { label: 'Mon club',       link: '/mon-club',    roles: ['PRESIDENT', 'ENTRAINEUR', 'ADMINISTRATIF'], perms: ['club:manage', 'membres:manage'] },
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

  /**
   * Un conteneur n'a de sens que s'il lui reste AU MOINS un sous-item accessible (rôle + module).
   * Sans cette garde, un menu dont tous les sous-écrans ont été fermés par le pack resterait affiché
   * mais mènerait à du vide / une route bloquée. Un conteneur sans sous-menu est piloté par ses
   * propres gates (module/rôle) et reste visible.
   */
  private hasAccessibleSubnav(m: NavModule, userRole: Role): boolean {
    if (!m.subnav.length) return true;
    return m.subnav.some(s =>
      this.visible(s.roles, s.perms, userRole) && this.moduleVisible(s.module));
  }

  readonly navModules = computed<NavModule[]>(() => {
    const user = this.auth.currentUser();
    if (!user) return [];
    return ALL_MODULES.filter(m =>
      this.visible(m.roles, m.perms, user.role)
      && this.moduleVisible(m.module, m.modulesAny)
      && this.hasAccessibleSubnav(m, user.role));
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

  /** Lien de bascule vers l'espace mobile staff (/staff) : rôles non-joueur, module actif. */
  peutEspaceStaff(): boolean { return this.auth.peutEspaceStaff(); }

  allerEspaceMobile(): void {
    this.profileOpen.set(false);
    this.sidebarService.close();
    this.router.navigate(['/staff']);
  }

  toggleProfile(): void { this.profileOpen.update(v => !v); }
  closeProfile(): void  { this.profileOpen.set(false); }
}
