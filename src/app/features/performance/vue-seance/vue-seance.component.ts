import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SeanceService, Seance } from '@core/services/seance.service';
import { PredictionService, RapportSeance, LigneRapport } from '@core/services/prediction.service';
import { MetriquesClubService } from '@core/services/metriques-club.service';
import { DebriefCardComponent } from '@shared/components/debrief-card/debrief-card.component';
import { CouleursTypeService } from '@core/services/couleurs-type.service';
import { DateSimuleeService } from '@core/services/date-simulee.service';

type GroupePoste = 'TOUS' | 'DF' | 'ML' | 'ATT';

/** Ligne du rapport enrichie des données brutes GPS (zones, accel/freinage, charge). */
interface LigneVue extends LigneRapport {
  zones: number[];          // distance (m) par bande, indexée comme ZONES
  zones_total_m: number;
  nb_accelerations: number | null;
  nb_freinages: number | null;
  charge_ua: number | null; // charge GPS, ou sRPE en repli (cf. charge_source)
  /** D'où vient `charge_ua` : mesurée par le capteur, ou déduite du RPE déclaré. */
  charge_source: 'GPS' | 'RPE' | null;
  /**
   * Distances CUMULÉES telles qu'importées et stockées : `cumuls[1]` (> 15 km/h) contient
   * `cumuls[2]` (> 19), qui contient `cumuls[3]` (> 24), qui contient `cumuls[4]` (> 28).
   * À ne pas confondre avec `zones`, qui sont les mêmes mètres découpés en bandes exclusives
   * pour le donut — un même joueur y affiche deux chiffres différents pour « 24 km/h ».
   * Index 0 = distance totale, pour aligner les deux tableaux sur le même vecteur.
   */
  cumuls: (number | null)[];
}

@Component({
  selector: 'app-vue-seance',
  standalone: true,
  templateUrl: './vue-seance.component.html',
  styleUrl: './vue-seance.component.scss',
  imports: [FormsModule, DecimalPipe, DatePipe, DebriefCardComponent],
})
export class VueSeanceComponent implements OnInit {

  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private seanceService     = inject(SeanceService);
  private predictionService = inject(PredictionService);
  readonly metriquesClub    = inject(MetriquesClubService);
  /** Couleurs de type resolues depuis type_seance.couleur (V93), repli historique inclus. */
  private couleursType = inject(CouleursTypeService);
  /** « Aujourd'hui » doit suivre l'horloge simulée, comme le fait le rapport côté Python. */
  private dateSimulee = inject(DateSimuleeService);

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
  /** Onglet du bloc joueurs : lecture analytique (norme, écart, objectif) ou données brutes. */
  ongletTable = signal<'analyse' | 'brut'>('analyse');
  /** Joueurs dont la ligne détaillée est dépliée. */
  private expanded = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.couleursType.charger();   // couleurs du club (idempotent)
    this.metriquesClub.charger();
    this.seanceService.getAll().subscribe({
      next: data => {
        // Cet écran lit des DONNÉES de séance : une séance à venir n'en a aucune, et un club qui
        // planifie sa saison d'un coup noierait le sélecteur sous des dizaines d'entrées vides.
        // On s'arrête donc à aujourd'hui (date simulée comprise) et on écarte les annulées.
        const aujourdhui = this.dateSimulee.get() ?? new Date().toLocaleDateString('sv-SE');
        const triees = [...data]
          .filter(s => s.date <= aujourdhui && s.statut !== 'ANNULEE')
          .sort((a, b) => b.date.localeCompare(a.date)
            || (b.heureDebut ?? '').localeCompare(a.heureDebut ?? ''));
        this.seances.set(triees);
        // Un id d'URL est un choix explicite (lien depuis le calendrier) : on l'honore même s'il
        // sort de la liste. Le rapport d'une séance future revient alors vide, ce qui est juste.
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
      // Repli GPS → sRPE, comme le fait déjà le moteur de charge : sans lui, un présent sans
      // capteur qui a rempli son questionnaire affichait une ligne entièrement vide.
      const chargeGps = this.num(d?.chargeUa);
      const chargeRpe = l.charge_rpe ?? null;
      return {
        ...l,
        zones,
        zones_total_m: zones.reduce((s, v) => s + v, 0),
        nb_accelerations: this.num(d?.nbAccelerations),
        nb_freinages: this.num(d?.nbFreinages),
        charge_ua: chargeGps ?? chargeRpe,
        charge_source: chargeGps != null ? 'GPS' : (chargeRpe != null ? 'RPE' : null),
        cumuls: [
          this.num(d?.distanceTotaleM), this.num(d?.distance15kmhM), this.num(d?.distance19kmhM),
          this.num(d?.distanceSprint24kmhM), this.num(d?.distanceSprint28kmhM),
        ],
      } as LigneVue;
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

  /** Mètres entiers, séparateur de milliers FR. Jamais de km : un sprint de 11 m vaut « 11 m ». */
  m(v: number | null | undefined): string {
    return v == null ? '—' : Math.round(v).toLocaleString('fr-FR');
  }

  /**
   * Distance lisible : mètres sous le kilomètre, km au-delà. Le « x,xx km » systématique écrasait
   * les petites valeurs — 10,74 m et 5,97 m s'affichaient tous deux « 0,01 km », et 1,53 m « 0,00 km ».
   */
  distanceLisible(v: number | null | undefined): string {
    if (v == null) return '—';
    if (v < 1000) return `${Math.round(v)} m`;
    return `${(v / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
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

  /**
   * Ordre d'affichage du bloc joueurs — commun aux onglets « Analyse » et « Données brutes »
   * ainsi qu'à l'export CSV, qui lisent tous ce même vecteur.
   *
   * <p>Porteurs de capteur d'abord, non-mesurés ensuite : depuis que les présents sans capteur
   * figurent dans la liste, le tableau pouvait s'ouvrir sur des lignes vides et laisser croire
   * à une séance sans données. À l'intérieur du groupe mesuré, le tri par statut est conservé
   * pour garder les joueurs sous la norme en tête ; le nom départage les ex æquo. Les
   * non-mesurés n'ont pas de statut qui ait un sens sans distance : ils sont alphabétiques.
   * Séance entièrement sans GPS : tout le monde tombe dans ce second groupe, donc alphabétique.
   */
  readonly lignesFiltrees = computed<LigneVue[]>(() => {
    const g = this.groupePoste();
    const order: Record<string, number> = { SOUS_NORME: 0, SANS_BASELINE: 1, DANS_NORME: 2, SUR_NORME: 3 };
    // Mesuré = le rapport a une distance OU les données brutes en portent une : les deux sources
    // sont chargées séparément, l'une peut manquer sans que le joueur soit pour autant sans capteur.
    const mesure = (l: LigneVue) => (l.distance_reelle != null || l.cumuls[0] != null) ? 0 : 1;
    const nomComplet = (l: LigneVue) => `${l.nom ?? ''} ${l.prenom ?? ''}`.trim();
    const parNom = (a: LigneVue, b: LigneVue) =>
      nomComplet(a).localeCompare(nomComplet(b), 'fr', { sensitivity: 'base' });
    return this.lignes()
      .filter(l => g === 'TOUS' || this.grouper(l.poste) === g)
      .sort((a, b) => {
        const groupe = mesure(a) - mesure(b);
        if (groupe !== 0) return groupe;
        if (mesure(a) === 1) return parNom(a, b);
        return (order[a.statut] ?? 9) - (order[b.statut] ?? 9) || parNom(a, b);
      });
  });

  // ── KPI (sur l'ensemble filtré) ─────────────────────────────────
  readonly kpis = computed(() => {
    const ls = this.lignesFiltrees();
    // Les moyennes se divisent par les joueurs RÉELLEMENT MESURÉS, pas par les participants :
    // depuis que les présents sans capteur figurent dans la liste, diviser par le total ferait
    // chuter les moyennes d'équipe sans que personne n'ait moins couru.
    const n = ls.filter(l => l.distance_reelle != null).length || 1;
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

  /**
   * Pied du tableau brut : total d'équipe et moyenne individuelle.
   *
   * <p>Les deux se calculent sur les joueurs RÉELLEMENT MESURÉS : inclure les présents sans
   * capteur ferait chuter la moyenne sans que personne n'ait moins couru. La vitesse max n'a
   * pas de somme qui ait un sens — on remonte le maximum de l'effectif dans les deux lignes.
   * Le ratio moyen est la moyenne des ratios individuels (même convention que les feuilles
   * Excel du staff), et non le rapport des sommes, qui pondérerait par le temps de jeu.</p>
   */
  readonly agregatsBruts = computed(() => {
    const ls = this.lignesFiltrees().filter(l => l.cumuls[0] != null);
    const n = ls.length;
    const somme = (f: (l: LigneVue) => number | null | undefined) =>
      ls.reduce((a, l) => a + (f(l) ?? 0), 0);
    const totaux = {
      duree:   somme(l => l.duree_minutes),
      c:       [0, 1, 2, 3, 4].map(i => somme(l => l.cumuls[i])),
      sprints: somme(l => l.nb_sprints),
      accel:   somme(l => l.nb_accelerations),
      frein:   somme(l => l.nb_freinages),
      vmax:    ls.reduce((a, l) => Math.max(a, l.vitesse_max ?? 0), 0),
      ratio:   somme(l => l.ratio_reel),
    };
    const div = (v: number) => (n ? v / n : 0);
    return {
      n,
      totaux,
      moyennes: {
        duree:   div(totaux.duree),
        c:       totaux.c.map(div),
        sprints: div(totaux.sprints),
        accel:   div(totaux.accel),
        frein:   div(totaux.frein),
        vmax:    totaux.vmax,
        ratio:   div(totaux.ratio),
      },
    };
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
    // Les colonnes Z1..Z5 sont des BANDES calculées (15-19, 19-24…) : réimporter ce fichier tel
    // quel injecterait des bandes dans des colonnes qui attendent des cumuls. On exporte donc
    // aussi les cumuls bruts « Sup_15kmh_m… », en valeur exacte, tels qu'ils sont en base.
    const head = ['Joueur', 'Poste', 'Duree_min', 'Distance_m', 'Dist_attendue_m', 'Ratio_m_min',
      'Objectif_seance_m', 'Delta_m', 'Delta_pct', 'Statut', 'Vmax_kmh', 'Sprints',
      'Accelerations', 'Freinages',
      'Sup_15kmh_m', 'Sup_19kmh_m', 'Sup_24kmh_m', 'Sup_28kmh_m',
      'Z1_m', 'Z2_m', 'Z3_m', 'Z4_m', 'Z5_m'];
    const rows = this.lignesFiltrees().map(l => [
      `${l.prenom} ${l.nom}`, l.poste ?? '', l.duree_minutes ?? '', l.distance_reelle ?? '',
      l.distance_attendue ?? '', l.ratio_reel ?? '', l.objectif_seance_m ?? '',
      l.delta_m ?? '', l.delta_pct ?? '', l.statut, l.vitesse_max ?? '', l.nb_sprints ?? '',
      l.nb_accelerations ?? '', l.nb_freinages ?? '',
      ...l.cumuls.slice(1).map(c => c ?? ''),
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
  couleurType(code?: string): string { return this.couleursType.couleur(code); }

  statutClass(statut: string): string {
    return { SOUS_NORME: 'statut-sous', DANS_NORME: 'statut-dans', SUR_NORME: 'statut-sur', SANS_BASELINE: 'statut-sans' }[statut] ?? '';
  }
  statutLibelle(statut: string): string {
    return { SOUS_NORME: 'Sous la norme', DANS_NORME: 'Dans la norme', SUR_NORME: 'Sur la norme', SANS_BASELINE: 'Pas de baseline' }[statut] ?? statut;
  }
  /** Statut d'appel, pour nommer une contradiction (« absent, pourtant mesuré »). */
  statutAppelLibelle(statut: string): string {
    return { PRESENT: 'présent', RETARD: 'en retard', ADAPTE: 'adapté', SOIN: 'au soin', EXCUSE: 'excusé', ABSENT: 'absent' }[statut] ?? statut.toLowerCase();
  }
  statutBadgeClass(statut: string): string {
    return { SOUS_NORME: 'badge--bad', DANS_NORME: 'badge--ok', SUR_NORME: 'badge--info', SANS_BASELINE: 'badge--neutral' }[statut] ?? 'badge--neutral';
  }
  deltaClass(delta: number | null): string {
    if (delta === null) return '';
    return delta < 0 ? 'delta-neg' : delta > 0 ? 'delta-pos' : '';
  }
}
