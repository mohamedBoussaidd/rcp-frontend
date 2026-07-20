import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

/** Occupation d'une zone en mode lecture : qui y travaille et avec quel staff. */
export interface OccupationZone {
  zone: number;
  /** Libellé court du bloc (« 2 · Conservation »). */
  bloc: string;
  /** Staff avec son pictogramme de rôle, ex. « ▶ Rémi ». */
  staff: string[];
  /** Signalé en conflit : une autre occupation partage cette zone. */
  conflit?: boolean;
}

/** Libellés des 8 zones. Index 0 = zone 1. */
export const LIBELLES_ZONES = [
  'Couloir gauche · moitié A',
  'Demi-espace gauche · moitié A',
  'Demi-espace droit · moitié A',
  'Couloir droit · moitié A',
  'Couloir gauche · moitié B',
  'Demi-espace gauche · moitié B',
  'Demi-espace droit · moitié B',
  'Couloir droit · moitié B',
];

/**
 * Terrain découpé en 8 zones — 4 bandes en longueur × 2 moitiés — utilisé à trois endroits :
 * la mini-carte cliquable du formulaire, la carte en lecture seule de la fiche imprimable, et
 * la feuille de route du staff sur mobile.
 *
 * <pre>
 *        moitié A     moitié B
 *       ┌─────────┬─────────┐
 *       │    1    │    5    │   couloir gauche
 *  BUT  │    2    │    6    │   demi-espace gauche   BUT
 *       │    3    │    7    │   demi-espace droit
 *       │    4    │    8    │   couloir droit
 *       └─────────┴─────────┘
 * </pre>
 *
 * Volontairement en CSS pur plutôt qu'en SVG : la carte doit rester lisible <b>imprimée en noir
 * et blanc</b>, sur la fiche que le staff tient au bord du terrain.
 */
@Component({
  selector: 'app-terrain-zones',
  standalone: true,
  templateUrl: './terrain-zones.component.html',
  styleUrl: './terrain-zones.component.scss',
})
export class TerrainZonesComponent {

  /** Zones sélectionnées (1..8). En mode lecture, sert à griser les zones inoccupées. */
  @Input() set zones(v: number[] | null | undefined) { this.selection.set([...(v ?? [])]); }
  @Output() zonesChange = new EventEmitter<number[]>();

  /** Cliquable : le coach coche les zones du bloc. Sinon, carte de consultation. */
  @Input() editable = false;

  /** Mode lecture : ce qui se passe dans chaque zone (plusieurs blocs possibles par zone). */
  @Input() occupations: OccupationZone[] = [];

  /** Réduit la carte (feuille de route mobile, vignette de bloc). */
  @Input() compact = false;

  protected readonly selection = signal<number[]>([]);
  protected readonly libelles = LIBELLES_ZONES;

  /** Ordre d'affichage : colonne moitié A (1-4) puis colonne moitié B (5-8). */
  protected readonly colonneA = [1, 2, 3, 4];
  protected readonly colonneB = [5, 6, 7, 8];

  protected estChoisie(zone: number): boolean {
    return this.selection().includes(zone);
  }

  protected occupationsDe(zone: number): OccupationZone[] {
    return this.occupations.filter(o => o.zone === zone);
  }

  protected enConflit(zone: number): boolean {
    return this.occupationsDe(zone).some(o => o.conflit);
  }

  protected libelle(zone: number): string {
    return this.libelles[zone - 1] ?? `Zone ${zone}`;
  }

  protected basculer(zone: number): void {
    if (!this.editable) return;
    const courant = this.selection();
    const suivant = courant.includes(zone)
      ? courant.filter(z => z !== zone)
      : [...courant, zone].sort((a, b) => a - b);
    this.selection.set(suivant);
    this.zonesChange.emit(suivant);
  }

  /**
   * Raccourcis : un demi-terrain vaut 4 zones, et personne n'a envie de les cliquer une par une.
   * Un second clic sur le même raccourci désélectionne — c'est le geste attendu quand on s'est
   * trompé de moitié.
   */
  protected raccourci(cible: 'A' | 'B' | 'TOUT'): void {
    if (!this.editable) return;
    const zones = cible === 'A' ? this.colonneA : cible === 'B' ? this.colonneB : [...this.colonneA, ...this.colonneB];
    const dejaTout = zones.every(z => this.selection().includes(z));
    const suivant = dejaTout
      ? this.selection().filter(z => !zones.includes(z))
      : [...new Set([...this.selection(), ...zones])].sort((a, b) => a - b);
    this.selection.set(suivant);
    this.zonesChange.emit(suivant);
  }

  /** Résumé texte (« demi-terrain gauche », « 2 zones ») affiché à côté de la carte. */
  protected readonly resume = computed(() => {
    const z = this.selection();
    if (z.length === 0) return 'aucune zone';
    if (z.length === 8) return 'terrain entier';
    if (this.colonneA.every(x => z.includes(x)) && z.length === 4) return 'demi-terrain A';
    if (this.colonneB.every(x => z.includes(x)) && z.length === 4) return 'demi-terrain B';
    return `${z.length} zone${z.length > 1 ? 's' : ''}`;
  });
}
