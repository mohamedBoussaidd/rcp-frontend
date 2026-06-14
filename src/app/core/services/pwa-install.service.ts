import { Injectable, signal } from '@angular/core';

/** Événement Chrome/Android d'invite d'installation (non typé dans la lib DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Gère l'installation de la PWA. Capte l'événement `beforeinstallprompt`
 * (Android/Chrome) pour proposer l'installation à la demande, et expose des
 * helpers iOS (où l'installation se fait via Partager → « Sur l'écran d'accueil »).
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {

  private deferred: BeforeInstallPromptEvent | null = null;

  /** Une invite d'installation native est disponible (Android/Chrome). */
  readonly canInstall = signal(false);
  /** L'app vient d'être installée. */
  readonly installed = signal(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canInstall.set(false);
      this.installed.set(true);
    });
  }

  get isIos(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  /** L'app tourne déjà en mode installé (écran d'accueil / standalone). */
  get isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
  }

  /** iOS (Safari) non installé : installation manuelle via Partager. */
  get iosInstallable(): boolean {
    return this.isIos && !this.isStandalone;
  }

  /** Déclenche l'invite native d'installation (Android/Chrome). */
  async prompt(): Promise<void> {
    if (!this.deferred) return;
    this.deferred.prompt();
    try { await this.deferred.userChoice; } catch { /* ignoré */ }
    this.deferred = null;
    this.canInstall.set(false);
  }
}
