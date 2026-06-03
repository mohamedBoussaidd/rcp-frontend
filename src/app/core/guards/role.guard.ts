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

  router.navigate(['/dashboard']);
  return false;
};
