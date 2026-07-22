import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationItem, NotificationService, CategorieNotif } from '@core/services/notification.service';
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
  readonly filtre = signal<CategorieNotif | null>(null);

  readonly categories: { code: CategorieNotif | null; label: string }[] = [
    { code: null, label: 'Toutes' },
    { code: 'ALERTE', label: 'Alertes' },
    { code: 'RAPPEL', label: 'Rappels' },
    { code: 'MESSAGE', label: 'Messages' },
    { code: 'INFO', label: 'Infos' },
  ];

  ngOnInit(): void { this.charger(); }

  private charger(): void {
    this.chargement.set(true);
    this.service.lister(0, 50, this.filtre()).subscribe({
      next: p => { this.items.set(p.items); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  filtrer(cat: CategorieNotif | null): void {
    if (this.filtre() === cat) return;
    this.filtre.set(cat);
    this.charger();
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

  supprimer(n: NotificationItem, e: Event): void {
    e.stopPropagation();
    this.service.supprimer(n.id, !n.lu).subscribe();
    this.items.update(l => l.filter(x => x.id !== n.id));
  }

  viderLues(): void {
    this.service.viderLues().subscribe();
    this.items.update(l => l.filter(x => !x.lu));
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
