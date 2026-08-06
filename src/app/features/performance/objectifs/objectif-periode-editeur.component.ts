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
    <div class="editeur">
      <header class="editeur__head">
        <div>
          <h3 class="editeur__titre">
            {{ periode.libelle }}
            <span class="chip">{{ libTypePeriode(periode.typePeriode) }}</span>
          </h3>
          <p class="editeur__sub">
            {{ periode.dateDebut | date : 'd MMM' }} – {{ periode.dateFin | date : 'd MMM y' }}
            · {{ periode.nbSemaines }} semaine{{ periode.nbSemaines > 1 ? 's' : '' }}
          </p>
        </div>
        <button class="ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
      </header>

      @if (sansCharge()) {
        <!-- Trêve et intersaison : le joueur n'est pas censé être en charge. Le moteur d'analyse
             se tait déjà sur ces périodes (aucune alerte) — y fixer un objectif se contredirait. -->
        <div class="repos">
          <mat-icon>bedtime</mat-icon>
          <div>
            <strong>
            Pas d'objectif sur une période de {{ libTypePeriode(periode.typePeriode).toLowerCase() }}.
            <app-info-bulle [texte]="aide.horsCharge" />
          </strong>
            <p>
              Le joueur n'est pas censé être en charge : l'application n'émet déjà aucune alerte
              pendant ces périodes. Lui fixer une cible de charge la contredirait.
            </p>
          </div>
        </div>
      } @else {
        <div class="barre">
          <label class="field">
            <span>Modèle</span>
            <select [(ngModel)]="modeleId" (ngModelChange)="previsualiser()">
              <option [ngValue]="null">— choisir —</option>
              @for (m of modeles(); track m.id) {
                <option [ngValue]="m.id">{{ m.nom }}@if (tousTypes) { — {{ libTypePeriode(m.typePeriode) }} }</option>
              }
            </select>
          </label>
          <label class="chk chk--filtre" [title]="'Par défaut, seuls les modèles du même type que la période sont proposés.'">
            <input type="checkbox" [(ngModel)]="tousTypes" (ngModelChange)="chargerModeles()">
            Tous les types
          </label>
          <div class="barre__spacer"></div>
          @if (modeleId) {
            <button class="btn" (click)="previsualiser()">Recalculer</button>
            <button class="btn btn--primary" (click)="enregistrer()" [disabled]="lignes().length === 0">
              Enregistrer
            </button>
          }
        </div>

        @if (modeles().length === 0) {
          <p class="note note--warn note--bloc">
            <mat-icon>info</mat-icon>
            Aucun modèle de type « {{ libTypePeriode(periode.typePeriode) }} ». Créez-en un à
            l'étape 2, ou cochez « Tous les types » pour en réutiliser un autre.
          </p>
        } @else if (!tousTypes) {
          <p class="filtre-info">
            Seuls les modèles de type « {{ libTypePeriode(periode.typePeriode) }} » sont proposés —
            c'est le type de la période qui commande.
          </p>
        }
      }

      @if (avertissement(); as a) {
        <p class="note note--warn note--bloc">
          <mat-icon>warning</mat-icon> {{ a }}
        </p>
      }

      @if (nbModifiees() > 0) {
        <p class="note note--info note--bloc">
          <mat-icon>edit</mat-icon>
          {{ nbModifiees() }} case(s) retouchée(s) à la main. Recalculer depuis le modèle les écrasera.
        </p>
      }

      @if (lignes().length > 0) {
        <div class="grille-wrap">
          <table class="tbl tbl--grille">
            <thead>
              @if (bandeau().length > 0) {
                <tr class="bandeau">
                  <th><app-info-bulle [texte]="aide.bandeauPhases" /></th>
                  @for (b of bandeau(); track b.nom + b.debut) {
                    <th [attr.colspan]="b.nb" class="bandeau__cell"
                        [style.background]="couleurPhase(b.nom)">{{ b.nom }}</th>
                  }
                </tr>
              }
              <tr>
                <th class="col-metrique">Métrique</th>
                @for (c of colonnes(); track c.cle) {
                  <th class="num"><span class="c-titre">{{ c.titre }}</span><small>{{ c.sousTitre }}</small></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (m of metriquesVisibles(); track m.code) {
                <tr>
                  <td class="col-metrique">
                    <span class="m-nom">{{ m.libelle }}</span>
                    <small>{{ m.unite }}</small>
                    @if (m.nature === 'EXPOSITION') { <app-info-bulle [texte]="aide.metriqueExposition" /> }
                    <span class="prio" [class]="'prio--' + prioriteDe(m.code).toLowerCase()"
                          [title]="explicationPriorite(prioriteDe(m.code))">
                      {{ libPriorite(prioriteDe(m.code)) }}
                    </span>
                  </td>
                  @for (c of colonnes(); track c.cle) {
                    <td class="num">
                      <input type="number" class="mini"
                             [class.mini--touche]="estModifiee(c, m.code)"
                             [ngModel]="lire(c, m.code)"
                             (ngModelChange)="ecrire(c, m.code, $event)">
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pied">
          <label class="chk">
            <input type="checkbox" [(ngModel)]="toutesMetriques"> Afficher les 7 métriques
          </label>
          <p class="legende">
            <span class="pastille pastille--touche"></span> retouché à la main
            <app-info-bulle [texte]="aide.caseRetouchee" />
            @if (referentielNom()) {
              · Échelle : <strong>{{ referentielNom() }}</strong>
              <app-info-bulle [texte]="aide.echelleReferentiel" />
            }
          </p>
        </div>
      } @else if (modeleId) {
        <p class="vide">Aucune valeur générée. Vérifiez que le modèle contient des phases avec des pourcentages.</p>
      }
    </div>
  `,
  styles: [`
    .editeur { display: flex; flex-direction: column; gap: .7rem; }
    .editeur__head { display: flex; justify-content: space-between; align-items: flex-start; }
    .editeur__titre { margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: .5rem; }
    .editeur__sub { margin: .15rem 0 0; color: var(--text-muted, #64748b); font-size: .85rem; }
    .chip { font-size: .72rem; padding: .12rem .45rem; border-radius: 999px;
            background: var(--surface-2, #f1f5f9); color: var(--text-muted, #64748b); font-weight: 500; }
    .barre { display: flex; align-items: flex-end; gap: .7rem; flex-wrap: wrap; }
    .barre__spacer { flex: 1; }
    .grille-wrap { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .tbl th, .tbl td { padding: .4rem .5rem; border-bottom: 1px solid var(--border, #eef2f7); text-align: left; }
    .tbl .num { text-align: right; }
    .col-metrique { min-width: 13rem; }
    .m-nom { font-weight: 600; }
    .col-metrique small { color: var(--text-muted, #94a3b8); margin-left: .3rem; }
    .c-titre { display: block; font-weight: 600; }
    thead small { font-weight: 400; color: var(--text-muted, #94a3b8); font-size: .75rem; }
    .bandeau__cell { text-align: center; font-size: .78rem; text-transform: uppercase;
                     letter-spacing: .04em; border-radius: 5px 5px 0 0; font-weight: 700; }
    .mini { width: 5.2rem; text-align: right; padding: .25rem .3rem;
            border: 1px solid var(--border, #e2e8f0); border-radius: 4px; font-variant-numeric: tabular-nums; }
    .mini--touche { border-color: #f59e0b; background: #fffbeb; }
    .prio { display: inline-block; margin-left: .4rem; font-size: .68rem; padding: .05rem .35rem;
            border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
    .prio--secondaire { background: #f1f5f9; color: #64748b; }
    .prio--important { background: #dbeafe; color: #1d4ed8; }
    .prio--intouchable { background: #dcfce7; color: #15803d; }
    .note { display: flex; align-items: center; gap: .4rem; font-size: .85rem; margin: 0; }
    .note--bloc { padding: .5rem .7rem; border-radius: 6px; }
    .note--warn { color: #b45309; background: #fffbeb; }
    .note--info { color: #1d4ed8; background: #eff6ff; }
    .note mat-icon { font-size: 1.05rem; width: 1.05rem; height: 1.05rem; }
    .pied { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .5rem; }
    .legende { font-size: .8rem; color: var(--text-muted, #64748b); margin: 0; }
    .pastille { display: inline-block; width: .7rem; height: .7rem; border-radius: 3px; vertical-align: -1px; }
    .pastille--touche { background: #fffbeb; border: 1px solid #f59e0b; }
    .chk { display: inline-flex; gap: .35rem; align-items: center; font-size: .85rem; }
    .chk--filtre { color: var(--text-muted, #64748b); white-space: nowrap; padding-bottom: .35rem; }
    .filtre-info { font-size: .78rem; color: var(--text-muted, #94a3b8); margin: -.2rem 0 .2rem; }
    .repos { display: flex; gap: .7rem; align-items: flex-start; padding: .9rem 1rem;
             border-radius: 8px; background: var(--surface-2, #f8fafc);
             border: 1px dashed var(--border, #e2e8f0); }
    .repos mat-icon { color: #64748b; }
    .repos strong { font-size: .95rem; }
    .repos p { margin: .2rem 0 0; font-size: .85rem; color: var(--text-muted, #64748b); max-width: 62ch; }
    .vide { color: var(--text-muted, #94a3b8); font-size: .9rem; }
    .ic { background: none; border: 0; cursor: pointer; color: var(--text-muted, #64748b); }
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
