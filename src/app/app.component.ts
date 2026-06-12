import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@core/services/theme.service';
import { NavSidebarComponent } from '@shared/components/nav-sidebar/nav-sidebar.component';
import { SidebarService } from '@core/services/sidebar.service';
import { AuthService } from '@core/services/auth.service';

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    imports: [RouterOutlet, NavSidebarComponent]
})
export class AppComponent {
  title = 'RCP - Préparateur physique';

  sidebar = inject(SidebarService);
  auth = inject(AuthService);

  constructor() {
    inject(ThemeService).init();
  }
}
