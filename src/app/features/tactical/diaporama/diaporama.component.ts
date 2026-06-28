import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TechniqueService, SchemaTactique } from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
import { SchemaEditorComponent } from '../schema-editor/schema-editor.component';
import { SchemaPickerDialogComponent } from '../schema-picker-dialog/schema-picker-dialog.component';
import {
  DiaporamaDetail, DiaporamaResume, DiaporamaService, Slide, SlideType, StyleTexte, Visibilite, Statut,
} from './diaporama.service';
import { DiaporamaPlayerComponent } from './diaporama-player.component';
import { SlideTexteDialogComponent, SlideTexteResultat } from './slide-texte-dialog.component';

/** Taille max conseillée d'une image uploadée (stockée en data URL). Au-delà : avertissement. */
const IMAGE_MAX_OCTETS = 2_000_000;

/**
 * Diaporama de séance : sous-menu « Diaporama » (section de planning-technique).
 * Deux vues : bibliothèque (grille de diaporamas) et éditeur (méta + slides réordonnables).
 * Slides de 3 types (schéma copié / image upload ou URL / lien vidéo). Le schéma peut être
 * choisi dans la bibliothèque ou dessiné en place (éditeur Konva commun, copy-on-attach).
 * « Lancer en plein écran » ouvre le lecteur présentateur (overlay).
 */
@Component({
  selector: 'app-diaporama',
  standalone: true,
  templateUrl: './diaporama.component.html',
  styleUrl: './diaporama.component.scss',
  imports: [FormsModule, MatIcon, DragDropModule, DiaporamaPlayerComponent],
})
export class DiaporamaComponent implements OnInit {

  private service = inject(DiaporamaService);
  private tech = inject(TechniqueService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  resumes = signal<DiaporamaResume[]>([]);
  loading = signal(true);

  /** Diaporama en cours d'édition (null = vue bibliothèque). */
  detail = signal<DiaporamaDetail | null>(null);

  /** Diaporama joué en plein écran (null = lecteur fermé). */
  presentation = signal<DiaporamaDetail | null>(null);

  /** Panneau « ajouter un slide » ouvert + type sélectionné (add-panel variante B). */
  ajoutOuvert = signal(false);
  typeAjout = signal<SlideType>('SCHEMA');
  aussiBibliotheque = signal(false);
  urlImage = '';
  urlVideo = '';

  readonly peutEcrire = computed(() => this.auth.has('diaporama:write'));

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.lister().subscribe({
      next: l => { this.resumes.set(l); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── Bibliothèque ──
  nouveau(): void {
    this.service.creer('Nouveau diaporama').subscribe({
      next: d => { this.resumes.update(l => l); this.detail.set(d); },
      error: () => this.erreurCreation(),
    });
  }

  ouvrir(r: DiaporamaResume): void {
    this.service.detail(r.id).subscribe({
      next: d => this.detail.set(d),
      error: () => this.snack.open('Ouverture impossible', 'Fermer', { duration: 3000 }),
    });
  }

  dupliquer(r: DiaporamaResume, ev: Event): void {
    ev.stopPropagation();
    this.service.dupliquer(r.id).subscribe({
      next: d => { this.snack.open('Diaporama dupliqué', 'Fermer', { duration: 2500 }); this.detail.set(d); },
      error: () => this.snack.open('Duplication impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimerDepuisListe(r: DiaporamaResume, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Supprimer le diaporama « ${r.titre} » ?`)) return;
    this.service.supprimer(r.id).subscribe({
      next: () => this.resumes.update(l => l.filter(x => x.id !== r.id)),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  retour(): void { this.detail.set(null); this.ajoutOuvert.set(false); this.charger(); }

  // ── Méta du diaporama (titre / visibilité / statut), auto-enregistrées ──
  majMeta(): void {
    const d = this.detail();
    if (!d || !d.modifiable) return;
    this.service.modifier(d.id, { titre: d.titre.trim() || 'Sans titre', visibilite: d.visibilite, statut: d.statut })
      .subscribe({
        next: maj => this.detail.set(maj),
        error: err => {
          const msg = err?.status === 409 ? 'Sélectionnez une équipe pour une visibilité « Équipe »' : 'Enregistrement impossible';
          this.snack.open(msg, 'Fermer', { duration: 3500 });
          this.service.detail(d.id).subscribe(rafraichi => this.detail.set(rafraichi));
        },
      });
  }

  setVisibilite(v: Visibilite): void { const d = this.detail(); if (d) { d.visibilite = v; this.majMeta(); } }
  setStatut(s: Statut): void { const d = this.detail(); if (d) { d.statut = s; this.majMeta(); } }

  supprimerDiapo(): void {
    const d = this.detail();
    if (!d) return;
    if (!confirm(`Supprimer le diaporama « ${d.titre} » ?`)) return;
    this.service.supprimer(d.id).subscribe({
      next: () => this.retour(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── Slides ──
  private diapoCourant(): DiaporamaDetail | null {
    const d = this.detail();
    if (!d?.modifiable) { this.snack.open('Seul le créateur peut modifier ce diaporama', 'Fermer', { duration: 3000 }); return null; }
    return d;
  }

  /** Slide SCHEMA depuis la bibliothèque (copie du schemaJson + aperçu). */
  ajouterSchemaDepuisBibliotheque(): void {
    const d = this.diapoCourant();
    if (!d) return;
    this.dialog.open(SchemaPickerDialogComponent, { panelClass: 'dark-dialog', maxWidth: '95vw' })
      .afterClosed().subscribe((s: SchemaTactique | undefined) => {
        if (!s) return;
        this.creerSlide(d.id, { type: 'SCHEMA', titre: s.nom, schemaJson: s.schemaJson, apercu: s.apercu });
      });
  }

  /** Slide SCHEMA dessiné en place (éditeur Konva) ; option « aussi enregistrer dans la bibliothèque ». */
  ajouterSchemaDessine(): void {
    const d = this.diapoCourant();
    if (!d) return;
    const aussiBiblio = this.aussiBibliotheque();
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: 'Nouveau schéma',
        enregistrer: (json: string, apercu: string) => {
          if (aussiBiblio) {
            this.tech.creerSchema({ nom: 'Schéma diaporama', schemaJson: json, apercu }).subscribe();
          }
          return this.service.ajouterSlide(d.id, { type: 'SCHEMA', schemaJson: json, apercu });
        },
      },
    }).afterClosed().subscribe(saved => { if (saved) this.rechargerDetail(); });
  }

  /** Re-dessine le schéma d'un slide existant (remplace son snapshot). */
  editerSchemaSlide(s: Slide): void {
    const d = this.diapoCourant();
    if (!d) return;
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: s.titre || 'Schéma',
        schemaJson: s.schemaJson,
        enregistrer: (json: string, apercu: string) =>
          this.service.modifierSlide(d.id, s.id, { type: 'SCHEMA', titre: s.titre, schemaJson: json, apercu }),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.rechargerDetail(); });
  }

  ajouterImageFichier(input: HTMLInputElement): void {
    const d = this.diapoCourant();
    const file = input.files?.[0];
    if (!d || !file) return;
    if (file.size > IMAGE_MAX_OCTETS) {
      this.snack.open('Image trop lourde (max ~2 Mo). Réduisez-la avant import.', 'Fermer', { duration: 4000 });
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.creerSlide(d.id, { type: 'IMAGE', titre: file.name, imageSrc: reader.result as string });
      input.value = '';
    };
    reader.onerror = () => this.snack.open('Lecture du fichier impossible', 'Fermer', { duration: 3000 });
    reader.readAsDataURL(file);
  }

  ajouterImageUrl(): void {
    const d = this.diapoCourant();
    const url = this.urlImage.trim();
    if (!d || !url) return;
    this.creerSlide(d.id, { type: 'IMAGE', imageSrc: url });
    this.urlImage = '';
  }

  ajouterVideo(): void {
    const d = this.diapoCourant();
    const url = this.urlVideo.trim();
    if (!d || !url) return;
    this.creerSlide(d.id, { type: 'VIDEO_LIEN', videoUrl: url });
    this.urlVideo = '';
  }

  /** Slide TEXTE : ouvre l'éditeur de texte (contenu + style) avec aperçu. */
  ajouterTexte(): void {
    const d = this.diapoCourant();
    if (!d) return;
    this.dialog.open(SlideTexteDialogComponent, { width: '720px', maxWidth: '92vw', autoFocus: false, data: null })
      .afterClosed().subscribe((r: SlideTexteResultat | undefined) => {
        if (!r) return;
        this.creerSlide(d.id, { type: 'TEXTE', titre: this.titreDepuisTexte(r.texte), texte: r.texte, styleJson: JSON.stringify(r.style) });
      });
  }

  editerTexteSlide(s: Slide): void {
    const d = this.diapoCourant();
    if (!d) return;
    this.dialog.open(SlideTexteDialogComponent, {
      width: '720px', maxWidth: '92vw', autoFocus: false,
      data: { texte: s.texte ?? '', style: this.styleDe(s) },
    }).afterClosed().subscribe((r: SlideTexteResultat | undefined) => {
      if (!r) return;
      this.service.modifierSlide(d.id, s.id, { type: 'TEXTE', titre: this.titreDepuisTexte(r.texte), texte: r.texte, styleJson: JSON.stringify(r.style) })
        .subscribe({ next: () => this.rechargerDetail(), error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }) });
    });
  }

  /** Style d'un slide TEXTE (parsé), ou objet vide (le dialog complète avec ses défauts). */
  styleDe(s: Slide): Partial<StyleTexte> {
    if (!s.styleJson) return {};
    try { return JSON.parse(s.styleJson) as StyleTexte; } catch { return {}; }
  }

  private titreDepuisTexte(t: string): string {
    const ligne = t.trim().split('\n')[0];
    return ligne.length > 40 ? ligne.slice(0, 40) + '…' : ligne;
  }

  private creerSlide(diapoId: string, req: { type: SlideType; titre?: string; schemaJson?: string; apercu?: string; imageSrc?: string; videoUrl?: string; texte?: string; styleJson?: string }): void {
    this.service.ajouterSlide(diapoId, req).subscribe({
      next: () => { this.ajoutOuvert.set(false); this.rechargerDetail(); },
      error: () => this.snack.open('Ajout du slide impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Enregistre le titre d'un slide (préserve son contenu selon le type). */
  majTitreSlide(s: Slide): void {
    const d = this.diapoCourant();
    if (!d) return;
    this.service.modifierSlide(d.id, s.id, {
      type: s.type, titre: s.titre,
      schemaJson: s.schemaJson, apercu: s.apercu, imageSrc: s.imageSrc, videoUrl: s.videoUrl,
      texte: s.texte, styleJson: s.styleJson,
    }).subscribe({ error: () => this.snack.open('Renommage impossible', 'Fermer', { duration: 3000 }) });
  }

  supprimerSlide(s: Slide): void {
    const d = this.diapoCourant();
    if (!d) return;
    if (!confirm('Supprimer ce slide ?')) return;
    this.service.supprimerSlide(d.id, s.id).subscribe({
      next: () => this.rechargerDetail(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  dropSlide(ev: CdkDragDrop<Slide[]>): void {
    const d = this.detail();
    if (!d || ev.previousIndex === ev.currentIndex) return;
    const slides = [...d.slides];
    moveItemInArray(slides, ev.previousIndex, ev.currentIndex);
    this.detail.set({ ...d, slides });
    this.service.reordonner(d.id, slides.map(s => s.id)).subscribe({
      next: maj => this.detail.set(maj),
      error: () => { this.snack.open('Réordonnancement impossible', 'Fermer', { duration: 3000 }); this.rechargerDetail(); },
    });
  }

  // ── Présentation ──
  presenter(r?: DiaporamaResume): void {
    const courant = this.detail();
    if (!r && courant) { this.lancerPresentation(courant); return; }
    if (!r) return;
    this.service.detail(r.id).subscribe({
      next: d => this.lancerPresentation(d),
      error: () => this.snack.open('Ouverture impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private lancerPresentation(d: DiaporamaDetail): void {
    if (d.slides.length === 0) { this.snack.open('Ce diaporama est vide', 'Fermer', { duration: 3000 }); return; }
    this.presentation.set(d);
  }

  fermerPresentation(): void { this.presentation.set(null); }

  // ── Helpers ──
  private rechargerDetail(): void {
    const d = this.detail();
    if (!d) return;
    this.service.detail(d.id).subscribe(maj => this.detail.set(maj));
  }

  private erreurCreation(): void {
    this.snack.open('Création impossible — sélectionnez un club actif', 'Fermer', { duration: 3500 });
  }

  iconeType(t: SlideType): string {
    return t === 'SCHEMA' ? 'sports_soccer' : t === 'IMAGE' ? 'image' : t === 'VIDEO_LIEN' ? 'smart_display' : 'title';
  }
  libelleType(t: SlideType): string {
    return t === 'SCHEMA' ? 'Schéma' : t === 'IMAGE' ? 'Image' : t === 'VIDEO_LIEN' ? 'Vidéo' : 'Texte';
  }
}
