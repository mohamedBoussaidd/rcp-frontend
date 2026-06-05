import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ContexteService } from '../services/contexte.service';

/**
 * Ajoute les en-têtes du contexte de navigation actif (club + équipes ciblées)
 * sur les appels API. Le backend (ScopeResolver) les utilise pour RESTREINDRE la
 * portée des données dans le périmètre autorisé par l'identité.
 *   X-Contexte-Club     : id du club actif
 *   X-Contexte-Equipes  : CSV d'ids d'équipes (omis = toutes les équipes du club)
 */
export const contexteInterceptor: HttpInterceptorFn = (req, next) => {
  const contexte = inject(ContexteService);
  const club = contexte.clubActif();

  if (!club || req.url.includes('/api/auth/')) {
    return next(req);
  }

  const headers: Record<string, string> = { 'X-Contexte-Club': club.id };
  const equipes = contexte.equipesActives();
  if (equipes.length > 0) {
    headers['X-Contexte-Equipes'] = equipes.join(',');
  }

  return next(req.clone({ setHeaders: headers }));
};
