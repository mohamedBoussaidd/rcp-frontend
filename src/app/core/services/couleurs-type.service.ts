import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { TypeSeance } from './seance.service';

/**
 * Couleurs de type de séance, résolues une fois pour toute l'application.
 *
 * <p>Cinq écrans (charge d'équipe, imports GPS/RPE, vue séance, vue charge) portaient chacun
 * leur PROPRE copie codée en dur des 7 couleurs historiques : un type créé par un club sortait
 * gris-violet partout, et une couleur modifiée en base n'était visible nulle part.
 *
 * <p>Depuis V93 la couleur vit sur `type_seance.couleur`. Ce service la charge une seule fois
 * (cache mémoire) et retombe sur la table historique tant que la réponse n'est pas arrivée —
 * l'affichage ne clignote donc jamais et reste correct sur une base pas encore migrée.
 */
@Injectable({ providedIn: 'root' })
export class CouleursTypeService {

  /** Repli : les couleurs historiques, identiques à celles semées par V93. */
  private static readonly REPLI: Record<string, string> = {
    MATCH:        '#ef4444',
    MATCH_AMICAL: '#f97316',
    INTENSIF:     '#6366f1',
    TECHNIQUE:    '#0ea5a0',
    REPRISE:      '#22c55e',
    PRE_MATCH:    '#eab308',
    FORCE:        '#8b5cf6',
  };

  /** Couleur par défaut d'un type inconnu — inchangée par rapport à l'existant. */
  static readonly DEFAUT = '#6366f1';

  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /** Couleurs par code, alimentées par le catalogue du club actif. */
  private readonly parCode = signal<Record<string, string>>({});
  private chargement = false;

  constructor() {
    this.charger();
  }

  /**
   * Recharge le catalogue après une modification de couleur : sans ça, le changement
   * n'apparaîtrait qu'au prochain rechargement complet de l'application.
   */
  rafraichir(): void {
    this.chargement = false;
    this.charger();
  }

  /**
   * Charge le catalogue (idempotent). Best-effort : sans le droit `seances:read` ou hors
   * contexte club, on garde simplement le repli.
   */
  charger(): void {
    if (this.chargement) return;
    this.chargement = true;
    // Le joueur n'a pas `seances:read` : il lit le même catalogue via son espace personnel,
    // sinon son calendrier retomberait sur la palette par défaut au lieu des couleurs du club.
    const url = this.auth.hasRole('JOUEUR') ? '/api/moi/type-seances' : '/api/type-seances';
    this.http.get<TypeSeance[]>(url).subscribe({
      next: types => {
        const map: Record<string, string> = {};
        for (const t of types) {
          if (t.couleur) map[t.code] = t.couleur;
        }
        this.parCode.set(map);
      },
      error: () => { this.chargement = false; },   // réessayable au prochain écran
    });
  }

  /** Couleur d'un type : celle de la base, sinon l'historique, sinon le défaut. */
  couleur(code?: string | null): string {
    if (!code) return CouleursTypeService.DEFAUT;
    return this.parCode()[code]
      ?? CouleursTypeService.REPLI[code]
      ?? CouleursTypeService.DEFAUT;
  }
}
