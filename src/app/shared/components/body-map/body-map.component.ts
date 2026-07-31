import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number };

interface Region {
  id: string;
  /** Valeur stockée dans geneZone (≤40 car, lisible aussi côté staff). */
  zone: string;
  view: 'front' | 'back';
  shape: Shape;
}

/**
 * Mannequin interactif « où as-tu mal ». Silhouette face/dos composée de zones
 * tappables (SVG). Émet une chaîne lisible (ex. « Ischio droit ») compatible
 * avec le champ libre `gene_zone` (varchar 40) et l'affichage staff.
 *
 * Côté anatomique du JOUEUR : en vue de face, la gauche de l'écran = côté droit
 * du joueur (et inversement en vue de dos).
 */
@Component({
  selector: 'app-body-map',
  standalone: true,
  templateUrl: './body-map.component.html',
  styleUrl: './body-map.component.scss',
})
export class BodyMapComponent {

  @Input() set value(v: string | null) { this._value.set(v); }
  @Output() valueChange = new EventEmitter<string>();

  private _value = signal<string | null>(null);
  readonly view = signal<'front' | 'back'>('front');

  readonly regions: Region[] = this.build();

  readonly visibles = computed(() => this.regions.filter(r => r.view === this.view()));
  readonly selectedId = computed(() => this.regions.find(r => r.zone === this._value())?.id ?? null);

  choisir(r: Region): void {
    this._value.set(r.zone);
    this.valueChange.emit(r.zone);
  }

  basculer(v: 'front' | 'back'): void { this.view.set(v); }

  // ──────────────────────── Construction des zones ────────────────────────

  private build(): Region[] {
    const out: Region[] = [];
    const cx = 100;

    // Axial : une zone centrale (pas de côté).
    const axial = (view: 'front' | 'back', id: string, zone: string, shape: Shape) =>
      out.push({ id: `${view}_${id}`, zone, view, shape });

    // Latéral : 2 zones miroir. Côté anatomique du joueur selon la vue.
    const lateral = (view: 'front' | 'back', id: string, label: string, left: Shape) => {
      const right = this.mirror(left);
      const gaucheEcran = view === 'front' ? 'droit' : 'gauche';
      const droiteEcran = view === 'front' ? 'gauche' : 'droit';
      out.push({ id: `${view}_${id}_l`, zone: `${label} ${gaucheEcran}`, view, shape: left });
      out.push({ id: `${view}_${id}_r`, zone: `${label} ${droiteEcran}`, view, shape: right });
    };

    // ───── FACE ─────
    axial('front', 'tete', 'Tête', { kind: 'ellipse', cx, cy: 32, rx: 17, ry: 21 });
    axial('front', 'cou', 'Cou', { kind: 'rect', x: 91, y: 50, w: 18, h: 12, rx: 5 });
    lateral('front', 'epaule', 'Épaule', { kind: 'ellipse', cx: 68, cy: 74, rx: 13, ry: 11 });
    axial('front', 'poitrine', 'Poitrine', { kind: 'rect', x: 72, y: 66, w: 56, h: 40, rx: 16 });
    lateral('front', 'bras', 'Bras', { kind: 'rect', x: 52, y: 78, w: 17, h: 50, rx: 8 });
    axial('front', 'ventre', 'Abdomen', { kind: 'rect', x: 76, y: 104, w: 48, h: 52, rx: 14 });
    lateral('front', 'avantbras', 'Avant-bras', { kind: 'rect', x: 48, y: 128, w: 15, h: 48, rx: 7 });
    lateral('front', 'main', 'Main', { kind: 'ellipse', cx: 55, cy: 186, rx: 9, ry: 12 });
    lateral('front', 'aine', 'Aine', { kind: 'ellipse', cx: 86, cy: 164, rx: 12, ry: 10 });
    lateral('front', 'cuisse', 'Cuisse', { kind: 'rect', x: 77, y: 176, w: 21, h: 70, rx: 10 });
    lateral('front', 'genou', 'Genou', { kind: 'ellipse', cx: 87, cy: 254, rx: 13, ry: 12 });
    lateral('front', 'tibia', 'Tibia', { kind: 'rect', x: 79, y: 264, w: 17, h: 72, rx: 8 });
    lateral('front', 'cheville', 'Cheville', { kind: 'rect', x: 82, y: 336, w: 12, h: 14, rx: 5 });
    lateral('front', 'pied', 'Pied', { kind: 'ellipse', cx: 86, cy: 360, rx: 14, ry: 9 });

    // ───── DOS ─────
    axial('back', 'tete', 'Tête', { kind: 'ellipse', cx, cy: 32, rx: 17, ry: 21 });
    axial('back', 'nuque', 'Nuque', { kind: 'rect', x: 91, y: 50, w: 18, h: 12, rx: 5 });
    lateral('back', 'epaule', 'Épaule', { kind: 'ellipse', cx: 68, cy: 74, rx: 13, ry: 11 });
    axial('back', 'doshaut', 'Haut du dos', { kind: 'rect', x: 72, y: 66, w: 56, h: 44, rx: 16 });
    lateral('back', 'bras', 'Bras', { kind: 'rect', x: 52, y: 78, w: 17, h: 50, rx: 8 });
    axial('back', 'dosbas', 'Bas du dos', { kind: 'rect', x: 76, y: 108, w: 48, h: 48, rx: 12 });
    lateral('back', 'avantbras', 'Avant-bras', { kind: 'rect', x: 48, y: 128, w: 15, h: 48, rx: 7 });
    lateral('back', 'main', 'Main', { kind: 'ellipse', cx: 55, cy: 186, rx: 9, ry: 12 });
    lateral('back', 'fessier', 'Fessier', { kind: 'ellipse', cx: 85, cy: 166, rx: 15, ry: 14 });
    lateral('back', 'ischio', 'Ischio', { kind: 'rect', x: 77, y: 180, w: 21, h: 68, rx: 10 });
    lateral('back', 'genou', 'Genou', { kind: 'ellipse', cx: 87, cy: 254, rx: 13, ry: 12 });
    lateral('back', 'mollet', 'Mollet', { kind: 'rect', x: 79, y: 264, w: 17, h: 72, rx: 8 });
    lateral('back', 'talon', 'Talon', { kind: 'ellipse', cx: 86, cy: 358, rx: 12, ry: 10 });

    return out;
  }

  /** Miroir horizontal d'une forme autour de l'axe x=100. */
  private mirror(s: Shape): Shape {
    return s.kind === 'ellipse'
      ? { ...s, cx: 200 - s.cx }
      : { ...s, x: 200 - s.x - s.w };
  }
}
