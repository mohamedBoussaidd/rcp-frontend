import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChoixArbitrage, ObjectifsService, SemaineArbitrage } from '@core/services/objectifs.service';

/**
 * Arbitrage d'une semaine à deux matchs.
 *
 * <p>Le malentendu que cet écran existe pour lever : la cible hebdomadaire du référentiel INCLUT
 * le match. Une deuxième rencontre ne relève donc pas la semaine — elle mange la part
 * d'entraînement. Sans arbitrage, le préparateur lit « 34 km » et croit disposer de 34 km
 * d'entraînement alors qu'il lui en reste 14.
 *
 * <p>Trois réponses, aucune bonne dans l'absolu : c'est une décision d'entraîneur, pas un calcul.
 * On les chiffre toutes les trois AVANT de choisir, parce qu'un choix dont on ne voit pas la
 * conséquence n'est pas un choix.
 */
@Component({
  selector: 'app-arbitrage-semaine',
  standalone: true,
  imports: [FormsModule, MatIconModule, DatePipe, DecimalPipe],
  template: `
    <div class="arb-overlay" (click)="fermerSiFond($event)">
      <div class="arb" role="dialog" aria-modal="true">

        <header class="arb-head">
          <div class="arb-head__txt">
            <h2 class="arb-head__t">Semaine à {{ etat()?.nbMatchs || 2 }} matchs</h2>
            <p class="arb-head__s">
              Semaine du {{ dateLundi | date:'dd MMMM' }}
              @if (etat()?.datesMatchs?.length) { · matchs le {{ datesLisibles() }} }
            </p>
          </div>
          @if (etat()?.matchDistanceM) {
            <div class="arb-cout">
              <span class="arb-cout__v">{{ (etat()!.matchDistanceM! * etat()!.nbMatchs) / 1000 | number:'1.1-1' }} km</span>
              <span class="arb-cout__l">coût estimé des matchs sur la cible</span>
            </div>
          }
          <button class="arb-ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
        </header>

        @if (chargement()) {
          <div class="arb-vide">Chargement…</div>
        } @else if (!etat()) {
          <div class="arb-vide">Impossible de lire cette semaine.</div>
        } @else {
          <div class="arb-corps">

            @if (etat()!.avertissement) {
              <div class="arb-alerte">{{ etat()!.avertissement }}</div>
            }

            <!-- Le rappel qui justifie tout l'écran : la cible inclut les matchs. -->
            <p class="arb-rappel">
              La cible hebdomadaire <strong>inclut les matchs</strong>.
              @if (etat()!.matchDistanceM) {
                Tant qu'aucune option n'est enregistrée, l'écran ne distingue pas ce qui revient au
                match de ce qui reste pour l'entraînement.
              } @else {
                Aucun référentiel adopté : la charge d'un match est inconnue, seul l'allègement reste possible.
              }
            </p>

            <div class="arb-choix">
              @for (o of OPTIONS; track o.code) {
                <button class="arb-opt" [class.arb-opt--on]="choix() === o.code"
                        [class.arb-opt--off]="!estPossible(o.code)"
                        [disabled]="!estPossible(o.code)"
                        (click)="choix.set(o.code)">
                  <span class="arb-opt__r"></span>
                  <span class="arb-opt__c">
                    <span class="arb-opt__h">
                      <strong>{{ o.titre }}</strong>
                      @if (o.code === 'ALLEGER') { <span class="badge badge--ok">proposé par défaut</span> }
                      @if (!estPossible(o.code)) { <span class="badge badge--neutral">indisponible</span> }
                    </span>
                    <span class="arb-opt__d">{{ o.description }}</span>
                    <span class="arb-opt__e">{{ effet(o.code) }}</span>
                    @if (!estPossible(o.code)) {
                      <span class="arb-opt__why">{{ pourquoiIndisponible(o.code) }}</span>
                    }

                    @if (o.code === 'RELISSER' && choix() === 'RELISSER') {
                      <span class="arb-cibles">
                        <span class="arb-kicker">Semaines cibles du report</span>
                        @if (etat()!.semainesCibles.length) {
                          @for (s of etat()!.semainesCibles; track s) {
                            <span class="arb-cible">semaine du {{ s | date:'dd/MM' }}</span>
                          }
                          @if (etat()!.periodeFin) {
                            <small>Le report ne franchit jamais la fin de la période
                              ({{ etat()!.periodeFin | date:'dd/MM' }}) : la suivante a ses propres phases.</small>
                          }
                        } @else {
                          <span class="arb-alerte arb-alerte--mini">
                            Aucune semaine cible disponible : la période se termine, il n'existe pas de
                            semaine suivante où relisser.
                          </span>
                        }
                      </span>
                    }
                  </span>
                </button>
              }
            </div>

            <label class="arb-note">
              <span class="arb-kicker">Note</span>
              <textarea [(ngModel)]="note" maxlength="300"
                        placeholder="Pourquoi cette décision — utile à la relecture du bilan de période."></textarea>
            </label>

            <!-- Ce que la décision a déjà produit : un ajustement doit être vérifiable. -->
            @if (etat()!.reports.length) {
              <div class="arb-reports">
                <div class="arb-reports__head">
                  <span class="arb-kicker">Reports enregistrés</span>
                  <span>un relissage déplace de la charge, il n'en crée ni n'en détruit</span>
                </div>
                <table class="arb-tbl">
                  <thead>
                    <tr><th>Semaine cible</th><th>Métrique</th><th class="r">Delta</th></tr>
                  </thead>
                  <tbody>
                    @for (r of etat()!.reports; track r.dateLundiCible + r.metrique) {
                      <tr>
                        <td>{{ r.dateLundiCible | date:'dd/MM' }}</td>
                        <td class="arb-tbl__m">{{ r.metrique }}</td>
                        <td class="r num" [class.arb-neg]="r.delta < 0">
                          {{ r.delta > 0 ? '+' : '' }}{{ r.delta / 1000 | number:'1.1-1' }} km
                        </td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2">Somme des deltas</td>
                      <td class="r num">{{ sommeReports() > 0 ? '+' : '' }}{{ sommeReports() / 1000 | number:'1.1-1' }} km</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            }
          </div>

          <footer class="arb-pied">
            @if (etat()!.choix) {
              <button class="btn btn--sm arb-retirer" (click)="annuler()" [disabled]="envoi()">
                Retirer l'arbitrage
              </button>
            }
            <span class="arb-sp"></span>
            <button class="btn btn--secondary" (click)="fermer.emit()">Fermer</button>
            <button class="btn btn--primary" (click)="enregistrer()"
                    [disabled]="envoi() || !choix() || !estPossible(choix()!)">
              {{ etat()!.choix ? 'Modifier la décision' : 'Enregistrer la décision' }}
            </button>
          </footer>
        }
      </div>
    </div>
  `,
  styles: [`
    .arb-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center;
                   padding: 24px; background: rgba(11, 18, 32, .5); }
    .arb { width: min(880px, 100%); max-height: 90vh; display: flex; flex-direction: column;
           background: var(--surface); border: 1px solid var(--border-strong);
           border-radius: var(--r-xl); box-shadow: var(--shadow-xl); overflow: hidden; }
    .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
    .r { text-align: right; }
    .arb-sp { flex: 1; }
    .arb-kicker { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
                  text-transform: uppercase; color: var(--text-4); }

    .arb-head { display: flex; align-items: flex-start; gap: 16px; padding: 15px 18px;
                border-bottom: 1px solid var(--border); }
    .arb-head__txt { flex: 1; min-width: 0; }
    .arb-head__t { margin: 0; font-size: 16px; font-weight: 700; }
    .arb-head__s { margin: 3px 0 0; font-size: 12.5px; color: var(--text-3); }
    .arb-cout { text-align: right; }
    .arb-cout__v { display: block; font-family: var(--font-num); font-size: 18px;
                   font-weight: 600; color: var(--cuivre); }
    .arb-cout__l { display: block; font-size: 11.5px; color: var(--text-4); }
    .arb-ic { width: 30px; height: 30px; display: grid; place-items: center; flex: none;
              border: 1px solid var(--border-strong); border-radius: var(--r-md);
              background: var(--surface); cursor: pointer; color: var(--text-2); }
    .arb-ic:hover { background: var(--surface-3); }

    .arb-vide { padding: 34px; text-align: center; color: var(--text-3); font-size: 13px; }
    .arb-corps { flex: 1; overflow: auto; padding: 15px 18px;
                 display: flex; flex-direction: column; gap: 12px; }

    .arb-alerte { padding: 9px 12px; border-radius: var(--r-md); font-size: 12.5px;
                  background: var(--warn-bg); border: 1px solid var(--warn-bd); color: var(--text-2); }
    .arb-alerte--mini { display: block; margin-top: 6px; }
    .arb-rappel { margin: 0; padding: 10px 12px; border-radius: var(--r-md);
                  background: var(--surface-2); border: 1px solid var(--border);
                  font-size: 12.5px; line-height: 1.55; color: var(--text-2); }

    .arb-choix { display: flex; flex-direction: column; gap: 9px; }
    .arb-opt { display: flex; align-items: flex-start; gap: 11px; text-align: left;
               padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--r-lg);
               background: var(--surface); cursor: pointer; font: inherit; color: inherit; }
    .arb-opt:hover { border-color: var(--border-strong); }
    .arb-opt--on { border-color: var(--green-500); border-width: 2px; padding: 11px 13px;
                   background: var(--green-50); }
    .arb-opt--off { opacity: .55; cursor: not-allowed; }
    .arb-opt__r { width: 17px; height: 17px; flex: none; margin-top: 2px;
                  border-radius: var(--r-pill); border: 2px solid var(--border-strong);
                  background: var(--surface); }
    .arb-opt--on .arb-opt__r { border-color: var(--green-600); background: var(--green-600);
                               box-shadow: inset 0 0 0 2px var(--surface); }
    .arb-opt__c { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .arb-opt__h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                  font-size: 13.5px; }
    .arb-opt__d { font-size: 12.5px; line-height: 1.55; color: var(--text-2); }
    .arb-opt__e { font-size: 12.5px; font-weight: 600; color: var(--text); }
    .arb-opt__why { font-size: 12px; color: var(--warn); background: var(--warn-bg);
                    border: 1px solid var(--warn-bd); border-radius: var(--r-md); padding: 6px 9px; }

    .arb-cibles { margin-top: 7px; padding-top: 9px; border-top: 1px dashed var(--border-strong);
                  display: block; font-size: 12.5px; }
    .arb-cible { display: inline-block; margin: 6px 6px 0 0; padding: 3px 9px;
                 border-radius: var(--r-pill); background: var(--surface);
                 border: 1px solid var(--border); }
    .arb-cibles small { display: block; margin-top: 7px; font-size: 11.5px; color: var(--text-3); }

    .arb-note { display: block; }
    .arb-note textarea { width: 100%; min-height: 62px; margin-top: 6px; resize: vertical;
                         padding: 9px 11px; border: 1px solid var(--border-strong);
                         border-radius: var(--r-md); background: var(--surface);
                         font: inherit; font-size: 12.5px; color: var(--text); }
    .arb-note textarea:focus { outline: none; border-color: var(--green-500); }

    .arb-reports__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
                         margin-bottom: 6px; }
    .arb-reports__head span:last-child { font-size: 12px; color: var(--text-3); }
    .arb-tbl { width: 100%; border-collapse: collapse; border: 1px solid var(--border);
               border-radius: var(--r-md); overflow: hidden; font-size: 12.5px; }
    .arb-tbl th { text-align: left; padding: 8px 11px; background: var(--surface-2);
                  border-bottom: 1px solid var(--border); font-size: 11.5px;
                  font-weight: 600; color: var(--text-2); }
    .arb-tbl td { padding: 8px 11px; border-bottom: 1px solid var(--border); }
    .arb-tbl__m { color: var(--text-2); }
    .arb-tbl tfoot td { background: var(--ok-bg); font-weight: 700; border-bottom: 0;
                        color: var(--ok); }
    .arb-neg { color: var(--bad); }

    .arb-pied { display: flex; align-items: center; gap: 9px; padding: 12px 18px;
                border-top: 1px solid var(--border); background: var(--surface-2); }
    .arb-retirer { background: var(--surface); color: var(--bad); border-color: var(--bad-bd); }
  `],
})
export class ArbitrageSemaineComponent implements OnInit {

  /** Lundi de la semaine à arbitrer (ISO yyyy-MM-dd). */
  @Input({ required: true }) dateLundi!: string;
  /** Cible hebdo lue à l'écran, en mètres : sert à chiffrer l'effet de chaque branche. */
  @Input() cibleSemaineM: number | null = null;
  @Output() fermer = new EventEmitter<void>();
  /** Émis après écriture : l'écran appelant recharge son panneau. */
  @Output() arbitre = new EventEmitter<void>();

  private service = inject(ObjectifsService);
  private snack = inject(MatSnackBar);

  readonly OPTIONS: { code: ChoixArbitrage; titre: string; description: string }[] = [
    { code: 'ALLEGER', titre: 'Alléger l\'entraînement',
      description: 'La cible de la semaine ne bouge pas : les deux matchs prennent leur part, il reste moins pour l\'entraînement.' },
    { code: 'ASSUMER', titre: 'Assumer la charge',
      description: 'La cible monte d\'un match : l\'entraînement reste au même niveau, la semaine sera plus lourde que prévu.' },
    { code: 'RELISSER', titre: 'Relisser sur les semaines suivantes',
      description: 'La cible baisse cette semaine et la différence part à parts égales sur les deux semaines suivantes de la période.' },
  ];

  etat = signal<SemaineArbitrage | null>(null);
  choix = signal<ChoixArbitrage | null>(null);
  note = '';
  chargement = signal(true);
  envoi = signal(false);

  ngOnInit(): void { this.charger(); }

  private charger(): void {
    this.chargement.set(true);
    this.service.arbitrageSemaine(this.dateLundi).subscribe({
      next: e => {
        this.etat.set(e);
        this.choix.set(e.choix ?? 'ALLEGER');   // le défaut est proposé, jamais appliqué en silence
        this.note = e.note ?? '';
        this.chargement.set(false);
      },
      error: () => { this.chargement.set(false); },
    });
  }

  /** Sans référentiel, on ne sait pas ce que coûte un match : rien à ajouter ni à déplacer. */
  estPossible(code: ChoixArbitrage): boolean {
    if (code === 'ALLEGER') return true;
    const e = this.etat();
    if (!e || !e.referentielAdopte) return false;
    return code !== 'RELISSER' || e.semainesCibles.length > 0;
  }

  /** Une option grisée sans raison se lit comme un bug : elle dit toujours pourquoi. */
  pourquoiIndisponible(code: ChoixArbitrage): string {
    const e = this.etat();
    if (!e || !e.referentielAdopte) {
      return 'Aucun référentiel adopté : la charge d\'un match est inconnue, on ne peut ni la rajouter ni la déplacer.';
    }
    if (code === 'RELISSER') {
      return `La période se termine${e.periodeFin ? ' le ' + new Date(e.periodeFin).toLocaleDateString('fr-FR') : ''} : il n'existe pas de semaine suivante où relisser.`;
    }
    return '';
  }

  /** Un relissage déplace de la charge : la somme doit rester nulle, et se vérifie ici. */
  sommeReports(): number {
    return (this.etat()?.reports ?? []).reduce((s, r) => s + r.delta, 0);
  }

  /** Effet chiffré d'une branche, en clair — un choix sans conséquence visible n'en est pas un. */
  effet(code: ChoixArbitrage): string {
    const e = this.etat();
    if (!e) return '';
    const cible = this.cibleSemaineM;
    const match = e.matchDistanceM;
    if (!match) return 'Effet non chiffrable sans référentiel adopté.';

    const km = (v: number) => (v / 1000).toFixed(1) + ' km';
    if (code === 'ALLEGER') {
      if (!cible) return `Les ${e.nbMatchs} matchs consomment ${km(match * e.nbMatchs)} de la semaine.`;
      return `Cible inchangée${cible ? ' (' + km(cible) + ')' : ''} → entraînement ${km(Math.max(0, cible - match * e.nbMatchs))}.`;
    }
    if (code === 'ASSUMER') {
      return cible
        ? `Cible ${km(cible)} → ${km(cible + match)} · entraînement inchangé (${km(Math.max(0, cible - match * (e.nbMatchs - 1)))}).`
        : `Cible relevée de ${km(match)}.`;
    }
    const n = e.semainesCibles.length || 2;
    return cible
      ? `Cible ${km(cible)} → ${km(Math.max(0, cible - match))} · +${km(match / n)} sur chacune des ${n} semaines suivantes.`
      : `−${km(match)} cette semaine, répartis sur les ${n} semaines suivantes.`;
  }

  datesLisibles(): string {
    const d = this.etat()?.datesMatchs ?? [];
    return d.map(x => new Date(x).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })).join(' et ');
  }

  enregistrer(): void {
    const c = this.choix();
    if (!c) return;
    this.envoi.set(true);
    this.service.arbitrer(this.dateLundi, c, this.note || null).subscribe({
      next: e => {
        this.etat.set(e);
        this.envoi.set(false);
        this.snack.open('Décision enregistrée.', 'OK', { duration: 2500 });
        this.arbitre.emit();
      },
      error: err => {
        this.envoi.set(false);
        this.snack.open(err?.error?.message || err?.error || 'Enregistrement impossible.', 'OK',
          { duration: 5000 });
      },
    });
  }

  annuler(): void {
    this.envoi.set(true);
    this.service.annulerArbitrage(this.dateLundi).subscribe({
      next: e => {
        this.etat.set(e);
        this.choix.set('ALLEGER');
        this.note = '';
        this.envoi.set(false);
        this.snack.open('Arbitrage retiré : la trajectoire d\'origine est rétablie.', 'OK',
          { duration: 3000 });
        this.arbitre.emit();
      },
      error: () => {
        this.envoi.set(false);
        this.snack.open('Suppression impossible.', 'OK', { duration: 4000 });
      },
    });
  }

  fermerSiFond(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).classList.contains('overlay')) this.fermer.emit();
  }
}
