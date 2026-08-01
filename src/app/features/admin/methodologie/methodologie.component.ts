import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';

/**
 * Page de référence des indicateurs, organisée en DEUX familles :
 *  · « Les scores » — les indicateurs chiffrés avec des seuils (ACWR, monotonie, fatigue, risque) ;
 *  · « Les lectures d'effectif » — les outils de lecture sans seuil de danger (dérives).
 *
 * Volontairement UNE SEULE page qui défile, pas des onglets : chaque carte porte un `id` qui sert
 * d'ancre aux bulles « Voir la méthodologie » (cf. aides-indicateurs.ts). Une ancre pointant vers
 * une carte rangée dans un onglet masqué ne défile pas — le sommaire ci-dessous donne la même
 * navigation sans casser ce mécanisme.
 */
@Component({
  selector: 'app-methodologie',
  standalone: true,
  templateUrl: './methodologie.component.html',
  styleUrl: './methodologie.component.scss',
  imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent, RouterLink]
})
export class MethodologieComponent {
  private router = inject(Router);

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
