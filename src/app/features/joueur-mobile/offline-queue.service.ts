import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { EspaceJoueurService, WellnessRequest, RpeRequest } from '@core/services/espace-joueur.service';

type PendingItem =
  | { id: string; kind: 'wellness'; payload: WellnessRequest; ts: number }
  | { id: string; kind: 'rpe'; payload: RpeRequest; ts: number };

const STORAGE_KEY = 'rcp_joueur_offline_queue';

/**
 * File d'attente des saisies faites hors-ligne (wellness / sRPE). Persistée en
 * localStorage, rejouée automatiquement au retour du réseau. Permet au joueur de
 * saisir dans le vestiaire sans connexion : la donnée part dès que possible.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {

  private api = inject(EspaceJoueurService);

  readonly online = signal(navigator.onLine);
  readonly pending = signal<PendingItem[]>(this.load());
  readonly nbPending = signal(this.pending().length);

  constructor() {
    window.addEventListener('online', () => { this.online.set(true); this.flush(); });
    window.addEventListener('offline', () => this.online.set(false));
    // Tentative de vidage au démarrage si des éléments traînent.
    if (this.online() && this.pending().length) this.flush();
  }

  /** Une erreur HTTP correspond-elle à une perte de réseau (pas un refus serveur) ? */
  estErreurReseau(err: { status?: number }): boolean {
    return !navigator.onLine || err?.status === 0;
  }

  enqueue(item: Omit<PendingItem, 'id' | 'ts'>): void {
    const full = { ...item, id: crypto.randomUUID(), ts: Date.now() } as PendingItem;
    const list = [...this.pending(), full];
    this.persist(list);
  }

  /** Rejoue séquentiellement les éléments en attente ; retire ceux qui passent. */
  flush(): void {
    const items = this.pending();
    if (!items.length || !navigator.onLine) return;

    let restant = [...items];
    const suivant = (i: number) => {
      if (i >= items.length) { this.persist(restant); return; }
      const it = items[i];
      const obs: Observable<unknown> = it.kind === 'wellness'
        ? this.api.saisirWellness(it.payload)
        : this.api.saisirRpe(it.payload);
      obs.subscribe({
        next: () => { restant = restant.filter(x => x.id !== it.id); this.persist(restant); suivant(i + 1); },
        error: () => suivant(i + 1), // on garde l'élément pour un prochain essai
      });
    };
    suivant(0);
  }

  private persist(list: PendingItem[]): void {
    this.pending.set(list);
    this.nbPending.set(list.length);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota */ }
  }

  private load(): PendingItem[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
  }
}
