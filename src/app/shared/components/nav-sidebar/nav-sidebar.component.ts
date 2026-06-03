import { Component, HostBinding, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from '../../../core/services/theme.service';
import { SidebarService } from '../../../core/services/sidebar.service';
import { AuthService, Role } from '../../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles: Role[];
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN:   'Super-admin',
  PRESIDENT:     'Président',
  ENTRAINEUR:    'Entraîneur',
  PREPARATEUR:   'Préparateur',
  MEDICAL:       'Staff médical',
  ADMINISTRATIF: 'Administratif',
  JOUEUR:        'Joueur',
};

@Component({
  selector: 'app-nav-sidebar',
  standalone: true,
  templateUrl: './nav-sidebar.component.html',
  styleUrl: './nav-sidebar.component.scss',
  imports: [RouterLink, RouterLinkActive, MatIcon]
})
export class NavSidebarComponent {
  @HostBinding('class.open') get isOpen() { return this.sidebarService.isOpen(); }

  private readonly allItems: NavItem[] = [
    { label: 'Administration', icon: 'admin_panel_settings', route: '/admin/clubs', roles: ['SUPER_ADMIN'] },
    { label: 'Mon club',     icon: 'groups',         route: '/mon-club',    roles: ['PRESIDENT'] },
    { label: 'Dashboard',    icon: 'dashboard',      route: '/dashboard',   roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
    { label: 'Calendrier',   icon: 'calendar_month', route: '/calendrier',  roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
    { label: 'Séances',      icon: 'fitness_center', route: '/seances',     roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'JOUEUR'] },
    { label: 'Pesées',       icon: 'monitor_weight', route: '/pesees',      roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'] },
    { label: 'Médical',      icon: 'healing',        route: '/medical',     roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
    { label: 'Import Excel', icon: 'upload_file',    route: '/import',      roles: ['SUPER_ADMIN', 'PREPARATEUR'] },
    { label: 'Méthodologie', icon: 'science',        route: '/methodologie', roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'] },
    { label: 'Paramètres',   icon: 'settings',       route: '/parametres',  roles: ['SUPER_ADMIN', 'PRESIDENT'] },
  ];

  readonly navItems = computed<NavItem[]>(() => {
    const user = this.auth.currentUser();
    if (!user) return [];
    return this.allItems.filter(item => item.roles.includes(user.role));
  });

  get user() { return this.auth.currentUser; }

  constructor(
    public themeService: ThemeService,
    public sidebarService: SidebarService,
    private auth: AuthService,
  ) {}

  roleLabel(role: Role): string {
    return ROLE_LABELS[role] ?? role;
  }

  deconnexion(): void {
    this.sidebarService.close();
    this.auth.logout();
  }
}
