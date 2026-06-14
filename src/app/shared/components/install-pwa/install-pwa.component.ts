import { Component, inject, signal } from '@angular/core';
import { PwaInstallService } from '@core/services/pwa-install.service';

/**
 * Bouton « Installer l'application ». Sur Android/Chrome il déclenche l'invite
 * native ; sur iOS (Safari) il déplie la marche à suivre (Partager → écran
 * d'accueil). Rien ne s'affiche si l'app est déjà installée ou non installable.
 */
@Component({
  selector: 'app-install-pwa',
  standalone: true,
  templateUrl: './install-pwa.component.html',
  styleUrl: './install-pwa.component.scss',
})
export class InstallPwaComponent {
  install = inject(PwaInstallService);
  readonly showIos = signal(false);
}
