import { Component } from '@angular/core';

/**
 * Route tampon « invisible » servant à forcer la réinstanciation d'un module
 * (et donc le rechargement de ses données) après un changement de contexte :
 * on rebondit sur cette route puis on revient à l'URL d'origine. Jamais affichée
 * durablement (navigation en skipLocationChange).
 */
@Component({
  selector: 'app-rechargement',
  standalone: true,
  template: '',
})
export class RechargementComponent {}
