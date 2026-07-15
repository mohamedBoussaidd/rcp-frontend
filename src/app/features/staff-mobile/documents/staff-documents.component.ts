import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MesDocumentsAdminService, MonDocumentAdmin } from '@core/services/mes-documents-admin.service';
import { AuthService } from '@core/services/auth.service';
import { ContratService, MonBulletin, MonContrat } from '@core/services/contrat.service';

/**
 * Mes documents administratifs (staff mobile) : les documents requis pour MA fiche
 * (licence dirigeant, diplômes, honorabilité…), dépôt et téléchargement. Miroir de
 * l'écran joueur, branché sur le montage /api/membre (self-scope, V58).
 * Si le module Contrats & paie est actif (V59) : mon contrat + mes fiches de paye.
 */
@Component({
  selector: 'app-staff-documents',
  standalone: true,
  templateUrl: './staff-documents.component.html',
  styleUrl: './staff-documents.component.scss',
  imports: [DatePipe],
})
export class StaffDocumentsComponent implements OnInit {

  private service = inject(MesDocumentsAdminService);
  private contratService = inject(ContratService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  readonly documents = signal<MonDocumentAdmin[]>([]);
  readonly chargement = signal(true);
  readonly nonLie = signal(false);
  readonly envoiEnCours = signal<string | null>(null);

  readonly contrats = signal<MonContrat[]>([]);
  readonly bulletins = signal<MonBulletin[]>([]);

  ngOnInit(): void {
    this.charger();
    if (this.auth.hasModule('contrats')) {
      this.contratService.mesContrats().subscribe({ next: c => this.contrats.set(c), error: () => {} });
      this.contratService.mesBulletins().subscribe({ next: b => this.bulletins.set(b), error: () => {} });
    }
  }

  private charger(): void {
    this.service.mesDocumentsMembre().subscribe({
      next: d => { this.documents.set(d); this.chargement.set(false); },
      error: e => {
        this.chargement.set(false);
        if (e?.status === 409) this.nonLie.set(true);
      },
    });
  }

  statutLabel(s: string): string {
    switch (s) {
      case 'VALIDE': return 'Validé';
      case 'SOUMIS': return 'En attente';
      case 'REFUSE': return 'Refusé';
      case 'EXPIRE': return 'Expiré';
      default: return 'Manquant';
    }
  }
  statutClass(s: string): string {
    switch (s) {
      case 'VALIDE': return 'sd-badge--ok';
      case 'SOUMIS': return 'sd-badge--info';
      case 'REFUSE': case 'EXPIRE': return 'sd-badge--bad';
      default: return 'sd-badge--off';
    }
  }

  deposer(d: MonDocumentAdmin, e: Event): void {
    const fichier = (e.target as HTMLInputElement).files?.[0];
    if (!fichier) return;
    this.envoiEnCours.set(d.typeId);
    this.service.deposerMembre(d.typeId, fichier).subscribe({
      next: maj => {
        this.envoiEnCours.set(null);
        this.documents.update(l => l.map(x => x.typeId === d.typeId ? maj : x));
      },
      error: () => {
        this.envoiEnCours.set(null);
        this.snack.open("Échec de l'envoi du document", 'Fermer', { duration: 3000 });
      },
    });
  }

  telecharger(d: MonDocumentAdmin): void {
    if (!d.documentId) return;
    this.service.telechargerMembre(d.documentId).subscribe({
      next: blob => this.sauver(blob, d.nomOriginal || 'document'),
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  telechargerContrat(c: MonContrat): void {
    this.contratService.telechargerMonContrat(c.id).subscribe({
      next: blob => this.sauver(blob, c.nomOriginal || 'contrat.pdf'),
      error: () => this.snack.open('Téléchargement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  telechargerBulletin(b: MonBulletin): void {
    this.contratService.telechargerMonBulletin(b.id).subscribe({
      next: blob => {
        this.sauver(blob, b.nomOriginal);
        if (!b.premierTelechargementLe) {
          this.bulletins.update(l => l.map(x => x.id === b.id ? { ...x, premierTelechargementLe: new Date().toISOString() } : x));
        }
      },
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
