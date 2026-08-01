import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { JoueurStore } from '../joueur.store';
import { MaSeanceGps } from '@core/services/espace-joueur.service';

/**
 * Historique perso du joueur (lecture) — refonte « Claude Design ».
 * Onglet « Bien-être » : série Hooper 7 j + moyennes sommeil/fatigue.
 * Onglet « Charge / RPE » : charge sRPE par jour + charge cumulée.
 * Onglet « GPS » : ses séances mesurées, comparées à LUI-MÊME uniquement.
 */
@Component({
  selector: 'app-joueur-historique',
  standalone: true,
  templateUrl: './joueur-historique.component.html',
  styleUrl: './joueur-historique.component.scss',
  imports: [DecimalPipe, DatePipe],
})
export class JoueurHistoriqueComponent {

  store = inject(JoueurStore);

  readonly tab = signal<'bienetre' | 'charge' | 'gps'>('bienetre');
  setTab(t: 'bienetre' | 'charge' | 'gps'): void {
    this.tab.set(t);
    if (t === 'gps') this.store.chargerHistoriqueGps();   // chargement paresseux
  }

  // ──────────────────────────── Onglet GPS ────────────────────────────

  /** Séance dépliée (une seule à la fois : l'écran est un téléphone). */
  readonly gpsOuvert = signal<string | null>(null);
  toggleGps(id: string): void { this.gpsOuvert.update(v => (v === id ? null : id)); }

  /** Record personnel de vitesse, toutes séances confondues. */
  readonly vmaxRecord = computed(() =>
    Math.max(0, ...this.store.gpsSeances().map(s => s.gps?.vitesseMaxKmh ?? 0)));

  /**
   * Moyenne de distance PAR TYPE de séance, sur ses propres séances mesurées.
   *
   * <p>C'est le seul point de comparaison offert au joueur : lui-même. Ni ses coéquipiers, ni le
   * barème de poste du staff — ces lectures-là appartiennent au préparateur, qui les commente.</p>
   */
  private readonly refParType = computed(() => {
    const acc = new Map<string, { somme: number; n: number }>();
    for (const s of this.store.gpsSeances()) {
      const d = s.gps?.distanceTotaleM;
      if (d == null || !s.typeCode) continue;
      const e = acc.get(s.typeCode) ?? { somme: 0, n: 0 };
      acc.set(s.typeCode, { somme: e.somme + d, n: e.n + 1 });
    }
    return acc;
  });

  /**
   * Écart de distance à sa propre moyenne sur ce type de séance, en %.
   * `null` sous 3 séances de référence : un écart calculé sur un seul précédent ne veut rien dire.
   */
  ecartMoyenne(s: MaSeanceGps): number | null {
    const d = s.gps?.distanceTotaleM;
    const ref = s.typeCode ? this.refParType().get(s.typeCode) : undefined;
    if (d == null || !ref || ref.n < 3) return null;
    const moy = ref.somme / ref.n;
    if (!moy) return null;
    return Math.round((d - moy) / moy * 100);
  }

  estRecordVitesse(s: MaSeanceGps): boolean {
    const v = s.gps?.vitesseMaxKmh;
    return v != null && v > 0 && v === this.vmaxRecord();
  }

  /** Pourquoi cette séance n'a pas de chiffres — un trou inexpliqué se lit comme un bug. */
  raisonSansGps(s: MaSeanceGps): string {
    switch (s.statutPresence) {
      case 'ABSENT': return 'absent';
      case 'EXCUSE': return 'excusé';
      case 'SOIN':   return 'au soin';
      default:       return 'pas de capteur';
    }
  }

  /** Mention de contexte affichée même quand la séance a des données (ex. séance adaptée). */
  mentionStatut(s: MaSeanceGps): string {
    switch (s.statutPresence) {
      case 'ADAPTE': return 'séance adaptée';
      case 'RETARD': return 'arrivé en retard';
      default:       return '';
    }
  }

  /** Mètres entiers ; jamais de km, pour ne pas écraser un sprint de 11 m en « 0,01 km ». */
  m(v: number | null | undefined): string {
    return v == null ? '—' : Math.round(v).toLocaleString('fr-FR');
  }

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
