import { Component, inject, signal, OnInit, HostListener, HostBinding, Input, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService, NotificationItem, CategorieNotif } from '@core/services/notification.service';
import { NotificationPushService } from '@core/services/notification-push.service';
import { AuthService } from '@core/services/auth.service';

/**
 * Cloche de notifications (fixe, en haut à droite) commune au staff et à la PWA joueur.
 * Badge alimenté par le polling 60 s du service ; panneau déroulant avec la liste, marquage
 * lu et navigation par deep-link. Propose l'activation du Web Push si disponible.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit {

  private notifs = inject(NotificationService);
  private push = inject(NotificationPushService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private host = inject(ElementRef);

  /** Mode intégré au flux (ex. header PWA, à côté de l'avatar) au lieu du flottant fixe. */
  @Input() @HostBinding('class.inline') inline = false;

  readonly nonLus = this.notifs.nonLus;
  readonly etatPush = this.push.etat;
  readonly ouvert = signal(false);
  readonly items = signal<NotificationItem[]>([]);
  readonly chargement = signal(false);
  readonly filtre = signal<CategorieNotif | null>(null);

  readonly categories: { code: CategorieNotif | null; label: string }[] = [
    { code: null, label: 'Toutes' },
    { code: 'ALERTE', label: 'Alertes' },
    { code: 'RAPPEL', label: 'Rappels' },
    { code: 'MESSAGE', label: 'Messages' },
    { code: 'INFO', label: 'Infos' },
  ];

  ngOnInit(): void {
    this.notifs.demarrerPolling();
    this.push.init();
  }

  basculer(): void {
    const o = !this.ouvert();
    this.ouvert.set(o);
    if (o) this.charger();
  }

  private charger(): void {
    this.chargement.set(true);
    this.notifs.lister(0, 20, this.filtre()).subscribe({
      next: p => { this.items.set(p.items); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  filtrer(cat: CategorieNotif | null): void {
    if (this.filtre() === cat) return;
    this.filtre.set(cat);
    this.charger();
  }

  supprimer(n: NotificationItem, e: Event): void {
    e.stopPropagation();
    this.notifs.supprimer(n.id, !n.lu).subscribe();
    this.items.update(list => list.filter(x => x.id !== n.id));
  }

  viderLues(): void {
    this.notifs.viderLues().subscribe();
    this.items.update(list => list.filter(x => !x.lu));
  }

  ouvrir(n: NotificationItem): void {
    if (!n.lu) {
      this.notifs.marquerLu(n.id).subscribe();
      this.items.update(list => list.map(x => x.id === n.id ? { ...x, lu: true } : x));
    }
    this.ouvert.set(false);
    if (n.lien) this.router.navigateByUrl(n.lien);
  }

  toutLire(): void {
    this.notifs.marquerToutLu().subscribe();
    this.items.update(list => list.map(x => ({ ...x, lu: true })));
  }

  activerPush(): void { this.push.activer(); }

  allerParametres(): void {
    this.ouvert.set(false);
    this.router.navigate([this.estStaff() ? '/parametres-notifications' : '/joueur/notifications']);
  }

  estStaff(): boolean {
    return this.auth.hasRole('SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL');
  }

  iconeCategorie(cat: string): string {
    switch (cat) {
      case 'ALERTE': return '⚠️';
      case 'RAPPEL': return '⏰';
      case 'MESSAGE': return '💬';
      case 'INFO': return 'ℹ️';
      default: return '🔔';
    }
  }

  tempsRelatif(iso: string): string {
    const d = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - d);
    const min = Math.floor(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    return `il y a ${j} j`;
  }

  @HostListener('document:click', ['$event'])
  fermerSiDehors(e: MouseEvent): void {
    if (this.ouvert() && !this.host.nativeElement.contains(e.target)) this.ouvert.set(false);
  }
}
