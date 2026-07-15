import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { NotificationPushService } from '@core/services/notification-push.service';
import { NotificationService } from '@core/services/notification.service';

/** Onglet mis en avant dans la barre de navigation basse. */
type OngletNav = 'accueil' | 'agenda' | 'messages' | 'effectif' | null;

/**
 * Coquille mobile de l'espace staff (PWA) — miroir du layout joueur (/joueur) :
 * plein écran sans le chrome desktop (masqué par AppComponent sur les routes /staff),
 * barre de navigation basse persistante (Accueil · Agenda · FAB Appel · Messages ·
 * Effectif), top bar contextuelle (retour + titre) sur les écrans secondaires.
 * Initialise le Web Push (le staff profite enfin des notifications sur téléphone)
 * et le sélecteur d'équipe (périmètre autorisé, cf. staff multi-équipes).
 */
@Component({
  selector: 'app-staff-layout',
  standalone: true,
  templateUrl: './staff-layout.component.html',
  styleUrl: './staff-layout.component.scss',
  imports: [RouterOutlet],
})
export class StaffLayoutComponent implements OnInit {

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private push = inject(NotificationPushService);
  private notifications = inject(NotificationService);
  contexte = inject(ContexteService);

  readonly titre = signal('');
  readonly estHome = signal(true);
  readonly ongletActif = signal<OngletNav>('accueil');
  readonly peutAppeler = signal(false);

  ngOnInit(): void {
    this.push.init();
    this.notifications.demarrerPolling();
    this.peutAppeler.set(this.auth.has('presence:write'));
    // Sélecteur d'équipe : périmètre autorisé de l'identité (union des affectations).
    this.contexte.chargerEquipesAutorisees().subscribe({
      next: equipes => this.contexte.definirEquipesDispo(equipes),
      error: () => {},
    });
    this.maj();
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.maj());
  }

  private maj(): void {
    let r = this.route;
    while (r.firstChild) r = r.firstChild;
    const data = r.snapshot.data;
    this.titre.set(data['title'] ?? '');
    this.estHome.set(!!data['home']);

    const url = this.router.url.split('?')[0].replace(/\/$/, '');
    this.ongletActif.set(this.ongletDeUrl(url));
  }

  private ongletDeUrl(url: string): OngletNav {
    if (url === '/staff') return 'accueil';
    if (url.startsWith('/staff/agenda')) return 'agenda';
    if (url.startsWith('/staff/messages')) return 'messages';
    if (url.startsWith('/staff/effectif')) return 'effectif';
    return null;
  }

  aller(onglet: Exclude<OngletNav, null>): void {
    const routes: Record<Exclude<OngletNav, null>, string> = {
      accueil: '/staff',
      agenda: '/staff/agenda',
      messages: '/staff/messages',
      effectif: '/staff/effectif',
    };
    this.router.navigate([routes[onglet]]);
  }

  faireAppel(): void { this.router.navigate(['/staff/appel']); }

  retour(): void { this.router.navigate(['/staff']); }
}
