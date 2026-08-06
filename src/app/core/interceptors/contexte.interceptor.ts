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
 *   X-Contexte-Saison   : id de la saison consultée (omis = aucun bornage de dates)
 *
 * La saison est lue DIRECTEMENT dans le localStorage plutôt que via `SaisonContexteService` :
 * ce service dépend de `HttpClient`, l'injecter ici créerait un cycle à l'exécution. Elle est
 * envoyée pour TOUS les rôles staff, y compris ceux qui n'ont pas de contexte club/équipe —
 * borner dans le temps ne révèle aucune donnée, cela ne fait que restreindre.
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

  // JOUEUR : jamais de contexte, saison comprise — la PWA est en self-scope.
  const saison = auth.hasRole('JOUEUR') ? null : localStorage.getItem('rcp_saison_active');
  const avecSaison = (h: Record<string, string>): Record<string, string> => {
    if (saison) h['X-Contexte-Saison'] = saison;
    return h;
  };

  if (auth.hasRole('SUPER_ADMIN', 'PRESIDENT')) {
    const club = contexte.clubActif();
    if (!club) {
      return saison ? next(req.clone({ setHeaders: avecSaison({}) })) : next(req);
    }
    const headers: Record<string, string> = { 'X-Contexte-Club': club.id };
    const equipes = contexte.equipesActives();
    if (equipes.length > 0) {
      headers['X-Contexte-Equipes'] = equipes.join(',');
    }
    return next(req.clone({ setHeaders: avecSaison(headers) }));
  }

  if (auth.hasRole('ENTRAINEUR', 'PREPARATEUR', 'MEDICAL')) {
    const headers: Record<string, string> = {};
    const equipes = contexte.equipesActives();
    if (equipes.length > 0) {
      headers['X-Contexte-Equipes'] = equipes.join(',');
    }
    avecSaison(headers);
    if (Object.keys(headers).length > 0) {
      return next(req.clone({ setHeaders: headers }));
    }
  }

  return next(req);
};
