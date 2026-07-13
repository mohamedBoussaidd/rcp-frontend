import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

/**
 * Redirecteur d'accueil : `''`, `**` et le logo (routerLink /dashboard) passent par ici, qui
 * renvoie chaque utilisateur vers SA page d'accueil (auth.homeRoute()) selon son rôle. Évite un
 * redirectTo statique unique qui enverrait tout le monde sur le même écran.
 */
@Component({
  selector: 'app-home-redirect',
  standalone: true,
  template: '',
})
export class HomeRedirectComponent {
  constructor() {
    const auth = inject(AuthService);
    const router = inject(Router);
    router.navigateByUrl(auth.homeRoute());
  }
}
