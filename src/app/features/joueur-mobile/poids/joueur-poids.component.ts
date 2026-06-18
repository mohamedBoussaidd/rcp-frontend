import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';

interface Pt { x: number; y: number; poids: number; date: string; }

/**
 * Évolution du poids (lecture) : KPI poids actuel + écart au poids de forme
 * cible, courbe SVG (aplat vert dégradé) avec curseur de survol interactif
 * affichant poids du moment / poids de forme / écart.
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

  /** Polygone d'aplat sous la courbe (ferme jusqu'au bas du repère). */
  readonly aire = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return '';
    const ligne = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return `${pts[0].x.toFixed(1)},100 ${ligne} ${pts[pts.length - 1].x.toFixed(1)},100`;
  });

  /** Position verticale (%) de la ligne cible dans le repère. */
  readonly cibleY = computed<number | null>(() => {
    const c = this.cible();
    if (c == null) return null;
    const { min, max } = this.bornes();
    return 100 - ((c - min) / (max - min || 1)) * 100;
  });

  // ──────────────────────── Curseur de survol ────────────────────────

  /** Index survolé (null = pas de survol → on retient la dernière pesée). */
  private readonly survol = signal<number | null>(null);

  /** Index effectivement sélectionné (survol ou dernière pesée par défaut). */
  readonly selIdx = computed(() => {
    const n = this.points().length;
    if (n === 0) return -1;
    const s = this.survol();
    return s == null ? n - 1 : Math.min(Math.max(s, 0), n - 1);
  });

  readonly sel = computed(() => {
    const i = this.selIdx();
    const p = this.points()[i];
    if (!p) return null;
    const c = this.cible();
    return {
      x: p.x,
      poids: p.poids,
      date: p.date,
      cible: c,
      ecart: c != null ? Math.round((p.poids - c) * 10) / 10 : null,
    };
  });

  /** Position horizontale (%) bornée de l'infobulle pour rester visible. */
  readonly tipX = computed(() => {
    const s = this.sel();
    return s ? Math.min(Math.max(s.x, 16), 84) : 50;
  });

  /** Met à jour le point survolé à partir de la position du pointeur. */
  scruter(e: PointerEvent): void {
    const n = this.points().length;
    if (n === 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    this.survol.set(Math.round(ratio * (n - 1)));
  }

  finScrutation(): void { this.survol.set(null); }

  ecartClasse(e: number | null): string {
    if (e == null) return '';
    const a = Math.abs(e);
    return a <= 1 ? 'ok' : a <= 2.5 ? 'moyen' : 'bad';
  }
}
