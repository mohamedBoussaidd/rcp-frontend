import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService, Role } from '../services/auth.service';

/**
 * Restreint une route à certains rôles via `data: { roles: [...] }`.
 * Sera surtout exploité en Phase 3 (cloisonnement des modules).
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  const roles = route.data?.['roles'] as Role[] | undefined;
  if (!roles || roles.length === 0 || auth.hasRole(...roles)) {
    return true;
  }

  // Rôle non autorisé : on renvoie vers sa page d'accueil. Garde anti-boucle si
  // la route refusée EST déjà la home du rôle (ex. rôle sans aucun module).
  const home = auth.homeRoute();
  const attempted = '/' + (route.routeConfig?.path ?? '');
  if (attempted !== home) {
    router.navigateByUrl(home);
  }
  return false;
};
