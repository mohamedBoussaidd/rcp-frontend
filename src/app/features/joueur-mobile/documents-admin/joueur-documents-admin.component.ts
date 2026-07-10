import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MesDocumentsAdminService, MonDocumentAdmin } from '@core/services/mes-documents-admin.service';

/**
 * PWA joueur — « Mes documents administratifs » (licence, certificat médical, autorisation
 * parentale…), distinct des documents médicaux. Upload direct ou re-soumission après refus.
 */
@Component({
  selector: 'app-joueur-documents-admin',
  standalone: true,
  templateUrl: './joueur-documents-admin.component.html',
  styleUrl: './joueur-documents-admin.component.scss',
  imports: [DatePipe],
})
export class JoueurDocumentsAdminComponent implements OnInit {

  private service = inject(MesDocumentsAdminService);

  readonly documents = signal<MonDocumentAdmin[]>([]);
  readonly chargement = signal(true);
  readonly typeActif = signal<string | null>(null);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  ngOnInit(): void { this.charger(); }

  private charger(): void {
    this.chargement.set(true);
    this.service.mesDocuments().subscribe({
      next: d => { this.documents.set(d); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  statutLabel(s: string): string {
    return ({ MANQUANT: 'À déposer', SOUMIS: 'En attente de validation', VALIDE: 'Validé', REFUSE: 'Refusé', EXPIRE: 'Expiré' } as Record<string, string>)[s] ?? s;
  }

  expireBientot(d: MonDocumentAdmin): boolean {
    if (d.statut !== 'VALIDE' || !d.dateExpiration) return false;
    return (new Date(d.dateExpiration).getTime() - Date.now()) / 86_400_000 <= 30;
  }

  ouvrir(typeId: string): void {
    this.erreur.set(null);
    this.typeActif.set(this.typeActif() === typeId ? null : typeId);
  }

  onFichier(e: Event, typeId: string): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { this.erreur.set('Fichier trop volumineux (max 10 Mo).'); return; }
    this.envoi.set(true); this.erreur.set(null);
    this.service.deposer(typeId, f).subscribe({
      next: () => { this.envoi.set(false); this.typeActif.set(null); this.charger(); },
      error: err => {
        this.envoi.set(false);
        this.erreur.set(
          err.status === 415 ? 'Type non autorisé (PDF, JPG, PNG).'
          : err.status === 413 ? 'Fichier trop volumineux (max 10 Mo).'
          : 'Échec du dépôt. Réessaie.');
      },
    });
  }

  telecharger(d: MonDocumentAdmin): void {
    if (!d.documentId) return;
    this.service.telecharger(d.documentId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = d.nomOriginal || d.typeLibelle; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {},
    });
  }
}
