import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Restreint une route aux MODULES actifs du club (couche packs / abonnement) :
 *  - `data: { module: 'gps' }` → accès si ce module est actif ;
 *  - `data: { modulesAny: ['tactique','match','diaporama'] }` → accès si AU MOINS un l'est.
 *
 * En cas de refus : redirection vers la page d'accueil du rôle (garde anti-boucle). La sécurité
 * de fond reste le 403 backend ; ceci ne fait que fermer l'accès à un écran non souscrit.
 */
export const moduleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const module = route.data?.['module'] as string | undefined;
  const modulesAny = route.data?.['modulesAny'] as string[] | undefined;

  const ok =
    (!module && !modulesAny) ||
    (!!module && auth.hasModule(module)) ||
    (!!modulesAny && modulesAny.some(m => auth.hasModule(m)));

  if (ok) return true;

  const home = auth.homeRoute();
  const attempted = '/' + (route.routeConfig?.path ?? '');
  if (attempted !== home) router.navigateByUrl(home);
  return false;
};
