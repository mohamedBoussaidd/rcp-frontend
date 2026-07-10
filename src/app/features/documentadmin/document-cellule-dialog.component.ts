import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DocumentAdminService, StatutDocument } from '@core/services/documentadmin.service';

export interface DocumentCelluleDialogData {
  joueurId: string;
  joueurNom: string;
  typeId: string;
  typeLibelle: string;
  documentId?: string | null;
  statut: StatutDocument;
  dateExpiration?: string | null;
  motifRefus?: string | null;
}

/**
 * Action sur une cellule de la matrice de conformité : dépôt (MANQUANT/remplacement),
 * validation ou refus (SOUMIS). Le dépôt reste possible quel que soit le statut courant
 * (écrasement simple, cohérent avec le backend).
 */
@Component({
  selector: 'app-document-cellule-dialog',
  standalone: true,
  templateUrl: './document-cellule-dialog.component.html',
  styleUrl: './document-cellule-dialog.component.scss',
  imports: [FormsModule, DatePipe],
})
export class DocumentCelluleDialogComponent {

  private service = inject(DocumentAdminService);
  private ref = inject(MatDialogRef<DocumentCelluleDialogComponent>);
  data = inject<DocumentCelluleDialogData>(MAT_DIALOG_DATA);

  readonly fichier = signal<File | null>(null);
  readonly refusOuvert = signal(false);
  readonly motif = signal('');
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  get libelleStatut(): string {
    return ({
      MANQUANT: 'Manquant', SOUMIS: 'En attente de validation', VALIDE: 'Validé',
      REFUSE: 'Refusé', EXPIRE: 'Expiré',
    } as Record<StatutDocument, string>)[this.data.statut];
  }

  onFichier(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.fichier.set(input.files?.[0] ?? null);
  }

  deposer(): void {
    const f = this.fichier();
    if (!f) { this.erreur.set('Choisis un fichier.'); return; }
    this.envoi.set(true); this.erreur.set(null);
    this.service.deposer(this.data.joueurId, this.data.typeId, f).subscribe({
      next: () => { this.envoi.set(false); this.ref.close(true); },
      error: err => {
        this.envoi.set(false);
        this.erreur.set(
          err.status === 415 ? 'Type non autorisé (PDF, JPG, PNG).'
          : err.status === 413 ? 'Fichier trop volumineux (max 10 Mo).'
          : 'Échec du dépôt. Réessaie.');
      },
    });
  }

  valider(): void {
    if (!this.data.documentId) return;
    this.envoi.set(true); this.erreur.set(null);
    this.service.valider(this.data.documentId).subscribe({
      next: () => { this.envoi.set(false); this.ref.close(true); },
      error: () => { this.envoi.set(false); this.erreur.set('Échec de la validation.'); },
    });
  }

  ouvrirRefus(): void { this.refusOuvert.set(true); }

  refuser(): void {
    if (!this.data.documentId) return;
    if (!this.motif().trim()) { this.erreur.set('Le motif de refus est obligatoire.'); return; }
    this.envoi.set(true); this.erreur.set(null);
    this.service.refuser(this.data.documentId, this.motif().trim()).subscribe({
      next: () => { this.envoi.set(false); this.ref.close(true); },
      error: () => { this.envoi.set(false); this.erreur.set('Échec du refus.'); },
    });
  }

  telecharger(): void {
    if (!this.data.documentId) return;
    this.service.telecharger(this.data.documentId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      },
      error: () => {},
    });
  }

  fermer(): void { this.ref.close(false); }
}
