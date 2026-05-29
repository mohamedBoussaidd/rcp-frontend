import { Component, HostBinding } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from '../../../core/services/theme.service';
import { SidebarService } from '../../../core/services/sidebar.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-nav-sidebar',
  standalone: true,
  templateUrl: './nav-sidebar.component.html',
  styleUrl: './nav-sidebar.component.scss',
  imports: [RouterLink, RouterLinkActive, MatIcon]
})
export class NavSidebarComponent {
  @HostBinding('class.open') get isOpen() { return this.sidebarService.isOpen(); }

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',    icon: 'dashboard',       route: '/dashboard' },
    { label: 'Calendrier',   icon: 'calendar_month',  route: '/calendrier' },
    { label: 'Séances',      icon: 'fitness_center',  route: '/seances' },
    { label: 'Pesées',       icon: 'monitor_weight',  route: '/pesees' },
    { label: 'Import Excel', icon: 'upload_file',     route: '/import' },
    { label: 'Méthodologie', icon: 'science',         route: '/methodologie' },
    { label: 'Paramètres',   icon: 'settings',        route: '/parametres' },
  ];

  constructor(public themeService: ThemeService, public sidebarService: SidebarService) {}
}
