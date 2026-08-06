import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ObjectifsService, EtatPeriode, Metrique, PosteRef, ModeleResume,
  ValeurPeriode, ObjectifPeriodeDetail, Apercu, Priorite,
} from '@core/services/objectifs.service';
import { InfoBulleComponent } from '@shared/components/info-bulle/info-bulle.component';
import { INFOBULLES_OBJECTIFS } from './infobulles-objectifs';

interface Colonne { cle: string; titre: string; sousTitre: string; phase: string | null; }

/**
 * Éditeur de l'objectif d'UNE période : on choisit un modèle, on prévisualise, on ajuste, on
 * enregistre.
 *
 * <p>Le <b>bandeau de phases</b> au-dessus des colonnes est la pièce qui rend le modèle lisible :
 * sans lui, le préparateur voit une suite de nombres qui monte puis redescend en dernière semaine
 * sans comprendre pourquoi. Avec lui, il lit « Accumulation, Développement, Pic, Décharge » et la
 * chute finale devient évidente.
 *
 * <p>Deux formes selon le type de période : trajectoire semaine par semaine en préparation,
 * fourchettes par poste en compétition. Une seule grille les affiche toutes les deux — seules les
 * colonnes changent.
 */
@Component({
  selector: 'app-objectif-periode-editeur',
  standalone: true,
  imports: [FormsModule, MatIconModule, DatePipe, InfoBulleComponent],
  template: `
    <div class="ope">
      <header class="ope-head">
        <div class="ope-head__txt">
          <h3 class="ope-head__titre">{{ periode.libelle }}</h3>
          <p class="ope-head__sub">
            <span class="num">{{ periode.dateDebut | date : 'd MMM' }} → {{ periode.dateFin | date : 'd MMM y' }}</span>
            · type {{ libTypePeriode(periode.typePeriode) }}
            · {{ periode.nbSemaines }} semaine{{ periode.nbSemaines > 1 ? 's' : '' }}
          </p>
        </div>
        @if (!sansCharge() && modeleId) {
          <button class="btn btn--secondary" (click)="previsualiser()">Recalculer</button>
          <button class="btn btn--primary" (click)="enregistrer()" [disabled]="lignes().length === 0">
            Enregistrer
          </button>
        }
        <button class="ope-ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
      </header>

      @if (sansCharge()) {
        <!-- Trêve et intersaison : le joueur n'est pas censé être en charge. Le moteur d'analyse
             se tait déjà sur ces périodes (aucune alerte) — y fixer un objectif se contredirait. -->
        <div class="ope-repos">
          <span class="badge badge--neutral">hors charge
            <app-info-bulle [texte]="aide.horsCharge" /></span>
          <p>
            Une {{ libTypePeriode(periode.typePeriode).toLowerCase() }} ne reçoit pas d'objectifs :
            il n'y a pas de charge à planifier. L'application n'émet déjà aucune alerte pendant ces
            périodes — lui fixer une cible la contredirait. Cette période est exclue du décompte de
            complétion, sinon l'étape ne serait jamais complète.
          </p>
        </div>
      } @else {
        <div class="ope-barre">
          <select class="ope-select" [(ngModel)]="modeleId" (ngModelChange)="previsualiser()">
            <option [ngValue]="null">Choisir un modèle…</option>
            @for (m of modeles(); track m.id) {
              <option [ngValue]="m.id">{{ m.nom }}@if (tousTypes) { — {{ libTypePeriode(m.typePeriode) }} }</option>
            }
          </select>
          <label class="ope-chk" title="Par défaut, seuls les modèles du même type que la période sont proposés.">
            <input type="checkbox" [(ngModel)]="tousTypes" (ngModelChange)="chargerModeles()">
            Tous les types
          </label>
          @if (!tousTypes) {
            <span class="ope-hint">
              seuls les modèles de type « {{ libTypePeriode(periode.typePeriode) }} » —
              c'est le type de la période qui commande
            </span>
          }
          <span class="ope-barre__spacer"></span>
          @if (referentielNom(); as r) {
            <span class="ope-hint">échelle : <strong>{{ r }}</strong>
              <app-info-bulle [texte]="aide.echelleReferentiel" /></span>
          }
        </div>

        @if (modeles().length === 0) {
          <div class="ope-note ope-note--info">
            <mat-icon>info</mat-icon>
            <span>Aucun modèle n'est prévu pour le type
              <strong>{{ libTypePeriode(periode.typePeriode) }}</strong>. Cochez
              <strong>Tous les types</strong> pour en emprunter un, ou créez-en un à l'étape 2.</span>
          </div>
        }
      }

      @if (avertissement(); as a) {
        <div class="ope-note ope-note--warn">
          <mat-icon>warning</mat-icon><span>{{ a }}</span>
        </div>
      }

      @if (lignes().length > 0) {
        <div class="ope-legende">
          <label class="ope-chk">
            <input type="checkbox" [(ngModel)]="toutesMetriques"> Afficher les 7 métriques
          </label>
          <span class="ope-barre__spacer"></span>
          <span class="ope-touche-lg">
            <span class="ope-pastille"></span>
            case retouchée à la main — <b class="num">{{ nbModifiees() }}</b>
            <app-info-bulle [texte]="aide.caseRetouchee" />
          </span>
        </div>

        @if (nbModifiees() > 0) {
          <div class="ope-note ope-note--cuivre">
            <mat-icon>edit</mat-icon>
            <span>{{ nbModifiees() }} case(s) retouchée(s) à la main survivent à un enregistrement,
              mais pas à un <strong>Recalculer</strong> : il réapplique le modèle sur toute la période.</span>
          </div>
        }

        <div class="ope-grille">
          <table class="ope-tbl">
            <thead>
              @if (bandeau().length > 0) {
                <tr>
                  <th class="ope-tbl__vide"><app-info-bulle [texte]="aide.bandeauPhases" /></th>
                  @for (b of bandeau(); track b.nom + b.debut) {
                    <th [attr.colspan]="b.nb" class="ope-bandeau"
                        [style.background]="couleurPhase(b.nom)">{{ b.nom }}</th>
                  }
                </tr>
              }
              <tr>
                <th class="ope-col">Métrique</th>
                @for (c of colonnes(); track c.cle) {
                  <th class="r ope-th-sem">
                    <span class="num">{{ c.titre }}</span><small class="num">{{ c.sousTitre }}</small>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (m of metriquesVisibles(); track m.code) {
                <tr>
                  <td class="ope-col">
                    <span class="ope-m">{{ m.libelle }}</span>
                    @if (m.nature === 'EXPOSITION') {
                      <span class="ope-cible">cible directe</span>
                      <app-info-bulle [texte]="aide.metriqueExposition" />
                    }
                    <small>{{ m.unite }}</small>
                    <span class="ope-prio" [class]="'ope-prio--' + prioriteDe(m.code).toLowerCase()"
                          [title]="explicationPriorite(prioriteDe(m.code))">
                      {{ libPriorite(prioriteDe(m.code)) }}
                    </span>
                  </td>
                  @for (c of colonnes(); track c.cle) {
                    <td class="ope-cell" [class.ope-cell--touche]="estModifiee(c, m.code)">
                      <input type="number" class="ope-input"
                             [ngModel]="lire(c, m.code)"
                             (ngModelChange)="ecrire(c, m.code, $event)">
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (modeleId) {
        <p class="ope-vide">Aucune valeur générée. Vérifiez que le modèle contient des phases avec des pourcentages.</p>
      }
    </div>
  `,
  styles: [`
    .ope { border: 1px solid var(--border); border-radius: var(--r-xl);
           background: var(--surface); box-shadow: var(--shadow-sm); overflow: hidden; }
    .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }

    .ope-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                padding: 13px 15px; border-bottom: 1px solid var(--border);
                background: var(--surface-2); }
    .ope-head__txt { flex: 1; min-width: 200px; }
    .ope-head__titre { margin: 0; font-size: 15px; font-weight: 600; }
    .ope-head__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-3); }
    .ope-ic { width: 30px; height: 30px; display: grid; place-items: center; flex: none;
              border: 0; background: none; cursor: pointer; color: var(--text-3);
              border-radius: var(--r-md); }
    .ope-ic:hover { background: var(--surface-3); color: var(--text); }

    .ope-repos { padding: 22px 24px; text-align: center; background: var(--slate-50); }
    .ope-repos p { margin: 11px auto 0; max-width: 62ch; font-size: 13px;
                   line-height: 1.6; color: var(--text-2); }

    .ope-barre { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                 padding: 13px 15px; border-bottom: 1px solid var(--border); }
    .ope-barre__spacer { flex: 1; }
    .ope-select { min-width: 260px; padding: 7px 10px; border: 1px solid var(--border-strong);
                  border-radius: var(--r-sm); background: var(--surface);
                  font: inherit; font-size: 13px; color: var(--text); }
    .ope-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px;
               color: var(--text-2); cursor: pointer; white-space: nowrap; }
    .ope-chk input { accent-color: var(--green-600); }
    .ope-hint { font-size: 12px; color: var(--text-3); }
    .ope-hint strong { color: var(--text-2); font-weight: 600; }

    .ope-note { display: flex; align-items: flex-start; gap: 10px; margin: 12px 15px;
                padding: 10px 12px; border-radius: var(--r-md); font-size: 12.5px;
                line-height: 1.55; }
    .ope-note mat-icon { flex: none; font-size: 16px; width: 16px; height: 16px; margin-top: 1px; }
    .ope-note--info { background: var(--info-bg); border: 1px solid var(--info-bd); color: var(--text-2); }
    .ope-note--info mat-icon { color: var(--info); }
    .ope-note--warn { background: var(--warn-bg); border: 1px solid var(--warn-bd); color: var(--text-2); }
    .ope-note--warn mat-icon { color: var(--warn); }
    .ope-note--cuivre { background: var(--cuivre-bg); border: 1px solid var(--cuivre-bd); color: var(--text-2); }
    .ope-note--cuivre mat-icon { color: var(--cuivre); }

    .ope-legende { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                   padding: 11px 15px 0; }
    .ope-touche-lg { display: inline-flex; align-items: center; gap: 7px;
                     font-size: 12px; color: var(--text-2); }
    /* Le coin cuivre est la signature d'une valeur saisie à la main : elle survit à un
       enregistrement, pas à un Recalculer. La légende porte le même dessin que les cases. */
    .ope-pastille { width: 11px; height: 11px; border-radius: 2px; background: var(--surface);
                    border: 1px solid var(--cuivre);
                    box-shadow: inset -3px 3px 0 0 var(--cuivre); }

    .ope-grille { margin: 11px 15px 15px; border: 1px solid var(--border);
                  border-radius: var(--r-md); overflow: auto; }
    .ope-tbl { width: 100%; border-collapse: collapse; min-width: 640px; }
    .ope-tbl th { text-align: left; padding: 7px 10px; background: var(--surface-2);
                  border-bottom: 1px solid var(--border-strong); font-size: 10px;
                  letter-spacing: .07em; text-transform: uppercase; color: var(--text-3);
                  font-weight: 700; white-space: nowrap; }
    .ope-tbl td { border-bottom: 1px solid var(--border); }
    .ope-tbl .r { text-align: right; }
    .ope-tbl__vide { background: var(--surface-2); }
    .ope-th-sem { border-left: 1px solid var(--border); text-align: center !important; }
    .ope-th-sem small { display: block; font-size: 10px; font-weight: 400;
                        text-transform: none; letter-spacing: 0; color: var(--text-4); }
    .ope-bandeau { text-align: center !important; font-size: 10.5px !important;
                   text-transform: none !important; letter-spacing: 0 !important;
                   color: var(--text-2) !important; border-left: 1px solid var(--border); }
    .ope-col { min-width: 14rem; padding: 6px 10px; }
    .ope-m { font-weight: 600; font-size: 12.5px; }
    .ope-col small { color: var(--text-4); font-size: 10.5px; margin-left: .3rem; }
    .ope-cible { margin-left: 5px; font-size: 9.5px; padding: 1px 5px; border-radius: var(--r-pill);
                 background: var(--cuivre); color: #fff; vertical-align: 1px; }
    .ope-prio { display: inline-block; margin-left: 6px; font-size: 9.5px; padding: 1px 5px;
                border-radius: var(--r-xs); font-weight: 700; text-transform: uppercase;
                letter-spacing: .03em; border: 1px solid; }
    .ope-prio--secondaire { background: var(--surface-3); color: var(--text-3); border-color: var(--border); }
    .ope-prio--important { background: var(--info-bg); color: var(--info); border-color: var(--info-bd); }
    .ope-prio--intouchable { background: var(--ok-bg); color: var(--ok); border-color: var(--ok-bd); }

    .ope-cell { padding: 0; border-left: 1px solid var(--border); }
    .ope-cell--touche { background: var(--cuivre-bg);
                        box-shadow: inset -4px 4px 0 -1px var(--cuivre); }
    .ope-input { width: 100%; padding: 7px 6px; border: 0; background: transparent;
                 font-family: var(--font-num); font-variant-numeric: tabular-nums;
                 font-size: 12px; text-align: center; color: var(--text); }
    .ope-input:focus { outline: 2px solid var(--green-500); outline-offset: -2px;
                       background: var(--surface); }

    .ope-vide { color: var(--text-4); font-size: 13px; padding: 16px 15px; margin: 0; }
  `],
})
export class ObjectifPeriodeEditeurComponent implements OnInit {

  @Input({ required: true }) periode!: EtatPeriode;
  @Input({ required: true }) metriques: Metrique[] = [];
  @Input({ required: true }) postes: PosteRef[] = [];
  @Output() fermer = new EventEmitter<void>();
  @Output() enregistre = new EventEmitter<void>();

  private api = inject(ObjectifsService);
  private snack = inject(MatSnackBar);

  readonly aide = INFOBULLES_OBJECTIFS;

  modeles = signal<ModeleResume[]>([]);
  lignes = signal<ValeurPeriode[]>([]);
  avertissement = signal<string | null>(null);
  referentielNom = signal<string | null>(null);
  modeleId: string | null = null;
  toutesMetriques = false;
  /** Échappatoire : réutiliser un modèle d'un autre type (une reprise calquée sur une prépa). */
  tousTypes = false;

  /**
   * Trêve et intersaison ne reçoivent pas d'objectif. Ce n'est pas une limite technique : le
   * moteur d'analyse considère déjà ces périodes comme hors charge et n'émet aucune alerte
   * dessus. Y fixer une cible dirait l'inverse de ce que fait le reste de l'application.
   */
  sansCharge(): boolean {
    return ['TREVE', 'INTERSAISON'].includes((this.periode.typePeriode || '').toUpperCase());
  }

  ngOnInit(): void {
    if (this.sansCharge()) return;   // rien à charger : aucun objectif n'est attendu ici
    this.chargerModeles();
    // Un objectif déjà posé : on l'ouvre tel quel, retouches comprises.
    this.api.objectifPeriode(this.periode.periodeId).subscribe({
      next: (d: ObjectifPeriodeDetail) => {
        this.modeleId = d.entete.modeleId;
        this.lignes.set(d.valeurs);
        this.avertissement.set(d.entete.avertissement);
        this.referentielNom.set(d.entete.referentielNom);
      },
      error: () => { /* aucun objectif encore : on part du choix de modèle */ },
    });
  }

  /** Modèles proposables : ceux du type de la période, ou tous si l'échappatoire est cochée. */
  chargerModeles(): void {
    this.api.modeles(this.tousTypes ? undefined : this.periode.typePeriode).subscribe({
      next: m => this.modeles.set(m),
      error: () => this.modeles.set([]),
    });
  }

  // ── Colonnes : semaines en préparation, postes en compétition ──

  private estCompetition(): boolean {
    return (this.periode.typePeriode || '').toUpperCase() === 'COMPETITION';
  }

  colonnes = computed<Colonne[]>(() => {
    const l = this.lignes();
    if (l.length === 0) return [];
    if (this.estCompetition()) {
      const codes = [...new Set(l.map(v => v.poste).filter((p): p is string => !!p))];
      return this.postes.filter(p => codes.includes(p.code))
        .map(p => ({ cle: p.code, titre: p.libelle, sousTitre: '', phase: null }));
    }
    const semaines = [...new Set(l.map(v => v.noSemaine).filter((n): n is number => n != null))]
      .sort((a, b) => a - b);
    return semaines.map(n => {
      const ligne = l.find(v => v.noSemaine === n);
      return {
        cle: String(n),
        titre: `S${n}`,
        sousTitre: ligne?.dateLundi ? this.jourMois(ligne.dateLundi) : '',
        phase: ligne?.phaseNom ?? null,
      };
    });
  });

  /** Regroupe les colonnes consécutives d'une même phase : c'est le bandeau du haut. */
  bandeau = computed<{ nom: string; nb: number; debut: string }[]>(() => {
    const cols = this.colonnes();
    if (this.estCompetition() || cols.length === 0) return [];
    const blocs: { nom: string; nb: number; debut: string }[] = [];
    for (const c of cols) {
      const nom = c.phase ?? '—';
      const dernier = blocs[blocs.length - 1];
      if (dernier && dernier.nom === nom) dernier.nb++;
      else blocs.push({ nom, nb: 1, debut: c.cle });
    }
    return blocs;
  });

  metriquesVisibles = computed<Metrique[]>(() =>
    this.toutesMetriques ? this.metriques : this.metriques.filter(m => m.principale));

  nbModifiees = computed(() => this.lignes().filter(v => v.modifieManuellement).length);

  // ── Lecture / écriture ──

  private trouver(c: Colonne, metrique: string): ValeurPeriode | undefined {
    return this.lignes().find(v => v.metrique === metrique &&
      (this.estCompetition() ? v.poste === c.cle : String(v.noSemaine) === c.cle));
  }

  lire(c: Colonne, metrique: string): number | null {
    return this.trouver(c, metrique)?.valeurMin ?? null;
  }

  estModifiee(c: Colonne, metrique: string): boolean {
    return this.trouver(c, metrique)?.modifieManuellement ?? false;
  }

  /**
   * Une retouche écrit min ET max sur une valeur unique (trajectoire), ou seulement la borne
   * basse en compétition — la borne haute y garde son propre sens de plafond du référentiel.
   */
  ecrire(c: Colonne, metrique: string, v: number | null): void {
    this.lignes.update(l => l.map(ligne => {
      const cible = ligne.metrique === metrique &&
        (this.estCompetition() ? ligne.poste === c.cle : String(ligne.noSemaine) === c.cle);
      if (!cible) return ligne;
      return {
        ...ligne,
        valeurMin: v,
        valeurMax: this.estCompetition() ? ligne.valeurMax : v,
        modifieManuellement: true,
      };
    }));
  }

  prioriteDe(metrique: string): Priorite {
    return this.lignes().find(v => v.metrique === metrique)?.priorite ?? 'IMPORTANT';
  }

  // ── Actions ──

  previsualiser(): void {
    if (!this.modeleId) { this.lignes.set([]); return; }
    if (this.nbModifiees() > 0 &&
        !confirm(`${this.nbModifiees()} case(s) ont été retouchées à la main. Recalculer depuis le modèle les écrasera. Continuer ?`)) {
      return;
    }
    this.api.apercu(this.periode.periodeId, this.modeleId).subscribe({
      next: (a: Apercu) => {
        this.lignes.set(a.valeurs);
        this.avertissement.set(a.avertissement);
      },
      error: e => this.erreur(e),
    });
  }

  enregistrer(): void {
    if (!this.modeleId) return;
    // On instancie d'abord (crée ou remplace l'objectif et son lien au modèle), puis on repose
    // les valeurs à l'écran pour conserver les retouches manuelles éventuelles.
    this.api.instancier(this.periode.periodeId, this.modeleId).subscribe({
      next: () => {
        this.api.enregistrerObjectifPeriode(this.periode.periodeId, this.lignes()).subscribe({
          next: d => {
            this.lignes.set(d.valeurs);
            this.referentielNom.set(d.entete.referentielNom);
            this.snack.open('Objectifs enregistrés pour cette période.', 'OK', { duration: 3500 });
            this.enregistre.emit();
          },
          error: e => this.erreur(e),
        });
      },
      error: e => this.erreur(e),
    });
  }

  // ── Présentation ──

  libTypePeriode(t: string): string {
    const map: Record<string, string> = {
      PREPARATION: 'Préparation', COMPETITION: 'Compétition',
      REPRISE: 'Reprise', TREVE: 'Trêve', INTERSAISON: 'Intersaison',
    };
    return map[(t || '').toUpperCase()] ?? t;
  }

  libPriorite(p: Priorite): string {
    return p === 'INTOUCHABLE' ? 'intouchable' : p === 'SECONDAIRE' ? 'secondaire' : 'important';
  }

  explicationPriorite(p: Priorite): string {
    if (p === 'INTOUCHABLE') return "Jamais réduit, même si l'ACWR impose d'alléger.";
    if (p === 'SECONDAIRE') return 'Absorbe la baisse en premier.';
    return "Réduit seulement une fois le secondaire épuisé.";
  }

  couleurPhase(nom: string): string {
    // Teintes stables par nom : le même bandeau garde ses couleurs d'une période à l'autre.
    let h = 0;
    for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360;
    return `hsl(${h}, 62%, 92%)`;
  }

  private jourMois(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  private erreur(e: { error?: { message?: string } }): void {
    this.snack.open(e?.error?.message || 'Opération impossible.', 'OK', { duration: 6000 });
  }
}
