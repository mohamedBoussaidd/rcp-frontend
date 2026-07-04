import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemeService } from '@core/services/theme.service';

interface Preset { nom: string; couleur: string | null; }

/** Palettes curées : contraste texte blanc / bouton garanti. null = vert par défaut. */
const PRESETS: Preset[] = [
  { nom: 'Vert (défaut)', couleur: null },
  { nom: 'Bleu royal',    couleur: '#1D4ED8' },
  { nom: 'Ciel',          couleur: '#0284C7' },
  { nom: 'Turquoise',     couleur: '#0D9488' },
  { nom: 'Rouge',         couleur: '#DC2626' },
  { nom: 'Bordeaux',      couleur: '#9F1239' },
  { nom: 'Orange',        couleur: '#EA580C' },
  { nom: 'Violet',        couleur: '#6D28D9' },
  { nom: 'Marine',        couleur: '#1E3A8A' },
];

/**
 * Onglet « Apparence » de Mon club : choix de la couleur d'accent + nav teintée,
 * avec aperçu appliqué en direct à toute l'application (rien n'est enregistré avant « Enregistrer »).
 */
@Component({
  selector: 'app-apparence-club',
  standalone: true,
  templateUrl: './apparence-club.component.html',
  styleUrl: './apparence-club.component.scss',
  imports: [FormsModule],
})
export class ApparenceClubComponent implements OnDestroy {

  readonly presets = PRESETS;

  private theme = inject(ThemeService);
  private snack = inject(MatSnackBar);

  couleur: string | null = this.theme.themeClub().couleurAccent;
  navTeintee = this.theme.themeClub().navTeintee;
  couleurLibre = this.couleur ?? '#15803D';
  modeLibre = !!this.couleur && !PRESETS.some(p => p.couleur === this.couleur);
  saving = signal(false);

  /** Y a-t-il des changements non enregistrés (par rapport au thème sauvegardé) ? */
  get dirty(): boolean {
    const t = this.theme.themeClub();
    return (t.couleurAccent ?? null) !== (this.couleur ?? null) || t.navTeintee !== this.navTeintee;
  }

  choisirPreset(p: Preset): void {
    this.modeLibre = false;
    this.couleur = p.couleur;
    this.apercu();
  }

  choisirLibre(): void {
    this.modeLibre = true;
    this.couleur = this.normalise(this.couleurLibre) ?? this.couleur;
    this.apercu();
  }

  couleurLibreChange(): void {
    if (!this.modeLibre) return;
    const hex = this.normalise(this.couleurLibre);
    if (hex) { this.couleur = hex; this.apercu(); }
  }

  apercu(): void {
    this.theme.previsualiser({ couleurAccent: this.couleur, navTeintee: this.navTeintee });
  }

  annuler(): void {
    const t = this.theme.themeClub();
    this.couleur = t.couleurAccent;
    this.navTeintee = t.navTeintee;
    this.couleurLibre = t.couleurAccent ?? '#15803D';
    this.modeLibre = !!t.couleurAccent && !PRESETS.some(p => p.couleur === t.couleurAccent);
    this.theme.annulerApercu();
  }

  enregistrer(): void {
    this.saving.set(true);
    this.theme.enregistrerThemeClub({ couleurAccent: this.couleur, navTeintee: this.navTeintee }).subscribe({
      next: () => { this.saving.set(false); this.snack.open('Thème du club enregistré', 'Fermer', { duration: 2500 }); },
      error: () => { this.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  /** Quitte l'écran sans enregistrer : on ré-applique le thème sauvegardé. */
  ngOnDestroy(): void {
    this.theme.annulerApercu();
  }

  private normalise(hex: string): string | null {
    const m = (hex ?? '').trim().match(/^#?([0-9a-fA-F]{6})$/);
    return m ? '#' + m[1].toUpperCase() : null;
  }
}
