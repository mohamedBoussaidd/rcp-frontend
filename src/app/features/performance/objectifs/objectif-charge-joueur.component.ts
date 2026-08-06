import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PredictionService, TrajectoireJoueur, SemaineTrajectoire } from '@core/services/prediction.service';
import { ObjectifsService, Metrique } from '@core/services/objectifs.service';

/** Une semaine mise à l'échelle de la règle : tout est déjà en pourcentage de largeur. */
interface LigneSemaine {
  no: number;
  date: string;
  matchs: number;
  passee: boolean;
  hab: number | null;
  attMin: number | null;
  attMax: number | null;
  ret: number | null;
  rea: number | null;
  habTxt: string;
  attTxt: string;
  retTxt: string;
  reaTxt: string;
  ecart: number | null;
  ton: 'ok' | 'warn' | 'bad' | 'neutre';
  habPct: string;
  attLeft: string;
  attWidth: string;
  retLeft: string;
  reaWidth: string;
  tenue: boolean | null;
}

/** Un bloc de semaines consécutives partageant la même phase du modèle. */
interface BlocPhase {
  nom: string;
  plage: string;
  nb: number;
  moyRet: string;
  moyRea: string;
  tenues: number;
  evaluees: number;
  aVenir: boolean;
  semaines: LigneSemaine[];
}

/**
 * Onglet « Objectif de charge » de la fiche joueur : la trajectoire de la période, semaine par
 * semaine, sur une seule règle.
 *
 * <p>Ce que le tableau d'équipe ne peut pas montrer : la FORME dans le temps. Une ligne de
 * tableau dit « il est 25 % sous son poste cette semaine » ; la règle dit s'il remonte, s'il
 * stagne depuis deux mois, ou s'il vient de décrocher — trois situations qui n'appellent pas la
 * même conversation.
 *
 * <p>Chaque semaine porte ses quatre grandeurs sur la même échelle horizontale : le losange
 * <b>Habituel</b>, la bande <b>Attendu</b>, le trait <b>Retenu</b> et la barre <b>Réalisé</b>.
 * Une courbe à quatre séries obligeait à faire l'aller-retour entre le graphique et le tableau
 * pour répondre à « de combien il a manqué » ; ici la réponse est sur la ligne.
 *
 * <p>Habituel n'est pas le réalisé : c'est la moyenne des quatre semaines qui précèdent, la même
 * grandeur que la charge chronique ailleurs dans l'application. Sans ça, « Habituel » et
 * « Réalisé » seraient la même courbe décalée et l'écran ne dirait rien. Le back ne le calcule
 * que sur la distance totale : sur les autres métriques, le losange est simplement absent.
 */
@Component({
  selector: 'app-objectif-charge-joueur',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="tab-content ocj">
      @if (chargement()) {
        <p class="ocj-vide">Chargement…</p>
      } @else if (!data()?.disponible) {
        <div class="ocj-empty">
          <span class="ocj-empty__ic"><mat-icon>event_busy</mat-icon></span>
          <h3>{{ data()?.erreur || 'Aucune période de saison ne couvre cette date' }}</h3>
          <p>
            Sans période, la trajectoire du joueur n'a pas de cadre : ni phase, ni nombre de
            semaines, ni objectif retenu à comparer. Les périodes se posent dans
            <strong>Performance › Objectifs de performance</strong>.
          </p>
        </div>
      } @else {

        <header class="ocj-head">
          <div class="ocj-head__gauche">
            <div class="ocj-titres">
              <span class="ocj-periode">{{ data()!.periode!.libelle }}</span>
              <span class="badge badge--info">{{ data()!.periode!.type }}</span>
              <span class="ocj-meta">
                <span class="num">{{ data()!.nb_semaines }}</span> semaines · {{ plage() }}
              </span>
              <button class="ocj-defs" (click)="defs.set(!defs())">
                <mat-icon>info</mat-icon>
                {{ defs() ? 'Masquer les définitions' : 'Habituel / Attendu / Retenu' }}
              </button>
            </div>

            @if (data()!.nb_semaines_evaluees) {
              <div class="ocj-score">
                <span class="badge badge--fort" [class]="'badge badge--fort badge--' + tonScore()">
                  <span class="num">{{ data()!.nb_semaines_tenues }} / {{ data()!.nb_semaines_evaluees }}</span>
                </span>
                <span class="ocj-score__txt">semaines tenues — {{ phraseScore() }}</span>
              </div>
            }
          </div>

          <!-- Les six métriques de la trajectoire. Toutes sont servies par l'API : le sélecteur
               n'est pas un décor. -->
          @if (metriques().length > 1) {
            <div class="segmented ocj-metriques">
              @for (m of metriques(); track m.code) {
                <button [class.is-active]="metrique() === m.code" [title]="m.libelle"
                        (click)="metrique.set(m.code)">{{ court(m) }}</button>
              }
            </div>
          }
        </header>

        @if (defs()) {
          <div class="ocj-lex">
            <div class="ocj-lex__i">
              <span class="ocj-lex__t"><i class="ocj-trait ocj-trait--hab"></i>Habituel</span>
              <p>La moyenne des 4 semaines qui précèdent — sa charge chronique, pas le réalisé de
                 la semaine. Calculé sur la distance totale uniquement.</p>
            </div>
            <div class="ocj-lex__i">
              <span class="ocj-lex__t"><i class="ocj-trait ocj-trait--att"></i>Attendu</span>
              <p>Ce qu'un joueur de son poste fait normalement au niveau du référentiel adopté.
                 Sur la distance totale, c'est une fourchette min–max ; ailleurs, une valeur.</p>
            </div>
            <div class="ocj-lex__i">
              <span class="ocj-lex__t"><i class="ocj-trait ocj-trait--ret"></i>Retenu</span>
              <p>Ce qui a été prescrit pour cette semaine par l'objectif de période, arbitrages de
                 semaines à plusieurs matchs compris.</p>
            </div>
          </div>
        }

        @if (!data()!.referentiel_actif) {
          <div class="ocj-warn">
            <mat-icon>warning</mat-icon>
            <div>
              <strong>Aucun référentiel adopté</strong>
              <span>La bande <b>Attendu</b> restera vide sur toutes les semaines.</span>
            </div>
          </div>
        }

        <!-- En-tête de colonnes + règle graduée : l'échelle se lit une fois pour tout l'écran. -->
        <div class="ocj-cols">
          <div class="ocj-cols__lib">{{ libMetrique() }} · {{ uniteMetrique() }}</div>
          <div class="ocj-regle">
            @for (g of graduations(); track g.pct) {
              <span class="ocj-regle__t num" [style.left]="g.pct">{{ g.label }}</span>
            }
          </div>
          <div class="r ocj-cols__h ocj-cols__h--hab">Habituel</div>
          <div class="r ocj-cols__h ocj-cols__h--att">Attendu</div>
          <div class="r ocj-cols__h ocj-cols__h--ret">Retenu</div>
          <div class="r ocj-cols__h ocj-cols__h--rea">Réalisé</div>
          <div class="r ocj-cols__h">Écart</div>
        </div>

        <div class="ocj-phases">
          @for (p of blocs(); track p.nom + p.plage) {
            <section class="ocj-phase">
              <div class="ocj-phase__head">
                <div class="ocj-phase__gauche">
                  <span class="ocj-phase__nom">{{ p.nom }}</span>
                  <span class="ocj-phase__meta num">{{ p.plage }} · {{ p.nb }} sem.</span>
                  @if (p.aVenir) { <span class="badge badge--neutral">à venir</span> }
                </div>
                <div class="ocj-phase__droite">
                  <span class="ocj-phase__moy">
                    Moyenne <b class="num ocj-c-ret">{{ p.moyRet }}</b> retenu ·
                    <b class="num ocj-c-rea">{{ p.moyRea }}</b> réalisé
                  </span>
                  @if (p.evaluees > 0) {
                    <span class="badge" [class]="'badge badge--' + tonBloc(p)">
                      <span class="num">{{ p.tenues }}/{{ p.evaluees }}</span> tenues
                    </span>
                  }
                </div>
              </div>

              @for (s of p.semaines; track s.no) {
                <div class="ocj-sem" [class.ocj-sem--futur]="!s.passee">
                  <div class="ocj-sem__id">
                    <span class="num ocj-sem__no">S{{ s.no }}</span>
                    <span class="ocj-sem__date">{{ s.date }}</span>
                    @if (s.matchs > 1) {
                      <span class="badge badge--warn" title="Semaine à plusieurs matchs">{{ s.matchs }} matchs</span>
                    } @else if (s.matchs === 1) {
                      <span class="badge badge--ok">match</span>
                    }
                  </div>

                  <!-- La règle : quatre repères, une seule échelle. -->
                  <div class="ocj-piste">
                    @if (s.attMin != null) {
                      <span class="ocj-att" [style.left]="s.attLeft" [style.width]="s.attWidth"></span>
                    }
                    @if (s.rea != null) {
                      <span class="ocj-rea" [style.width]="s.reaWidth"></span>
                    }
                    @if (s.ret != null) {
                      <span class="ocj-ret" [style.left]="s.retLeft"></span>
                    }
                    @if (s.hab != null) {
                      <span class="ocj-hab" [style.left]="s.habPct"></span>
                    }
                  </div>

                  <div class="r num ocj-c-hab">{{ s.habTxt }}</div>
                  <div class="r num ocj-c-att">{{ s.attTxt }}</div>
                  <div class="r num ocj-c-ret">{{ s.retTxt }}</div>
                  <div class="r num ocj-c-rea">{{ s.reaTxt }}</div>
                  <div class="r">
                    @if (s.ecart != null) {
                      <span class="badge" [class]="'badge badge--' + s.ton">
                        <span class="num">{{ s.ecart > 0 ? '+' : '' }}{{ s.ecart }} %</span>
                      </span>
                    } @else if (!s.passee) {
                      <span class="badge badge--neutral">à venir</span>
                    } @else {
                      <span class="ocj-muted">—</span>
                    }
                  </div>
                </div>
              }
            </section>
          }
        </div>

        <div class="ocj-legende">
          <span class="ocj-lg"><i class="ocj-hab ocj-hab--lg"></i>Habituel</span>
          <span class="ocj-lg"><i class="ocj-att ocj-att--lg"></i>Attendu{{ bandeAttendu() ? ' (min–max)' : '' }}</span>
          <span class="ocj-lg"><i class="ocj-ret ocj-ret--lg"></i>Retenu</span>
          <span class="ocj-lg"><i class="ocj-rea ocj-rea--lg"></i>Réalisé</span>
          <span class="ocj-legende__note">
            Habituel démarre bas sur les 4 premières semaines : c'est une moyenne des 4 semaines
            précédentes, en partie sur l'intersaison. Les semaines à venir n'ont pas de Réalisé.
            @if (!bandeAttendu()) {
              Sur cette métrique, le référentiel ne donne qu'une valeur d'Attendu — pas de fourchette
              ni d'Habituel.
            }
          </span>
        </div>

        <div class="ocj-suite">
          <mat-icon>arrow_forward</mat-icon>
          <span>
            La lecture d'équipe, toutes positions confondues, est dans
            <strong>Performance › Charge d'entraînement</strong>, onglet <strong>Objectif</strong>.
            La configuration se règle depuis <strong>Objectifs de performance</strong>.
          </span>
        </div>
      }
    </div>
  `,
  styles: [`
    .ocj { display: flex; flex-direction: column; gap: 16px; }
    .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
    .r { text-align: right; }
    .ocj-muted { color: var(--text-4); }
    .ocj-vide { padding: 26px; text-align: center; color: var(--text-3); font-size: 13px; }

    /* Grille commune à l'en-tête de colonnes et à chaque ligne de semaine : c'est elle qui
       garantit que la règle de la ligne 12 est à la même échelle que celle de la ligne 1. */
    .ocj-cols, .ocj-sem { display: grid;
                          grid-template-columns: 180px minmax(0, 1fr) 66px 96px 66px 66px 92px;
                          gap: 12px; align-items: center; }

    /* ── En-tête ── */
    .ocj-head { display: flex; align-items: flex-end; justify-content: space-between;
                gap: 18px; flex-wrap: wrap; padding-bottom: 14px;
                border-bottom: 1px solid var(--border); }
    .ocj-head__gauche { display: flex; flex-direction: column; gap: 8px; }
    .ocj-titres { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ocj-periode { font-size: 19px; font-weight: 600; letter-spacing: -.015em; }
    .ocj-meta { font-size: 12.5px; color: var(--text-3); }
    .ocj-defs { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px;
                border: 1px solid var(--border-strong); border-radius: var(--r-pill);
                background: var(--surface); cursor: pointer; font: inherit;
                font-size: 12px; font-weight: 600; color: var(--text-2); }
    .ocj-defs:hover { border-color: var(--green-300); color: var(--green-800); }
    .ocj-defs mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .ocj-score { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ocj-score__txt { font-size: 13px; color: var(--text-2); }
    .ocj-metriques { flex-wrap: wrap; }

    /* ── Définitions dépliables ── */
    .ocj-lex { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
               padding: 16px 18px; background: var(--slate-50);
               border: 1px solid var(--border); border-radius: var(--r-lg); }
    .ocj-lex__i { display: flex; flex-direction: column; gap: 5px; }
    .ocj-lex__t { display: inline-flex; align-items: center; gap: 8px;
                  font-size: 14px; font-weight: 600; }
    .ocj-lex__i p { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--text-2); }
    .ocj-trait { width: 16px; height: 3px; border-radius: var(--r-pill); flex: none; }
    .ocj-trait--hab { background: var(--slate-400); }
    .ocj-trait--att { background: var(--info); }
    .ocj-trait--ret { background: var(--cuivre); }

    .ocj-warn { display: flex; align-items: flex-start; gap: 12px; padding: 13px 16px;
                background: var(--warn-bg); border: 1px solid var(--warn-bd);
                border-radius: var(--r-lg); }
    .ocj-warn mat-icon { color: var(--warn); flex: none; }
    .ocj-warn div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .ocj-warn strong { color: var(--warn); }
    .ocj-warn span { color: var(--text-2); }

    /* ── En-tête de colonnes + règle ── */
    .ocj-cols { padding: 0 16px; }
    .ocj-cols__lib { font-size: 11px; font-weight: 700; letter-spacing: .08em;
                     text-transform: uppercase; color: var(--text-4); }
    .ocj-cols__h { font-size: 10.5px; font-weight: 700; letter-spacing: .06em;
                   text-transform: uppercase; color: var(--text-4); }
    .ocj-cols__h--hab { color: var(--slate-500); }
    .ocj-cols__h--att { color: var(--info); }
    .ocj-cols__h--ret { color: var(--cuivre); }
    .ocj-cols__h--rea { color: var(--green-700); }
    .ocj-regle { position: relative; height: 16px; }
    .ocj-regle__t { position: absolute; top: 0; transform: translateX(-50%);
                    font-size: 11px; color: var(--text-4); white-space: nowrap; }

    /* ── Cartes de phase ── */
    .ocj-phases { display: flex; flex-direction: column; gap: 12px; }
    .ocj-phase { border: 1px solid var(--border); border-radius: var(--r-lg);
                 overflow: hidden; background: var(--surface); }
    .ocj-phase__head { display: flex; align-items: center; justify-content: space-between;
                       gap: 14px; flex-wrap: wrap; padding: 11px 16px;
                       border-bottom: 1px solid var(--border); background: var(--surface-2); }
    .ocj-phase__gauche, .ocj-phase__droite { display: flex; align-items: center; gap: 12px;
                                             flex-wrap: wrap; }
    .ocj-phase__nom { font-size: 14.5px; font-weight: 600; letter-spacing: -.01em; }
    .ocj-phase__meta { font-size: 12px; color: var(--text-3); }
    .ocj-phase__moy { font-size: 12.5px; color: var(--text-3); }

    /* ── Ligne de semaine ── */
    .ocj-sem { padding: 10px 16px; border-top: 1px solid var(--border); }
    .ocj-sem:first-of-type { border-top: 0; }
    /* Une semaine à venir n'a pas de réalisé : on la grise plutôt que d'afficher un zéro. */
    .ocj-sem--futur { opacity: .62; }
    .ocj-sem__id { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ocj-sem__no { font-size: 13.5px; font-weight: 600; }
    .ocj-sem__date { font-size: 12px; color: var(--text-3); }

    .ocj-piste { position: relative; height: 32px; border-radius: var(--r-sm);
                 background: var(--surface-3); }
    .ocj-att { position: absolute; top: 0; bottom: 0; border-radius: var(--r-sm);
               background: var(--info-bg); border-left: 1px solid var(--info-bd);
               border-right: 1px solid var(--info-bd); }
    .ocj-rea { position: absolute; left: 0; top: 10px; height: 12px;
               border-radius: var(--r-xs); background: var(--green-600); }
    .ocj-ret { position: absolute; top: 3px; bottom: 3px; width: 3px;
               border-radius: var(--r-pill); background: var(--cuivre); }
    .ocj-hab { position: absolute; top: 11px; width: 9px; height: 9px;
               transform: rotate(45deg); background: var(--surface);
               border: 2px solid var(--slate-400); }

    .ocj-c-hab { color: var(--slate-500); font-size: 12.5px; }
    .ocj-c-att { color: var(--info); font-size: 12.5px; }
    .ocj-c-ret { color: var(--cuivre); font-size: 12.5px; font-weight: 600; }
    .ocj-c-rea { color: var(--green-700); font-size: 12.5px; font-weight: 600; }

    /* ── Légende ── */
    .ocj-legende { display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
                   padding: 13px 16px; background: var(--surface-2);
                   border: 1px solid var(--border); border-radius: var(--r-lg); }
    .ocj-lg { display: inline-flex; align-items: center; gap: 8px;
              font-size: 12.5px; font-weight: 600; color: var(--text-2); }
    .ocj-hab--lg { position: static; width: 9px; height: 9px; }
    .ocj-att--lg { position: static; width: 24px; height: 13px; }
    .ocj-ret--lg { position: static; width: 3px; height: 14px; }
    .ocj-rea--lg { position: static; width: 22px; height: 9px; }
    .ocj-legende__note { flex: 1; min-width: 280px; font-size: 12px; line-height: 1.55;
                         color: var(--text-3); }

    .ocj-suite { display: flex; align-items: center; gap: 12px; padding: 13px 16px;
                 background: var(--green-50); border: 1px solid var(--green-200);
                 border-radius: var(--r-lg); font-size: 13px; line-height: 1.55;
                 color: var(--text-2); }
    .ocj-suite mat-icon { color: var(--green-700); flex: none; }
    .ocj-suite strong { color: var(--green-800); font-weight: 600; }

    .ocj-empty { max-width: 620px; margin: 30px auto; text-align: center; padding: 30px;
                 border: 1px dashed var(--border-strong); border-radius: var(--r-xl);
                 background: var(--surface-2); }
    .ocj-empty__ic { width: 42px; height: 42px; margin: 0 auto 12px; display: grid;
                     place-items: center; border-radius: var(--r-pill);
                     background: var(--warn-bg); border: 1px solid var(--warn-bd); }
    .ocj-empty__ic mat-icon { color: var(--warn); }
    .ocj-empty h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
    .ocj-empty p { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--text-2); }

    @media (max-width: 1100px) {
      .ocj-cols { display: none; }
      .ocj-sem { grid-template-columns: 150px minmax(0, 1fr) repeat(4, 60px) 84px; gap: 8px; }
      .ocj-lex { grid-template-columns: 1fr; }
    }
  `],
})
export class ObjectifChargeJoueurComponent implements OnInit {

  @Input({ required: true }) joueurId!: string;

  private predictions = inject(PredictionService);
  private objectifs = inject(ObjectifsService);

  data = signal<TrajectoireJoueur | null>(null);
  chargement = signal(true);
  defs = signal(false);
  metrique = signal('distance_totale');
  private catalogue = signal<Metrique[]>([]);

  ngOnInit(): void {
    this.predictions.getTrajectoireJoueur(this.joueurId).subscribe({
      next: d => { this.data.set(d); this.chargement.set(false); },
      error: () => { this.chargement.set(false); },
    });
    // Les libellés et unités viennent du catalogue plutôt que d'une table recopiée ici : le
    // vocabulaire des métriques appartient au back, et deux listes finiraient par diverger.
    this.objectifs.catalogue().subscribe({
      next: c => this.catalogue.set(c.metriques ?? []),
      error: () => this.catalogue.set([]),
    });
  }

  /**
   * Métriques réellement servies par la trajectoire. On les déduit de la première semaine plutôt
   * que de les lister en dur : le jour où le back en ajoute une, elle apparaît toute seule.
   */
  metriques = computed<Metrique[]>(() => {
    const s = this.data()?.semaines?.[0];
    if (!s?.metriques) return [];
    const codes = Object.keys(s.metriques);
    const cat = this.catalogue();
    return codes
      .map(c => cat.find(m => m.code === c) ?? { code: c, libelle: c, unite: '', nature: 'CUMUL', principale: false, ordre: 99 } as Metrique)
      .sort((a, b) => a.ordre - b.ordre);
  });

  /** Libellé court pour le segment : le nom complet tient dans le title. */
  court(m: Metrique): string {
    if (m.code === 'distance_totale') return 'Distance';
    return m.libelle.replace(/^Distance\s*/i, '').trim() || m.libelle;
  }

  libMetrique = computed(() =>
    this.metriques().find(m => m.code === this.metrique())?.libelle ?? 'Distance totale');

  uniteMetrique = computed(() => this.metrique() === 'distance_totale' ? 'km'
    : (this.metriques().find(m => m.code === this.metrique())?.unite || 'nb'));

  /** Seule la distance totale a une fourchette Attendu et un Habituel : le back s'arrête là. */
  bandeAttendu = computed(() => this.metrique() === 'distance_totale');

  plage(): string {
    const p = this.data()?.periode;
    if (!p) return '';
    return `${this.jour(p.date_debut)} → ${this.jour(p.date_fin)}`;
  }

  tonScore(): string {
    const d = this.data();
    if (!d?.nb_semaines_evaluees) return 'neutral';
    const t = (d.nb_semaines_tenues ?? 0) / d.nb_semaines_evaluees;
    return t >= 0.75 ? 'ok' : t >= 0.5 ? 'warn' : 'bad';
  }

  phraseScore(): string {
    const d = this.data();
    if (!d?.nb_semaines_evaluees) return '';
    const t = Math.round((d.nb_semaines_tenues ?? 0) / d.nb_semaines_evaluees * 100);
    if (t >= 75) return `${t} % des semaines évaluées sont au niveau prescrit.`;
    if (t >= 50) return `${t} % seulement : la charge décroche régulièrement du prescrit.`;
    return `${t} % : le prescrit n'est presque jamais atteint, l'objectif est peut-être hors d'échelle.`;
  }

  tonBloc(p: BlocPhase): string {
    if (!p.evaluees) return 'neutral';
    const t = p.tenues / p.evaluees;
    return t >= 0.75 ? 'ok' : t >= 0.5 ? 'warn' : 'bad';
  }

  // ── Échelle ──

  /**
   * Plafond de la règle : la plus grande valeur affichée, avec 8 % de marge pour qu'une barre
   * pleine ne touche jamais le bord (elle se lirait comme un dépassement).
   */
  private echelle = computed<number>(() => {
    let max = 0;
    for (const s of this.data()?.semaines ?? []) {
      const v = this.valeurs(s);
      for (const x of [v.hab, v.attMax, v.ret, v.rea]) if (x != null && x > max) max = x;
    }
    return max > 0 ? max * 1.08 : 1;
  });

  graduations = computed(() => {
    const max = this.echelle();
    return [0.25, 0.5, 0.75, 1].map(f => ({
      pct: `${f * 100}%`,
      label: this.fmt(max * f),
    }));
  });

  // ── Lecture d'une semaine dans la métrique choisie ──

  private valeurs(s: SemaineTrajectoire): {
    hab: number | null; attMin: number | null; attMax: number | null;
    ret: number | null; rea: number | null;
  } {
    if (this.metrique() === 'distance_totale') {
      return {
        hab: s.habituel_m, attMin: s.attendu_min_m,
        attMax: s.attendu_max_m ?? s.attendu_min_m,
        ret: s.retenu_m, rea: s.passee ? s.realise_m : null,
      };
    }
    const m = s.metriques?.[this.metrique()];
    if (!m) return { hab: null, attMin: null, attMax: null, ret: null, rea: null };
    return {
      hab: null, attMin: m.attendu, attMax: m.attendu,
      ret: m.retenu, rea: s.passee ? m.realise : null,
    };
  }

  /**
   * Regroupement par phase. Les semaines sont consécutives et déjà ordonnées : on coupe au
   * changement de nom plutôt que de regrouper par clé, sinon deux passages distincts d'une même
   * phase (rare, mais possible) fusionneraient en un bloc qui ne correspond à aucune réalité.
   */
  blocs = computed<BlocPhase[]>(() => {
    const d = this.data();
    if (!d?.semaines?.length) return [];
    const max = this.echelle();
    const out: BlocPhase[] = [];

    for (const s of d.semaines) {
      const nom = s.phase || 'Hors phase';
      const v = this.valeurs(s);
      const ecart = v.ret && v.rea != null ? Math.round((v.rea - v.ret) / v.ret * 100) : null;
      const pct = (x: number | null) => `${Math.max(0, Math.min(100, (x ?? 0) / max * 100))}%`;

      const ligne: LigneSemaine = {
        no: s.no_semaine, date: this.jour(s.date_lundi), matchs: s.nb_matchs, passee: s.passee,
        hab: v.hab, attMin: v.attMin, attMax: v.attMax, ret: v.ret, rea: v.rea,
        habTxt: v.hab == null ? '—' : this.fmt(v.hab),
        attTxt: v.attMin == null ? '—'
          : (v.attMax != null && v.attMax !== v.attMin
              ? `${this.fmt(v.attMin)}–${this.fmt(v.attMax)}` : this.fmt(v.attMin)),
        retTxt: v.ret == null ? '—' : this.fmt(v.ret),
        reaTxt: v.rea == null ? '—' : this.fmt(v.rea),
        ecart,
        ton: ecart == null ? 'neutre' : ecart >= -5 ? 'ok' : ecart >= -20 ? 'warn' : 'bad',
        habPct: pct(v.hab), attLeft: pct(v.attMin),
        attWidth: `${Math.max(0.6, ((v.attMax ?? 0) - (v.attMin ?? 0)) / max * 100)}%`,
        retLeft: pct(v.ret), reaWidth: pct(v.rea),
        tenue: v.ret && v.rea != null ? v.rea >= v.ret : null,
      };

      const dernier = out[out.length - 1];
      if (dernier && dernier.nom === nom) dernier.semaines.push(ligne);
      else out.push({ nom, plage: '', nb: 0, moyRet: '—', moyRea: '—',
                      tenues: 0, evaluees: 0, aVenir: false, semaines: [ligne] });
    }

    for (const b of out) {
      const ss = b.semaines;
      b.nb = ss.length;
      b.plage = ss.length > 1 ? `S${ss[0].no}–S${ss[ss.length - 1].no}` : `S${ss[0].no}`;
      b.aVenir = ss.every(s => !s.passee);
      b.evaluees = ss.filter(s => s.tenue != null).length;
      b.tenues = ss.filter(s => s.tenue === true).length;
      b.moyRet = this.moyenne(ss.map(s => s.ret));
      b.moyRea = this.moyenne(ss.filter(s => s.passee).map(s => s.rea));
    }
    return out;
  });

  private moyenne(vals: (number | null)[]): string {
    const v = vals.filter((x): x is number => x != null);
    if (v.length === 0) return '—';
    return this.fmt(v.reduce((s, x) => s + x, 0) / v.length);
  }

  /** La distance totale se lit en km partout ailleurs dans l'application : elle le reste ici. */
  private fmt(v: number): string {
    if (this.metrique() === 'distance_totale') return `${(v / 1000).toFixed(1)} km`;
    const u = this.metriques().find(m => m.code === this.metrique())?.unite ?? '';
    return u ? `${Math.round(v)} ${u}` : `${Math.round(v)}`;
  }

  private jour(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
}
