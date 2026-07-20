import { Component, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { ImportPhotoResultat, ImportPhotoService } from '@core/services/import-photo.service';
import { SchemaViewerComponent } from '../schema-viewer/schema-viewer.component';

/**
 * « Importer depuis une photo » (IA vision) — mobile-first : prise de photo ou upload,
 * loader (l'analyse prend 10-20 s), aperçu du contenu extrait + miniature du schéma,
 * puis renvoi du résultat à l'appelant (formulaire exercice ou séance) qui pré-remplit.
 */
@Component({
  selector: 'app-import-photo-dialog',
  standalone: true,
  imports: [SchemaViewerComponent],
  templateUrl: './import-photo-dialog.component.html',
  styleUrl: './import-photo-dialog.component.scss',
})
export class ImportPhotoDialogComponent {

  dialogRef = inject<MatDialogRef<ImportPhotoDialogComponent, ImportPhotoResultat | null>>(MatDialogRef);
  private service = inject(ImportPhotoService);

  apercuUrl = signal<string | null>(null);
  fichier = signal<File | null>(null);
  analyseEnCours = signal(false);
  erreur = signal<string | null>(null);
  resultat = signal<ImportPhotoResultat | null>(null);

  choisir(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.fichier.set(f);
    this.erreur.set(null);
    this.resultat.set(null);
    const ancien = this.apercuUrl();
    if (ancien) URL.revokeObjectURL(ancien);
    this.apercuUrl.set(URL.createObjectURL(f));
  }

  analyser(): void {
    const f = this.fichier();
    if (!f || this.analyseEnCours()) return;
    this.analyseEnCours.set(true);
    this.erreur.set(null);
    this.service.analyser(f).subscribe({
      next: r => {
        this.analyseEnCours.set(false);
        this.resultat.set(r);
      },
      error: err => {
        this.analyseEnCours.set(false);
        this.erreur.set(err?.error?.message || err?.error?.reason
          || 'Analyse impossible — vérifie la photo et réessaie.');
      },
    });
  }

  utiliser(): void {
    this.dialogRef.close(this.resultat());
  }

  annuler(): void {
    const url = this.apercuUrl();
    if (url) URL.revokeObjectURL(url);
    this.dialogRef.close(null);
  }

  resume(): string[] {
    const r = this.resultat();
    if (!r) return [];
    const t = r.texte;
    const lignes: string[] = [];
    if (t.titre) lignes.push(`Titre : ${t.titre}`);
    if (t.type) lignes.push(`Type détecté : ${t.type === 'SEANCE' ? 'Séance' : 'Exercice'}`);
    if (t.dureeMinutes) lignes.push(`Durée : ${t.dureeMinutes} min`);
    if (t.objectif) lignes.push(`Objectif : ${t.objectif}`);
    if (t.blocs.length) lignes.push(`${t.blocs.length} temps : ${t.blocs.map(b => b.libelle).join(' · ')}`);
    if (t.dominantes.length) lignes.push(`Dominantes : ${t.dominantes.join(', ')}`);
    if (t.materiel) lignes.push(`Matériel : ${t.materiel}`);
    if (r.nbElements || r.nbTraces) lignes.push(`Schéma : ${r.nbElements} éléments, ${r.nbTraces} tracés`);
    return lignes;
  }
}
