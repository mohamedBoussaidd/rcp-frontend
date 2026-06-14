import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JoueurStore } from '../joueur.store';
import { DocumentMedical } from '@core/services/espace-joueur.service';

/**
 * Mes documents médicaux : liste + téléchargement + suppression, et dépôt depuis
 * le mobile (photo d'ordonnance / PDF) avec catégorie + rôles de partage.
 */
@Component({
  selector: 'app-joueur-documents',
  standalone: true,
  templateUrl: './joueur-documents.component.html',
  styleUrl: './joueur-documents.component.scss',
  imports: [DatePipe, FormsModule],
})
export class JoueurDocumentsComponent {

  store = inject(JoueurStore);

  readonly CATEGORIES = [
    { val: 'certificat', label: 'Certificat' },
    { val: 'ordonnance', label: 'Ordonnance' },
    { val: 'imagerie', label: 'Imagerie' },
    { val: 'compte_rendu', label: 'Compte rendu' },
    { val: 'autre', label: 'Autre' },
  ];
  readonly ROLES = [
    { val: 'ENTRAINEUR', label: 'Entraîneur' },
    { val: 'PREPARATEUR', label: 'Préparateur' },
    { val: 'PRESIDENT', label: 'Président' },
  ];

  // Dépôt
  readonly depotOuvert = signal(false);
  readonly fichier = signal<File | null>(null);
  readonly categorie = signal('certificat');
  readonly description = signal('');
  readonly partage = signal<string[]>([]);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  categorieLabel(v: string): string { return this.CATEGORIES.find(c => c.val === v)?.label ?? v; }
  roleLabel(v: string): string { return this.ROLES.find(r => r.val === v)?.label ?? v; }

  tailleLisible(o: number): string {
    if (o < 1024) return o + ' o';
    if (o < 1024 * 1024) return Math.round(o / 1024) + ' Ko';
    return (Math.round(o / (1024 * 1024) * 10) / 10) + ' Mo';
  }

  ouvrirDepot(): void { this.erreur.set(null); this.depotOuvert.set(true); }
  annuler(): void {
    this.depotOuvert.set(false); this.fichier.set(null); this.categorie.set('certificat');
    this.description.set(''); this.partage.set([]); this.erreur.set(null);
  }

  onFichier(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.fichier.set(input.files?.[0] ?? null);
  }
  togglePartage(role: string): void {
    this.partage.update(r => r.includes(role) ? r.filter(x => x !== role) : [...r, role]);
  }

  deposer(): void {
    const f = this.fichier();
    if (!f) { this.erreur.set('Choisis un fichier.'); return; }
    if (f.size > 10 * 1024 * 1024) { this.erreur.set('Fichier trop volumineux (max 10 Mo).'); return; }
    this.envoi.set(true); this.erreur.set(null);
    this.store.deposerDocument(f, this.categorie(), this.description(), this.partage()).subscribe({
      next: () => { this.envoi.set(false); this.annuler(); },
      error: err => {
        this.envoi.set(false);
        this.erreur.set(
          err.status === 415 ? 'Type non autorisé (PDF, JPG, PNG).'
          : err.status === 413 ? 'Fichier trop volumineux (max 10 Mo).'
          : 'Échec du dépôt. Réessaie.');
      },
    });
  }

  telecharger(doc: DocumentMedical): void {
    this.store.telechargerDocument(doc.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = doc.nomOriginal; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {},
    });
  }

  supprimer(doc: DocumentMedical): void {
    if (!confirm(`Supprimer « ${doc.nomOriginal} » ?`)) return;
    this.store.supprimerDocument(doc.id).subscribe({ error: () => {} });
  }

  icone(typeMime: string): string {
    if (typeMime?.startsWith('image/')) return '🖼️';
    if (typeMime === 'application/pdf') return '📄';
    return '📎';
  }
}
