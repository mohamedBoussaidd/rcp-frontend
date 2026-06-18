import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { JoueurStore } from './joueur.store';
import { OfflineQueueService } from './offline-queue.service';

/** Onglet mis en avant dans la barre de navigation basse (PWA). */
type OngletNav = 'accueil' | 'historique' | 'conseils' | 'sante' | null;

/**
 * Coquille mobile de l'espace joueur (PWA). Plein écran, sans le chrome desktop
 * (la sidebar staff est masquée par AppComponent sur les routes /joueur).
 * Barre de navigation basse (Accueil · Historique · FAB Ressenti · Conseils ·
 * Santé) PERSISTANTE sur tous les écrans ; top bar contextuelle (retour + titre)
 * sur les écrans secondaires uniquement.
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
  /** Écran racine (un onglet de nav) → pas de bouton retour. */
  readonly estRacine = signal(true);
  /** Onglet de nav basse mis en avant (null = aucun, ex. wellness/rpe). */
  readonly ongletActif = signal<OngletNav>('accueil');

  ngOnInit(): void {
    this.store.ensureLoaded();
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
    this.ownHeader.set(!!data['ownHeader']);

    const url = this.router.url.split('?')[0].replace(/\/$/, '');
    this.estRacine.set(['/joueur', '/joueur/historique', '/joueur/conseils', '/joueur/sante'].includes(url));
    this.ongletActif.set(this.ongletDeUrl(url));
  }

  /** Onglet mis en avant selon la section de l'URL. */
  private ongletDeUrl(url: string): OngletNav {
    if (url === '/joueur') return 'accueil';
    if (url.startsWith('/joueur/historique')) return 'historique';
    if (url.startsWith('/joueur/conseils')) return 'conseils';
    if (['/joueur/sante', '/joueur/blessures', '/joueur/poids', '/joueur/documents', '/joueur/seances']
      .some(p => url.startsWith(p))) return 'sante';
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
