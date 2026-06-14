import { Component, computed, inject } from '@angular/core';
import { JoueurStore } from '../joueur.store';

/**
 * Historique perso du joueur (lecture) : série 7 jours (barre Hooper + effort
 * sRPE) + synthèse (Hooper moyen, charge cumulée, jours remplis) + dernière gêne.
 */
@Component({
  selector: 'app-joueur-historique',
  standalone: true,
  templateUrl: './joueur-historique.component.html',
  styleUrl: './joueur-historique.component.scss',
})
export class JoueurHistoriqueComponent {

  store = inject(JoueurStore);

  readonly serie = computed(() => this.store.serie7j());

  readonly hooperMoyen = computed(() => {
    const vals = this.serie().map(j => j.hooper).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  readonly joursRemplis = computed(() => this.serie().filter(j => j.hooper != null).length);

  readonly chargeCumulee = computed(() => {
    const limite = this.store.dateISO(new Date(Date.now() - 6 * 86400000));
    return this.store.rpe()
      .filter(r => r.date >= limite && r.charge != null)
      .reduce((tot, r) => tot + (r.charge ?? 0), 0);
  });

  /** Dernière gêne signalée sur les 7 derniers jours. */
  readonly derniereGene = computed(() => {
    const limite = this.store.dateISO(new Date(Date.now() - 6 * 86400000));
    return this.store.wellness()
      .filter(w => w.geneZone && w.date >= limite)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  });

  /** Hauteur de barre Hooper en % (max 25). */
  barH(v: number | null): number { return v == null ? 0 : Math.round(v / 25 * 100); }

  classe(v: number | null): string {
    if (v == null) return '';
    if (v <= 11) return 'ok';
    if (v <= 17) return 'moyen';
    return 'bad';
  }
}
