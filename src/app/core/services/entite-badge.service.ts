import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { BadgeDef } from '../../shared/components/badge/badge.model';

type MapEntite = Record<string, BadgeDef[]>;

/**
 * Tags (badges plateforme) posés sur des entités (exercice / séance / joueur).
 *   - Affichage : un cache PAR TYPE (chargé une fois via `/api/badges/entite/{type}`) évite une
 *     requête par card ; `lookup(type, id)` lit ce cache de façon réactive.
 *   - Assignation (super-admin) : `assigner()` puis rafraîchit le cache.
 */
@Injectable({ providedIn: 'root' })
export class EntiteBadgeService {

  private http = inject(HttpClient);
  private caches = new Map<string, WritableSignal<MapEntite>>();
  private charges = new Set<string>();

  private cacheDe(type: string): WritableSignal<MapEntite> {
    let s = this.caches.get(type);
    if (!s) { s = signal<MapEntite>({}); this.caches.set(type, s); }
    return s;
  }

  /** Charge (une seule fois) la carte des tags du type. À appeler depuis un effet du composant. */
  ensureLoaded(type: string): void {
    if (!type || this.charges.has(type)) return;
    this.charges.add(type);
    this.http.get<MapEntite>(`/api/badges/entite/${type}`).subscribe({
      next: m => this.cacheDe(type).set(m ?? {}),
      error: () => { this.charges.delete(type); },
    });
  }

  /** Lecture réactive des tags d'une entité depuis le cache du type. */
  lookup(type: string, id: string | null | undefined): BadgeDef[] {
    if (!id) return [];
    return this.cacheDe(type)()[id] ?? [];
  }

  private rafraichir(type: string): void {
    this.charges.delete(type);
    this.ensureLoaded(type);
  }

  /** Tags d'une entité précise (non caché) — pour l'écran d'assignation. */
  badgesDe(type: string, id: string): Observable<BadgeDef[]> {
    return this.http.get<BadgeDef[]>(`/api/badges/entite/${type}/${id}`);
  }

  /** Remplace les tags d'une entité (super-admin) puis rafraîchit le cache d'affichage. */
  assigner(type: string, id: string, badgeIds: string[]): Observable<BadgeDef[]> {
    return this.http.put<BadgeDef[]>(`/api/badges/entite/${type}/${id}`, badgeIds).pipe(
      tap(() => this.rafraichir(type)),
    );
  }
}
