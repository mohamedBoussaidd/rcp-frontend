import { Component, computed, inject, signal } from '@angular/core';
import { JoueurStore } from '../joueur.store';

/**
 * Historique perso du joueur (lecture) — refonte « Claude Design ».
 * Onglet « Bien-être » : série Hooper 7 j + moyennes sommeil/fatigue.
 * Onglet « Charge / RPE » : charge sRPE par jour + charge cumulée.
 */
@Component({
  selector: 'app-joueur-historique',
  standalone: true,
  templateUrl: './joueur-historique.component.html',
  styleUrl: './joueur-historique.component.scss',
})
export class JoueurHistoriqueComponent {

  store = inject(JoueurStore);

  readonly tab = signal<'bienetre' | 'charge'>('bienetre');
  setTab(t: 'bienetre' | 'charge'): void { this.tab.set(t); }

  readonly serie = computed(() => this.store.serie7j());

  readonly hooperMoyen = computed(() => {
    const vals = this.serie().map(j => j.hooper).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  readonly joursRemplis = computed(() => this.serie().filter(j => j.hooper != null).length);

  /** Moyenne d'un item Hooper sur la fenêtre 7 j (1..10, 1 décimale). */
  private moyenneItem(sel: (w: { sommeil: number; fatigue: number }) => number): number | null {
    const limite = this.store.dateISO(new Date(Date.now() - 6 * 86400000));
    const ws = this.store.wellness().filter(w => w.date >= limite);
    if (!ws.length) return null;
    return Math.round(ws.reduce((a, w) => a + sel(w), 0) / ws.length * 10) / 10;
  }
  readonly sommeilMoyen = computed(() => this.moyenneItem(w => w.sommeil));
  readonly fatigueMoyen = computed(() => this.moyenneItem(w => w.fatigue));

  readonly chargeCumulee = computed(() => {
    const limite = this.store.dateISO(new Date(Date.now() - 6 * 86400000));
    return this.store.rpe()
      .filter(r => r.date >= limite && r.charge != null)
      .reduce((tot, r) => tot + (r.charge ?? 0), 0);
  });

  /** Charge sRPE par jour sur 7 j (somme des charges du jour). */
  readonly chargeSerie = computed(() => {
    const parDate = new Map<string, number>();
    for (const r of this.store.rpe()) {
      if (r.charge != null) parDate.set(r.date, (parDate.get(r.date) ?? 0) + r.charge);
    }
    const points = this.serie().map(j => ({ jour: j.jour, aujourdhui: j.aujourdhui, charge: parDate.get(j.date) ?? 0 }));
    const max = Math.max(1, ...points.map(p => p.charge));
    return points.map(p => ({ ...p, h: Math.round(p.charge / max * 100) }));
  });

  readonly chargeMax = computed(() => Math.max(0, ...this.chargeSerie().map(p => p.charge)));

  /** Dernière gêne signalée sur les 7 derniers jours. */
  readonly derniereGene = computed(() => {
    const limite = this.store.dateISO(new Date(Date.now() - 6 * 86400000));
    return this.store.wellness()
      .filter(w => w.geneZone && w.date >= limite)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  });

  /** Hauteur de barre Hooper en % (max 50). */
  barH(v: number | null): number { return v == null ? 0 : Math.round(v / 50 * 100); }

  classe(v: number | null): string {
    if (v == null) return '';
    if (v <= 22) return 'ok';
    if (v <= 34) return 'moyen';
    return 'bad';
  }
}
