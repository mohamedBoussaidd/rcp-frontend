import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DateSimuleeService } from '../services/date-simulee.service';

/**
 * Ajoute l'en-tête `X-Date-Simulee` (yyyy-MM-dd) sur les appels API quand une date
 * simulée est active (outil de test de la temporalité). Sans date simulée : no-op.
 */
export const dateSimuleeInterceptor: HttpInterceptorFn = (req, next) => {
  const d = inject(DateSimuleeService).get();
  if (!d || req.url.includes('/api/auth/')) return next(req);
  return next(req.clone({ setHeaders: { 'X-Date-Simulee': d } }));
};
