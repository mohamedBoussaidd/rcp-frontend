import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationItem, NotificationService } from '@core/services/notification.service';
import { NotificationPushService } from '@core/services/notification-push.service';

/**
 * Centre de notifications du staff (mobile) : liste in-app (marquage lu, lien),
 * et activation du Web Push de l'appareil. Réutilise le service de la cloche.
 */
@Component({
  selector: 'app-staff-notifications',
  standalone: true,
  templateUrl: './staff-notifications.component.html',
  styleUrl: './staff-notifications.component.scss',
  imports: [DatePipe],
})
export class StaffNotificationsComponent implements OnInit {

  private service = inject(NotificationService);
  private router = inject(Router);
  push = inject(NotificationPushService);

  readonly items = signal<NotificationItem[]>([]);
  readonly chargement = signal(true);
  readonly nonLus = this.service.nonLus;

  ngOnInit(): void { this.charger(); }

  private charger(): void {
    this.service.lister(0, 50).subscribe({
      next: p => { this.items.set(p.items); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  ouvrir(n: NotificationItem): void {
    if (!n.lu) {
      this.service.marquerLu(n.id).subscribe({
        next: () => this.items.update(l => l.map(x => x.id === n.id ? { ...x, lu: true } : x)),
        error: () => {},
      });
    }
    if (n.lien) this.router.navigateByUrl(n.lien);
  }

  toutLire(): void {
    this.service.marquerToutLu().subscribe({
      next: () => this.items.update(l => l.map(x => ({ ...x, lu: true }))),
      error: () => {},
    });
  }

  icone(n: NotificationItem): string {
    switch (n.categorie) {
      case 'ALERTE': return '⚠️';
      case 'MESSAGE': return '💬';
      case 'RAPPEL': return '⏰';
      case 'SYSTEME': return '⚙️';
      default: return 'ℹ️';
    }
  }
}
