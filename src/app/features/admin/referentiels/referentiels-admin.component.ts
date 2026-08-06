import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ObjectifsService, CatalogueReferentiels, ReferentielResume, ReferentielDetail,
  ValeurRef, Metrique, PosteRef, UsageReferentiel, ClubUtilisateur, EcartResponse,
} from '@core/services/objectifs.service';

type Contexte = 'MATCH' | 'SEMAINE';
type Onglet = 'apercu' | 'objectifs' | 'versions' | 'clubs';

/**
 * Catalogue des référentiels de charge de la PLATEFORME (super-admin).
 *
 * <p>Même famille que les schémas globaux et les rôles globaux : on publie ici, les clubs
 * consomment. Toute l'ergonomie découle d'une règle : <b>un référentiel publié ne se modifie
 * pas</b>. Le bouton « Modifier » n'existe donc pas sur un publié — il est remplacé par
 * « Nouvelle version », et c'est volontairement le geste le plus visible de l'écran.
 *
 * <p>Sans cette règle, corriger une valeur déplacerait l'« Attendu » de tous les clubs d'un coup :
 * un joueur passerait de vert à rouge un lundi matin sans que personne n'ait rien fait.
 */
@Component({
  selector: 'app-referentiels-admin',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  template: `
    <div class="ref-admin">
      <header class="page-head">
        <div>
          <h1 class="page-head__title">Référentiels d'objectifs</h1>
          <p class="page-head__sub">
            Les normes de charge mises à disposition des clubs : ce qui est « normal » pour un poste,
            à un niveau donné. Un club les adopte telles quelles ou en duplique une copie qu'il adapte.
          </p>
        </div>
        <div class="page-head__actions">
          <button class="btn btn--primary" (click)="ouvrirCreation()">
            <mat-icon>add</mat-icon> Nouveau référentiel
          </button>
        </div>
      </header>

      @if (creation()) {
        <section class="card card--creation">
          <h2 class="card__title">Nouveau référentiel</h2>
          <p class="card__hint">
            Il naît en brouillon et vide. Renseignez ses valeurs, puis publiez-le pour le rendre
            adoptable.
          </p>
          <div class="creation__form">
            <label class="field"><span>Nom</span>
              <input [(ngModel)]="nouveauNom" placeholder="ex. National 1 GPS 2027" maxlength="160">
            </label>
            <label class="field"><span>Niveau</span>
              <input [(ngModel)]="nouveauNiveau" placeholder="ex. N1" maxlength="20">
            </label>
            <button class="btn btn--primary" (click)="creer()" [disabled]="!nouveauNom.trim()">Créer</button>
            <button class="btn" (click)="creation.set(false)">Annuler</button>
          </div>
        </section>
      }

      <nav class="tabs">
        <button class="tabs__item" [class.tabs__item--on]="vue() === 'catalogue'"
                (click)="vue.set('catalogue')">Catalogue</button>
        <button class="tabs__item" [class.tabs__item--on]="vue() === 'usage'"
                (click)="chargerUsage()">Utilisation par les clubs</button>
      </nav>

      <!-- ─────────────── Catalogue ─────────────── -->
      @if (vue() === 'catalogue') {
        <section class="card">
          @if (referentiels().length === 0) {
            <p class="vide">Aucun référentiel. Créez-en un pour démarrer le catalogue.</p>
          } @else {
            <table class="tbl">
              <thead>
                <tr>
                  <th>Nom</th><th>Niveau</th><th class="num">Version</th>
                  <th>Statut</th><th class="num">Clubs</th><th class="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (r of referentiels(); track r.id) {
                  <tr [class.tr--on]="selection()?.entete?.id === r.id"
                      [class.tr--archive]="r.statut === 'ARCHIVE'">
                    <td class="nom">{{ r.nom }}</td>
                    <td>{{ r.niveau || '—' }}</td>
                    <td class="num"><span class="ver">v{{ r.version }}</span></td>
                    <td><span class="badge" [class]="'badge--' + tonStatut(r.statut)">{{ libStatut(r.statut) }}</span></td>
                    <td class="num">{{ r.nbAdoptions }}</td>
                    <td class="num actions">
                      <button class="ic" title="Ouvrir" (click)="ouvrir(r)"><mat-icon>visibility</mat-icon></button>
                      @if (r.statut === 'PUBLIE') {
                        <button class="ic" title="Ouvrir une nouvelle version" (click)="nouvelleVersion(r)">
                          <mat-icon>difference</mat-icon>
                        </button>
                      }
                      @if (r.statut === 'BROUILLON') {
                        <button class="ic ic--go" title="Publier" (click)="publier(r)"><mat-icon>publish</mat-icon></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <!-- ─────────────── Détail ─────────────── -->
        @if (selection(); as d) {
          <section class="card card--detail">
            <header class="detail__head">
              <div>
                <h2 class="card__title">
                  {{ d.entete.nom }}
                  <span class="ver ver--big">v{{ d.entete.version }}</span>
                  <span class="badge" [class]="'badge--' + tonStatut(d.entete.statut)">{{ libStatut(d.entete.statut) }}</span>
                </h2>
                @if (d.entete.statut === 'PUBLIE') {
                  <p class="card__hint">
                    Ce référentiel est publié, donc <strong>immuable</strong>. Pour corriger une valeur,
                    ouvrez une nouvelle version : les clubs resteront sur la leur jusqu'à ce qu'ils
                    décident de migrer.
                  </p>
                }
              </div>
              <div class="detail__actions">
                @if (d.entete.statut === 'PUBLIE') {
                  <button class="btn btn--primary" (click)="nouvelleVersion(d.entete)">
                    <mat-icon>difference</mat-icon> Nouvelle version
                  </button>
                }
                @if (d.entete.statut === 'BROUILLON') {
                  <button class="btn btn--primary" (click)="enregistrer()">Enregistrer</button>
                  <button class="btn btn--go" (click)="publier(d.entete)"><mat-icon>publish</mat-icon> Publier</button>
                }
                <button class="ic" title="Fermer" (click)="selection.set(null)"><mat-icon>close</mat-icon></button>
              </div>
            </header>

            <nav class="tabs tabs--sub">
              <button class="tabs__item" [class.tabs__item--on]="onglet() === 'apercu'"
                      (click)="onglet.set('apercu')">Vue d'ensemble</button>
              <button class="tabs__item" [class.tabs__item--on]="onglet() === 'objectifs'"
                      (click)="onglet.set('objectifs')">Objectifs</button>
              <button class="tabs__item" [class.tabs__item--on]="onglet() === 'versions'"
                      (click)="onglet.set('versions')">Historique des versions</button>
              <button class="tabs__item" [class.tabs__item--on]="onglet() === 'clubs'"
                      (click)="chargerClubs(d.entete.id)">Clubs utilisateurs</button>
            </nav>

            @if (onglet() === 'apercu') {
              <div class="apercu">
                <dl class="infos">
                  <dt>Niveau</dt><dd>{{ d.entete.niveau || '—' }}</dd>
                  <dt>Postes renseignés</dt><dd>{{ postesRenseignes().length }}</dd>
                  <dt>Métriques</dt><dd>{{ metriques().length }}</dd>
                  <dt>Contextes</dt><dd>Match / Semaine</dd>
                  <dt>Cases remplies</dt><dd>{{ d.valeurs.length }}</dd>
                  <dt>Clubs épinglés</dt><dd>{{ d.entete.nbAdoptions }}</dd>
                </dl>
                <div class="heat">
                  <h3 class="sous-titre">Exigence relative par poste — semaine</h3>
                  <p class="card__hint">
                    Une norme n'a ni bon ni mauvais : la couleur compare les postes <em>entre eux</em>,
                    ligne par ligne. Plus c'est foncé, plus le poste est exigeant sur cette métrique.
                  </p>
                  <table class="tbl tbl--heat">
                    <thead>
                      <tr><th>Métrique</th>
                        @for (p of postesRenseignes(); track p.code) { <th class="num">{{ p.libelle }}</th> }
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of metriques(); track m.code) {
                        <tr>
                          <td class="nom">{{ m.libelle }}</td>
                          @for (p of postesRenseignes(); track p.code) {
                            <td class="num cell" [style.background]="teinte(m.code, p.code)">
                              {{ affiche(valeur(p.code, 'SEMAINE', m.code), m) }}
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            @if (onglet() === 'objectifs') {
              <div class="grille">
                <div class="grille__head">
                  <div class="seg">
                    @for (c of contextes; track c) {
                      <button class="seg__item" [class.seg__item--on]="contexte() === c"
                              (click)="contexte.set(c)">{{ c === 'MATCH' ? 'Match (90 min)' : 'Semaine' }}</button>
                    }
                  </div>
                  @if (contexte() === 'SEMAINE') {
                    <p class="note">La cible de semaine <strong>inclut le match</strong>. L'entraînement n'est pas saisi : il se déduit des minutes réellement jouées.</p>
                  }
                </div>

                @if (!d.entete.modifiable) {
                  <p class="note note--lock">
                    <mat-icon>lock</mat-icon>
                    Lecture seule — un référentiel publié est immuable.
                  </p>
                }

                <table class="tbl tbl--grille">
                  <thead>
                    <tr><th>Métrique</th>
                      @for (p of postes(); track p.code) { <th class="num">{{ p.libelle }}</th> }
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of metriquesVisibles(); track m.code) {
                      <tr>
                        <td class="nom">
                          {{ m.libelle }}
                          <small>{{ m.unite }}</small>
                          @if (m.nature === 'EXPOSITION') { <em class="hint-expo">% du record perso</em> }
                        </td>
                        @for (p of postes(); track p.code) {
                          <td class="num">
                            <div class="paire">
                              <input type="number" class="mini" [disabled]="!d.entete.modifiable"
                                     [ngModel]="valeur(p.code, contexte(), m.code)?.valeurMin"
                                     (ngModelChange)="setValeur(p.code, m.code, 'min', $event)"
                                     [placeholder]="m.nature === 'EXPOSITION' ? 'seuil' : 'min'">
                              @if (m.nature !== 'EXPOSITION') {
                                <span class="tiret">–</span>
                                <input type="number" class="mini" [disabled]="!d.entete.modifiable"
                                       [ngModel]="valeur(p.code, contexte(), m.code)?.valeurMax"
                                       (ngModelChange)="setValeur(p.code, m.code, 'max', $event)"
                                       placeholder="max">
                              }
                            </div>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>

                <label class="chk">
                  <input type="checkbox" [(ngModel)]="toutesMetriques"> Afficher les 7 métriques
                </label>
              </div>
            }

            @if (onglet() === 'versions') {
              <div class="versions">
                @if (versionsDuNiveau().length <= 1) {
                  <p class="vide">Une seule version publiée pour ce niveau.</p>
                } @else {
                  <table class="tbl">
                    <thead><tr><th>Version</th><th>Statut</th><th class="num">Clubs</th><th class="num">Comparer</th></tr></thead>
                    <tbody>
                      @for (v of versionsDuNiveau(); track v.id) {
                        <tr>
                          <td class="nom">{{ v.nom }} <span class="ver">v{{ v.version }}</span></td>
                          <td><span class="badge" [class]="'badge--' + tonStatut(v.statut)">{{ libStatut(v.statut) }}</span></td>
                          <td class="num">{{ v.nbAdoptions }}</td>
                          <td class="num">
                            @if (v.id !== d.entete.id) {
                              <button class="btn btn--sm" (click)="comparer(v.id, d.entete.id)">Voir l'écart</button>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }

                @if (ecart(); as e) {
                  <div class="diff">
                    <h3 class="sous-titre">{{ e.avantNom }} → {{ e.apresNom }}</h3>
                    @if (e.lignes.length === 0) {
                      <p class="vide">Aucune différence de valeur entre ces deux versions.</p>
                    } @else {
                      <table class="tbl">
                        <thead><tr><th>Poste</th><th>Contexte</th><th>Métrique</th><th class="num">Avant</th><th class="num">Après</th></tr></thead>
                        <tbody>
                          @for (l of e.lignes; track l.poste + l.contexte + l.metrique) {
                            <tr>
                              <td>{{ libPoste(l.poste) }}</td>
                              <td>{{ l.contexte === 'MATCH' ? 'Match' : 'Semaine' }}</td>
                              <td>{{ libMetrique(l.metrique) }}</td>
                              <td class="num av">{{ borne(l.avantMin, l.avantMax) }}</td>
                              <td class="num ap">{{ borne(l.apresMin, l.apresMax) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    }
                  </div>
                }
              </div>
            }

            @if (onglet() === 'clubs') {
              <div class="clubs">
                @if (clubs().length === 0) {
                  <p class="vide">Aucun club n'utilise ce référentiel — il peut être archivé sans conséquence.</p>
                } @else {
                  <p class="note note--warn">
                    <mat-icon>warning</mat-icon>
                    {{ clubs().length }} adoption(s) épinglée(s) sur cette version. Publier une nouvelle
                    version ne les déplacera pas : chacune migrera quand elle le décidera.
                  </p>
                  <table class="tbl">
                    <thead><tr><th>Club</th><th>Portée</th></tr></thead>
                    <tbody>
                      @for (c of clubs(); track c.clubId + (c.equipeId || '')) {
                        <tr><td class="nom">{{ c.clubNom }}</td><td>{{ c.equipeNom }}</td></tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
            }
          </section>
        }
      }

      <!-- ─────────────── Utilisation ─────────────── -->
      @if (vue() === 'usage') {
        <section class="card">
          <h2 class="card__title">Utilisation des référentiels par les clubs</h2>
          <p class="card__hint">Repère les versions restées en service alors qu'une plus récente existe.</p>
          @if (usage().length === 0) {
            <p class="vide">Aucune adoption pour l'instant.</p>
          } @else {
            <table class="tbl">
              <thead><tr><th>Référentiel</th><th>Niveau</th><th class="num">Version</th><th>Statut</th><th class="num">Clubs</th></tr></thead>
              <tbody>
                @for (u of usage(); track u.referentielId) {
                  <tr [class.tr--archive]="u.statut === 'ARCHIVE'">
                    <td class="nom">{{ u.nom }}</td>
                    <td>{{ u.niveau || '—' }}</td>
                    <td class="num"><span class="ver">v{{ u.version }}</span></td>
                    <td><span class="badge" [class]="'badge--' + tonStatut(u.statut)">{{ libStatut(u.statut) }}</span></td>
                    <td class="num"><strong>{{ u.nbClubs }}</strong></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .ref-admin { display: flex; flex-direction: column; gap: 1rem; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .tabs { display: flex; gap: .25rem; border-bottom: 1px solid var(--border, #e2e8f0); }
    .tabs--sub { margin: .75rem 0; }
    .tabs__item { background: none; border: 0; border-bottom: 2px solid transparent; padding: .55rem .9rem;
                  cursor: pointer; font: inherit; color: var(--text-muted, #64748b); }
    .tabs__item--on { color: var(--primary, #2563eb); border-bottom-color: var(--primary, #2563eb); font-weight: 600; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .9rem; }
    .tbl th, .tbl td { padding: .5rem .6rem; border-bottom: 1px solid var(--border, #eef2f7); text-align: left; }
    .tbl th { font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; color: var(--text-muted, #64748b); }
    .tbl .num { text-align: right; }
    .tbl .nom { font-weight: 600; }
    .tbl .nom small { font-weight: 400; color: var(--text-muted, #94a3b8); margin-left: .3rem; }
    .tr--on { background: var(--surface-2, #f1f5f9); }
    .tr--archive { opacity: .55; }
    .ver { font-variant-numeric: tabular-nums; font-size: .8rem; padding: .1rem .35rem;
           border-radius: 4px; background: var(--surface-2, #f1f5f9); }
    .ver--big { font-size: .85rem; margin-left: .4rem; }
    .actions { white-space: nowrap; }
    .ic { background: none; border: 0; cursor: pointer; color: var(--text-muted, #64748b); padding: .2rem; }
    .ic:hover { color: var(--primary, #2563eb); }
    .ic--go:hover { color: #059669; }
    .btn--go { background: #059669; color: #fff; }
    .detail__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .detail__actions { display: flex; gap: .4rem; align-items: center; }
    .infos { display: grid; grid-template-columns: auto 1fr; gap: .3rem 1rem; margin: 0 0 1rem; }
    .infos dt { color: var(--text-muted, #64748b); font-size: .85rem; }
    .infos dd { margin: 0; font-weight: 600; font-size: .9rem; }
    .sous-titre { font-size: .95rem; margin: .8rem 0 .3rem; }
    .cell { font-variant-numeric: tabular-nums; }
    .grille__head { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: .6rem; }
    .seg { display: inline-flex; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; overflow: hidden; }
    .seg__item { background: none; border: 0; padding: .4rem .8rem; cursor: pointer; font: inherit; }
    .seg__item--on { background: var(--primary, #2563eb); color: #fff; }
    .paire { display: inline-flex; align-items: center; gap: .2rem; }
    .mini { width: 4.5rem; text-align: right; padding: .25rem .3rem; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; }
    .mini:disabled { background: var(--surface-2, #f8fafc); color: var(--text-muted, #94a3b8); }
    .tiret { color: var(--text-muted, #94a3b8); }
    .hint-expo { display: block; font-size: .72rem; color: var(--text-muted, #94a3b8); font-style: normal; }
    .note { display: flex; align-items: center; gap: .4rem; font-size: .85rem; color: var(--text-muted, #64748b); margin: .3rem 0; }
    .note--lock { color: #b45309; }
    .note--warn { color: #b45309; font-weight: 500; }
    .note mat-icon { font-size: 1.05rem; width: 1.05rem; height: 1.05rem; }
    .vide { color: var(--text-muted, #94a3b8); font-size: .9rem; padding: .8rem 0; }
    .creation__form { display: flex; gap: .6rem; align-items: flex-end; flex-wrap: wrap; }
    .diff { margin-top: 1rem; }
    .diff .av { color: var(--text-muted, #94a3b8); }
    .diff .ap { font-weight: 600; }
    .chk { display: inline-flex; gap: .35rem; align-items: center; margin-top: .6rem; font-size: .85rem; }
    @media (max-width: 900px) { .tbl { display: block; overflow-x: auto; } }
  `],
})
export class ReferentielsAdminComponent implements OnInit {

  private api = inject(ObjectifsService);
  private snack = inject(MatSnackBar);

  readonly contextes: Contexte[] = ['MATCH', 'SEMAINE'];

  vue = signal<'catalogue' | 'usage'>('catalogue');
  onglet = signal<Onglet>('apercu');
  contexte = signal<Contexte>('SEMAINE');
  toutesMetriques = false;

  referentiels = signal<ReferentielResume[]>([]);
  selection = signal<ReferentielDetail | null>(null);
  usage = signal<UsageReferentiel[]>([]);
  clubs = signal<ClubUtilisateur[]>([]);
  ecart = signal<EcartResponse | null>(null);

  private vocab = signal<CatalogueReferentiels | null>(null);
  creation = signal(false);
  nouveauNom = '';
  nouveauNiveau = '';

  /** Brouillon de travail : les modifications de la grille avant enregistrement. */
  private brouillon = new Map<string, ValeurRef>();

  ngOnInit(): void {
    this.api.catalogue().subscribe({
      next: c => this.vocab.set(c),
      // Le vocabulaire passe par la route club ; un super-admin sans club actif n'y a pas accès.
      // On retombe alors sur les postes et métriques déduits du référentiel ouvert.
      error: () => this.vocab.set(null),
    });
    this.recharger();
  }

  private recharger(): void {
    this.api.listerPlateforme().subscribe({
      next: l => this.referentiels.set(l),
      error: () => this.snack.open('Impossible de charger le catalogue.', 'OK', { duration: 4000 }),
    });
  }

  // ── Vocabulaire ──

  metriques = computed<Metrique[]>(() => this.vocab()?.metriques ?? []);
  postes = computed<PosteRef[]>(() => this.vocab()?.postes ?? []);

  metriquesVisibles = computed<Metrique[]>(() =>
    this.toutesMetriques ? this.metriques() : this.metriques().filter(m => m.principale));

  /** Postes réellement renseignés dans le référentiel ouvert (le gardien est souvent absent). */
  postesRenseignes = computed<PosteRef[]>(() => {
    const d = this.selection();
    if (!d) return [];
    const presents = new Set(d.valeurs.map(v => v.poste));
    return this.postes().filter(p => presents.has(p.code));
  });

  libMetrique(code: string): string {
    return this.metriques().find(m => m.code === code)?.libelle ?? code;
  }
  libPoste(code: string): string {
    return this.postes().find(p => p.code === code)?.libelle ?? code;
  }

  // ── Lecture / écriture de la grille ──

  private cle(poste: string, contexte: string, metrique: string): string {
    return `${poste}|${contexte}|${metrique}`;
  }

  valeur(poste: string, contexte: string, metrique: string): ValeurRef | undefined {
    const k = this.cle(poste, contexte, metrique);
    if (this.brouillon.has(k)) return this.brouillon.get(k);
    return this.selection()?.valeurs.find(
      v => v.poste === poste && v.contexte === contexte && v.metrique === metrique);
  }

  setValeur(poste: string, metrique: string, borne: 'min' | 'max', v: number | null): void {
    const contexte = this.contexte();
    const k = this.cle(poste, contexte, metrique);
    const actuel = this.valeur(poste, contexte, metrique);
    const ligne: ValeurRef = {
      poste, contexte: contexte as Contexte, metrique,
      valeurMin: actuel?.valeurMin ?? null, valeurMax: actuel?.valeurMax ?? null,
    };
    if (borne === 'min') ligne.valeurMin = v ?? null; else ligne.valeurMax = v ?? null;
    this.brouillon.set(k, ligne);
  }

  affiche(v: ValeurRef | undefined, m: Metrique): string {
    if (!v) return '—';
    if (m.nature === 'EXPOSITION') return v.valeurMin != null ? `${v.valeurMin} %` : '—';
    return this.borne(v.valeurMin, v.valeurMax);
  }

  borne(min: number | null, max: number | null): string {
    if (min == null && max == null) return '—';
    if (min != null && max != null) return `${min.toLocaleString('fr-FR')} – ${max.toLocaleString('fr-FR')}`;
    return (min ?? max)!.toLocaleString('fr-FR');
  }

  /**
   * Teinte normalisée LIGNE PAR LIGNE : la couleur compare les postes entre eux sur une même
   * métrique. Un dégradé absolu n'aurait aucun sens — une norme n'est ni bonne ni mauvaise.
   */
  teinte(metrique: string, poste: string): string {
    const d = this.selection();
    if (!d) return 'transparent';
    const ligne = d.valeurs.filter(v => v.metrique === metrique && v.contexte === 'SEMAINE');
    const pivots = ligne.map(v => this.pivot(v)).filter((n): n is number => n != null);
    if (pivots.length < 2) return 'transparent';
    const min = Math.min(...pivots), max = Math.max(...pivots);
    const v = ligne.find(x => x.poste === poste);
    const p = v ? this.pivot(v) : null;
    if (p == null || max === min) return 'transparent';
    const t = (p - min) / (max - min);
    return `rgba(37, 99, 235, ${(0.06 + t * 0.30).toFixed(3)})`;
  }

  private pivot(v: ValeurRef): number | null {
    if (v.valeurMin != null && v.valeurMax != null) return (v.valeurMin + v.valeurMax) / 2;
    return v.valeurMin ?? v.valeurMax ?? null;
  }

  // ── Actions ──

  ouvrirCreation(): void { this.creation.set(true); this.nouveauNom = ''; this.nouveauNiveau = ''; }

  creer(): void {
    this.api.creerPlateforme(this.nouveauNom.trim(), this.nouveauNiveau.trim()).subscribe({
      next: d => {
        this.creation.set(false);
        this.selection.set(d);
        this.onglet.set('objectifs');
        this.recharger();
        this.snack.open('Brouillon créé. Renseignez ses valeurs puis publiez-le.', 'OK', { duration: 5000 });
      },
      error: e => this.erreur(e),
    });
  }

  ouvrir(r: ReferentielResume): void {
    this.brouillon.clear();
    this.ecart.set(null);
    this.api.detailAdmin(r.id).subscribe({
      next: d => { this.selection.set(d); this.onglet.set('apercu'); },
      error: e => this.erreur(e),
    });
  }

  enregistrer(): void {
    const d = this.selection();
    if (!d) return;
    // Le back remplace l'intégralité des valeurs : on renvoie l'existant fusionné au brouillon.
    const fusion = new Map<string, ValeurRef>();
    for (const v of d.valeurs) fusion.set(this.cle(v.poste, v.contexte, v.metrique), v);
    for (const [k, v] of this.brouillon) fusion.set(k, v);
    this.api.enregistrerValeursAdmin(d.entete.id, [...fusion.values()]).subscribe({
      next: maj => {
        this.brouillon.clear();
        this.selection.set(maj);
        this.snack.open('Valeurs enregistrées.', 'OK', { duration: 3000 });
      },
      error: e => this.erreur(e),
    });
  }

  publier(r: ReferentielResume): void {
    const parent = r.parentId ? this.referentiels().find(x => x.id === r.parentId) : null;
    const avert = parent && parent.nbAdoptions > 0
      ? `\n\nLa version précédente (v${parent.version}) passera en archive. ${parent.nbAdoptions} adoption(s) y restent épinglées et ne bougeront pas.`
      : '';
    if (!confirm(`Publier « ${r.nom} » ?\n\nUne fois publié, il devient immuable : toute correction demandera une nouvelle version.${avert}`)) return;
    this.api.publier(r.id).subscribe({
      next: () => {
        this.snack.open('Référentiel publié.', 'OK', { duration: 3000 });
        this.recharger();
        if (this.selection()?.entete.id === r.id) this.ouvrir(r);
      },
      error: e => this.erreur(e),
    });
  }

  nouvelleVersion(r: ReferentielResume): void {
    this.api.nouvelleVersion(r.id).subscribe({
      next: d => {
        this.brouillon.clear();
        this.selection.set(d);
        this.onglet.set('objectifs');
        this.recharger();
        this.snack.open(`Version ${d.entete.version} ouverte en brouillon. Les clubs restent sur la précédente.`,
          'OK', { duration: 6000 });
      },
      error: e => this.erreur(e),
    });
  }

  comparer(avant: string, apres: string): void {
    this.api.ecartAdmin(avant, apres).subscribe({
      next: e => this.ecart.set(e),
      error: e => this.erreur(e),
    });
  }

  chargerClubs(id: string): void {
    this.onglet.set('clubs');
    this.api.clubsUtilisateurs(id).subscribe({
      next: c => this.clubs.set(c),
      error: () => this.clubs.set([]),
    });
  }

  chargerUsage(): void {
    this.vue.set('usage');
    this.api.usage().subscribe({
      next: u => this.usage.set(u),
      error: e => this.erreur(e),
    });
  }

  /** Toutes les versions du même niveau, pour l'onglet Historique. */
  versionsDuNiveau = computed<ReferentielResume[]>(() => {
    const d = this.selection();
    if (!d?.entete.niveau) return [];
    return this.referentiels()
      .filter(r => r.plateforme && r.niveau === d.entete.niveau)
      .sort((a, b) => b.version - a.version);
  });

  // ── Présentation ──

  tonStatut(s: string): string {
    return s === 'PUBLIE' ? 'success' : s === 'BROUILLON' ? 'warning' : 'neutral';
  }
  libStatut(s: string): string {
    return s === 'PUBLIE' ? 'Publié' : s === 'BROUILLON' ? 'Brouillon' : 'Archivé';
  }

  private erreur(e: { error?: { message?: string } }): void {
    this.snack.open(e?.error?.message || 'Opération impossible.', 'OK', { duration: 5000 });
  }
}
