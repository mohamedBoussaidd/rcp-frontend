import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';

interface Pt { x: number; y: number; poids: number; date: string; }

/**
 * Évolution du poids (lecture) : KPI poids actuel + écart au poids de forme
 * cible, courbe SVG des dernières pesées (avec ligne cible), liste détaillée.
 */
@Component({
  selector: 'app-joueur-poids',
  standalone: true,
  templateUrl: './joueur-poids.component.html',
  styleUrl: './joueur-poids.component.scss',
  imports: [DatePipe, DecimalPipe],
})
export class JoueurPoidsComponent {

  store = inject(JoueurStore);

  readonly cible = computed(() => this.store.profil()?.poidsFormeCible ?? null);

  /** Les 12 dernières pesées en ordre chronologique. */
  private readonly recentes = computed(() =>
    this.store.peseesTriees().slice(0, 12).reverse());

  /** Bornes verticales du graphe (inclut la cible si présente). */
  private readonly bornes = computed(() => {
    const vals = this.recentes().map(p => p.poids);
    const c = this.cible();
    if (c != null) vals.push(c);
    if (!vals.length) return { min: 0, max: 1 };
    let min = Math.min(...vals), max = Math.max(...vals);
    const marge = Math.max(0.5, (max - min) * 0.15);
    return { min: min - marge, max: max + marge };
  });

  /** Points de la courbe en repère 0..100 (x) × 0..100 (y, 0 = haut). */
  readonly points = computed<Pt[]>(() => {
    const r = this.recentes();
    const { min, max } = this.bornes();
    const span = max - min || 1;
    return r.map((p, i) => ({
      x: r.length === 1 ? 50 : (i / (r.length - 1)) * 100,
      y: 100 - ((p.poids - min) / span) * 100,
      poids: p.poids,
      date: p.date,
    }));
  });

  readonly polyline = computed(() => this.points().map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

  /** Position verticale (%) de la ligne cible dans le repère. */
  readonly cibleY = computed<number | null>(() => {
    const c = this.cible();
    if (c == null) return null;
    const { min, max } = this.bornes();
    return 100 - ((c - min) / (max - min || 1)) * 100;
  });

  ecartClasse(e: number | null): string {
    if (e == null) return '';
    const a = Math.abs(e);
    return a <= 1 ? 'ok' : a <= 2.5 ? 'moyen' : 'bad';
  }
}
