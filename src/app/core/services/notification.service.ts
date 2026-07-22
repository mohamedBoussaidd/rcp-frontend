import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type CategorieNotif = 'RAPPEL' | 'INFO' | 'MESSAGE' | 'ALERTE' | 'SYSTEME';

export interface NotificationItem {
  id: string;
  type: string;
  categorie: CategorieNotif;
  titre: string;
  corps?: string;
  lien?: string;
  priorite: 'NORMALE' | 'URGENTE';
  emetteurType: 'SYSTEME' | 'UTILISATEUR';
  emetteurNom?: string;
  sujetJoueurId?: string;
  sujetJoueurNom?: string;
  threadId?: string;
  repondable: boolean;
  lu: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nonLus: number;
  page: number;
  dernierePage: boolean;
}

/**
 * Notifications in-app du destinataire courant : liste paginée, marquage lu et polling léger
 * du compteur de non-lus (toutes les 60 s) qui alimente le badge de la cloche. Le polling est
 * démarré par la cloche (donc uniquement quand l'utilisateur est connecté).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {

  private http = inject(HttpClient);
  private readonly base = '/api/notifications';

  /** Compteur de non-lus (badge cloche). */
  readonly nonLus = signal(0);

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  /** Démarre le polling 60 s du compteur (idempotent). */
  demarrerPolling(): void {
    if (this.pollHandle) return;
    this.rafraichirCompteur();
    this.pollHandle = setInterval(() => this.rafraichirCompteur(), 60_000);
  }

  arreterPolling(): void {
    if (this.pollHandle) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  rafraichirCompteur(): void {
    this.http.get<{ nonLus: number }>(`${this.base}/compteur`)
      .subscribe({ next: r => this.nonLus.set(r.nonLus), error: () => {} });
  }

  lister(page = 0, size = 20, categorie?: CategorieNotif | null): Observable<NotificationPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (categorie) params = params.set('categorie', categorie);
    return this.http.get<NotificationPage>(this.base, { params })
      .pipe(tap(p => this.nonLus.set(p.nonLus)));
  }

  marquerLu(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/lu`, {})
      .pipe(tap(() => this.nonLus.update(n => Math.max(0, n - 1))));
  }

  marquerToutLu(): Observable<void> {
    return this.http.post<void>(`${this.base}/lire-tout`, {})
      .pipe(tap(() => this.nonLus.set(0)));
  }

  /** Supprime une notification. Décrémente le compteur si elle était non lue. */
  supprimer(id: string, etaitNonLue = false): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`)
      .pipe(tap(() => { if (etaitNonLue) this.nonLus.update(n => Math.max(0, n - 1)); }));
  }

  /** Supprime toutes les notifications déjà lues du destinataire courant. */
  viderLues(): Observable<void> {
    return this.http.delete<void>(`${this.base}/lues`);
  }
}
