import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ObjectifsService, Metrique, ModeleResume, ModeleDetail, Phase, PhaseValeur, Priorite,
} from '@core/services/objectifs.service';
import { InfoBulleComponent } from '@shared/components/info-bulle/info-bulle.component';
import { INFOBULLES_OBJECTIFS } from './infobulles-objectifs';
import { ObjectifCourbeModeleComponent } from './objectif-courbe-modele.component';

const TYPES = [
  { v: 'PREPARATION', l: 'Préparation' },
  { v: 'COMPETITION', l: 'Compétition' },
  { v: 'REPRISE', l: 'Reprise' },
];

const PRIORITES: { v: Priorite; l: string; court: string; aide: string }[] = [
  { v: 'SECONDAIRE', l: 'Secondaire', court: 'SEC',
    aide: 'Secondaire — absorbe la baisse en premier, la monnaie d\'échange.' },
  { v: 'IMPORTANT', l: 'Important', court: 'IMP',
    aide: 'Important — réduit seulement une fois le secondaire épuisé.' },
  { v: 'INTOUCHABLE', l: 'Intouchable', court: 'INT',
    aide: 'Intouchable — jamais réduit. Si c\'est impossible, l\'application le dit.' },
];

/**
 * Bibliothèque des modèles d'objectif du club : la FORME d'une période, sans ses kilomètres.
 *
 * <p>Un modèle ne contient que des phases et des pourcentages de la cible du référentiel. C'est ce
 * qui lui permet de servir à la fois un club N1 et un club régional — chacun obtient ses propres
 * mètres. Le pourcentage n'est jamais une contrainte de saisie : il ne se voit qu'ici, dans la
 * définition de la forme.
 *
 * <p>Le <b>poids de durée</b> est une part relative, jamais un nombre de semaines : c'est lui qui
 * fait qu'une même préparation tient sur 6, 9 ou 3 semaines sans que le pic soit raboté ni la
 * décharge diluée.
 */
@Component({
  selector: 'app-modele-objectif-editeur',
  standalone: true,
  imports: [FormsModule, MatIconModule, InfoBulleComponent, ObjectifCourbeModeleComponent],
  template: `
    <div class="omo">

      <!-- Onglets de modèles : la bibliothèque du club tient sur une ligne, et le modèle ouvert
           se voit sans avoir à balayer une liste latérale. -->
      <div class="omo-tabs">
        @for (m of modeles(); track m.id) {
          <button class="omo-tab" [class.omo-tab--on]="courant()?.entete?.id === m.id"
                  (click)="ouvrir(m)">
            <span class="omo-tab__nom">{{ m.nom }}</span>
            <span class="omo-tab__meta">
              <span class="num">{{ m.nbUtilisations }}</span> utilisation{{ m.nbUtilisations > 1 ? 's' : '' }}
              · {{ libType(m.typePeriode) }}
            </span>
          </button>
        }
        <button class="omo-tab omo-tab--neuf" (click)="nouveau()">
          <mat-icon>add</mat-icon> Nouveau modèle
        </button>
      </div>

      @if (courant(); as c) {
        <div class="omo-barre">
          <input class="omo-nom" [(ngModel)]="nom" maxlength="160"
                 placeholder="ex. Prépa — progression classique">
          <select class="omo-select" [(ngModel)]="typePeriode"
                  [title]="aide.typePeriodeModele">
            @for (t of types; track t.v) { <option [value]="t.v">{{ t.l }}</option> }
          </select>
          <app-info-bulle [texte]="aide.typePeriodeModele" />
          <button class="btn btn--primary" (click)="sauver()">Enregistrer</button>
          @if (c.entete.id) {
            <button class="btn btn--danger" (click)="supprimer(c.entete)">Supprimer</button>
          }
        </div>

        @if (c.entete.nbUtilisations > 0) {
          <div class="omo-note">
            <mat-icon>warning</mat-icon>
            <span>Ce modèle est déjà utilisé par <strong>{{ c.entete.nbUtilisations }}</strong>
              période(s). Modifier ses phases ne touche pas au <strong>Retenu</strong> déjà
              calculé : il faudra <strong>Recalculer</strong> période par période à l'étape 3.</span>
          </div>
        }

        <div class="omo-corps">
          <div class="omo-gauche">
            <app-objectif-courbe-modele [phases]="phases()" [metriques]="metriques"
                                        (majPct)="surCourbe($event)" />

            @if (phases().length > 0) {
              <div class="omo-simul">
                <div class="omo-simul__head">
                  <h4>Simulation de répartition <app-info-bulle [texte]="aide.simulationRepartition" /></h4>
                  <span>combien de semaines tombent dans chaque phase selon la durée de la période</span>
                </div>
                <div class="omo-simul__wrap">
                  <table class="omo-tbl">
                    <thead>
                      <tr>
                        <th>Phase</th>
                        @for (n of dureesTest; track n) { <th class="c">{{ n }} sem.</th> }
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of phases(); track $index; let i = $index) {
                        <tr>
                          <td>{{ p.nom || '—' }}</td>
                          @for (n of dureesTest; track n) {
                            <td class="c num" [class.omo-zero]="repartition(n)[i] === 0">
                              {{ repartition(n)[i] === 0 ? '—' : repartition(n)[i] }}
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="omo-simul__pied">
                  Un tiret signale une phase qui disparaît faute de semaines. Une phase marquée
                  <strong>INTOUCHABLE</strong> sur une métrique garde ses pourcentages même quand
                  la période est allégée.
                </p>
              </div>
            }
          </div>

          <div class="omo-droite">
            <div class="omo-ph__head">
              <h4>Phases</h4>
              <span class="num omo-ph__compte">{{ phases().length }}</span>
              <app-info-bulle [texte]="aide.phase" />
              <span class="omo-spacer"></span>
              <button class="btn btn--ghost btn--sm" (click)="basculerToutes()">
                {{ toutReplie() ? 'Tout déplier' : 'Tout replier' }}
              </button>
            </div>

            <div class="omo-phases">
              @for (p of phases(); track $index; let i = $index) {
                <div class="omo-phase">
                  <div class="omo-phase__head" [style.background]="couleurPhase(p.nom)">
                    <button class="omo-ic" [title]="estReplie(i) ? 'Déplier' : 'Replier'"
                            (click)="basculer(i)">
                      <mat-icon>{{ estReplie(i) ? 'chevron_right' : 'expand_more' }}</mat-icon>
                    </button>
                    <input class="omo-phase__nom" [(ngModel)]="p.nom" placeholder="Nom de la phase">
                    @if (estReplie(i)) { <span class="omo-resume num">{{ resumePhase(p) }}</span> }
                    <label class="omo-poids">
                      <span>poids<app-info-bulle [texte]="aide.poidsDuree" /></span>
                      <input type="number" min="1" max="9" [(ngModel)]="p.poidsDuree">
                    </label>
                    <span class="omo-phase__act">
                      <button class="omo-ic" title="Monter" (click)="deplacer(i, -1)" [disabled]="i === 0">
                        <mat-icon>arrow_upward</mat-icon>
                      </button>
                      <button class="omo-ic" title="Descendre" (click)="deplacer(i, 1)"
                              [disabled]="i === phases().length - 1"><mat-icon>arrow_downward</mat-icon></button>
                      <button class="omo-ic omo-ic--sup" title="Supprimer" (click)="retirerPhase(i)">
                        <mat-icon>close</mat-icon>
                      </button>
                    </span>
                  </div>

                  @if (!estReplie(i)) {
                    <table class="omo-tbl omo-tbl--phase">
                      <thead>
                        <tr>
                          <th>Métrique <app-info-bulle [texte]="aide.pourcentageParMetrique" /></th>
                          <th class="r">Début % <app-info-bulle [texte]="aide.pourcentages" /></th>
                          <th class="r">Fin %</th>
                          <th>Priorité <app-info-bulle [texte]="aide.priorite" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (m of metriques; track m.code) {
                          <tr>
                            <td>
                              <span class="omo-m">{{ m.libelle }}</span>
                              @if (m.nature === 'EXPOSITION') {
                                <span class="omo-cible"
                                      title="Ici le pourcentage EST la cible : % du record personnel, pas un % du référentiel.">cible directe</span>
                              }
                            </td>
                            <td class="r">
                              <input type="number" class="omo-mini" [ngModel]="lire(p, m.code, 'debut')"
                                     (ngModelChange)="ecrire(p, m.code, 'debut', $event)">
                            </td>
                            <td class="r">
                              <input type="number" class="omo-mini" [ngModel]="lire(p, m.code, 'fin')"
                                     (ngModelChange)="ecrire(p, m.code, 'fin', $event)">
                            </td>
                            <td>
                              <span class="omo-prios">
                                @for (pr of priorites; track pr.v) {
                                  <button type="button" class="omo-prio"
                                          [attr.data-prio]="pr.v"
                                          [class.omo-prio--on]="lirePriorite(p, m.code) === pr.v"
                                          [title]="pr.aide"
                                          (click)="ecrirePriorite(p, m.code, pr.v)">{{ pr.court }}</button>
                                }
                              </span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
              }

              <button class="omo-ajout" (click)="ajouterPhase()">
                <mat-icon>add</mat-icon> Ajouter une phase
              </button>
            </div>
          </div>
        </div>
      } @else {
        <p class="omo-vide">
          Choisissez un modèle ci-dessus, ou créez-en un : c'est la forme que prendra la montée en
          charge de vos périodes.
        </p>
      }
    </div>
  `,
  styles: [`
    .omo { display: flex; flex-direction: column; gap: 16px; }
    .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
    .omo-spacer { flex: 1; }
    .omo-vide { margin: 0; padding: 26px 0; font-size: 13px; color: var(--text-4); max-width: 70ch; }

    /* ── Onglets de modèles ── */
    .omo-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px;
                border-bottom: 1px solid var(--border); }
    .omo-tab { flex: none; text-align: left; padding: 9px 13px; border-radius: var(--r-md);
               border: 1px solid var(--border); background: var(--surface);
               cursor: pointer; font: inherit; color: inherit; }
    .omo-tab:hover { border-color: var(--border-strong); }
    .omo-tab--on { border-color: var(--green-500); background: var(--green-50);
                   box-shadow: 0 0 0 2px var(--green-100); }
    .omo-tab__nom { display: block; font-size: 13.5px; font-weight: 600; }
    .omo-tab--on .omo-tab__nom { color: var(--green-800); }
    .omo-tab__meta { display: block; font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
    .omo-tab--neuf { display: inline-flex; align-items: center; gap: 7px;
                     border-style: dashed; border-color: var(--border-strong);
                     color: var(--green-700); font-size: 13px; font-weight: 600; }
    .omo-tab--neuf:hover { background: var(--green-50); border-color: var(--green-400); }
    .omo-tab--neuf mat-icon { font-size: 16px; width: 16px; height: 16px; }

    /* ── Barre d'identité du modèle ── */
    .omo-barre { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .omo-nom { flex: 1; min-width: 240px; padding: 8px 11px; border: 1px solid var(--border-strong);
               border-radius: var(--r-sm); background: var(--surface);
               font: inherit; font-size: 14.5px; font-weight: 600; color: var(--text); }
    .omo-select { padding: 8px 10px; border: 1px solid var(--border-strong);
                  border-radius: var(--r-sm); background: var(--surface);
                  font: inherit; font-size: 13px; color: var(--text); }

    .omo-note { display: flex; align-items: flex-start; gap: 10px; padding: 10px 13px;
                border: 1px solid var(--warn-bd); background: var(--warn-bg);
                border-radius: var(--r-md); font-size: 12.5px; line-height: 1.55;
                color: var(--text-2); }
    .omo-note mat-icon { flex: none; color: var(--warn); font-size: 16px; width: 16px; height: 16px;
                         margin-top: 1px; }
    .omo-note strong { font-weight: 600; color: var(--text); }

    /* ── Deux colonnes : le dessin à gauche, les nombres à droite ── */
    .omo-corps { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
    .omo-gauche { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
    .omo-droite { flex: 1 1 440px; min-width: 0; }

    /* ── Simulation ── */
    .omo-simul__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
                       margin-bottom: 9px; }
    .omo-simul__head h4 { margin: 0; font-size: 13.5px; font-weight: 600;
                          display: inline-flex; align-items: center; gap: 5px; }
    .omo-simul__head span { font-size: 12.5px; color: var(--text-3); }
    .omo-simul__wrap { border: 1px solid var(--border); border-radius: var(--r-lg);
                       overflow: auto; background: var(--surface); }
    .omo-simul__pied { margin: 7px 2px 0; font-size: 11.5px; line-height: 1.55; color: var(--text-3); }
    .omo-simul__pied strong { font-weight: 700; color: var(--text-2); }
    .omo-zero { color: var(--warn); }

    /* ── Tables ── */
    .omo-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .omo-tbl th { text-align: left; padding: 8px 11px; background: var(--surface-2);
                  border-bottom: 1px solid var(--border-strong); font-size: 10px;
                  letter-spacing: .07em; text-transform: uppercase; color: var(--text-3);
                  font-weight: 700; white-space: nowrap; }
    .omo-tbl td { padding: 6px 11px; border-bottom: 1px solid var(--border); }
    .omo-tbl .r { text-align: right; }
    .omo-tbl .c { text-align: center; }
    .omo-tbl--phase { border-top: 1px solid var(--border); }
    .omo-tbl--phase th { padding: 6px 11px; border-bottom: 1px solid var(--border); }
    .omo-tbl--phase td { padding: 4px 11px; }
    .omo-m { font-size: 12.5px; }
    .omo-cible { margin-left: 5px; font-size: 9.5px; padding: 1px 5px; border-radius: var(--r-pill);
                 background: var(--cuivre); color: #fff; cursor: help; }

    /* ── Cartes de phase ── */
    .omo-ph__head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-bottom: 9px; }
    .omo-ph__head h4 { margin: 0; font-size: 13.5px; font-weight: 600; }
    .omo-ph__compte { font-size: 11.5px; color: var(--text-3); }
    .omo-phases { display: flex; flex-direction: column; gap: 8px; }
    .omo-phase { border: 1px solid var(--border); border-radius: var(--r-lg);
                 background: var(--surface); overflow: hidden; box-shadow: var(--shadow-xs); }
    .omo-phase__head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
    .omo-phase__nom { flex: 1; min-width: 6rem; padding: 4px 6px; border: 1px solid transparent;
                      border-radius: var(--r-sm); background: transparent;
                      font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text); }
    .omo-phase__nom:hover, .omo-phase__nom:focus { border-color: var(--border-strong);
                                                   background: var(--surface); outline: none; }
    .omo-resume { font-size: 12px; color: var(--text-2); background: var(--surface-3);
                  padding: 2px 8px; border-radius: var(--r-pill); white-space: nowrap; }
    .omo-poids { display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
                 color: var(--text-3); white-space: nowrap; }
    .omo-poids span { display: inline-flex; align-items: center; gap: 2px; }
    .omo-poids input { width: 42px; padding: 3px 5px; border: 1px solid var(--border-strong);
                       border-radius: var(--r-sm); background: var(--surface);
                       font-family: var(--font-num); font-size: 12px; text-align: center;
                       color: var(--text); }
    .omo-phase__act { display: inline-flex; gap: 1px; }
    .omo-ic { width: 24px; height: 24px; display: grid; place-items: center; flex: none;
              border: 0; background: none; cursor: pointer; color: var(--text-3);
              border-radius: var(--r-sm); }
    .omo-ic:hover { background: var(--surface-3); color: var(--text); }
    .omo-ic:disabled { opacity: .3; cursor: default; }
    .omo-ic mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .omo-ic--sup:hover { background: var(--bad-bg); color: var(--bad); }

    /* Trois boutons plutôt qu'un menu : les trois priorités se comparent d'un regard,
       et le choix courant se voit sans ouvrir quoi que ce soit. */
    .omo-prios { display: inline-flex; gap: 2px; }
    .omo-prio { padding: 2px 7px; border-radius: var(--r-sm); border: 1px solid var(--border);
                background: var(--surface); color: var(--text-4); cursor: pointer;
                font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .03em; }
    .omo-prio:hover { border-color: var(--border-strong); color: var(--text-2); }
    .omo-prio--on[data-prio="SECONDAIRE"] { background: var(--surface-3); color: var(--text-2);
                                            border-color: var(--border-strong); }
    .omo-prio--on[data-prio="IMPORTANT"] { background: var(--info-bg); color: var(--info);
                                           border-color: var(--info-bd); }
    .omo-prio--on[data-prio="INTOUCHABLE"] { background: var(--ok-bg); color: var(--ok);
                                             border-color: var(--ok-bd); }

    .omo-mini { width: 58px; padding: 4px 6px; border: 1px solid var(--border);
                border-radius: var(--r-sm); background: var(--surface);
                font-family: var(--font-num); font-size: 12px; text-align: right; color: var(--text); }
    .omo-mini:focus { border-color: var(--green-500); outline: none; }

    .omo-ajout { display: flex; align-items: center; justify-content: center; gap: 8px;
                 padding: 11px; border-radius: var(--r-lg); border: 1px dashed var(--border-strong);
                 background: none; cursor: pointer; font: inherit; font-size: 13px;
                 font-weight: 600; color: var(--green-700); }
    .omo-ajout:hover { background: var(--green-50); border-color: var(--green-400); }
    .omo-ajout mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `],
})
export class ModeleObjectifEditeurComponent implements OnInit {

  @Input({ required: true }) metriques: Metrique[] = [];
  @Output() change = new EventEmitter<void>();

  private api = inject(ObjectifsService);
  private snack = inject(MatSnackBar);

  readonly types = TYPES;
  readonly priorites = PRIORITES;
  readonly aide = INFOBULLES_OBJECTIFS;
  /** Durées témoins de la simulation : les cas qui font échouer un modèle en semaines fixes. */
  readonly dureesTest = [3, 4, 6, 7, 9];

  modeles = signal<ModeleResume[]>([]);
  courant = signal<ModeleDetail | null>(null);
  phases = signal<Phase[]>([]);
  nom = '';
  typePeriode = 'PREPARATION';

  /** Phases repliées, par index. Un modèle à 4 phases × 7 métriques tient sinon sur deux écrans. */
  private replies = signal<Set<number>>(new Set());

  estReplie(i: number): boolean { return this.replies().has(i); }

  basculer(i: number): void {
    this.replies.update(s => {
      const copie = new Set(s);
      if (copie.has(i)) copie.delete(i); else copie.add(i);
      return copie;
    });
  }

  toutReplie(): boolean {
    const n = this.phases().length;
    return n > 0 && this.replies().size >= n;
  }

  basculerToutes(): void {
    this.replies.set(this.toutReplie() ? new Set() : new Set(this.phases().map((_, i) => i)));
  }

  /**
   * Une poignée de la courbe vient d'être déplacée. La phase est désignée par son index et non
   * par sa référence : la courbe ne connaît que la position, et c'est suffisant tant que le
   * tableau n'est pas réordonné en cours de glissement (impossible, un seul geste à la fois).
   */
  surCourbe(e: { index: number; metrique: string; borne: 'debut' | 'fin'; valeur: number }): void {
    const p = this.phases()[e.index];
    if (!p) return;
    this.ecrire(p, e.metrique, e.borne, e.valeur);
  }

  /** Résumé d'une phase repliée : sa courbe de volume, la seule ligne qu'on veut voir de loin. */
  resumePhase(p: Phase): string {
    const v = p.valeurs.find(x => x.metrique === 'distance_totale');
    if (!v || v.pctDebut == null) return '';
    return v.pctDebut === v.pctFin ? `${v.pctDebut} %` : `${v.pctDebut} → ${v.pctFin} %`;
  }

  ngOnInit(): void { this.recharger(); }

  private recharger(): void {
    this.api.modeles().subscribe({
      next: m => this.modeles.set(m),
      error: () => this.modeles.set([]),
    });
  }

  ouvrir(m: ModeleResume): void {
    this.api.modele(m.id).subscribe({
      next: d => {
        this.courant.set(d);
        this.nom = d.entete.nom;
        this.typePeriode = d.entete.typePeriode;
        this.phases.set(d.phases.map(p => ({ ...p, valeurs: [...p.valeurs] })));
        // Tout replié à l'ouverture : 4 phases × 7 métriques dépliées, c'est deux écrans de
        // tableaux avant d'avoir vu la forme du modèle.
        this.replies.set(new Set(d.phases.map((_, i) => i)));
      },
      error: e => this.erreur(e),
    });
  }

  /**
   * Nouveau modèle. On le pré-remplit d'un nom et d'une première phase : un panneau vide donne
   * l'impression que le bouton n'a rien fait, et laisse l'utilisateur devant une page blanche
   * alors qu'il ne sait pas encore ce qu'est une phase.
   */
  nouveau(): void {
    this.courant.set({
      entete: { id: '', nom: '', typePeriode: 'PREPARATION', nbPhases: 0, nbUtilisations: 0, updatedAt: '' },
      phases: [],
    });
    this.nom = 'Nouveau modèle';
    this.typePeriode = 'PREPARATION';
    this.replies.set(new Set());
    this.phases.set([]);
    this.ajouterPhase();
  }

  ajouterPhase(): void {
    this.phases.update(l => [...l, {
      id: null, ordre: l.length, nom: `Phase ${l.length + 1}`, poidsDuree: 1,
      valeurs: this.metriques.map(m => ({
        metrique: m.code, pctDebut: 100, pctFin: 100,
        priorite: (m.nature === 'EXPOSITION' ? 'INTOUCHABLE' : 'IMPORTANT') as Priorite,
      })),
    }]);
  }

  retirerPhase(i: number): void {
    this.phases.update(l => l.filter((_, k) => k !== i));
  }

  deplacer(i: number, delta: number): void {
    this.phases.update(l => {
      const copie = [...l];
      const j = i + delta;
      if (j < 0 || j >= copie.length) return copie;
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie.map((p, k) => ({ ...p, ordre: k }));
    });
  }

  // ── Valeurs par métrique ──

  private valeurDe(p: Phase, metrique: string): PhaseValeur | undefined {
    return p.valeurs.find(v => v.metrique === metrique);
  }

  lire(p: Phase, metrique: string, borne: 'debut' | 'fin'): number | null {
    const v = this.valeurDe(p, metrique);
    return borne === 'debut' ? (v?.pctDebut ?? null) : (v?.pctFin ?? null);
  }

  ecrire(p: Phase, metrique: string, borne: 'debut' | 'fin', val: number | null): void {
    let v = this.valeurDe(p, metrique);
    if (!v) {
      v = { metrique, pctDebut: null, pctFin: null, priorite: 'IMPORTANT' };
      p.valeurs.push(v);
    }
    if (borne === 'debut') v.pctDebut = val; else v.pctFin = val;
    // La phase est mutée en place (le [(ngModel)] du tableau y compte) : on réémet quand même le
    // signal, sinon la courbe — qui lit `phases()` en entrée — ne redessinerait pas pendant un
    // glissement de poignée.
    this.phases.update(l => [...l]);
  }

  lirePriorite(p: Phase, metrique: string): Priorite {
    return this.valeurDe(p, metrique)?.priorite ?? 'IMPORTANT';
  }

  ecrirePriorite(p: Phase, metrique: string, val: Priorite): void {
    let v = this.valeurDe(p, metrique);
    if (!v) {
      v = { metrique, pctDebut: null, pctFin: null, priorite: val };
      p.valeurs.push(v);
      return;
    }
    v.priorite = val;
  }

  aidePriorite(p: Priorite): string {
    return PRIORITES.find(x => x.v === p)?.aide ?? '';
  }

  /**
   * Répartition simulée côté client — miroir exact de l'algorithme du back : plancher d'une
   * semaine par phase, plus grand reste ensuite, et suppression des phases INTERMÉDIAIRES de plus
   * faible poids quand la période est trop courte (la première et la dernière sont protégées).
   */
  repartition(nbSemaines: number): number[] {
    const phases = this.phases();
    if (phases.length === 0) return [];
    const n = Math.max(1, nbSemaines);
    let retenus = phases.map((_, i) => i);

    while (retenus.length > n && retenus.length > 1) {
      let pos = -1, poidsMin = Number.MAX_SAFE_INTEGER;
      for (let k = 1; k < retenus.length - 1; k++) {
        const w = Math.max(1, phases[retenus[k]].poidsDuree);
        if (w < poidsMin) { poidsMin = w; pos = k; }
      }
      if (pos < 0) pos = retenus.length - 1;
      retenus = retenus.filter((_, k) => k !== pos);
    }

    const total = retenus.reduce((s, i) => s + Math.max(1, phases[i].poidsDuree), 0);
    const base: number[] = [], frac: number[] = [], planchee: boolean[] = [];
    let somme = 0;
    retenus.forEach((i, k) => {
      const exact = n * Math.max(1, phases[i].poidsDuree) / total;
      let p = Math.floor(exact);
      planchee[k] = p < 1;
      if (p < 1) p = 1;
      base[k] = p; frac[k] = exact - Math.floor(exact); somme += p;
    });

    let reste = n - somme;
    if (reste > 0) {
      const ordre = retenus.map((_, k) => k).filter(k => !planchee[k])
        .sort((a, b) => frac[b] - frac[a] || a - b);
      for (let i = 0; i < reste; i++) {
        if (ordre.length === 0) { base[0]++; continue; }
        base[ordre[i % ordre.length]]++;
      }
    } else if (reste < 0) {
      for (let i = 0; i < -reste; i++) {
        let plusLongue = 0;
        for (let k = 1; k < base.length; k++) if (base[k] > base[plusLongue]) plusLongue = k;
        if (base[plusLongue] > 1) base[plusLongue]--;
      }
    }

    return phases.map((_, i) => {
      const k = retenus.indexOf(i);
      return k < 0 ? 0 : base[k];
    });
  }

  // ── Persistance ──

  sauver(): void {
    if (!this.nom.trim()) {
      this.snack.open('Le nom est obligatoire.', 'OK', { duration: 3000 });
      return;
    }
    const c = this.courant();
    const phases = this.phases().map((p, i) => ({ ...p, ordre: i }));
    const suite = c?.entete.id
      ? this.api.majModele(c.entete.id, this.nom.trim(), this.typePeriode, phases)
      : this.api.creerModele(this.nom.trim(), this.typePeriode, phases);
    suite.subscribe({
      next: d => {
        this.courant.set(d);
        this.phases.set(d.phases.map(p => ({ ...p, valeurs: [...p.valeurs] })));
        this.recharger();
        this.change.emit();
        this.snack.open('Modèle enregistré.', 'OK', { duration: 3000 });
      },
      error: e => this.erreur(e),
    });
  }

  supprimer(m: ModeleResume): void {
    if (!confirm(`Supprimer « ${m.nom} » ?\n\nLes périodes qui l'utilisent gardent leurs valeurs : elles ont été figées à la génération.`)) return;
    this.api.supprimerModele(m.id).subscribe({
      next: () => {
        this.courant.set(null);
        this.recharger();
        this.change.emit();
        this.snack.open('Modèle supprimé.', 'OK', { duration: 3000 });
      },
      error: e => this.erreur(e),
    });
  }

  libType(t: string): string { return TYPES.find(x => x.v === t)?.l ?? t; }

  couleurPhase(nom: string): string {
    let h = 0;
    for (let i = 0; i < (nom || '').length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360;
    return `hsl(${h}, 62%, 93%)`;
  }

  private erreur(e: { error?: { message?: string } }): void {
    this.snack.open(e?.error?.message || 'Opération impossible.', 'OK', { duration: 5000 });
  }
}
