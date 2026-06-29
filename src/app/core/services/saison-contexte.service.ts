import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { ContexteService } from './contexte.service';
import { SaisonService, Saison } from './saison.service';

/**
 * Contexte « saison active » côté client (PIVOT V37 : saison au niveau CLUB).
 *
 * Porte l'état du GATE de saison du staff :
 *  - la liste des saisons du club actif (mise en cache par club) ;
 *  - la saison EN_COURS « entrée » (acquittée via le sélecteur) ;
 *  - la mémorisation du choix (« entrer directement » → skip du sélecteur aux connexions suivantes).
 *
 * La saison active réelle reste l'EN_COURS du club côté serveur ; ce service ne fait que
 * piloter l'UI (gate + sélecteur + bandeau barre du haut).
 */
@Injectable({ providedIn: 'root' })
export class SaisonContexteService {

  private saisonApi = inject(SaisonService);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);

  private static readonly KEY_ACTIVE = 'rcp_saison_active';     // id de la saison entrée
  private static readonly KEY_REMEMBER = 'rcp_saison_remember'; // '1' => entrer directement

  /** Saisons du club actif (chargées à la demande, cachées par club). */
  readonly saisons = signal<Saison[]>([]);
  /** Saison EN_COURS « entrée » (pour le bandeau de la barre du haut). */
  readonly saisonActive = signal<Saison | null>(null);

  private chargePourClub: string | null = null;
  /** Club pour lequel le sélecteur a été validé (évite de re-demander à chaque navigation,
   *  et re-demande automatiquement si l'on change de club). */
  private entreeClub: string | null = null;

  /** Clé de cache = club du contexte (super-admin) sinon club/équipe de l'identité. */
  private cleClub(): string {
    const u = this.auth.currentUser();
    return this.contexte.clubActif()?.id ?? u?.clubId ?? u?.equipeId ?? 'self';
  }

  /** Charge les saisons du club actif (cache par club ; `force` pour rafraîchir). */
  charger(force = false): Observable<Saison[]> {
    const cle = this.cleClub();
    if (!force && this.chargePourClub === cle) {
      return of(this.saisons());
    }
    return this.saisonApi.getAll().pipe(tap(list => {
      this.saisons.set(list);
      this.chargePourClub = cle;
      const enCours = list.find(s => s.statut === 'EN_COURS') ?? null;
      // Maintient le bandeau à jour si la saison entrée est toujours l'EN_COURS.
      if (enCours && this.saisonActive()?.id === enCours.id) this.saisonActive.set(enCours);
    }));
  }

  /** Saison EN_COURS du club (ou null), d'après le cache courant. */
  enCours(): Saison | null {
    return this.saisons().find(s => s.statut === 'EN_COURS') ?? null;
  }

  /**
   * Le staff a-t-il déjà « acquitté » la saison EN_COURS donnée ?
   * Vrai si entrée durant la session, ou si mémorisée (« entrer directement ») au bon id.
   */
  estEntree(enCours: Saison): boolean {
    if (this.entreeClub === this.cleClub()) return true;
    const remember = localStorage.getItem(SaisonContexteService.KEY_REMEMBER) === '1';
    const active = localStorage.getItem(SaisonContexteService.KEY_ACTIVE);
    return remember && active === enCours.id;
  }

  /** Acquitte l'entrée dans une saison (depuis le sélecteur). `remember` = entrer directement ensuite. */
  entrer(s: Saison, remember: boolean): void {
    this.saisonActive.set(s);
    this.entreeClub = this.cleClub();
    localStorage.setItem(SaisonContexteService.KEY_ACTIVE, s.id);
    localStorage.setItem(SaisonContexteService.KEY_REMEMBER, remember ? '1' : '0');
  }

  /** Marque la saison comme active (bandeau) sans rejouer le sélecteur. */
  marquerActive(s: Saison): void {
    this.saisonActive.set(s);
    this.entreeClub = this.cleClub();
  }

  /** Réinitialise l'état (changement de club). */
  reset(): void {
    this.saisons.set([]);
    this.saisonActive.set(null);
    this.chargePourClub = null;
    this.entreeClub = null;
    localStorage.removeItem(SaisonContexteService.KEY_ACTIVE);
    localStorage.removeItem(SaisonContexteService.KEY_REMEMBER);
  }
}
