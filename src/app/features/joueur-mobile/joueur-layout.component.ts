import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { JoueurStore } from './joueur.store';
import { OfflineQueueService } from './offline-queue.service';

/**
 * Coquille mobile de l'espace joueur (PWA). Plein écran, sans le chrome desktop
 * (la sidebar staff est masquée par AppComponent sur les routes /joueur).
 * Top bar contextuelle : retour + titre pilotés par `data.title` / `data.home`
 * de la route enfant active.
 */
@Component({
  selector: 'app-joueur-layout',
  standalone: true,
  templateUrl: './joueur-layout.component.html',
  styleUrl: './joueur-layout.component.scss',
  imports: [RouterOutlet],
})
export class JoueurLayoutComponent implements OnInit {

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  store = inject(JoueurStore);
  offline = inject(OfflineQueueService);

  readonly titre = signal('');
  readonly estHome = signal(true);

  ngOnInit(): void {
    this.store.ensureLoaded();
    this.majTopbar();
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.majTopbar());
  }

  private majTopbar(): void {
    let r = this.route;
    while (r.firstChild) r = r.firstChild;
    const data = r.snapshot.data;
    this.titre.set(data['title'] ?? '');
    this.estHome.set(!!data['home']);
  }

  retour(): void { this.router.navigate(['/joueur']); }
  deconnexion(): void { this.auth.logout(); }
}
