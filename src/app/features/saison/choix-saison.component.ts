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

  ngOnInit(): void {
    this.sc.charger().subscribe({
      next: list => { this.saisons.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  get enCours(): Saison | null {
    return this.saisons().find(s => s.statut === 'EN_COURS') ?? null;
  }

  get cloturees(): Saison[] {
    return this.saisons().filter(s => s.statut !== 'EN_COURS');
  }

  entrer(s: Saison): void {
    this.sc.entrer(s, this.rememberChoix());
    this.router.navigateByUrl(this.auth.homeRoute());
  }

  consulter(): void {
    this.router.navigate(['/comparaison-saisons']);
  }

  creer(): void {
    this.router.navigate(['/creer-saison']);
  }
}
