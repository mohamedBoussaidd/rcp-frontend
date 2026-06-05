import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ContexteService } from '../services/contexte.service';

/**
 * Modules de données : le SUPER_ADMIN doit d'abord choisir un club actif
 * (on ne charge jamais toutes les données de la plateforme). Sans club actif,
 * on le renvoie vers l'espace d'administration. Sans effet pour les autres rôles,
 * dont le contexte découle de leur identité.
 */
export const contexteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const contexte = inject(ContexteService);
  const router = inject(Router);

  if (auth.hasRole('SUPER_ADMIN') && !contexte.clubActif()) {
    router.navigate(['/admin/clubs']);
    return false;
  }
  return true;
};
