import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SaisonContexteService } from '../services/saison-contexte.service';

/**
 * GATE de saison (PIVOT V37) : le staff doit avoir une saison EN_COURS dans son club pour
 * entrer dans l'app de travail.
 *  - aucune saison EN_COURS → écran « Créer une saison » (/creer-saison) ;
 *  - saison EN_COURS non encore acquittée cette session (et non « mémorisée ») → sélecteur
 *    explicite (/choix-saison) ;
 *  - sinon → accès autorisé.
 *
 * Les joueurs (PWA) ne sont jamais bloqués. L'Administratif non plus : ses écrans (Annuaire,
 * Licences & documents, tableau de bord admin) sont CLUB-WIDE, jamais scopés par saison — et il
 * n'a pas accès aux écrans du gate (/choix-saison réservé au STAFF, /creer-saison à saison:manage),
 * ce qui le bloquerait en boucle. En cas d'erreur réseau, on laisse passer pour ne pas bloquer
 * l'app sur un incident d'API.
 */
export const saisonGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const sc = inject(SaisonContexteService);
  const router = inject(Router);

  if (auth.hasRole('JOUEUR', 'ADMINISTRATIF')) return of(true);

  return sc.charger().pipe(
    map(saisons => {
      const enCours = saisons.find(s => s.statut === 'EN_COURS') ?? null;
      if (!enCours) return router.parseUrl('/creer-saison');
      if (sc.estEntree(enCours)) { sc.marquerActive(enCours); return true; }
      return router.parseUrl('/choix-saison');
    }),
    catchError(() => of(true)),
  );
};
