import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { SaisonService, SaisonRequest } from '@core/services/saison.service';
import { SaisonContexteService } from '@core/services/saison-contexte.service';

/**
 * Écran de GATE « Créer une saison » (PIVOT V37) : affiché au staff quand le club n'a aucune
 * saison EN_COURS. Dates et libellé pré-remplis, périodes par défaut générables. Une fois la
 * saison ouverte, on « entre » dedans (mémorisé) et on bascule vers la gestion pour définir
 * périodes et effectif (reconduction).
 */
@Component({
  selector: 'app-creer-saison',
  standalone: true,
  templateUrl: './creer-saison.component.html',
  styleUrl: './creer-saison.component.scss',
  imports: [FormsModule, MatIcon],
})
export class CreerSaisonComponent {

  private saisonApi = inject(SaisonService);
  private sc = inject(SaisonContexteService);
  private router = inject(Router);

  form: SaisonRequest = this.formVide();
  enCours = signal(false);
  erreur = signal<string | null>(null);

  private formVide(): SaisonRequest {
    const annee = new Date().getFullYear();
    return {
      libelle: `${annee}-${annee + 1}`,
      dateDebut: `${annee}-07-01`,
      dateFin: `${annee + 1}-06-30`,
      genererPeriodes: true,
    };
  }

  creer(): void {
    this.erreur.set(null);
    this.enCours.set(true);
    this.saisonApi.ouvrir(this.form).subscribe({
      next: saison => {
        // On rafraîchit le cache puis on entre dans la nouvelle saison (mémorisée → pas de sélecteur).
        this.sc.charger(true).subscribe({ next: () => {}, error: () => {} });
        this.sc.entrer(saison, true);
        // Direction la gestion : définir les périodes et l'effectif (reconduction).
        this.router.navigate(['/saisons']);
      },
      error: e => {
        this.enCours.set(false);
        this.erreur.set(e?.error?.message ?? e?.error ?? 'Création impossible.');
      },
    });
  }
}
