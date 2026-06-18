import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { JoueurStore } from './joueur.store';
import { OfflineQueueService } from './offline-queue.service';

/** Onglet actif de la barre de navigation basse (PWA). */
type OngletNav = 'accueil' | 'historique' | 'conseils' | 'sante' | null;

/**
 * Coquille mobile de l'espace joueur (PWA). Plein écran, sans le chrome desktop
 * (la sidebar staff est masquée par AppComponent sur les routes /joueur).
 * Top bar contextuelle (retour + titre) sur les écrans secondaires ; barre de
 * navigation basse (Accueil · Historique · FAB Ressenti · Conseils · Santé) sur
 * les écrans racines.
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
  /** L'écran rend son propre en-tête → on masque le topbar contextuel. */
  readonly ownHeader = signal(false);
  /** Onglet de nav basse actif (null = écran secondaire, nav masquée). */
  readonly onglet = signal<OngletNav>('accueil');

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
    this.ownHeader.set(!!data['ownHeader']);
    this.onglet.set(this.ongletDeUrl());
  }

  /** Déduit l'onglet de nav basse depuis l'URL (null hors écran racine). */
  private ongletDeUrl(): OngletNav {
    const url = this.router.url.split('?')[0].replace(/\/$/, '');
    if (url === '/joueur') return 'accueil';
    if (url === '/joueur/historique') return 'historique';
    if (url === '/joueur/conseils') return 'conseils';
    if (url === '/joueur/sante') return 'sante';
    return null;
  }

  aller(onglet: Exclude<OngletNav, null>): void {
    const routes: Record<Exclude<OngletNav, null>, string> = {
      accueil: '/joueur',
      historique: '/joueur/historique',
      conseils: '/joueur/conseils',
      sante: '/joueur/sante',
    };
    this.router.navigate([routes[onglet]]);
  }

  saisirRessenti(): void { this.router.navigate(['/joueur/wellness']); }

  retour(): void { this.router.navigate(['/joueur']); }
  deconnexion(): void { this.auth.logout(); }
}
