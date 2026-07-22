import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  MaintenanceAdminService, TacheVue, Retention, BroadcastRequest, CibleBroadcast,
} from '@core/services/maintenance-admin.service';
import { Club, ClubService } from '@core/services/club.service';

/**
 * Console d'exploitation plateforme (SUPER_ADMIN) : exécution manuelle des tâches de maintenance
 * (+ dernier statut), réglage de la rétention des notifications, et diffusion d'annonces.
 */
@Component({
  selector: 'app-maintenance',
  standalone: true,
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss',
  imports: [FormsModule, DatePipe, RouterLink],
})
export class MaintenanceComponent implements OnInit {

  private api = inject(MaintenanceAdminService);
  private clubService = inject(ClubService);
  private snack = inject(MatSnackBar);

  readonly onglet = signal<'taches' | 'retention' | 'annonce'>('taches');

  readonly taches = signal<TacheVue[]>([]);
  readonly enCours = signal<string | null>(null);

  retention: Retention = { lues: 30, nonLues: 90 };
  retentionSaving = signal(false);

  readonly clubs = signal<Club[]>([]);
  readonly roles = ['PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'ADMINISTRATIF', 'JOUEUR'];

  broadcast: BroadcastRequest = { cible: 'TOUS', titre: '', corps: '', lien: '', priorite: 'NORMALE', clubId: null, role: null };
  broadcastSaving = signal(false);

  ngOnInit(): void {
    this.api.taches().subscribe({ next: t => this.taches.set(t), error: () => {} });
    this.api.retention().subscribe({ next: r => this.retention = r, error: () => {} });
    this.clubService.lister().subscribe({ next: c => this.clubs.set(c), error: () => {} });
  }

  executer(t: TacheVue): void {
    if (t.nettoyage && !confirm(`Lancer « ${t.libelle} » maintenant ? Cette opération supprime des données.`)) return;
    this.enCours.set(t.code);
    this.api.executer(t.code).subscribe({
      next: maj => {
        this.enCours.set(null);
        this.taches.update(list => list.map(x => x.code === maj.code ? maj : x));
        this.snack.open(`${maj.libelle} : ${maj.dernierMessage ?? 'terminé'}`, 'OK', { duration: 3500 });
      },
      error: () => { this.enCours.set(null); this.snack.open('Échec de la tâche', 'Fermer', { duration: 3500 }); },
    });
  }

  enregistrerRetention(): void {
    this.retentionSaving.set(true);
    this.api.majRetention(this.retention).subscribe({
      next: r => { this.retention = r; this.retentionSaving.set(false); this.snack.open('Rétention enregistrée', 'OK', { duration: 2500 }); },
      error: () => { this.retentionSaving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3500 }); },
    });
  }

  changerCible(c: CibleBroadcast): void { this.broadcast.cible = c; }

  envoyerBroadcast(): void {
    if (!this.broadcast.titre.trim()) { this.snack.open('Titre requis', 'Fermer', { duration: 2500 }); return; }
    if (this.broadcast.cible === 'CLUB' && !this.broadcast.clubId) { this.snack.open('Choisis un club', 'Fermer', { duration: 2500 }); return; }
    if (this.broadcast.cible === 'ROLE' && !this.broadcast.role) { this.snack.open('Choisis un rôle', 'Fermer', { duration: 2500 }); return; }
    const cibleLbl = this.broadcast.cible === 'TOUS' ? 'TOUS les utilisateurs'
      : this.broadcast.cible === 'CLUB' ? 'un club' : 'un rôle';
    if (!confirm(`Envoyer cette annonce à ${cibleLbl} ?`)) return;
    this.broadcastSaving.set(true);
    this.api.broadcast(this.broadcast).subscribe({
      next: r => {
        this.broadcastSaving.set(false);
        this.snack.open(`Annonce envoyée à ${r.destinataires} destinataire(s)`, 'OK', { duration: 3500 });
        this.broadcast = { cible: 'TOUS', titre: '', corps: '', lien: '', priorite: 'NORMALE', clubId: null, role: null };
      },
      error: () => { this.broadcastSaving.set(false); this.snack.open('Envoi impossible', 'Fermer', { duration: 3500 }); },
    });
  }
}
