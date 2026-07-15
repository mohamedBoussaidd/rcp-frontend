import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Cible du start_url PWA (/m) : l'icône installée sur l'écran d'accueil s'ouvre ici, puis
 * chaque public est aiguillé vers son espace — joueur → /joueur, staff sur téléphone → /staff,
 * sinon accueil desktop du rôle. Retourne toujours une redirection : /m n'affiche jamais rien.
 */
export const aiguillageMobileGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.parseUrl('/login');
  }
  return router.parseUrl(auth.routeApresLogin());
};
