import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BilanPeriode, PredictionService } from '@core/services/prediction.service';

/**
 * Bilan d'une période : ce qui a été prescrit contre ce qui a été fait.
 *
 * <p>C'est la brique qui ferme la boucle. Sans elle, l'application sait dire ce qu'il faudrait
 * faire et ce qui se fait cette semaine, mais jamais si un bloc de préparation a tenu ses
 * promesses — donc jamais si le modèle utilisé était le bon.
 *
 * <p>Rien n'est figé en base : le bilan se recalcule à chaque ouverture. Un import GPS arrivé en
 * retard corrige le bilan au lieu de le laisser faux pour toujours.
 */
@Component({
  selector: 'app-bilan-periode',
  standalone: true,
  imports: [MatIconModule, DatePipe, DecimalPipe],
  template: `
    <div class="bp-overlay" (click)="fermerSiFond($event)">
      <div class="bp" role="dialog" aria-modal="true">

        <header class="bp-head">
          <div class="bp-head__txt">
            <div class="bp-head__ligne">
              <h2 class="bp-head__t">Bilan — {{ data()?.periode?.libelle || 'période' }}</h2>
              @if (data()?.terminee === false) {
                <span class="badge badge--info">période encore en cours</span>
              }
            </div>
            @if (data()?.periode) {
              <p class="bp-head__s num">
                {{ data()!.periode!.date_debut | date:'d MMM' }} –
                {{ data()!.periode!.date_fin | date:'d MMM y' }}
              </p>
            }
          </div>
          @if (data()?.disponible && data()?.objectif_defini) {
            <div class="bp-score">
              <span class="bp-score__v" [class.bp-score__v--low]="taux() < 50">
                {{ data()!.nb_semaines_tenues }}/{{ data()!.nb_semaines_evaluees }}
              </span>
              <span class="bp-score__l">semaines tenues · {{ taux() }} %</span>
            </div>
          }
          <button class="bp-ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
        </header>

        @if (chargement()) {
          <div class="bp-vide">Calcul du bilan…</div>
        } @else if (!data()?.disponible) {
          <div class="bp-vide">{{ data()?.erreur || 'Bilan indisponible.' }}</div>
        } @else if (!data()!.objectif_defini) {
          <div class="bp-vide">
            Aucun objectif n'a été posé sur cette période : il n'y a rien à comparer au réalisé.
          </div>
        } @else {
          <div class="bp-corps">

            <section class="bp-bloc">
              <span class="bp-kicker">Par métrique, sur toute la période</span>
              <div class="bp-wrap">
                <table class="bp-tbl">
                  <thead>
                    <tr><th>Métrique</th><th class="r">Prescrit</th><th class="r">Réalisé</th><th class="r">Écart</th></tr>
                  </thead>
                  <tbody>
                    @for (m of data()!.metriques; track m.metrique) {
                      <tr>
                        <td>{{ libelle(m.metrique) }}</td>
                        <td class="r num bp-muted">{{ valeur(m.metrique, m.prescrit) }}</td>
                        <td class="r num bp-fort">{{ valeur(m.metrique, m.realise) }}</td>
                        <td class="r num" [class]="'r num bp-ton-' + ton(m.ecart_pct)">
                          {{ m.ecart_pct == null ? '—' : (m.ecart_pct > 0 ? '+' : '') + (m.ecart_pct | number:'1.0-0') + ' %' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            <section class="bp-bloc">
              <span class="bp-kicker">Semaine par semaine</span>
              <div class="bp-wrap">
                <table class="bp-tbl">
                  <thead>
                    <tr>
                      <th>Sem.</th><th>Phase</th><th class="r">Prescrit</th>
                      <th class="r">Réalisé moyen</th><th class="r">Écart</th><th class="r">Atteint</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of data()!.semaines; track s.date_lundi) {
                      <tr>
                        <td class="num">S{{ s.no_semaine }}
                          @if (s.nb_matchs > 1) {
                            <span class="bp-dm" [title]="s.nb_matchs + ' matchs cette semaine'"></span>
                          }
                        </td>
                        <td class="bp-muted">{{ s.phase || '—' }}</td>
                        <td class="r num bp-muted">{{ km(s.prescrit_m) }}</td>
                        <td class="r num bp-fort">{{ km(s.realise_moyen_m) }}</td>
                        <td class="r num" [class]="'r num bp-ton-' + ton(s.ecart_pct)">
                          {{ s.ecart_pct == null ? '—' : (s.ecart_pct > 0 ? '+' : '') + (s.ecart_pct | number:'1.0-0') + ' %' }}
                        </td>
                        <td class="r num bp-muted">{{ s.nb_atteint }}/{{ s.nb_joueurs }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Les extrêmes, jamais la moyenne seule : c'est là que se prennent les décisions. -->
            @if (data()!.joueurs?.length) {
              <section class="bp-bloc">
                <div class="bp-bloc__head">
                  <span class="bp-kicker">Joueurs les plus en écart</span>
                  @if ((data()!.joueurs?.length || 0) > 8) {
                    <button class="bp-lien" (click)="tousJoueurs.set(!tousJoueurs())">
                      {{ tousJoueurs() ? 'Réduire' : 'Voir les ' + data()!.joueurs!.length + ' joueurs' }}
                    </button>
                  }
                </div>
                <div class="bp-wrap">
                  <table class="bp-tbl">
                    <thead>
                      <tr><th>Joueur</th><th>Poste</th><th class="r">Réalisé</th><th class="r">Écart</th><th class="r">Sem.</th></tr>
                    </thead>
                    <tbody>
                      @for (j of joueursAffiches(); track j.joueur_id) {
                        <tr>
                          <td class="bp-fort">{{ j.prenom }} {{ j.nom }}</td>
                          <td class="bp-muted">{{ j.poste }}</td>
                          <td class="r num">{{ km(j.realise_m) }}</td>
                          <td class="r num" [class]="'r num bp-ton-' + ton(j.ecart_pct)">
                            {{ j.ecart_pct == null ? '—' : (j.ecart_pct > 0 ? '+' : '') + (j.ecart_pct | number:'1.0-0') + ' %' }}
                          </td>
                          <td class="r num bp-muted">{{ j.nb_semaines }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }

            <p class="bp-note">
              Le réalisé est une <strong>moyenne par joueur</strong>, jamais une somme d'équipe — une
              somme varierait avec l'effectif présent. Le taux d'atteinte ne compte que les joueurs
              <strong>ayant des données</strong> cette semaine-là : un blessé ne compte pas comme
              objectif manqué.
            </p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .bp-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center;
                  padding: 24px; background: rgba(11, 18, 32, .5); }
    .bp { width: min(980px, 100%); max-height: 90vh; display: flex; flex-direction: column;
          background: var(--surface); border: 1px solid var(--border-strong);
          border-radius: var(--r-xl); box-shadow: var(--shadow-xl); overflow: hidden; }
    .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
    .r { text-align: right; }
    .bp-kicker { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
                 text-transform: uppercase; color: var(--text-4); }

    .bp-head { display: flex; align-items: flex-start; gap: 16px; padding: 15px 18px;
               border-bottom: 1px solid var(--border); }
    .bp-head__txt { flex: 1; min-width: 0; }
    .bp-head__ligne { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
    .bp-head__t { margin: 0; font-size: 16px; font-weight: 700; }
    .bp-head__s { margin: 3px 0 0; font-size: 12.5px; color: var(--text-3); }
    .bp-score { text-align: right; }
    .bp-score__v { display: block; font-family: var(--font-num); font-size: 20px;
                   font-weight: 600; color: var(--ok); }
    .bp-score__v--low { color: var(--warn); }
    .bp-score__l { display: block; font-size: 11.5px; color: var(--text-4); }
    .bp-ic { width: 30px; height: 30px; display: grid; place-items: center; flex: none;
             border: 1px solid var(--border-strong); border-radius: var(--r-md);
             background: var(--surface); cursor: pointer; color: var(--text-2); }
    .bp-ic:hover { background: var(--surface-3); }

    .bp-vide { padding: 34px; text-align: center; color: var(--text-3); font-size: 13px; }
    .bp-corps { flex: 1; overflow: auto; padding: 15px 18px;
                display: flex; flex-direction: column; gap: 16px; }

    .bp-bloc__head { display: flex; align-items: baseline; justify-content: space-between;
                     gap: 10px; }
    .bp-bloc > .bp-kicker, .bp-bloc__head { margin-bottom: 7px; }
    .bp-wrap { border: 1px solid var(--border); border-radius: var(--r-md); overflow: auto; }
    .bp-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .bp-tbl th { text-align: left; padding: 8px 11px; background: var(--surface-2);
                 border-bottom: 1px solid var(--border); font-size: 11.5px;
                 font-weight: 600; color: var(--text-2); white-space: nowrap; }
    .bp-tbl td { padding: 8px 11px; border-bottom: 1px solid var(--border); }
    .bp-tbl tbody tr:last-child td { border-bottom: 0; }
    .bp-muted { color: var(--text-3); }
    .bp-fort { font-weight: 600; }
    /* Semaine à plusieurs matchs : une pastille cuivre, la même couleur que « Retenu » ailleurs. */
    .bp-dm { display: inline-block; width: 8px; height: 8px; margin-left: 6px;
             border-radius: var(--r-pill); background: var(--cuivre); cursor: help;
             vertical-align: 1px; }
    .bp-note { margin: 0; padding: 11px 13px; border-radius: var(--r-md);
               background: var(--surface-2); border: 1px solid var(--border);
               font-size: 12.5px; line-height: 1.6; color: var(--text-2); }
    .bp-lien { background: none; border: 0; padding: 0; cursor: pointer;
               font: inherit; font-size: 12.5px; font-weight: 600; color: var(--green-700); }
    .bp-lien:hover { text-decoration: underline; }
    .bp-ton-ok      { color: var(--ok); font-weight: 600; }
    .bp-ton-warn    { color: var(--warn); font-weight: 600; }
    .bp-ton-bad     { color: var(--bad); font-weight: 600; }
    .bp-ton-neutral { color: var(--text-3); }
  `],
})
export class BilanPeriodeComponent implements OnInit {

  @Input({ required: true }) periodeId!: string;
  @Output() fermer = new EventEmitter<void>();

  private predictions = inject(PredictionService);

  data = signal<BilanPeriode | null>(null);
  chargement = signal(true);
  tousJoueurs = signal(false);

  private readonly LIBELLES: Record<string, string> = {
    distance_totale: 'Distance totale',
    distance_15: 'Distance > 15 km/h',
    distance_19: 'Distance > 19 km/h',
    distance_24_28: 'Distance 24–28 km/h',
    distance_28: 'Distance > 28 km/h',
    nb_sprints: 'Nombre de sprints',
  };

  ngOnInit(): void {
    this.predictions.getBilanPeriode(this.periodeId).subscribe({
      next: d => { this.data.set(d); this.chargement.set(false); },
      error: () => { this.chargement.set(false); },
    });
  }

  taux(): number {
    const d = this.data();
    if (!d?.nb_semaines_evaluees) return 0;
    return Math.round((d.nb_semaines_tenues ?? 0) / d.nb_semaines_evaluees * 100);
  }

  /** 8 lignes par défaut : le bilan sert à repérer les extrêmes, pas à relire tout l'effectif. */
  joueursAffiches() {
    const j = this.data()?.joueurs ?? [];
    return this.tousJoueurs() ? j : j.slice(0, 8);
  }

  libelle(code: string): string { return this.LIBELLES[code] ?? code; }

  /** Les sprints se comptent, tout le reste se mesure en kilomètres. */
  valeur(metrique: string, v: number | null): string {
    if (v == null) return '—';
    return metrique === 'nb_sprints' ? String(Math.round(v)) : (v / 1000).toFixed(1) + ' km';
  }

  km(v: number | null): string { return v == null ? '—' : (v / 1000).toFixed(1) + ' km'; }

  ton(pct: number | null | undefined): string {
    if (pct == null) return 'neutral';
    if (pct >= -5) return 'ok';
    if (pct >= -20) return 'warn';
    return 'bad';
  }

  fermerSiFond(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).classList.contains('overlay')) this.fermer.emit();
  }
}
