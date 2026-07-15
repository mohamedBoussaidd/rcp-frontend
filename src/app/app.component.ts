import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeService } from '@core/services/theme.service';
import { NavSidebarComponent } from '@shared/components/nav-sidebar/nav-sidebar.component';
import { NotificationBellComponent } from '@shared/components/notification-bell/notification-bell.component';
import { ChatWidgetComponent } from '@shared/components/chat-widget/chat-widget.component';
import { SidebarService } from '@core/services/sidebar.service';
import { AuthService } from '@core/services/auth.service';
import { DateSimuleeService } from '@core/services/date-simulee.service';
import { PwaInstallService } from '@core/services/pwa-install.service';

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    imports: [RouterOutlet, NavSidebarComponent, NotificationBellComponent, ChatWidgetComponent, DatePipe]
})
export class AppComponent {
  title = 'RCP - Préparateur physique';

  sidebar = inject(SidebarService);
  auth = inject(AuthService);
  private dateSimuleeService = inject(DateSimuleeService);
  private router = inject(Router);

  /** Date simulée active (yyyy-MM-dd) ou null. Réactive : signal du service. */
  readonly dateSimulee = this.dateSimuleeService.date;

  /** Bandeau « lecture seule » affiché quand un SUPER_ADMIN voyage dans la saison. */
  bandeauSimulation(): boolean {
    return this.auth.hasRole('SUPER_ADMIN') && !!this.dateSimulee();
  }

  /** Quitte le voyage : repasse en date réelle et recharge pour tout refetch. */
  quitterSimulation(): void {
    this.dateSimuleeService.set(null);
    window.location.reload();
  }

  /** PWA : routes /joueur et /staff affichées en plein écran, sans le chrome desktop. */
  readonly modeMobile = signal(AppComponent.estRouteMobile(this.router.url));

  private static estRouteMobile(url: string): boolean {
    return url.startsWith('/joueur') || url.startsWith('/staff');
  }

  constructor() {
    inject(ThemeService).init();
    inject(PwaInstallService); // capte tôt l'événement d'installation (beforeinstallprompt)
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => this.modeMobile.set(AppComponent.estRouteMobile((e as NavigationEnd).urlAfterRedirects)));
  }
}
