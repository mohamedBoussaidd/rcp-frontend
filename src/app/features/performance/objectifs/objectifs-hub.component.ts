import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ContexteService } from '@core/services/contexte.service';
import { SaisonContexteService } from '@core/services/saison-contexte.service';
import { ObjectifsService, Adoption, EtatPeriode } from '@core/services/objectifs.service';
import { PredictionService, SemaineTrajectoire } from '@core/services/prediction.service';
import { ObjectifsAssistantComponent } from './objectifs-assistant.component';

/** Une ligne de l'extrait « ce que cette configuration produit ». */
interface LigneApercu {
  no: number;
  date: string;
  hab: string;
  att: string;
  ret: string;
  rea: string;
  ecart: string;
  ton: 'ok' | 'warn' | 'bad' | 'neutre';
}

/**
 * Point d'entrée des objectifs de performance : un état des lieux, la preuve de ce qu'il produit,
 * et un bouton qui ouvre l'assistant.
 *
 * <p>La configuration elle-même vit dans une modale ({@link ObjectifsAssistantComponent}) plutôt
 * que dans cette page : c'est ce qui lui permet d'être ouverte aussi depuis une période de
 * l'écran Saison, sans dupliquer un seul écran.
 *
 * <p>Le bloc d'aperçu n'est pas un ornement. Trois tuiles d'état disent « c'est configuré » sans
 * jamais montrer À QUOI ça sert : on repart d'ici sans savoir ce qu'on vient de régler. L'extrait
 * prend un vrai joueur de l'effectif et affiche trois de ses semaines telles qu'elles sortiront
 * dans sa fiche — la page prouve ce qu'elle fabrique.
 */
@Component({
  selector: 'app-objectifs-hub',
  standalone: true,
  imports: [MatIconModule, RouterLink, ObjectifsAssistantComponent],
  template: `
    <div class="ohub">

      <header class="page-head ohub-head">
        <div class="ohub-head__txt">
          <h1 class="page-head__title">Objectifs de performance</h1>
          <p class="page-head__sub">
            Ce qui est attendu d'un joueur à son poste et à son niveau, décliné sur les périodes de
            la saison — se règle une fois, se relit ensuite chaque semaine dans la charge d'équipe.
          </p>
        </div>
        <div class="page-head__actions">
          <button class="btn btn--primary btn--lg" (click)="ouvrir(1)">
            <mat-icon>tune</mat-icon> Configurer les objectifs
          </button>
        </div>
      </header>

      @if (aMaj()) {
        <div class="ohub-maj">
          <mat-icon class="ohub-maj__ic">info</mat-icon>
          <div class="ohub-maj__txt">
            <strong>Une version plus récente d'un référentiel adopté est publiée</strong>
            <span>Vos valeurs ne bougeront pas tant que vous n'aurez pas migré.</span>
          </div>
          <button class="btn btn--sm ohub-maj__btn" (click)="ouvrir(1)">Voir</button>
        </div>
      }

      <!-- Trois tuiles = les trois étapes qui produisent réellement quelque chose. L'étape 4 de
           l'assistant est un résumé : elle n'a pas sa tuile ici, cette page EST le résumé. -->
      <div class="ohub-tuiles">
        @for (t of tuiles(); track t.etape) {
          <button class="ohub-tuile" (click)="ouvrir(t.etape)">
            <span class="ohub-tuile__haut">
              <span class="ohub-pastille" [class.ohub-pastille--ok]="t.fait">
                <mat-icon>{{ t.fait ? 'check' : 'priority_high' }}</mat-icon>
              </span>
              <span class="ohub-tuile__etape">Étape {{ t.etape }}</span>
              <mat-icon class="ohub-tuile__chev">chevron_right</mat-icon>
            </span>
            <span class="ohub-tuile__titre">{{ t.titre }}</span>
            <span class="ohub-tuile__valeur">{{ t.valeur }}</span>
            <span class="ohub-tuile__aide">{{ t.aide }}</span>
          </button>
        }
      </div>

      <!-- Preuve par l'exemple : un vrai joueur, ses vraies semaines. -->
      @if (apercu().length > 0) {
        <section class="ohub-preuve">
          <div class="ohub-preuve__head">
            <div>
              <h2 class="ohub-preuve__titre">Ce que cette configuration produit</h2>
              <p class="ohub-preuve__sub">
                Extrait de la fiche de <strong>{{ apercuJoueur() }}</strong>
                @if (apercuPoste()) { · {{ apercuPoste() }} }
                @if (apercuPeriode()) { · {{ apercuPeriode() }} }
              </p>
            </div>
            @if (apercuJoueurId(); as jid) {
              <a class="ohub-preuve__lien" [routerLink]="['/joueurs', jid]"
                 [queryParams]="{ tab: 'objectif' }">
                Ouvrir l'écran de suivi <mat-icon>arrow_forward</mat-icon>
              </a>
            }
          </div>

          <div class="ohub-preuve__corps">
            <table class="ohub-tbl">
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th class="r">Habituel</th>
                  <th class="r th--att">Attendu</th>
                  <th class="r th--ret">Retenu</th>
                  <th class="r th--rea">Réalisé</th>
                  <th class="r">Écart</th>
                </tr>
              </thead>
              <tbody>
                @for (l of apercu(); track l.no) {
                  <tr>
                    <td><b class="num">S{{ l.no }}</b> <span class="muted">· {{ l.date }}</span></td>
                    <td class="r num muted">{{ l.hab }}</td>
                    <td class="r num td--att">{{ l.att }}</td>
                    <td class="r num td--ret">{{ l.ret }}</td>
                    <td class="r num td--rea">{{ l.rea }}</td>
                    <td class="r num" [class]="'ton-' + l.ton">{{ l.ecart }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="ohub-lex">
              <span><strong>Habituel</strong> — moyenne des 4 semaines précédentes du joueur</span>
              <span><strong>Attendu</strong> — référentiel adopté, pour son poste et son niveau</span>
              <span><strong>Retenu</strong> — ce qui a été prescrit pour la semaine</span>
            </div>
          </div>
        </section>
      }

      <div class="ohub-suite">
        <mat-icon>arrow_forward</mat-icon>
        <div>
          <strong class="ohub-suite__titre">Et ensuite ?</strong>
          <p class="ohub-suite__txt">
            Le suivi hebdomadaire se lit dans <strong>Performance › Charge d'entraînement</strong>,
            onglet <strong>Objectif</strong>. Cette page-ci ne sert qu'à la configuration : elle ne
            bouge que quelques fois par saison.
          </p>
        </div>
      </div>

      @if (assistant()) {
        <app-objectifs-assistant [etapeInitiale]="etapeInitiale()" (fermer)="fermer()" />
      }
    </div>
  `,
  styles: [`
    .ohub { display: flex; flex-direction: column; gap: 20px; }
    .ohub-head { margin-bottom: 0; align-items: flex-start; }
    .ohub-head__txt { max-width: 78ch; }
    .ohub-head .page-head__sub { font-size: 13.5px; line-height: 1.55; }

    /* ── Bandeau de mise à jour de référentiel ── */
    .ohub-maj { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px;
                background: var(--info-bg); border: 1px solid var(--info-bd);
                border-radius: var(--r-lg); }
    .ohub-maj__ic { color: var(--info); flex: none; }
    .ohub-maj__txt { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .ohub-maj__txt strong { color: var(--info); font-size: 13.5px; }
    .ohub-maj__txt span { color: var(--text-2); }
    .ohub-maj__btn { flex: none; background: var(--surface); color: var(--info);
                     border-color: var(--info-bd); }

    /* ── Les trois tuiles d'état ── */
    .ohub-tuiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .ohub-tuile { display: flex; flex-direction: column; align-items: stretch; gap: 0;
                  text-align: left; cursor: pointer; font: inherit; color: inherit;
                  padding: 18px 18px 16px; background: var(--surface);
                  border: 1px solid var(--border); border-radius: var(--r-lg);
                  transition: border-color 160ms var(--ease-out), box-shadow 160ms var(--ease-out),
                              transform 160ms var(--ease-out); }
    .ohub-tuile:hover { border-color: var(--green-400); box-shadow: var(--shadow-md);
                        transform: translateY(-1px); }
    .ohub-tuile__haut { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
    .ohub-pastille { display: inline-flex; align-items: center; justify-content: center;
                     width: 22px; height: 22px; flex: none; border-radius: var(--r-pill);
                     background: var(--warn-bg); border: 1px solid var(--warn-bd); }
    .ohub-pastille mat-icon { font-size: 13px; width: 13px; height: 13px; color: var(--warn); }
    .ohub-pastille--ok { background: var(--ok-bg); border-color: var(--ok-bd); }
    .ohub-pastille--ok mat-icon { color: var(--ok); }
    .ohub-tuile__etape { font-size: 11px; font-weight: 700; letter-spacing: .1em;
                         text-transform: uppercase; color: var(--text-4); }
    .ohub-tuile__chev { margin-left: auto; color: var(--text-4);
                        font-size: 18px; width: 18px; height: 18px; }
    .ohub-tuile__titre { font-size: 16px; font-weight: 600; letter-spacing: -.01em; margin-bottom: 5px; }
    .ohub-tuile__valeur { font-size: 13.5px; line-height: 1.5; color: var(--text-2); }
    .ohub-tuile__aide { font-size: 12.5px; line-height: 1.5; color: var(--text-3); margin-top: 8px; }

    /* ── Extrait « ce que ça produit » ── */
    .ohub-preuve { border: 1px solid var(--border); border-radius: var(--r-lg);
                   overflow: hidden; background: var(--surface-2); }
    .ohub-preuve__head { display: flex; align-items: baseline; justify-content: space-between;
                         gap: 20px; flex-wrap: wrap; padding: 15px 18px 13px;
                         border-bottom: 1px solid var(--border); background: var(--surface); }
    .ohub-preuve__titre { margin: 0; font-size: 15px; font-weight: 600; }
    .ohub-preuve__sub { margin: 3px 0 0; font-size: 12.5px; color: var(--text-3); }
    .ohub-preuve__sub strong { color: var(--text-2); font-weight: 600; }
    .ohub-preuve__lien { display: inline-flex; align-items: center; gap: 5px;
                         font-size: 12.5px; font-weight: 600; color: var(--green-700);
                         text-decoration: none; }
    .ohub-preuve__lien:hover { color: var(--green-800); text-decoration: underline; }
    .ohub-preuve__lien mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .ohub-preuve__corps { padding: 4px 8px 8px; overflow-x: auto; }

    .ohub-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .ohub-tbl th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700;
                   letter-spacing: .08em; text-transform: uppercase; color: var(--text-4); }
    .ohub-tbl td { padding: 10px 12px; border-top: 1px solid var(--border); white-space: nowrap; }
    .ohub-tbl .r { text-align: right; }
    .ohub-tbl .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
    .ohub-tbl .muted { color: var(--text-3); font-weight: 400; }
    .th--att { color: var(--info); }
    .th--ret { color: var(--cuivre); }
    .th--rea { color: var(--green-700); }
    .td--att { color: var(--info); }
    .td--ret { color: var(--cuivre); font-weight: 600; }
    .td--rea { color: var(--green-700); font-weight: 600; }
    .ton-ok { color: var(--ok); font-weight: 600; }
    .ton-warn { color: var(--warn); font-weight: 600; }
    .ton-bad { color: var(--bad); font-weight: 600; }
    .ton-neutre { color: var(--text-4); }

    .ohub-lex { display: flex; flex-wrap: wrap; gap: 18px; padding: 12px 12px 8px;
                font-size: 12px; line-height: 1.5; color: var(--text-3); }
    .ohub-lex strong { color: var(--text-2); font-weight: 600; }

    /* ── Encart de sortie ── */
    .ohub-suite { display: flex; align-items: flex-start; gap: 14px; padding: 18px 20px;
                  background: var(--green-50); border: 1px solid var(--green-200);
                  border-radius: var(--r-lg); }
    .ohub-suite > mat-icon { color: var(--green-700); flex: none; margin-top: 1px; }
    .ohub-suite__titre { font-size: 15px; color: var(--green-900); }
    .ohub-suite__txt { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6;
                       color: var(--text-2); max-width: 82ch; }
    .ohub-suite__txt strong { color: var(--green-800); font-weight: 600; }

    @media (max-width: 900px) {
      .ohub-tuiles { grid-template-columns: 1fr; }
    }
  `],
})
export class ObjectifsHubComponent implements OnInit {

  private api = inject(ObjectifsService);
  private predictions = inject(PredictionService);
  private contexte = inject(ContexteService);
  private saisonCtx = inject(SaisonContexteService);

  adoptions = signal<Adoption[]>([]);
  periodes = signal<EtatPeriode[]>([]);
  nbModeles = signal(0);
  assistant = signal(false);
  etapeInitiale = signal<1 | 2 | 3 | 4>(1);

  apercu = signal<LigneApercu[]>([]);
  apercuJoueur = signal('');
  apercuJoueurId = signal<string | null>(null);
  apercuPoste = signal('');
  apercuPeriode = signal('');

  nbFaites = computed(() => this.periodes().filter(p => p.objectifsDefinis).length);
  aMaj = computed(() => this.adoptions().some(a => !!a.versionDisponibleId));

  /** Les trois tuiles, dans l'ordre où l'assistant les fait franchir. */
  tuiles = computed(() => [
    {
      etape: 1 as const, titre: 'Référentiel', fait: this.adoptions().length > 0,
      valeur: this.adoptions().length > 0
        ? `${this.adoptions().length} adoption${this.adoptions().length > 1 ? 's' : ''}`
        : 'Aucune adoption',
      aide: this.adoptions().length > 0
        ? 'La colonne « Attendu » a une échelle.'
        : 'Sans lui, aucune colonne « Attendu » ne s\'affiche.',
    },
    {
      etape: 2 as const, titre: 'Modèles d\'objectif', fait: this.nbModeles() > 0,
      valeur: `${this.nbModeles()} modèle${this.nbModeles() > 1 ? 's' : ''}`,
      aide: this.nbModeles() > 0
        ? 'La forme des progressions, en phases.'
        : 'La forme d\'une progression : ses phases et leur niveau.',
    },
    {
      etape: 3 as const, titre: 'Périodes de la saison', fait: this.nbFaites() > 0,
      valeur: this.periodes().length > 0
        ? `${this.nbFaites()} / ${this.periodes().length} avec objectifs`
        : 'Aucune période lue',
      aide: 'C\'est ici que le « Retenu » de chaque semaine est calculé.',
    },
  ]);

  ngOnInit(): void { this.charger(); }

  private charger(): void {
    this.api.adoptions().subscribe({ next: a => this.adoptions.set(a), error: () => this.adoptions.set([]) });
    this.api.modeles().subscribe({ next: m => this.nbModeles.set(m.length), error: () => this.nbModeles.set(0) });
    this.saisonCtx.charger().subscribe({ next: () => this.chargerPeriodes(), error: () => {} });
    this.chargerApercu();
  }

  private chargerPeriodes(): void {
    const s = this.saisonCtx.enCours()?.id;
    // Vue d'ensemble : l'équipe active si elle existe, sinon la première du périmètre — ce n'est
    // qu'un indicateur, l'assistant laisse choisir explicitement.
    const e = this.contexte.equipesActives()[0] ?? this.contexte.equipesDispo()[0]?.id;
    if (!s || !e) { this.periodes.set([]); return; }
    this.api.etatPeriodes(s, e).subscribe({
      next: p => this.periodes.set(p),
      error: () => this.periodes.set([]),
    });
  }

  /**
   * Choisit un joueur réel plutôt qu'un exemple inventé : un extrait fabriqué prouverait
   * seulement que la maquette sait dessiner un tableau. On prend le premier joueur de la semaine
   * qui porte un « Retenu » — sans retenu, l'extrait montrerait une colonne vide et démontrerait
   * l'inverse de ce qu'il est censé démontrer.
   */
  private chargerApercu(): void {
    this.predictions.getObjectifHebdo().subscribe({
      next: h => {
        const j = h.joueurs?.find(x => x.retenu_m != null) ?? h.joueurs?.[0];
        if (!j) return;
        this.predictions.getTrajectoireJoueur(j.joueur_id).subscribe({
          next: t => {
            if (!t.disponible || !t.semaines?.length) return;
            this.apercuJoueurId.set(j.joueur_id);
            this.apercuJoueur.set(`${j.prenom} ${j.nom}`.trim());
            this.apercuPoste.set(t.joueur?.poste || j.poste || '');
            this.apercuPeriode.set(t.periode?.libelle || '');
            this.apercu.set(this.troisSemaines(t.semaines));
          },
          error: () => {},
        });
      },
      error: () => {},
    });
  }

  /**
   * Trois semaines centrées sur la dernière semaine révolue : les semaines à venir n'ont pas de
   * réalisé, un extrait qui n'en montrerait que des colonnes vides ne prouverait rien.
   */
  private troisSemaines(semaines: SemaineTrajectoire[]): LigneApercu[] {
    const derniere = semaines.map(s => s.passee).lastIndexOf(true);
    const fin = derniere >= 0 ? derniere + 1 : Math.min(3, semaines.length);
    const debut = Math.max(0, fin - 3);
    return semaines.slice(debut, fin).map(s => {
      const ecart = s.retenu_m && s.passee
        ? Math.round((s.realise_m - s.retenu_m) / s.retenu_m * 100) : null;
      return {
        no: s.no_semaine,
        date: this.jour(s.date_lundi),
        hab: this.km(s.habituel_m),
        att: s.attendu_min_m != null
          ? `${(s.attendu_min_m / 1000).toFixed(0)}–${((s.attendu_max_m ?? s.attendu_min_m) / 1000).toFixed(0)} km`
          : '—',
        ret: this.km(s.retenu_m),
        rea: s.passee ? this.km(s.realise_m) : '—',
        ecart: ecart == null ? '—' : `${ecart > 0 ? '+' : ''}${ecart} %`,
        ton: ecart == null ? 'neutre' : ecart >= -5 ? 'ok' : ecart >= -20 ? 'warn' : 'bad',
      };
    });
  }

  private km(v: number | null | undefined): string {
    return v == null ? '—' : `${(v / 1000).toFixed(1)} km`;
  }

  private jour(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  ouvrir(etape: 1 | 2 | 3 | 4): void {
    this.etapeInitiale.set(etape);
    this.assistant.set(true);
  }

  fermer(): void {
    this.assistant.set(false);
    this.charger();
  }
}
