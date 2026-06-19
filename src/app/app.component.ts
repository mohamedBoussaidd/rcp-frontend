import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeService } from '@core/services/theme.service';
import { NavSidebarComponent } from '@shared/components/nav-sidebar/nav-sidebar.component';
import { NotificationBellComponent } from '@shared/components/notification-bell/notification-bell.component';
import { ChatWidgetComponent } from '@shared/components/chat-widget/chat-widget.component';
import { SidebarService } from '@core/services/sidebar.service';
import { AuthService } from '@core/services/auth.service';
import { PwaInstallService } from '@core/services/pwa-install.service';

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    imports: [RouterOutlet, NavSidebarComponent, NotificationBellComponent, ChatWidgetComponent]
})
export class AppComponent {
  title = 'RCP - Préparateur physique';

  sidebar = inject(SidebarService);
  auth = inject(AuthService);
  private router = inject(Router);

  /** PWA joueur : routes /joueur affichées en plein écran, sans la sidebar staff. */
  readonly modeMobile = signal(this.router.url.startsWith('/joueur'));

  constructor() {
    inject(ThemeService).init();
    inject(PwaInstallService); // capte tôt l'événement d'installation (beforeinstallprompt)
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => this.modeMobile.set((e as NavigationEnd).urlAfterRedirects.startsWith('/joueur')));
  }
}
