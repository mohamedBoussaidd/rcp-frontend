import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from './core/services/theme.service';
import { NavSidebarComponent } from './shared/components/nav-sidebar/nav-sidebar.component';
import { BarreContexteComponent } from './shared/components/barre-contexte/barre-contexte.component';
import { SidebarService } from './core/services/sidebar.service';
import { AuthService } from './core/services/auth.service';

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    imports: [RouterOutlet, NavSidebarComponent, BarreContexteComponent, MatIcon]
})
export class AppComponent {
  title = 'RCP - Préparateur physique';

  constructor(themeService: ThemeService, public sidebar: SidebarService, public auth: AuthService) {
    themeService.init();
  }
}
