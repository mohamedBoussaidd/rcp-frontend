import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { DateSimuleeService } from '../services/date-simulee.service';
import { AuthService } from '../services/auth.service';

/** Méthodes HTTP considérées comme des écritures (bloquées en mode voyage). */
const METHODES_ECRITURE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Mode « voyage dans la saison » (date simulée active, SUPER_ADMIN) = LECTURE SEULE : bloque côté
 * client toute requête d'écriture pour éviter d'écrire à l'heure réelle en croyant agir dans le passé.
 * Les lectures (GET) et l'authentification passent toujours ; le déblocage se fait en quittant la date
 * simulée (aucune requête réseau). Gardé sur le rôle SUPER_ADMIN (miroir du backend) pour ne jamais
 * gêner un autre utilisateur si une date traîne dans le localStorage partagé du navigateur.
 */
export const lectureSeuleInterceptor: HttpInterceptorFn = (req, next) => {
  const dateSimulee = inject(DateSimuleeService).get();
  const estSuperAdmin = inject(AuthService).hasRole('SUPER_ADMIN');
  const ecriture = METHODES_ECRITURE.has(req.method.toUpperCase());

  if (dateSimulee && estSuperAdmin && ecriture && !req.url.includes('/api/auth/')) {
    return throwError(() => new Error(
      'Lecture seule : les modifications sont désactivées pendant la simulation de date. Quittez la date simulée pour écrire.'));
  }
  return next(req);
};
