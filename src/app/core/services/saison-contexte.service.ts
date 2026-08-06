import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { ContexteService } from './contexte.service';
import { SaisonService, Saison } from './saison.service';

/**
 * Contexte « saison active » côté client (PIVOT V37 : saison au niveau CLUB).
 *
 * Porte l'état du GATE de saison du staff :
 *  - la liste des saisons du club actif (mise en cache par club) ;
 *  - la saison ENTRÉE, en cours ou archive, qui borne les listes de toute l'application ;
 *  - la mémorisation du choix (« entrer directement » → skip du sélecteur aux connexions suivantes).
 *
 * <p>INVARIANT : le signal `saisonActive` et la clé `rcp_saison_active` du localStorage disent
 * toujours la même chose. L'interceptor lit la clé, le bandeau lit le signal ; les laisser diverger
 * produisait une application qui affichait une saison et en interrogeait une autre. Tout passe donc
 * par {@link poser} — aucun chemin n'écrit l'un sans l'autre.</p>
 */
@Injectable({ providedIn: 'root' })
export class SaisonContexteService {

  private saisonApi = inject(SaisonService);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);

  private static readonly KEY_ACTIVE = 'rcp_saison_active';     // id de la saison entrée
  private static readonly KEY_REMEMBER = 'rcp_saison_remember'; // '1' => entrer directement
  /**
   * 'archive' => consultation délibérée d'une saison passée ; 'travail' (défaut) => saison courante.
   *
   * <p>Sans cette distinction, deux situations opposées deviennent indiscernables : consulter
   * volontairement une archive, et voir sa saison de travail clôturée ailleurs (autre poste, API,
   * panneau Saison d'un collègue). Dans le premier cas il faut RESTER sur l'archive, dans le second
   * il faut RECALER sur la nouvelle EN_COURS — sinon l'application borne silencieusement toutes ses
   * listes sur une saison morte.</p>
   */
  private static readonly KEY_MODE = 'rcp_saison_mode';

  /** Saisons du club actif (chargées à la demande, cachées par club). */
  readonly saisons = signal<Saison[]>([]);
  /** Saison ENTRÉE — celle qui borne les données affichées (pas forcément l'EN_COURS). */
  readonly saisonActive = signal<Saison | null>(null);

  /** La saison entrée est une archive : l'app est en lecture d'une saison passée. */
  readonly estArchive = computed(() => {
    const s = this.saisonActive();
    return !!s && s.statut !== 'EN_COURS';
  });

  private chargePourClub: string | null = null;
  /** Club pour lequel le sélecteur a été validé (évite de re-demander à chaque navigation,
   *  et re-demande automatiquement si l'on change de club). */
  private entreeClub: string | null = null;

  /** Clé de cache = club du contexte (super-admin) sinon club/équipe de l'identité. */
  private cleClub(): string {
    const u = this.auth.currentUser();
    return this.contexte.clubActif()?.id ?? u?.clubId ?? u?.equipeId ?? 'self';
  }

  /**
   * Charge les saisons du club actif (cache par club ; `force` pour rafraîchir).
   *
   * <p>Réhydrate au passage la saison entrée à partir du localStorage, en la RÉSOLVANT dans la
   * liste fraîche : c'est ce qui fait survivre une consultation d'archive à un rechargement de
   * page, et ce qui rattrape une saison entre-temps clôturée, rouverte ou supprimée ailleurs.</p>
   */
  charger(force = false): Observable<Saison[]> {
    const cle = this.cleClub();
    if (!force && this.chargePourClub === cle) {
      return of(this.saisons());
    }
    return this.saisonApi.getAll().pipe(tap(list => {
      this.saisons.set(list);
      this.chargePourClub = cle;
      this.resoudreEntree(list);
    }));
  }

  /** Force le prochain `charger()` à retaper le serveur (après clôture/réouverture/suppression). */
  invalider(): void {
    this.chargePourClub = null;
  }

  /** Saison EN_COURS du club (ou null), d'après le cache courant. */
  enCours(): Saison | null {
    return this.saisons().find(s => s.statut === 'EN_COURS') ?? null;
  }

  /**
   * Saison entrée telle qu'elle existe dans `list`, ou null si l'id mémorisé n'y figure plus
   * (saison supprimée, ou club changé). Une entrée devenue introuvable est purgée : mieux vaut
   * repasser une fois par le sélecteur que borner les requêtes sur un id fantôme.
   */
  private resoudreEntree(list: Saison[]): Saison | null {
    const id = localStorage.getItem(SaisonContexteService.KEY_ACTIVE);
    const trouvee = id ? list.find(s => s.id === id) ?? null : null;
    if (id && !trouvee) {
      this.oublier();
      return null;
    }
    if (!trouvee) return null;

    // Saison de TRAVAIL qui n'est plus EN_COURS : elle a été clôturée hors de cet écran. On ne
    // s'installe pas dans une archive par accident — on suit la nouvelle saison en cours.
    if (trouvee.statut !== 'EN_COURS' && !this.estModeArchive()) {
      const enCours = list.find(s => s.statut === 'EN_COURS') ?? null;
      if (enCours) { this.poser(enCours); return enCours; }
    }

    // Resynchronise le statut : la saison entrée a pu être clôturée ou rouverte depuis.
    // On ne repasse pas par `poser()` : le mode enregistré doit rester intact.
    this.saisonActive.set(trouvee);
    this.entreeClub = this.cleClub();
    return trouvee;
  }

  private estModeArchive(): boolean {
    return localStorage.getItem(SaisonContexteService.KEY_MODE) === 'archive';
  }

  /** Oublie la saison entrée (id devenu introuvable, ou déconnexion). */
  oublier(): void {
    localStorage.removeItem(SaisonContexteService.KEY_ACTIVE);
    localStorage.removeItem(SaisonContexteService.KEY_MODE);
    this.saisonActive.set(null);
    this.entreeClub = null;
  }

  /** Saison entrée résolue dans le cache courant (null si aucune ou introuvable). */
  entree(): Saison | null {
    return this.resoudreEntree(this.saisons());
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

  /** L'utilisateur a-t-il demandé à entrer directement (case du sélecteur) ? */
  memorise(): boolean {
    return localStorage.getItem(SaisonContexteService.KEY_REMEMBER) === '1';
  }

  /** La case n'a jamais été vue : le sélecteur la propose cochée à la première venue seulement. */
  memoriseInconnu(): boolean {
    return localStorage.getItem(SaisonContexteService.KEY_REMEMBER) === null;
  }

  /** Écrit la saison entrée — signal ET localStorage, jamais l'un sans l'autre. */
  private poser(s: Saison, mode: 'travail' | 'archive' = 'travail'): void {
    this.saisonActive.set(s);
    this.entreeClub = this.cleClub();
    localStorage.setItem(SaisonContexteService.KEY_ACTIVE, s.id);
    localStorage.setItem(SaisonContexteService.KEY_MODE, mode);
  }

  /** Acquitte l'entrée dans une saison (depuis le sélecteur). `remember` = entrer directement ensuite. */
  entrer(s: Saison, remember: boolean): void {
    this.poser(s, s.statut === 'EN_COURS' ? 'travail' : 'archive');
    localStorage.setItem(SaisonContexteService.KEY_REMEMBER, remember ? '1' : '0');
  }

  /** Marque la saison comme active (bandeau + bornage) sans rejouer le sélecteur ni toucher au choix mémorisé. */
  marquerActive(s: Saison): void {
    this.poser(s);
  }

  /**
   * Recale la saison entrée sur l'EN_COURS du club — appelé après une clôture ou une réouverture
   * depuis le panneau Saison : rouvrir une saison, c'est vouloir travailler dessus. Sans ce recalage
   * l'application continuait de borner sur une saison qu'on venait de clôturer.
   *
   * @returns la saison désormais entrée, ou null si le club n'a plus de saison EN_COURS.
   */
  resynchroniserSurEnCours(): Saison | null {
    const enCours = this.enCours();
    if (enCours) this.poser(enCours);
    return enCours;
  }

  /** Réinitialise l'état (changement de club). */
  reset(): void {
    this.saisons.set([]);
    this.chargePourClub = null;
    this.oublier();
    localStorage.removeItem(SaisonContexteService.KEY_REMEMBER);
  }

  /**
   * Déconnexion : on ne se réveille jamais dans une archive à la connexion suivante — c'est la règle
   * énoncée par le sélecteur (« on consulte une archive, on ne s'y installe pas »). Le choix
   * « entrer directement » survit en revanche, c'est précisément sa raison d'être.
   */
  auLogout(): void {
    this.saisons.set([]);
    this.chargePourClub = null;
    if (this.estModeArchive() || !this.memorise()) this.oublier();
    this.entreeClub = null;
  }
}
