import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '@core/services/auth.service';
import { SaisonContexteService } from '@core/services/saison-contexte.service';
import { Saison } from '@core/services/saison.service';

/**
 * Sélecteur de saison EXPLICITE (PIVOT V37) : liste les saisons du club, met en avant la saison
 * EN_COURS à « entrer », et propose la consultation (lecture seule) des saisons clôturées.
 * Case « entrer directement » → mémorise le choix pour skipper ce sélecteur aux connexions suivantes.
 */
@Component({
  selector: 'app-choix-saison',
  standalone: true,
  templateUrl: './choix-saison.component.html',
  styleUrl: './choix-saison.component.scss',
  imports: [DatePipe, FormsModule, MatIcon],
})
export class ChoixSaisonComponent implements OnInit {

  private sc = inject(SaisonContexteService);
  private auth = inject(AuthService);
  private router = inject(Router);

  saisons = signal<Saison[]>([]);
  loading = signal(true);
  rememberChoix = signal(true);
  /** Saison actuellement entrée, pour la signaler dans la liste. */
  entreeId = signal<string | null>(null);

  ngOnInit(): void {
    // La case reflète le choix réellement mémorisé ; elle n'est proposée cochée qu'à la toute
    // première venue (clé absente). Codée en dur à `true`, elle se recochait toute seule après
    // avoir été décochée, donnant l'impression que le décochage ne servait à rien.
    this.rememberChoix.set(this.sc.memoriseInconnu() || this.sc.memorise());

    // `force` : écran de DÉCISION, il ne doit jamais montrer un cache. Sans cela, une saison
    // clôturée ou rouverte depuis le panneau Saison continuait d'apparaître avec son ancien statut.
    this.sc.charger(true).subscribe({
      next: list => {
        this.saisons.set(list);
        this.entreeId.set(this.sc.saisonActive()?.id ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  get enCours(): Saison | null {
    return this.saisons().find(s => s.statut === 'EN_COURS') ?? null;
  }

  get cloturees(): Saison[] {
    return this.saisons().filter(s => s.statut !== 'EN_COURS');
  }

  estEntree(s: Saison): boolean {
    return this.entreeId() === s.id;
  }

  entrer(s: Saison): void {
    this.sc.entrer(s, this.rememberChoix());
    this.rejoindreAccueil();
  }

  /**
   * Entre dans une saison clôturée pour la CONSULTER : toutes les listes de l'application se
   * bornent alors à sa fenêtre de dates (en-tête `X-Contexte-Saison`).
   *
   * <p>Ce bouton renvoyait vers la comparaison inter-saisons, faute de mieux : avant le scoping
   * par saison, « entrer » dans une archive n'aurait rien changé à l'affichage. Le choix n'est
   * délibérément PAS mémorisé — on consulte une archive, on ne s'y installe pas : à la prochaine
   * connexion, on repart sur la saison en cours.</p>
   */
  consulter(s: Saison): void {
    this.sc.entrer(s, false);
    this.rejoindreAccueil();
  }

  /**
   * Rebond par la route tampon avant l'accueil : si l'on y était déjà, Angular réutilise le
   * composant sans rejouer son `ngOnInit`, et l'écran resterait peuplé des données de la saison
   * précédente malgré le changement de bornage.
   */
  private rejoindreAccueil(): void {
    const home = this.auth.homeRoute();
    this.router.navigateByUrl('/rechargement', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(home));
  }

  /** Comparaison inter-saisons (écran dédié, indépendant de la saison active). */
  comparer(): void {
    this.router.navigate(['/comparaison-saisons']);
  }

  creer(): void {
    this.router.navigate(['/creer-saison']);
  }
}
