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
 * SUPER_ADMIN et PRÉSIDENT naviguent « par contexte » (club + équipes). Le STAFF
 * multi-équipes (ENTRAÎNEUR/PRÉPARATEUR/MÉDICAL) n'envoie QUE l'équipe ciblée :
 * jamais l'en-tête club, car côté back un contexte « club seul » signifie TOUTES
 * les équipes du club → 403 pour un staff qui n'en couvre que certaines.
 * JOUEUR : jamais de contexte (self-scope, ex. /api/moi/seances).
 */
export const contexteInterceptor: HttpInterceptorFn = (req, next) => {
  const contexte = inject(ContexteService);
  const auth = inject(AuthService);

  if (req.url.includes('/api/auth/')) {
    return next(req);
  }

  if (auth.hasRole('SUPER_ADMIN', 'PRESIDENT')) {
    const club = contexte.clubActif();
    if (!club) return next(req);
    const headers: Record<string, string> = { 'X-Contexte-Club': club.id };
    const equipes = contexte.equipesActives();
    if (equipes.length > 0) {
      headers['X-Contexte-Equipes'] = equipes.join(',');
    }
    return next(req.clone({ setHeaders: headers }));
  }

  if (auth.hasRole('ENTRAINEUR', 'PREPARATEUR', 'MEDICAL')) {
    const equipes = contexte.equipesActives();
    if (equipes.length > 0) {
      return next(req.clone({ setHeaders: { 'X-Contexte-Equipes': equipes.join(',') } }));
    }
  }

  return next(req);
};
