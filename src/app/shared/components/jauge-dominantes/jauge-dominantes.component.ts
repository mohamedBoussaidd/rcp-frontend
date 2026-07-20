import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

/** Les cinq axes pédagogiques, dans l'ordre où ils se lisent sur une fiche. */
export type AxeDominante = 'tactiqueOrg' | 'tactiqueFonc' | 'mental' | 'technique' | 'athletique';

/** Dosage 0-5 par axe. 0 = axe non travaillé (et non « axe inconnu »). */
export type DosageDominantes = Record<AxeDominante, number>;

/** Note libre facultative par axe — précise l'axe, ne le remplace pas. */
export type NotesDominantes = Record<AxeDominante, string>;

export const AXES_DOMINANTES: { cle: AxeDominante; libelle: string; court: string }[] = [
  { cle: 'tactiqueOrg',  libelle: 'Tactique organisationnelle', court: 'Tact. org.' },
  { cle: 'tactiqueFonc', libelle: 'Tactique fonctionnelle',     court: 'Tact. fonc.' },
  { cle: 'mental',       libelle: 'Mental',                     court: 'Mental' },
  { cle: 'technique',    libelle: 'Technique',                  court: 'Technique' },
  { cle: 'athletique',   libelle: 'Athlétique',                 court: 'Athlétique' },
];

export function dosagesVides(): DosageDominantes {
  return { tactiqueOrg: 0, tactiqueFonc: 0, mental: 0, technique: 0, athletique: 0 };
}

export function notesVides(): NotesDominantes {
  return { tactiqueOrg: '', tactiqueFonc: '', mental: '', technique: '', athletique: '' };
}

/**
 * Dosage des cinq axes de dominante, de 0 à 5 pastilles.
 *
 * Remplace les cinq champs texte identiques d'avant (V68) : cinq zones de saisie côte à côte
 * demandaient un paragraphe là où le coach voulait juste dire « surtout technique, un peu de
 * mental ». Le texte n'a pas disparu — il devient la note facultative sous la jauge, dépliée
 * par le crayon, pour les cas où l'axe mérite une précision.
 *
 * Partagé par le formulaire d'exercice (avec notes) et celui de séance (avec barres, les notes
 * y étant déjà portées par les lignes d'objectifs pédagogiques juste en dessous).
 */
@Component({
  selector: 'app-jauge-dominantes',
  standalone: true,
  templateUrl: './jauge-dominantes.component.html',
  styleUrl: './jauge-dominantes.component.scss',
})
export class JaugeDominantesComponent {

  @Input({ required: true }) dosages!: DosageDominantes;
  @Output() dosagesChange = new EventEmitter<DosageDominantes>();

  /** Notes par axe. Fournies = le crayon apparaît ; absentes = jauge seule. */
  @Input() notes: NotesDominantes | null = null;
  @Output() notesChange = new EventEmitter<NotesDominantes>();

  /** Barre de proportion à côté des pastilles (formulaire de séance). */
  @Input() barres = false;

  protected readonly axes = AXES_DOMINANTES;
  protected readonly crans = [1, 2, 3, 4, 5];

  /** Axes dont la note est dépliée. Un axe déjà annoté s'ouvre tout seul. */
  private readonly notesOuvertes = signal<Set<AxeDominante>>(new Set());

  protected valeur(axe: AxeDominante): number {
    return this.dosages?.[axe] ?? 0;
  }

  /**
   * Un second clic sur le même cran remet l'axe à zéro : c'est le geste attendu quand on
   * s'est trompé, et sans lui il n'y aurait aucun moyen de revenir à « non travaillé ».
   */
  protected doser(axe: AxeDominante, cran: number): void {
    const suivant = { ...this.dosages, [axe]: this.valeur(axe) === cran ? 0 : cran };
    this.dosages = suivant;
    this.dosagesChange.emit(suivant);
  }

  protected note(axe: AxeDominante): string {
    return this.notes?.[axe] ?? '';
  }

  protected saisirNote(axe: AxeDominante, valeur: string): void {
    if (!this.notes) return;
    const suivant = { ...this.notes, [axe]: valeur };
    this.notes = suivant;
    this.notesChange.emit(suivant);
  }

  protected noteOuverte(axe: AxeDominante): boolean {
    return this.notesOuvertes().has(axe) || !!this.note(axe);
  }

  protected basculerNote(axe: AxeDominante): void {
    const set = new Set(this.notesOuvertes());
    // Une note déjà écrite reste visible : la replier donnerait l'illusion de l'avoir perdue.
    if (this.note(axe)) return;
    set.has(axe) ? set.delete(axe) : set.add(axe);
    this.notesOuvertes.set(set);
  }

  protected pourcentage(axe: AxeDominante): string {
    return `${this.valeur(axe) * 20}%`;
  }
}
