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
    <div class="overlay" (click)="fermerSiFond($event)">
      <div class="modale" role="dialog" aria-modal="true">

        <header class="mh">
          <div>
            <h2 class="mh__t">Bilan — {{ data()?.periode?.libelle || 'période' }}</h2>
            @if (data()?.periode) {
              <p class="mh__s">
                {{ data()!.periode!.date_debut | date:'d MMM' }} –
                {{ data()!.periode!.date_fin | date:'d MMM y' }}
                @if (data()!.terminee === false) { · <em>période encore en cours</em> }
              </p>
            }
          </div>
          <button class="ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
        </header>

        @if (chargement()) {
          <div class="vide">Calcul du bilan…</div>
        } @else if (!data()?.disponible) {
          <div class="vide">{{ data()?.erreur || 'Bilan indisponible.' }}</div>
        } @else if (!data()!.objectif_defini) {
          <div class="vide">
            Aucun objectif n'a été posé sur cette période : il n'y a rien à comparer au réalisé.
          </div>
        } @else {

          <!-- Le verdict d'abord : combien de semaines ont tenu. Le détail vient après. -->
          <div class="verdict" [class.verdict--low]="taux() < 50">
            <strong>{{ data()!.nb_semaines_tenues }}/{{ data()!.nb_semaines_evaluees }}</strong>
            semaines tenues à ±5 % de la cible
            <span class="verdict__pct">{{ taux() }} %</span>
          </div>

          <section class="bloc">
            <h3>Par métrique, sur toute la période</h3>
            <table class="tbl">
              <thead>
                <tr><th>Métrique</th><th class="r">Prescrit</th><th class="r">Réalisé</th><th class="r">Écart</th></tr>
              </thead>
              <tbody>
                @for (m of data()!.metriques; track m.metrique) {
                  <tr>
                    <td>{{ libelle(m.metrique) }}</td>
                    <td class="r">{{ valeur(m.metrique, m.prescrit) }}</td>
                    <td class="r">{{ valeur(m.metrique, m.realise) }}</td>
                    <td class="r" [class]="'ton-' + ton(m.ecart_pct)">
                      {{ m.ecart_pct == null ? '—' : (m.ecart_pct > 0 ? '+' : '') + (m.ecart_pct | number:'1.0-0') + ' %' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="note">
              Le réalisé est une <strong>moyenne par joueur</strong> : c'est ce qui se compare à une
              cible individuelle. Une somme d'équipe varierait avec l'effectif présent.
            </p>
          </section>

          <section class="bloc">
            <h3>Semaine par semaine</h3>
            <table class="tbl">
              <thead>
                <tr>
                  <th>Sem.</th><th>Phase</th><th class="r">Prescrit</th>
                  <th class="r">Réalisé moyen</th><th class="r">Écart</th><th class="r">Atteint</th>
                </tr>
              </thead>
              <tbody>
                @for (s of data()!.semaines; track s.date_lundi) {
                  <tr>
                    <td>S{{ s.no_semaine }}
                      @if (s.nb_matchs > 1) { <span class="dm">{{ s.nb_matchs }} matchs</span> }
                    </td>
                    <td class="muted">{{ s.phase || '—' }}</td>
                    <td class="r">{{ km(s.prescrit_m) }}</td>
                    <td class="r">{{ km(s.realise_moyen_m) }}</td>
                    <td class="r" [class]="'ton-' + ton(s.ecart_pct)">
                      {{ s.ecart_pct == null ? '—' : (s.ecart_pct > 0 ? '+' : '') + (s.ecart_pct | number:'1.0-0') + ' %' }}
                    </td>
                    <td class="r muted">{{ s.nb_atteint }}/{{ s.nb_joueurs }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <!-- Les extrêmes, jamais la moyenne seule : c'est là que se prennent les décisions. -->
          @if (data()!.joueurs?.length) {
            <section class="bloc">
              <h3>Joueurs les plus en écart</h3>
              <table class="tbl">
                <thead>
                  <tr><th>Joueur</th><th>Poste</th><th class="r">Réalisé</th><th class="r">Écart</th><th class="r">Sem.</th></tr>
                </thead>
                <tbody>
                  @for (j of joueursAffiches(); track j.joueur_id) {
                    <tr>
                      <td>{{ j.prenom }} {{ j.nom }}</td>
                      <td class="muted">{{ j.poste }}</td>
                      <td class="r">{{ km(j.realise_m) }}</td>
                      <td class="r" [class]="'ton-' + ton(j.ecart_pct)">
                        {{ j.ecart_pct == null ? '—' : (j.ecart_pct > 0 ? '+' : '') + (j.ecart_pct | number:'1.0-0') + ' %' }}
                      </td>
                      <td class="r muted">{{ j.nb_semaines }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if ((data()!.joueurs?.length || 0) > 8) {
                <button class="lien" (click)="tousJoueurs.set(!tousJoueurs())">
                  {{ tousJoueurs() ? 'Réduire' : 'Voir les ' + data()!.joueurs!.length + ' joueurs' }}
                </button>
              }
            </section>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
               align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
    .modale { background: var(--surface, #fff); border-radius: 14px; width: min(860px, 100%);
              max-height: 92vh; overflow: auto; padding: 20px; }
    .mh { display: flex; align-items: flex-start; gap: 12px; }
    .mh__t { margin: 0; font-size: 1.15rem; }
    .mh__s { margin: 4px 0 0; color: #64748b; font-size: .85rem; }
    .mh__s em { font-style: normal; color: #b45309; }
    .ic { margin-left: auto; background: none; border: 0; cursor: pointer; color: inherit; }
    .vide { padding: 32px; text-align: center; color: #64748b; font-size: .9rem; }
    .verdict { margin: 16px 0; padding: 12px 14px; border-radius: 10px; font-size: .95rem;
               background: #dcfce7; color: #14532d; }
    .verdict--low { background: #fef3c7; color: #92400e; }
    .verdict strong { font-size: 1.3rem; }
    .verdict__pct { float: right; font-weight: 700; }
    .bloc { margin-top: 18px; }
    .bloc h3 { margin: 0 0 8px; font-size: .82rem; text-transform: uppercase;
               letter-spacing: .04em; color: #94a3b8; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .tbl th, .tbl td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; text-align: left; }
    .tbl th { font-size: .72rem; text-transform: uppercase; color: #94a3b8; }
    .r { text-align: right; font-variant-numeric: tabular-nums; }
    .muted { color: #94a3b8; }
    .dm { margin-left: 5px; font-size: .62rem; padding: 1px 5px; border-radius: 4px;
          background: #fef3c7; color: #92400e; font-weight: 700; }
    .note { margin-top: 6px; font-size: .76rem; color: #94a3b8; font-style: italic; }
    .lien { margin-top: 8px; background: none; border: 0; color: #2563eb; cursor: pointer;
            font-size: .8rem; padding: 0; }
    .ton-ok   { color: #15803d; font-weight: 700; }
    .ton-warn { color: #b45309; font-weight: 700; }
    .ton-bad  { color: #dc2626; font-weight: 700; }
    .ton-neutral { color: #64748b; }
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
