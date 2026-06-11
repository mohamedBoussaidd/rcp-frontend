import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { MonClubService } from '@core/services/mon-club.service';

/**
 * Bandeau « contexte actif » (Club · Équipe) affiché dans le shell pour les rôles
 * à navigation contextuelle (SUPER_ADMIN, PRESIDENT). Permet de changer d'équipe
 * active et, pour le super-admin, de revenir à l'espace d'administration.
 */
@Component({
  selector: 'app-barre-contexte',
  standalone: true,
  templateUrl: './barre-contexte.component.html',
  styleUrl: './barre-contexte.component.scss',
  imports: [MatIcon],
})
export class BarreContexteComponent implements OnInit {

  constructor(
    public auth: AuthService,
    public contexte: ContexteService,
    private monClub: MonClubService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Président : son club est implicite → on initialise le contexte depuis mon-club.
    if (this.auth.hasRole('PRESIDENT') && this.contexte.equipesDispo().length === 0) {
      this.monClub.getMonClub().subscribe({
        next: mc => this.contexte.entrerClub(
          { id: mc.clubId, nom: mc.clubNom ?? 'Mon club' }, mc.equipes),
        error: () => {},
      });
    }
  }

  /** Visible uniquement pour les rôles à contexte (et si un club est actif). */
  get visible(): boolean {
    return this.auth.hasRole('SUPER_ADMIN', 'PRESIDENT') && !!this.contexte.clubActif();
  }

  get estSuperAdmin(): boolean {
    return this.auth.hasRole('SUPER_ADMIN');
  }

  onChangerEquipe(value: string): void {
    this.contexte.choisirEquipe(value || null);
    this.rechargerVueCourante();
  }

  /**
   * Force le module affiché à recharger ses données avec le nouveau contexte :
   * on rebondit sur une route tampon (sans changer l'URL) puis on revient, ce qui
   * réinstancie le composant courant → son ngOnInit relance les appels API.
   */
  private rechargerVueCourante(): void {
    const url = this.router.url;
    if (url.startsWith('/rechargement')) return;
    this.router.navigateByUrl('/rechargement', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(url));
  }

  retourAdmin(): void {
    this.contexte.reinitialiser();
    this.router.navigate(['/admin/clubs']);
  }
}
