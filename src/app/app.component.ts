import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { NavSidebarComponent } from './shared/components/nav-sidebar/nav-sidebar.component';

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    imports: [RouterOutlet, NavSidebarComponent]
})
export class AppComponent {
  title = 'RCP - Préparateur physique';

  constructor(themeService: ThemeService) {
    themeService.init();
  }
}
