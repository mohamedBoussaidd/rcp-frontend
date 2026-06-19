import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

/**
 * Web Push côté client (VAPID via @angular/service-worker). S'abonne au push si le service
 * worker est actif (build prod) et que des clés VAPID existent côté serveur, gère le clic sur
 * une notification (navigation), et expose l'état pour la bannière de relance. En dev (SW
 * désactivé) ou sur navigateur non compatible, tout est no-op et les notifications restent in-app.
 */
@Injectable({ providedIn: 'root' })
export class NotificationPushService {

  private http = inject(HttpClient);
  private swPush = inject(SwPush);
  private router = inject(Router);
  private readonly base = '/api/notifications/push';

  /** État : 'inactif' (push indispo), 'a-activer' (possible mais pas accordé), 'actif', 'refuse'. */
  readonly etat = signal<'inactif' | 'a-activer' | 'actif' | 'refuse'>('inactif');

  private clePublique: string | null = null;

  /** À appeler une fois après login : détecte la possibilité d'activer + gère les clics. */
  async init(): Promise<void> {
    if (!this.swPush.isEnabled) { this.etat.set('inactif'); return; }

    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const url = (notification as any)?.data?.url;
      if (url) this.router.navigateByUrl(url);
    });

    try {
      const cle = await firstValueFrom(
        this.http.get<{ publicKey: string | null; actif: boolean }>(`${this.base}/cle-publique`));
      if (!cle?.actif || !cle.publicKey) { this.etat.set('inactif'); return; }
      this.clePublique = cle.publicKey;

      const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'default';
      if (perm === 'denied') { this.etat.set('refuse'); return; }
      if (perm === 'granted') { await this.abonner(); return; }
      this.etat.set('a-activer');
    } catch {
      this.etat.set('inactif');
    }
  }

  /** Demande l'autorisation puis enregistre l'abonnement (déclenché par un geste utilisateur). */
  async activer(): Promise<void> {
    if (!this.swPush.isEnabled || !this.clePublique) return;
    try {
      await this.abonner();
    } catch {
      this.etat.set(Notification?.permission === 'denied' ? 'refuse' : 'a-activer');
    }
  }

  private async abonner(): Promise<void> {
    if (!this.clePublique) return;
    const sub = await this.swPush.requestSubscription({ serverPublicKey: this.clePublique });
    const json: any = sub.toJSON();
    await firstValueFrom(this.http.post<void>(`${this.base}/abonnement`, {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    }));
    this.etat.set('actif');
  }
}
