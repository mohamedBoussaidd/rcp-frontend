import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ContexteService } from '../services/contexte.service';
import { AuthService } from '../services/auth.service';

/**
 * Ajoute les en-têtes du contexte de navigation actif (club + équipes ciblées)
 * sur les appels API. Le backend (ScopeResolver) les utilise pour RESTREINDRE la
 * portée des données dans le périmètre autorisé par l'identité.
 *   X-Contexte-Club     : id du club actif
 *   X-Contexte-Equipes  : CSV d'ids d'équipes (omis = toutes les équipes du club)
 *
 * Seuls SUPER_ADMIN et PRÉSIDENT naviguent « par contexte ». Pour les autres rôles
 * (JOUEUR, ENTRAÎNEUR, MÉDICAL…), la portée est déjà cadrée à leur équipe par
 * l'identité : on n'envoie jamais le contexte (sinon un contexte staff resté en
 * localStorage provoque un 403 « hors de votre périmètre », ex. /api/moi/seances).
 */
export const contexteInterceptor: HttpInterceptorFn = (req, next) => {
  const contexte = inject(ContexteService);
  const auth = inject(AuthService);
  const club = contexte.clubActif();

  if (!club || req.url.includes('/api/auth/') || !auth.hasRole('SUPER_ADMIN', 'PRESIDENT')) {
    return next(req);
  }

  const headers: Record<string, string> = { 'X-Contexte-Club': club.id };
  const equipes = contexte.equipesActives();
  if (equipes.length > 0) {
    headers['X-Contexte-Equipes'] = equipes.join(',');
  }

  return next(req.clone({ setHeaders: headers }));
};
