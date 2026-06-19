import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService, Role } from '../services/auth.service';

/**
 * Restreint une route via `data: { roles: [...] }` et/ou `data: { perms: [...] }`.
 * Accès accordé si le rôle (legacy) correspond — comportement historique — OU si l'utilisateur
 * détient une des permissions listées (union multi-rôle, miroir de la nav et du backend).
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  const roles = route.data?.['roles'] as Role[] | undefined;
  const perms = route.data?.['perms'] as string[] | undefined;
  const aucuneContrainte = (!roles || roles.length === 0) && (!perms || perms.length === 0);
  const parRole = !!roles && roles.length > 0 && auth.hasRole(...roles);
  const parPerm = !!perms && perms.some(p => auth.has(p));
  if (aucuneContrainte || parRole || parPerm) {
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
