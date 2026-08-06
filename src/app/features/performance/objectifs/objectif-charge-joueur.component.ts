import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  ChartComponent, ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis,
  ApexStroke, ApexMarkers, ApexTooltip, ApexLegend, ApexDataLabels, ApexFill,
} from 'ng-apexcharts';
import { PredictionService, TrajectoireJoueur, SemaineTrajectoire } from '@core/services/prediction.service';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';

/**
 * Onglet « Objectif de charge » de la fiche joueur : les trois courbes sur la période.
 *
 * <p>Ce que le tableau d'équipe ne peut pas montrer : la FORME dans le temps. Une ligne de
 * tableau dit « il est 25 % sous son poste cette semaine » ; la courbe dit s'il remonte, s'il
 * stagne depuis deux mois, ou s'il vient de décrocher — trois situations qui n'appellent pas la
 * même conversation.
 *
 * <p>Habituel n'est pas le réalisé : c'est la moyenne des quatre semaines qui précèdent, la même
 * grandeur que la charge chronique ailleurs dans l'application. Sans ça, « Habituel » et
 * « Réalisé » seraient la même courbe décalée et l'écran ne dirait rien.
 */
@Component({
  selector: 'app-objectif-charge-joueur',
  standalone: true,
  imports: [ChartComponent, DecimalPipe, FormsModule, MatIconModule, InfoHintComponent],
  template: `
    <div class="tab-content pf">
      @if (chargement()) {
        <p class="vide">Chargement…</p>
      } @else if (!data()?.disponible) {
        <p class="vide">
          {{ data()?.erreur || 'Aucune période de saison ne couvre cette date : la trajectoire n\\'a pas de cadre.' }}
        </p>
      } @else {

        <!-- Bandeau de période : le cadre temporel doit être lu avant les courbes. -->
        <div class="oc-bar">
          <div>
            <strong>{{ data()!.periode!.libelle }}</strong>
            <span class="oc-type">{{ data()!.periode!.type }}</span>
            <small>{{ data()!.nb_semaines }} semaines</small>
            <app-info-hint titre="Habituel / Attendu / Retenu"
              texte="Habituel : la moyenne des 4 semaines qui précèdent — sa charge chronique, pas le réalisé de la semaine. Attendu : ce qu'un joueur de son poste fait normalement au niveau du référentiel adopté. Retenu : ce qui a été prescrit pour cette semaine par l'objectif de période, arbitrages de semaines à deux matchs compris. Le réalisé s'arrête à la dernière semaine révolue : les semaines à venir n'ont pas de données."></app-info-hint>
          </div>
          @if (data()!.nb_semaines_evaluees) {
            <span class="oc-score" [class.oc-score--low]="tauxTenu() < 50">
              {{ data()!.nb_semaines_tenues }}/{{ data()!.nb_semaines_evaluees }} semaines tenues
            </span>
          }
          @if (!data()!.referentiel_actif) {
            <span class="oc-warn">Aucun référentiel adopté : la courbe « Attendu » reste vide.</span>
          }
        </div>

        <section class="pf-card">
          <div class="pf-card__head"><span class="pf-card__bullet"></span><h2>Distance totale, semaine par semaine</h2></div>
          <apx-chart
            [series]="series" [chart]="chart" [xaxis]="xaxis" [yaxis]="yaxis"
            [stroke]="stroke" [markers]="markers" [tooltip]="tooltip"
            [legend]="legend" [dataLabels]="dataLabels" [fill]="fill"></apx-chart>
        </section>

        <section class="pf-card">
          <div class="pf-card__head"><span class="pf-card__bullet"></span><h2>Détail des semaines</h2></div>
          <div class="oc-tablewrap">
            <table class="oc-table">
              <thead>
                <tr>
                  <th>Semaine</th><th>Phase</th>
                  <th class="r">Habituel</th><th class="r">Attendu</th>
                  <th class="r">Retenu</th><th class="r">Réalisé</th><th class="r">Écart</th>
                </tr>
              </thead>
              <tbody>
                @for (s of data()!.semaines; track s.date_lundi) {
                  <tr [class.oc-futur]="!s.passee">
                    <td>
                      S{{ s.no_semaine }}
                      <small>{{ jour(s.date_lundi) }}</small>
                      @if (s.nb_matchs > 1) { <span class="oc-dm" title="Semaine à plusieurs matchs">{{ s.nb_matchs }} matchs</span> }
                      @else if (s.nb_matchs === 1) { <span class="oc-m" title="Un match cette semaine">match</span> }
                    </td>
                    <td class="muted">{{ s.phase || '—' }}</td>
                    <td class="r muted">{{ km(s.habituel_m) }}</td>
                    <td class="r">
                      @if (s.attendu_min_m != null) {
                        {{ s.attendu_min_m / 1000 | number:'1.0-0' }}–{{ (s.attendu_max_m ?? s.attendu_min_m) / 1000 | number:'1.0-0' }} km
                      } @else { <span class="muted">—</span> }
                    </td>
                    <td class="r">{{ km(s.retenu_m) }}</td>
                    <td class="r" [class]="'ton-' + ton(s)">{{ s.passee ? km(s.realise_m) : '—' }}</td>
                    <td class="r">
                      @if (s.passee && s.retenu_m) {
                        <span [class]="'ton-' + ton(s)">{{ ecart(s)! > 0 ? '+' : '' }}{{ ecart(s) | number:'1.0-0' }} %</span>
                      } @else { <span class="muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .vide { padding:28px; text-align:center; color:#64748b; font-size:13px; }
    .oc-bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px;
              font-size:13px; color:#475569; }
    .oc-bar small { color:#94a3b8; margin-left:8px; }
    .oc-type { margin-left:8px; font-size:10.5px; padding:1px 6px; border-radius:4px;
               background:#eef2ff; color:#4338ca; font-weight:700; }
    .oc-score { margin-left:auto; font-weight:700; color:#15803d; }
    .oc-score--low { color:#b45309; }
    .oc-warn { flex-basis:100%; font-size:12px; color:#64748b; font-style:italic; }
    .oc-tablewrap { overflow-x:auto; }
    .oc-table { width:100%; border-collapse:collapse; font-size:12.5px; }
    .oc-table th, .oc-table td { padding:6px 8px; border-bottom:1px solid #f1f5f9; text-align:left; }
    .oc-table th { font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:#94a3b8; }
    .oc-table td small { display:block; color:#94a3b8; font-size:10.5px; }
    .r { text-align:right; font-variant-numeric:tabular-nums; }
    .muted { color:#94a3b8; }
    /* Une semaine à venir n'a pas de réalisé : on la grise plutôt que d'afficher un zéro. */
    .oc-futur { opacity:.55; }
    .oc-dm { display:inline-block; margin-top:2px; font-size:10px; padding:1px 5px; border-radius:4px;
             background:#fef3c7; color:#92400e; font-weight:700; }
    .oc-m { display:inline-block; margin-top:2px; font-size:10px; padding:1px 5px; border-radius:4px;
            background:#f1f5f9; color:#64748b; font-weight:700; }
    .ton-ok   { color:#15803d; font-weight:700; }
    .ton-warn { color:#b45309; font-weight:700; }
    .ton-bad  { color:#dc2626; font-weight:700; }
    .ton-neutral { color:#475569; }
  `],
})
export class ObjectifChargeJoueurComponent implements OnInit {

  @Input({ required: true }) joueurId!: string;

  private predictions = inject(PredictionService);

  data = signal<TrajectoireJoueur | null>(null);
  chargement = signal(true);

  series: ApexAxisChartSeries = [];
  chart: ApexChart = { type: 'line', height: 300, toolbar: { show: false }, animations: { enabled: false } };
  xaxis: ApexXAxis = { categories: [], labels: { style: { fontSize: '11px' } } };
  yaxis: ApexYAxis = { labels: { formatter: v => (v / 1000).toFixed(0) + ' km' } };
  stroke: ApexStroke = { width: [2, 2, 3, 3], curve: 'straight', dashArray: [4, 0, 0, 0] };
  markers: ApexMarkers = { size: [0, 0, 3, 4] };
  legend: ApexLegend = { position: 'top', horizontalAlign: 'right', fontSize: '12px' };
  dataLabels: ApexDataLabels = { enabled: false };
  fill: ApexFill = { opacity: 1 };
  tooltip: ApexTooltip = {
    shared: true,
    y: { formatter: v => (v == null ? '—' : (v / 1000).toFixed(1) + ' km') },
  };

  ngOnInit(): void {
    this.predictions.getTrajectoireJoueur(this.joueurId).subscribe({
      next: d => { this.data.set(d); this.construireGraphe(d); this.chargement.set(false); },
      error: () => { this.chargement.set(false); },
    });
  }

  /**
   * Quatre séries : Attendu (bande de référence, pointillé), Habituel, Retenu, Réalisé.
   * Le réalisé est coupé après la dernière semaine révolue — une courbe qui plonge à zéro sur
   * les semaines à venir se lit comme un effondrement alors qu'il ne s'est encore rien passé.
   */
  private construireGraphe(d: TrajectoireJoueur): void {
    if (!d.disponible || !d.semaines.length) return;
    const s = d.semaines;
    this.xaxis = { ...this.xaxis, categories: s.map(x => 'S' + x.no_semaine) };
    this.series = [
      { name: 'Attendu',  data: s.map(x => x.attendu_m ?? null) as number[], color: '#94a3b8' },
      { name: 'Habituel', data: s.map(x => x.habituel_m ?? null) as number[], color: '#6366f1' },
      { name: 'Retenu',   data: s.map(x => x.retenu_m ?? null) as number[], color: '#0ea5e9' },
      { name: 'Réalisé',  data: s.map(x => (x.passee ? x.realise_m : null)) as number[], color: '#15803d' },
    ];
  }

  tauxTenu(): number {
    const d = this.data();
    if (!d?.nb_semaines_evaluees) return 100;
    return Math.round((d.nb_semaines_tenues ?? 0) / d.nb_semaines_evaluees * 100);
  }

  ecart(s: SemaineTrajectoire): number | null {
    if (!s.retenu_m) return null;
    return Math.round((s.realise_m - s.retenu_m) / s.retenu_m * 100);
  }

  /** Même échelle de tons que le tableau d'équipe : un écart se lit pareil des deux côtés. */
  ton(s: SemaineTrajectoire): string {
    const e = this.ecart(s);
    if (!s.passee || e == null) return 'neutral';
    if (e >= -5) return 'ok';
    if (e >= -20) return 'warn';
    return 'bad';
  }

  km(v: number | null | undefined): string {
    return v == null ? '—' : (v / 1000).toFixed(1) + ' km';
  }

  jour(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
