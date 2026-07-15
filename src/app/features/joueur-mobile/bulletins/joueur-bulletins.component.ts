import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ContratService, MonBulletin, MonContrat } from '@core/services/contrat.service';

/**
 * Mes fiches de paye & mon contrat (PWA joueur). Lecture seule : bulletins distribués
 * par le club (le 1er téléchargement est tracé côté gestion) et contrat(s) de la personne.
 */
@Component({
  selector: 'app-joueur-bulletins',
  standalone: true,
  templateUrl: './joueur-bulletins.component.html',
  styleUrl: './joueur-bulletins.component.scss',
  imports: [DatePipe],
})
export class JoueurBulletinsComponent implements OnInit {

  private service = inject(ContratService);
  private snack = inject(MatSnackBar);

  readonly bulletins = signal<MonBulletin[]>([]);
  readonly contrats = signal<MonContrat[]>([]);
  readonly chargement = signal(true);

  ngOnInit(): void {
    this.service.mesBulletins().subscribe({
      next: b => { this.bulletins.set(b); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
    this.service.mesContrats().subscribe({ next: c => this.contrats.set(c), error: () => {} });
  }

  telecharger(b: MonBulletin): void {
    this.service.telechargerMonBulletin(b.id).subscribe({
      next: blob => {
        this.sauver(blob, b.nomOriginal);
        // Reflète le jalon « téléchargé » sans recharger.
        if (!b.premierTelechargementLe) {
          this.bulletins.update(l => l.map(x => x.id === b.id ? { ...x, premierTelechargementLe: new Date().toISOString() } : x));
        }
      },
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  telechargerContrat(c: MonContrat): void {
    this.service.telechargerMonContrat(c.id).subscribe({
      next: blob => this.sauver(blob, c.nomOriginal || 'contrat.pdf'),
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private sauver(blob: Blob, nom: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom; a.click();
    URL.revokeObjectURL(url);
  }
}
