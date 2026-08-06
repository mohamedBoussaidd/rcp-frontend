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
    <div class="overlay" (click)="fermerSiFond($event)">
      <div class="modale" role="dialog" aria-modal="true">

        <header class="mh">
          <div>
            <h2 class="mh__t">Semaine à {{ etat()?.nbMatchs || 2 }} matchs</h2>
            <p class="mh__s">
              Semaine du {{ dateLundi | date:'dd MMMM' }}
              @if (etat()?.datesMatchs?.length) {
                · matchs le {{ datesLisibles() }}
              }
            </p>
          </div>
          <button class="ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
        </header>

        @if (chargement()) {
          <div class="vide">Chargement…</div>
        } @else if (!etat()) {
          <div class="vide">Impossible de lire cette semaine.</div>
        } @else {

          @if (etat()!.avertissement) {
            <div class="alerte">{{ etat()!.avertissement }}</div>
          }

          <!-- Le rappel qui justifie tout l'écran : la cible inclut les matchs. -->
          <div class="rappel">
            <mat-icon>info</mat-icon>
            <p>
              La cible hebdomadaire <strong>inclut les matchs</strong>.
              @if (etat()!.matchDistanceM) {
                Ici, {{ etat()!.nbMatchs }} matchs représentent environ
                <strong>{{ (etat()!.matchDistanceM! * etat()!.nbMatchs) / 1000 | number:'1.1-1' }} km</strong>
                de la semaine — c'est autant de moins pour l'entraînement.
              } @else {
                Aucun référentiel adopté : la charge d'un match est inconnue, seul l'allègement reste possible.
              }
            </p>
          </div>

          <div class="choix">
            @for (o of OPTIONS; track o.code) {
              <button class="opt" [class.opt--on]="choix() === o.code"
                      [class.opt--off]="!estPossible(o.code)"
                      [disabled]="!estPossible(o.code)"
                      (click)="choix.set(o.code)">
                <div class="opt__h">
                  <span class="opt__r"></span>
                  <strong>{{ o.titre }}</strong>
                  @if (o.code === 'ALLEGER') { <em class="opt__def">proposé par défaut</em> }
                </div>
                <p class="opt__d">{{ o.description }}</p>
                <p class="opt__e">{{ effet(o.code) }}</p>
              </button>
            }
          </div>

          @if (choix() === 'RELISSER' && etat()!.semainesCibles.length) {
            <div class="cibles">
              Le report ira sur :
              @for (s of etat()!.semainesCibles; track s) {
                <span class="chip">semaine du {{ s | date:'dd/MM' }}</span>
              }
              @if (etat()!.periodeFin) {
                <small>Le report ne franchit jamais la fin de la période ({{ etat()!.periodeFin | date:'dd/MM' }}) :
                  la suivante a ses propres phases.</small>
              }
            </div>
          }
          @if (choix() === 'RELISSER' && !etat()!.semainesCibles.length) {
            <div class="alerte">La période se termine : aucune semaine ne peut recevoir le report.</div>
          }

          <label class="note">
            <span>Note (facultative)</span>
            <input type="text" [(ngModel)]="note" maxlength="300"
                   placeholder="Ex. : match de coupe, rotation prévue sur 8 joueurs">
          </label>

          <!-- Ce que la décision a déjà produit : un ajustement doit être vérifiable. -->
          @if (etat()!.reports.length) {
            <details class="reports">
              <summary>Ajustements en vigueur ({{ etat()!.reports.length }})</summary>
              <table>
                <tr><th>Semaine</th><th>Métrique</th><th class="r">Delta</th></tr>
                @for (r of etat()!.reports; track r.dateLundiCible + r.metrique) {
                  <tr>
                    <td>{{ r.dateLundiCible | date:'dd/MM' }}</td>
                    <td>{{ r.metrique }}</td>
                    <td class="r" [class.neg]="r.delta < 0">
                      {{ r.delta > 0 ? '+' : '' }}{{ r.delta / 1000 | number:'1.1-1' }} km
                    </td>
                  </tr>
                }
              </table>
            </details>
          }

          <footer class="mf">
            @if (etat()!.choix) {
              <button class="btn btn--ghost" (click)="annuler()" [disabled]="envoi()">
                Retirer l'arbitrage
              </button>
            }
            <span class="sp"></span>
            <button class="btn" (click)="fermer.emit()">Fermer</button>
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
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
               align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
    .modale { background: var(--surface, #fff); border-radius: 14px; width: min(720px, 100%);
              max-height: 92vh; overflow: auto; padding: 20px; }
    .mh { display: flex; align-items: flex-start; gap: 12px; }
    .mh__t { margin: 0; font-size: 1.15rem; }
    .mh__s { margin: 4px 0 0; color: var(--text-muted, #667); font-size: .86rem; }
    .ic { margin-left: auto; background: none; border: 0; cursor: pointer; color: inherit; }
    .vide { padding: 32px; text-align: center; color: var(--text-muted, #667); }
    .alerte { margin: 14px 0; padding: 10px 12px; border-radius: 8px; font-size: .86rem;
              background: rgba(240,170,60,.14); border: 1px solid rgba(240,170,60,.35); }
    .rappel { display: flex; gap: 10px; margin: 14px 0; padding: 10px 12px; border-radius: 8px;
              background: rgba(90,140,255,.10); }
    .rappel p { margin: 0; font-size: .86rem; line-height: 1.45; }
    .rappel mat-icon { font-size: 20px; width: 20px; height: 20px; opacity: .7; }
    .choix { display: grid; gap: 10px; }
    .opt { text-align: left; padding: 12px 14px; border-radius: 10px; cursor: pointer;
           border: 1px solid var(--border, #dde); background: var(--surface, #fff); }
    .opt--on { border-color: var(--primary, #3b6ef5); box-shadow: 0 0 0 2px rgba(59,110,245,.16); }
    .opt--off { opacity: .45; cursor: not-allowed; }
    .opt__h { display: flex; align-items: center; gap: 8px; }
    .opt__r { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border, #bbc); }
    .opt--on .opt__r { border-color: var(--primary, #3b6ef5); background: var(--primary, #3b6ef5); }
    .opt__def { font-size: .72rem; color: var(--text-muted, #778); font-style: normal; }
    .opt__d { margin: 6px 0 0 20px; font-size: .84rem; color: var(--text-muted, #667); }
    .opt__e { margin: 4px 0 0 20px; font-size: .84rem; font-weight: 600; }
    .cibles { margin-top: 12px; font-size: .85rem; }
    .cibles small { display: block; margin-top: 4px; color: var(--text-muted, #778); }
    .chip { display: inline-block; margin: 0 4px; padding: 2px 8px; border-radius: 999px;
            background: rgba(90,140,255,.14); font-size: .8rem; }
    .note { display: block; margin-top: 14px; font-size: .85rem; }
    .note span { display: block; margin-bottom: 4px; color: var(--text-muted, #667); }
    .note input { width: 100%; padding: 8px 10px; border-radius: 8px;
                  border: 1px solid var(--border, #dde); background: transparent; color: inherit; }
    .reports { margin-top: 14px; font-size: .84rem; }
    .reports table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .reports th, .reports td { padding: 4px 6px; border-bottom: 1px solid var(--border, #eee); }
    .r { text-align: right; }
    .neg { color: #c25; }
    .mf { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
    .sp { flex: 1; }
    .btn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border, #dde);
           background: transparent; cursor: pointer; color: inherit; font-size: .88rem; }
    .btn--primary { background: var(--primary, #3b6ef5); color: #fff; border-color: transparent; }
    .btn--ghost { color: #c25; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
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
