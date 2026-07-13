import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SeanceService, Seance } from '@core/services/seance.service';
import { PredictionService, RapportSeance, LigneRapport } from '@core/services/prediction.service';
import { MetriquesClubService } from '@core/services/metriques-club.service';

const COULEURS_TYPE: Record<string, string> = {
  MATCH:        '#ef4444',
  MATCH_AMICAL: '#f97316',
  INTENSIF:     '#6366f1',
  TECHNIQUE:    '#0ea5a0',
  REPRISE:      '#22c55e',
  PRE_MATCH:    '#eab308',
  FORCE:        '#8b5cf6',
};

type GroupePoste = 'TOUS' | 'DF' | 'ML' | 'ATT';

/** Ligne du rapport enrichie des données brutes GPS (zones, accel/freinage, charge). */
interface LigneVue extends LigneRapport {
  zones: number[];          // distance (m) par bande, indexée comme ZONES
  zones_total_m: number;
  nb_accelerations: number | null;
  nb_freinages: number | null;
  charge_ua: number | null; // module RPE — null tant que non saisi
}

@Component({
  selector: 'app-vue-seance',
  standalone: true,
  templateUrl: './vue-seance.component.html',
  styleUrl: './vue-seance.component.scss',
  imports: [FormsModule, DecimalPipe, DatePipe],
})
export class VueSeanceComponent implements OnInit {

  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private seanceService     = inject(SeanceService);
  private predictionService = inject(PredictionService);
  readonly metriquesClub    = inject(MetriquesClubService);

  /** Bandes Z1..Z5 aux seuils réels du club (profil d'import), défaut 15/19/24/28. */
  readonly ZONES = this.metriquesClub.zones;

  /** Le club importe-t-il au moins une distance par zone ? (sinon barres/donut masqués) */
  readonly zonesDispo = computed(() =>
    ['DISTANCE_Z15', 'DISTANCE_Z19', 'DISTANCE_Z24', 'DISTANCE_Z28']
      .some(m => this.metriquesClub.estActive(m)));

  seances = signal<Seance[]>([]);
  seanceIdSel = signal<string | null>(null);
  rapport = signal<RapportSeance | null>(null);
  lignes  = signal<LigneVue[]>([]);
  loading = signal(false);
  error   = signal(false);

  /** Filtre par groupe de poste (maquette : Tous / DF / ML / ATT). */
  groupePoste = signal<GroupePoste>('TOUS');
  /** Joueurs dont la ligne détaillée est dépliée. */
  private expanded = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.metriquesClub.charger();
    this.seanceService.getAll().subscribe({
      next: data => {
        const triees = [...data].sort((a, b) => b.date.localeCompare(a.date));
        this.seances.set(triees);
        const idParam = this.route.snapshot.paramMap.get('id');
        const cible = idParam ?? triees[0]?.id ?? null;
        if (cible) this.choisirSeance(cible);
      },
      error: () => this.error.set(true),
    });
  }

  choisirSeance(id: string): void {
    this.seanceIdSel.set(id);
    this.loading.set(true);
    this.error.set(false);
    forkJoin({
      rapport: this.predictionService.getRapportSeance(id),
      donnees: this.seanceService.getDonneesGps(id).pipe(catchError(() => of([] as any[]))),
    }).subscribe({
      next: ({ rapport, donnees }) => {
        this.rapport.set(rapport);
        this.lignes.set(this.fusionner(rapport.lignes, donnees ?? []));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set(true); this.rapport.set(null); },
    });
  }

  /** Associe à chaque ligne de rapport ses données GPS brutes (zones, accel, freinage). */
  private fusionner(lignes: LigneRapport[], donnees: any[]): LigneVue[] {
    const parJoueur = new Map<string, any>();
    for (const d of donnees) {
      const jid = d?.joueur?.id ?? d?.joueurId;
      if (jid) parJoueur.set(jid, d);
    }
    return lignes.map(l => {
      const d = parJoueur.get(l.joueur_id);
      const zones = this.bandes(d);
      return {
        ...l,
        zones,
        zones_total_m: zones.reduce((s, v) => s + v, 0),
        nb_accelerations: this.num(d?.nbAccelerations),
        nb_freinages: this.num(d?.nbFreinages),
        charge_ua: this.num(d?.chargeUa), // absent du GPS — reste null tant que RPE non câblé
      };
    });
  }

  /** Distances par bande à partir des seuils cumulés (>15, >19, >24, >28). */
  private bandes(d: any): number[] {
    if (!d) return [0, 0, 0, 0, 0];
    const tot = this.num(d.distanceTotaleM) ?? 0;
    const d15 = this.num(d.distance15kmhM) ?? 0;
    const d19 = this.num(d.distance19kmhM) ?? 0;
    const d24 = this.num(d.distanceSprint24kmhM) ?? 0;
    const d28 = this.num(d.distanceSprint28kmhM) ?? 0;
    return [
      Math.max(tot - d15, 0),
      Math.max(d15 - d19, 0),
      Math.max(d19 - d24, 0),
      Math.max(d24 - d28, 0),
      Math.max(d28, 0),
    ];
  }

  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  // ── Filtre poste ────────────────────────────────────────────────
  setGroupe(g: GroupePoste): void { this.groupePoste.set(g); }

  /** Mappe un poste libre (RW, CB, DM…) vers DF / ML / ATT. */
  private grouper(poste?: string): GroupePoste | '?' {
    const p = (poste ?? '').toUpperCase();
    if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DF', 'GK'].includes(p)) return 'DF';
    if (['CM', 'DM', 'AM', 'ML', 'MC', 'MD', 'MG'].includes(p))   return 'ML';
    if (['ST', 'CF', 'RW', 'LW', 'ATT', 'BU', 'AT'].includes(p))  return 'ATT';
    return '?';
  }

  readonly lignesFiltrees = computed<LigneVue[]>(() => {
    const g = this.groupePoste();
    const order: Record<string, number> = { SOUS_NORME: 0, SANS_BASELINE: 1, DANS_NORME: 2, SUR_NORME: 3 };
    return this.lignes()
      .filter(l => g === 'TOUS' || this.grouper(l.poste) === g)
      .sort((a, b) => (order[a.statut] ?? 9) - (order[b.statut] ?? 9));
  });

  // ── KPI (sur l'ensemble filtré) ─────────────────────────────────
  readonly kpis = computed(() => {
    const ls = this.lignesFiltrees();
    const n = ls.length || 1;
    const distTot = ls.reduce((s, l) => s + (l.distance_reelle ?? 0), 0);
    const sprints = ls.reduce((s, l) => s + (l.nb_sprints ?? 0), 0);
    let vmax = 0, vmaxJoueur = '';
    for (const l of ls) {
      if ((l.vitesse_max ?? 0) > vmax) { vmax = l.vitesse_max ?? 0; vmaxJoueur = `${l.prenom?.[0] ?? ''}. ${l.nom}`; }
    }
    const charges = ls.map(l => l.charge_ua).filter((v): v is number => v !== null);
    return {
      distanceTotaleKm: distTot / 1000,
      distanceMoyM: distTot / n,
      vitesseMax: vmax,
      vitesseMaxJoueur: vmaxJoueur,
      sprintsTotal: sprints,
      sprintsMoy: sprints / n,
      chargeMoy: charges.length ? charges.reduce((s, v) => s + v, 0) / charges.length : null,
    };
  });

  /** Distance totale (km) par bande, sur l'ensemble filtré — alimente le donut. */
  readonly zonesGlobales = computed(() => {
    const ls = this.lignesFiltrees();
    const ZONES = this.ZONES();
    const cumul = ZONES.map((_, i) => ls.reduce((s, l) => s + (l.zones[i] ?? 0), 0));
    const total = cumul.reduce((s, v) => s + v, 0) || 1;
    return ZONES.map((z, i) => ({
      ...z,
      m: cumul[i],
      km: cumul[i] / 1000,
      pct: (cumul[i] / total) * 100,
    }));
  });

  /** Dégradé conique CSS pour le donut des zones. */
  readonly donutGradient = computed(() => {
    let acc = 0;
    const stops = this.zonesGlobales().map(z => {
      const from = acc; acc += z.pct;
      return `${z.couleur} ${from.toFixed(2)}% ${acc.toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  /** Charge affichée seulement si au moins une valeur RPE existe. */
  readonly chargeDispo = computed(() => this.lignes().some(l => l.charge_ua !== null));

  // ── Lignes dépliables ───────────────────────────────────────────
  toggle(joueurId: string): void {
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(joueurId) ? next.delete(joueurId) : next.add(joueurId);
      return next;
    });
  }
  estDeplie(joueurId: string): boolean { return this.expanded().has(joueurId); }

  estMatch(): boolean {
    const t = this.rapport()?.type_code;
    return t === 'MATCH' || t === 'MATCH_AMICAL';
  }

  // ── Export CSV ──────────────────────────────────────────────────
  exporterCsv(): void {
    const r = this.rapport();
    if (!r) return;
    const sep = ';';
    const head = ['Joueur', 'Poste', 'Duree_min', 'Distance_m', 'Dist_attendue_m', 'Ratio_m_min',
      'Objectif_seance_m', 'Delta_m', 'Delta_pct', 'Statut', 'Vmax_kmh', 'Sprints',
      'Accelerations', 'Freinages', 'Z1_m', 'Z2_m', 'Z3_m', 'Z4_m', 'Z5_m'];
    const rows = this.lignesFiltrees().map(l => [
      `${l.prenom} ${l.nom}`, l.poste ?? '', l.duree_minutes ?? '', l.distance_reelle ?? '',
      l.distance_attendue ?? '', l.ratio_reel ?? '', l.objectif_seance_m ?? '',
      l.delta_m ?? '', l.delta_pct ?? '', l.statut, l.vitesse_max ?? '', l.nb_sprints ?? '',
      l.nb_accelerations ?? '', l.nb_freinages ?? '',
      ...l.zones.map(z => Math.round(z)),
    ].join(sep));
    const csv = [head.join(sep), ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vue-seance_${r.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers d'affichage (repris de seance-detail) ──────────────
  couleurType(code?: string): string { return COULEURS_TYPE[code ?? ''] ?? '#6366f1'; }

  statutClass(statut: string): string {
    return { SOUS_NORME: 'statut-sous', DANS_NORME: 'statut-dans', SUR_NORME: 'statut-sur', SANS_BASELINE: 'statut-sans' }[statut] ?? '';
  }
  statutLibelle(statut: string): string {
    return { SOUS_NORME: 'Sous la norme', DANS_NORME: 'Dans la norme', SUR_NORME: 'Sur la norme', SANS_BASELINE: 'Pas de baseline' }[statut] ?? statut;
  }
  statutBadgeClass(statut: string): string {
    return { SOUS_NORME: 'badge--bad', DANS_NORME: 'badge--ok', SUR_NORME: 'badge--info', SANS_BASELINE: 'badge--neutral' }[statut] ?? 'badge--neutral';
  }
  deltaClass(delta: number | null): string {
    if (delta === null) return '';
    return delta < 0 ? 'delta-neg' : delta > 0 ? 'delta-pos' : '';
  }
}
