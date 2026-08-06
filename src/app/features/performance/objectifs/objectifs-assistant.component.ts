import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ContexteService, EquipeContexte } from '@core/services/contexte.service';
import { SaisonContexteService } from '@core/services/saison-contexte.service';
import {
  ObjectifsService, CatalogueReferentiels, Metrique, PosteRef, ReferentielResume,
  ReferentielDetail, Adoption, EtatPeriode, EcartResponse, ValeurRef,
} from '@core/services/objectifs.service';
import { InfoBulleComponent } from '@shared/components/info-bulle/info-bulle.component';
import { INFOBULLES_OBJECTIFS } from './infobulles-objectifs';
import { ModeleObjectifEditeurComponent } from './modele-objectif-editeur.component';
import { ObjectifPeriodeEditeurComponent } from './objectif-periode-editeur.component';
import { BilanPeriodeComponent } from './bilan-periode.component';

type Etape = 1 | 2 | 3 | 4;

/**
 * Assistant de configuration des objectifs de performance, en modale plein écran.
 *
 * <p>Quatre étapes reliées par une timeline <b>librement navigable</b> : on avance, on revient,
 * on saute — rien n'est perdu, parce que chaque étape écrit immédiatement côté serveur au lieu
 * d'accumuler un état local à valider à la fin. C'est aussi ce qui permet de rouvrir l'assistant
 * six mois plus tard pour ne corriger qu'une case.
 *
 * <p>Ouvrable depuis deux endroits, et c'est voulu : depuis Performance pour le parcours complet,
 * et depuis une période de la saison pour aller droit à l'étape 3 sur celle-là. Le référentiel et
 * les modèles sont des biens du CLUB, pas d'une période — les enfermer dans l'écran Saison les
 * rendrait introuvables.
 */
@Component({
  selector: 'app-objectifs-assistant',
  standalone: true,
  imports: [FormsModule, MatIconModule, DatePipe, InfoBulleComponent,
            ModeleObjectifEditeurComponent, ObjectifPeriodeEditeurComponent,
            BilanPeriodeComponent],
  template: `
    <div class="overlay" (click)="fermerSiFond($event)">
      <div class="modale" role="dialog" aria-modal="true">

        <header class="modale__head">
          <div>
            <h2 class="modale__titre">Configuration des objectifs de performance</h2>
            <p class="modale__sub">Se règle une fois par saison. Vous pouvez revenir à n'importe quelle étape.</p>
          </div>
          <button class="ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
        </header>

        <!-- Timeline navigable : chaque pastille est un bouton, dans les deux sens. -->
        <nav class="timeline">
          @for (e of etapes; track e.n) {
            <button class="pas" [class.pas--on]="etape() === e.n" [class.pas--ok]="estFaite(e.n)"
                    (click)="aller(e.n)">
              <span class="pas__rond">
                @if (estFaite(e.n) && etape() !== e.n) { <mat-icon>check</mat-icon> } @else { {{ e.n }} }
              </span>
              <span class="pas__lib">
                <strong>{{ e.titre }}</strong>
                <small>{{ etatCourt(e.n) }}</small>
              </span>
            </button>
            @if (!$last) { <span class="trait" [class.trait--ok]="estFaite(e.n)"></span> }
          }
        </nav>

        <div class="modale__corps">

          <!-- ─────────── Étape 1 : référentiel ─────────── -->
          @if (etape() === 1) {
            <h3 class="etape__titre">
              Choisir le référentiel <app-info-bulle [texte]="aide.referentiel" />
            </h3>
            <p class="etape__aide">
              Le référentiel dit ce qui est <strong>normal</strong> pour un poste, à un niveau donné.
              Il est fourni : adoptez-le tel quel, ou dupliquez-en une copie que vous adaptez. Une
              équipe sans référentiel n'affichera simplement pas de colonne « Attendu ».
            </p>

            <div class="deux-col">
              <div>
                <table class="tbl">
                  <thead><tr>
                    <th>Portée <app-info-bulle [texte]="aide.adoptionEquipe" /></th>
                    <th>Référentiel</th>
                    <th class="num">Version <app-info-bulle [texte]="aide.versionEpinglee" /></th>
                  </tr></thead>
                  <tbody>
                    <tr class="tr--defaut">
                      <td class="nom">Tout le club <small>par défaut</small></td>
                      <td>
                        <select [ngModel]="referentielDe(null)" (ngModelChange)="adopter(null, $event)">
                          <option [ngValue]="null">— aucun —</option>
                          @for (r of adoptables(); track r.id) {
                            <option [ngValue]="r.id">{{ r.nom }}{{ r.plateforme ? '' : ' (copie club)' }}</option>
                          }
                        </select>
                      </td>
                      <td class="num">
                        {{ versionDe(null) }}
                        @if (adoptionDe(null)?.versionDisponibleId) { <mat-icon class="up" title="Nouvelle version disponible">arrow_upward</mat-icon> }
                      </td>
                    </tr>
                    @for (e of equipes(); track e.id) {
                      <tr>
                        <td class="nom">{{ e.nom }}</td>
                        <td>
                          <select [ngModel]="referentielDe(e.id)" (ngModelChange)="adopter(e.id, $event)">
                            <option [ngValue]="null">— suit le club —</option>
                            @for (r of adoptables(); track r.id) {
                              <option [ngValue]="r.id">{{ r.nom }}{{ r.plateforme ? '' : ' (copie club)' }}</option>
                            }
                          </select>
                        </td>
                        <td class="num">
                          {{ versionDe(e.id) }}
                          @if (adoptionDe(e.id)?.versionDisponibleId) { <mat-icon class="up" title="Nouvelle version disponible">arrow_upward</mat-icon> }
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="3" class="vide">Aucune équipe accessible dans votre périmètre.</td></tr>
                    }
                  </tbody>
                </table>

                @for (a of adoptionsAvecMaj(); track a.id) {
                  <div class="maj">
                    <mat-icon>update</mat-icon>
                    <span><strong>{{ a.equipeNom }}</strong> est en v{{ a.version }}.
                      <strong>{{ a.versionDisponibleNom }}</strong> est disponible — vos valeurs ne
                      bougeront pas tant que vous n'aurez pas migré.</span>
                    <button class="btn btn--sm" (click)="voirEcart(a)">Changements</button>
                    <button class="btn btn--sm btn--primary" (click)="migrer(a)">Migrer</button>
                  </div>
                }

                <div class="dupli">
                  <span>Les valeurs ne collent pas à votre réalité ?
                    <app-info-bulle [texte]="aide.duplication" /></span>
                  <select [(ngModel)]="sourceDuplication">
                    <option [ngValue]="null">— à copier —</option>
                    @for (r of adoptables(); track r.id) { <option [ngValue]="r.id">{{ r.nom }}</option> }
                  </select>
                  <button class="btn btn--sm" (click)="dupliquer()" [disabled]="!sourceDuplication">Dupliquer</button>
                </div>
              </div>

              <!-- Aperçu : sans lui, on choisit un référentiel sans savoir ce qu'il contient. -->
              <aside class="apercu">
                <div class="apercu__head">
                  <h4>Aperçu <app-info-bulle [texte]="aide.contexteMatchSemaine" /></h4>
                  <select [(ngModel)]="apercuId" (ngModelChange)="chargerApercu()">
                    <option [ngValue]="null">— choisir —</option>
                    @for (r of adoptables(); track r.id) { <option [ngValue]="r.id">{{ r.nom }}</option> }
                  </select>
                </div>
                @if (apercu(); as a) {
                  <div class="seg seg--sm">
                    @for (c of ['SEMAINE', 'MATCH']; track c) {
                      <button class="seg__item" [class.seg__item--on]="ctxApercu() === c"
                              (click)="ctxApercu.set(c)">{{ c === 'MATCH' ? 'Match' : 'Semaine' }}</button>
                    }
                  </div>
                  <table class="tbl tbl--mini">
                    <thead>
                      <tr><th>Métrique</th>
                        @for (p of postesApercu(); track p.code) { <th class="num">{{ p.libelle }}</th> }
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of metriquesApercu(); track m.code) {
                        <tr>
                          <td class="nom">{{ m.libelle }}</td>
                          @for (p of postesApercu(); track p.code) {
                            <td class="num">{{ celluleApercu(p.code, m) }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                  <label class="chk"><input type="checkbox" [(ngModel)]="apercuToutes"> Les 7 métriques</label>
                  <p class="apercu__pied">
                    {{ a.valeurs.length }} valeurs · {{ postesApercu().length }} postes
                    @if (a.entete.statut !== 'PUBLIE') { · <em>{{ a.entete.statut === 'BROUILLON' ? 'brouillon' : 'archivé' }}</em> }
                  </p>
                } @else {
                  <p class="vide">Choisissez un référentiel pour voir ses valeurs avant de l'adopter.</p>
                }
              </aside>
            </div>

            @if (ecart(); as e) {
              <div class="diff">
                <h4 class="sous-titre">{{ e.avantNom }} → {{ e.apresNom }}</h4>
                @if (e.lignes.length === 0) { <p class="vide">Aucune valeur ne change.</p> } @else {
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
                <button class="btn btn--sm" (click)="ecart.set(null)">Fermer</button>
              </div>
            }
          }

          <!-- ─────────── Étape 2 : modèles ─────────── -->
          @if (etape() === 2) {
            <h3 class="etape__titre">
              Préparer les modèles <app-info-bulle [texte]="aide.modele" />
            </h3>
            <p class="etape__aide">
              Un modèle est la <strong>forme</strong> d'une période — ses phases et leur niveau —
              sans ses kilomètres. Le référentiel fournit l'échelle, donc le même modèle sert à
              toutes vos équipes quel que soit leur niveau. Ces modèles n'appartiennent qu'à votre club.
            </p>
            <app-modele-objectif-editeur [metriques]="metriques()" (change)="rechargerPeriodes()" />
          }

          <!-- ─────────── Étape 3 : périodes ─────────── -->
          @if (etape() === 3) {
            <h3 class="etape__titre">
              Poser les objectifs sur les périodes
              <app-info-bulle [texte]="aide.trajectoireVsPostes" />
            </h3>
            <p class="etape__aide">
              Chaque période reçoit un modèle. Le passage d'une période à l'autre est automatique :
              à la date prévue, l'application bascule sur les objectifs suivants.
              <app-info-bulle [texte]="aide.bascPeriode" />
            </p>

            <div class="barre">
              <label class="field"><span>Équipe</span>
                <select [ngModel]="equipeChoisie()" (ngModelChange)="choisirEquipe($event)">
                  <option [ngValue]="null">— choisir une équipe —</option>
                  @for (e of equipes(); track e.id) { <option [ngValue]="e.id">{{ e.nom }}</option> }
                </select>
              </label>
              @if (saisonNom()) { <span class="chip">Saison {{ saisonNom() }}</span> }
            </div>

            @if (!saisonId()) {
              <p class="vide">Aucune saison en cours. Créez-en une depuis Planning › Saison.</p>
            } @else if (!equipeChoisie()) {
              <p class="vide">Choisissez une équipe pour voir ses périodes.</p>
            } @else if (periodes().length === 0) {
              <p class="vide">
                Aucune période définie pour cette équipe. Créez-les depuis Planning › Saison,
                puis revenez ici.
              </p>
            } @else {
              <div class="cartes">
                @for (p of periodes(); track p.periodeId) {
                  <button class="carte" [class.carte--on]="edition()?.periodeId === p.periodeId"
                          [class.carte--faite]="p.objectifsDefinis"
                          [class.carte--repos]="sansCharge(p)" (click)="editer(p)">
                    <span class="carte__type">{{ libTypePeriode(p.typePeriode) }}</span>
                    <strong class="carte__nom">{{ p.libelle }}</strong>
                    <span class="carte__dates">
                      {{ p.dateDebut | date : 'd MMM' }} – {{ p.dateFin | date : 'd MMM' }} · {{ p.nbSemaines }} sem.
                    </span>
                    <span class="carte__etat">
                      @if (sansCharge(p)) {
                        <mat-icon>bedtime</mat-icon> Hors charge
                      } @else if (p.objectifsDefinis) {
                        <mat-icon>check_circle</mat-icon> {{ p.modeleNom || 'Défini' }}
                      } @else {
                        <mat-icon>radio_button_unchecked</mat-icon> À définir
                      }
                    </span>
                    <!-- Le bilan n'apparaît que si la période a commencé ET porte des objectifs :
                         proposer un bilan vide sur une période à venir n'a aucun sens. -->
                    @if (p.objectifsDefinis && !sansCharge(p) && aCommence(p)) {
                      <span class="carte__bilan" (click)="ouvrirBilan(p, $event)">
                        <mat-icon>insights</mat-icon> Bilan
                      </span>
                    }
                  </button>
                }
              </div>

              @if (edition(); as p) {
                <div class="editeur-zone">
                  <app-objectif-periode-editeur
                    [periode]="p" [metriques]="metriques()" [postes]="postes()"
                    (fermer)="edition.set(null)" (enregistre)="rechargerPeriodes()" />
                </div>
              }

              @if (bilanPeriodeId(); as pid) {
                <app-bilan-periode [periodeId]="pid" (fermer)="bilanPeriodeId.set(null)" />
              }
            }
          }

          <!-- ─────────── Étape 4 : résumé ─────────── -->
          @if (etape() === 4) {
            <h3 class="etape__titre">Résumé</h3>
            <p class="etape__aide">Tout est enregistré au fur et à mesure — il n'y a rien à valider ici.</p>
            <ul class="bilan">
              <li [class.ok]="adoptions().length > 0">
                <mat-icon>{{ adoptions().length > 0 ? 'check_circle' : 'error_outline' }}</mat-icon>
                <span><strong>Référentiel</strong> — {{ adoptions().length }} adoption(s)
                  @if (adoptions().length === 0) { <em>: aucune colonne « Attendu » ne s'affichera</em> }
                </span>
              </li>
              <li [class.ok]="nbModeles() > 0">
                <mat-icon>{{ nbModeles() > 0 ? 'check_circle' : 'error_outline' }}</mat-icon>
                <span><strong>Modèles</strong> — {{ nbModeles() }} disponible(s)</span>
              </li>
              <li [class.ok]="nbPeriodesFaites() > 0">
                <mat-icon>{{ nbPeriodesFaites() > 0 ? 'check_circle' : 'error_outline' }}</mat-icon>
                <span><strong>Périodes</strong> — {{ nbPeriodesFaites() }} / {{ nbPeriodesAConfigurer() }} avec objectifs
                  @if (equipeChoisie()) { pour l'équipe sélectionnée }
                  @if (periodes().length > nbPeriodesAConfigurer()) {
                    <em>({{ periodes().length - nbPeriodesAConfigurer() }} hors charge, sans objectif attendu)</em>
                  }
                </span>
              </li>
            </ul>
            <p class="etape__aide">
              Le suivi hebdomadaire se lit ensuite dans <strong>Performance › Charge d'entraînement</strong>,
              onglet « Objectif ».
            </p>
          }
        </div>

        <footer class="modale__pied">
          <button class="btn" (click)="aller(precedente())" [disabled]="etape() === 1">
            <mat-icon>arrow_back</mat-icon> Précédent
          </button>
          <span class="pied__pos">Étape {{ etape() }} sur 4</span>
          @if (etape() < 4) {
            <button class="btn btn--primary" (click)="aller(suivante())">
              Suivant <mat-icon>arrow_forward</mat-icon>
            </button>
          } @else {
            <button class="btn btn--primary" (click)="fermer.emit()">Terminer</button>
          }
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, .55); z-index: 1000;
               display: grid; place-items: center; padding: 1.2rem; }
    .modale { background: var(--surface, #fff); border-radius: 14px; width: min(1180px, 100%);
              max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;
              box-shadow: 0 18px 50px rgba(0,0,0,.28); }
    .modale__head { display: flex; justify-content: space-between; align-items: flex-start;
                    gap: 1rem; padding: 1rem 1.2rem .6rem; }
    .modale__titre { margin: 0; font-size: 1.15rem; }
    .modale__sub { margin: .15rem 0 0; color: var(--text-muted, #64748b); font-size: .85rem; }
    .timeline { display: flex; align-items: center; gap: .35rem; padding: .4rem 1.2rem 1rem;
                border-bottom: 1px solid var(--border, #e2e8f0); overflow-x: auto; }
    .pas { display: flex; align-items: center; gap: .5rem; background: none; border: 0;
           cursor: pointer; font: inherit; padding: .2rem .3rem; border-radius: 8px; white-space: nowrap; }
    .pas:hover { background: var(--surface-2, #f1f5f9); }
    .pas__rond { flex: 0 0 1.75rem; height: 1.75rem; border-radius: 50%; display: grid; place-items: center;
                 background: var(--surface-2, #e2e8f0); color: #475569; font-weight: 700; font-size: .85rem; }
    .pas--on .pas__rond { background: var(--primary, #2563eb); color: #fff; }
    .pas--ok .pas__rond { background: #16a34a; color: #fff; }
    .pas__rond mat-icon { font-size: 1rem; width: 1rem; height: 1rem; }
    .pas__lib { display: flex; flex-direction: column; line-height: 1.15; text-align: left; }
    .pas__lib strong { font-size: .86rem; }
    .pas__lib small { font-size: .72rem; color: var(--text-muted, #94a3b8); }
    .trait { flex: 1 1 1.2rem; min-width: .8rem; height: 2px; background: var(--border, #e2e8f0); }
    .trait--ok { background: #16a34a; }
    .modale__corps { padding: 1rem 1.2rem; overflow-y: auto; flex: 1; }
    .etape__titre { margin: 0 0 .25rem; font-size: 1.02rem; }
    .etape__aide { margin: 0 0 .9rem; color: var(--text-muted, #64748b); font-size: .86rem; max-width: 78ch; }
    .deux-col { display: grid; grid-template-columns: 1fr minmax(280px, 400px); gap: 1.2rem; align-items: start; }
    .apercu { border: 1px solid var(--border, #e2e8f0); border-radius: 10px; padding: .7rem .8rem;
              background: var(--surface-2, #f8fafc); }
    .apercu__head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .apercu__head h4 { margin: 0; font-size: .92rem; }
    .apercu__pied { font-size: .76rem; color: var(--text-muted, #94a3b8); margin: .4rem 0 0; }
    .seg { display: inline-flex; border: 1px solid var(--border, #e2e8f0); border-radius: 6px;
           overflow: hidden; margin: .55rem 0; background: #fff; }
    .seg__item { background: none; border: 0; padding: .25rem .6rem; cursor: pointer; font: inherit; font-size: .82rem; }
    .seg__item--on { background: var(--primary, #2563eb); color: #fff; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .tbl th, .tbl td { padding: .4rem .5rem; border-bottom: 1px solid var(--border, #eef2f7); text-align: left; }
    .tbl .num { text-align: right; }
    .tbl .nom { font-weight: 600; }
    .tbl .nom small { font-weight: 400; color: var(--text-muted, #94a3b8); margin-left: .25rem; }
    .tbl--mini { font-size: .78rem; }
    .tbl--mini th, .tbl--mini td { padding: .22rem .3rem; }
    .tr--defaut { background: var(--surface-2, #f8fafc); }
    .up { color: #2563eb; font-size: 1rem; width: 1rem; height: 1rem; vertical-align: -2px; }
    .maj { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-top: .55rem;
           padding: .5rem .65rem; border-radius: 6px; background: #eff6ff; color: #1e40af; font-size: .84rem; }
    .maj mat-icon { font-size: 1.1rem; width: 1.1rem; height: 1.1rem; }
    .dupli { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; margin-top: .8rem;
             padding-top: .65rem; border-top: 1px dashed var(--border, #e2e8f0);
             font-size: .83rem; color: var(--text-muted, #64748b); }
    .diff { margin-top: 1rem; }
    .diff .av { color: var(--text-muted, #94a3b8); }
    .diff .ap { font-weight: 600; }
    .sous-titre { font-size: .92rem; margin: .4rem 0 .3rem; }
    .barre { display: flex; align-items: flex-end; gap: .8rem; flex-wrap: wrap; margin-bottom: .8rem; }
    .chip { font-size: .75rem; padding: .15rem .5rem; border-radius: 999px;
            background: var(--surface-2, #f1f5f9); color: var(--text-muted, #64748b); }
    .cartes { display: grid; grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); gap: .65rem; }
    .carte { display: flex; flex-direction: column; gap: .12rem; text-align: left; cursor: pointer;
             padding: .65rem .75rem; border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
             background: var(--surface, #fff); font: inherit; }
    .carte--on { border-color: var(--primary, #2563eb); box-shadow: 0 0 0 2px rgba(37,99,235,.12); }
    .carte--faite { border-left: 3px solid #16a34a; }
    .carte--repos { border-left: 3px solid #cbd5e1; background: var(--surface-2, #f8fafc); }
    .carte--repos .carte__etat { color: #94a3b8; }
    .carte__type { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted, #94a3b8); }
    .carte__nom { font-size: .95rem; }
    .carte__dates { font-size: .78rem; color: var(--text-muted, #64748b); }
    .carte__etat { display: inline-flex; align-items: center; gap: .22rem; font-size: .78rem;
                   margin-top: .25rem; color: var(--text-muted, #64748b); }
    .carte--faite .carte__etat { color: #15803d; }
    .carte__bilan { display: inline-flex; align-items: center; gap: .2rem; margin-top: .3rem;
                    font-size: .75rem; color: #2563eb; }
    .carte__bilan:hover { text-decoration: underline; }
    .carte__bilan mat-icon { font-size: .9rem; width: .9rem; height: .9rem; }
    .carte__etat mat-icon { font-size: .95rem; width: .95rem; height: .95rem; }
    .editeur-zone { margin-top: 1rem; padding-top: .9rem; border-top: 1px solid var(--border, #e2e8f0); }
    .bilan { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
    .bilan li { display: flex; align-items: center; gap: .5rem; font-size: .9rem; color: #b45309; }
    .bilan li.ok { color: #15803d; }
    .modale__pied { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
                    padding: .75rem 1.2rem; border-top: 1px solid var(--border, #e2e8f0);
                    background: var(--surface-2, #f8fafc); }
    .pied__pos { font-size: .82rem; color: var(--text-muted, #64748b); }
    .vide { color: var(--text-muted, #94a3b8); font-size: .88rem; padding: .5rem 0; }
    .chk { display: inline-flex; gap: .3rem; align-items: center; font-size: .8rem; }
    .ic { background: none; border: 0; cursor: pointer; color: var(--text-muted, #64748b); }
    @media (max-width: 960px) { .deux-col { grid-template-columns: 1fr; } }
  `],
})
export class ObjectifsAssistantComponent implements OnInit {

  /** Ouvre directement sur une période précise (entrée depuis l'écran Saison). */
  @Input() periodeCible: string | null = null;
  @Input() etapeInitiale: Etape = 1;
  @Output() fermer = new EventEmitter<void>();

  private api = inject(ObjectifsService);
  private contexte = inject(ContexteService);
  private saisonCtx = inject(SaisonContexteService);
  private snack = inject(MatSnackBar);

  /** Textes d'aide : le paragraphe dit à quoi sert l'étape, l'infobulle lève le jargon d'un champ. */
  readonly aide = INFOBULLES_OBJECTIFS;

  readonly etapes = [
    { n: 1 as Etape, titre: 'Référentiel' },
    { n: 2 as Etape, titre: 'Modèles' },
    { n: 3 as Etape, titre: 'Périodes' },
    { n: 4 as Etape, titre: 'Résumé' },
  ];

  etape = signal<Etape>(1);
  catalogue = signal<CatalogueReferentiels | null>(null);
  adoptions = signal<Adoption[]>([]);
  equipes = signal<EquipeContexte[]>([]);
  equipeChoisie = signal<string | null>(null);
  periodes = signal<EtatPeriode[]>([]);
  edition = signal<EtatPeriode | null>(null);
  ecart = signal<EcartResponse | null>(null);
  nbModeles = signal(0);

  apercu = signal<ReferentielDetail | null>(null);
  apercuId: string | null = null;
  apercuToutes = false;
  ctxApercu = signal<string>('SEMAINE');
  sourceDuplication: string | null = null;

  metriques = computed<Metrique[]>(() => this.catalogue()?.metriques ?? []);
  postes = computed<PosteRef[]>(() => this.catalogue()?.postes ?? []);
  saisonId = computed<string | null>(() => this.saisonCtx.enCours()?.id ?? null);
  saisonNom = computed<string | null>(() => this.saisonCtx.enCours()?.libelle ?? null);

  adoptables = computed<ReferentielResume[]>(() =>
    (this.catalogue()?.referentiels ?? []).filter(r => r.statut !== 'ARCHIVE'));

  adoptionsAvecMaj = computed<Adoption[]>(() =>
    this.adoptions().filter(a => !!a.versionDisponibleId));

  nbPeriodesFaites = computed(() => this.periodes().filter(p => p.objectifsDefinis).length);

  /**
   * Périodes qui attendent réellement un objectif. Trêve et intersaison en sont exclues, sans
   * quoi le compteur « 3 / 5 » n'atteindrait jamais son total et l'étape resterait éternellement
   * marquée comme inachevée.
   */
  nbPeriodesAConfigurer = computed(() =>
    this.periodes().filter(p => !this.sansCharge(p)).length);

  ngOnInit(): void {
    this.etape.set(this.etapeInitiale);

    this.api.catalogue().subscribe({
      next: c => this.catalogue.set(c),
      error: e => this.erreur(e),
    });
    this.rechargerAdoptions();
    this.api.modeles().subscribe({ next: m => this.nbModeles.set(m.length), error: () => {} });

    // Les équipes sont chargées ICI plutôt que lues dans le contexte global : l'assistant doit
    // fonctionner même si aucune équipe n'a été sélectionnée dans le sélecteur du bandeau.
    const dispo = this.contexte.equipesDispo();
    if (dispo.length > 0) {
      this.equipes.set(dispo);
      this.initEquipe(dispo);
    } else {
      this.contexte.chargerEquipesAutorisees().subscribe({
        next: eq => { this.equipes.set(eq); this.initEquipe(eq); },
        error: () => this.equipes.set([]),
      });
    }

    this.saisonCtx.charger().subscribe({ next: () => this.rechargerPeriodes(), error: () => {} });
  }

  private initEquipe(eq: EquipeContexte[]): void {
    const active = this.contexte.equipesActives()[0] ?? null;
    this.equipeChoisie.set(active ?? (eq.length > 0 ? eq[0].id : null));
    this.rechargerPeriodes();
  }

  // ── Navigation ──

  aller(n: Etape): void {
    this.etape.set(n);
    if (n === 3) this.rechargerPeriodes();
    if (n === 4) this.api.modeles().subscribe({ next: m => this.nbModeles.set(m.length), error: () => {} });
  }

  precedente(): Etape { return Math.max(1, this.etape() - 1) as Etape; }
  suivante(): Etape { return Math.min(4, this.etape() + 1) as Etape; }

  /** Une étape « faite » : le rond passe au vert dans la timeline. */
  estFaite(n: Etape): boolean {
    if (n === 1) return this.adoptions().length > 0;
    if (n === 2) return this.nbModeles() > 0;
    if (n === 3) return this.nbPeriodesFaites() > 0;
    return false;
  }

  etatCourt(n: Etape): string {
    if (n === 1) return this.adoptions().length > 0 ? `${this.adoptions().length} adoption(s)` : 'à choisir';
    if (n === 2) return this.nbModeles() > 0 ? `${this.nbModeles()} modèle(s)` : 'à créer';
    if (n === 3) return this.nbPeriodesAConfigurer() > 0
      ? `${this.nbPeriodesFaites()} / ${this.nbPeriodesAConfigurer()}` : 'à définir';
    return 'vérifier';
  }

  fermerSiFond(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).classList.contains('overlay')) this.fermer.emit();
  }

  // ── Étape 1 ──

  private rechargerAdoptions(): void {
    this.api.adoptions().subscribe({
      next: a => this.adoptions.set(a),
      error: () => this.adoptions.set([]),
    });
  }

  adoptionDe(equipeId: string | null): Adoption | undefined {
    return this.adoptions().find(a => (a.equipeId ?? null) === equipeId);
  }

  referentielDe(equipeId: string | null): string | null {
    return this.adoptionDe(equipeId)?.referentielId ?? null;
  }

  versionDe(equipeId: string | null): string {
    const a = this.adoptionDe(equipeId);
    return a ? `v${a.version}` : '—';
  }

  adopter(equipeId: string | null, referentielId: string | null): void {
    if (!referentielId) {
      const a = this.adoptionDe(equipeId);
      if (!a) return;
      this.api.retirerAdoption(a.id).subscribe({
        next: () => { this.rechargerAdoptions(); this.snack.open('Adoption retirée.', 'OK', { duration: 2500 }); },
        error: e => this.erreur(e),
      });
      return;
    }
    this.api.adopter(referentielId, equipeId).subscribe({
      next: () => {
        this.rechargerAdoptions();
        // Aperçu automatique de ce qu'on vient d'adopter : sinon on choisit à l'aveugle.
        this.apercuId = referentielId;
        this.chargerApercu();
        this.snack.open('Référentiel adopté.', 'OK', { duration: 2500 });
      },
      error: e => this.erreur(e),
    });
  }

  chargerApercu(): void {
    if (!this.apercuId) { this.apercu.set(null); return; }
    this.api.detailReferentiel(this.apercuId).subscribe({
      next: d => this.apercu.set(d),
      error: e => this.erreur(e),
    });
  }

  metriquesApercu = computed<Metrique[]>(() =>
    this.apercuToutes ? this.metriques() : this.metriques().filter(m => m.principale));

  postesApercu = computed<PosteRef[]>(() => {
    const a = this.apercu();
    if (!a) return [];
    const presents = new Set(a.valeurs.map(v => v.poste));
    return this.postes().filter(p => presents.has(p.code));
  });

  celluleApercu(poste: string, m: Metrique): string {
    const a = this.apercu();
    if (!a) return '—';
    const v: ValeurRef | undefined = a.valeurs.find(
      x => x.poste === poste && x.contexte === this.ctxApercu() && x.metrique === m.code);
    if (!v) return '—';
    if (m.nature === 'EXPOSITION') return v.valeurMin != null ? `${v.valeurMin} %` : '—';
    return this.borne(v.valeurMin, v.valeurMax);
  }

  voirEcart(a: Adoption): void {
    if (!a.versionDisponibleId) return;
    this.api.ecart(a.referentielId, a.versionDisponibleId).subscribe({
      next: e => this.ecart.set(e),
      error: e => this.erreur(e),
    });
  }

  migrer(a: Adoption): void {
    if (!a.versionDisponibleId) return;
    if (!confirm(`Migrer « ${a.equipeNom} » vers ${a.versionDisponibleNom} ?\n\nLa colonne « Attendu » de vos joueurs sera recalculée.`)) return;
    this.api.adopter(a.versionDisponibleId, a.equipeId).subscribe({
      next: () => { this.ecart.set(null); this.rechargerAdoptions(); this.snack.open('Migration effectuée.', 'OK', { duration: 3000 }); },
      error: e => this.erreur(e),
    });
  }

  dupliquer(): void {
    if (!this.sourceDuplication) return;
    this.api.dupliquer(this.sourceDuplication).subscribe({
      next: d => {
        this.sourceDuplication = null;
        this.api.catalogue().subscribe({ next: c => this.catalogue.set(c), error: () => {} });
        this.apercuId = d.entete.id;
        this.chargerApercu();
        this.snack.open(`Copie « ${d.entete.nom} » créée. Adoptez-la, puis ajustez ses valeurs.`,
          'OK', { duration: 6000 });
      },
      error: e => this.erreur(e),
    });
  }

  // ── Étape 3 ──

  choisirEquipe(id: string | null): void {
    this.equipeChoisie.set(id);
    this.edition.set(null);
    this.rechargerPeriodes();
  }

  rechargerPeriodes(): void {
    const s = this.saisonId(), e = this.equipeChoisie();
    if (!s || !e) { this.periodes.set([]); return; }
    this.api.etatPeriodes(s, e).subscribe({
      next: p => {
        this.periodes.set(p);
        if (this.periodeCible) {
          const cible = p.find(x => x.periodeId === this.periodeCible);
          if (cible) this.edition.set(cible);
        }
      },
      error: () => this.periodes.set([]),
    });
  }

  editer(p: EtatPeriode): void {
    this.edition.set(this.edition()?.periodeId === p.periodeId ? null : p);
  }

  /** Trêve et intersaison : hors charge, donc sans objectif — et l'app se tait déjà dessus. */
  sansCharge(p: EtatPeriode): boolean {
    return ['TREVE', 'INTERSAISON'].includes((p.typePeriode || '').toUpperCase());
  }

  // ── Bilan de période ──

  bilanPeriodeId = signal<string | null>(null);

  /** Une période qui n'a pas commencé n'a rien à bilanter — le bouton n'apparaît pas. */
  aCommence(p: EtatPeriode): boolean {
    return !!p.dateDebut && new Date(p.dateDebut) <= new Date();
  }

  /** La carte entière ouvre l'éditeur : le bilan doit arrêter la propagation du clic. */
  ouvrirBilan(p: EtatPeriode, ev: Event): void {
    ev.stopPropagation();
    this.bilanPeriodeId.set(p.periodeId);
  }

  // ── Présentation ──

  libTypePeriode(t: string): string {
    const map: Record<string, string> = {
      PREPARATION: 'Préparation', COMPETITION: 'Compétition',
      REPRISE: 'Reprise', TREVE: 'Trêve', INTERSAISON: 'Intersaison',
    };
    return map[(t || '').toUpperCase()] ?? t;
  }

  libMetrique(code: string): string {
    return this.metriques().find(m => m.code === code)?.libelle ?? code;
  }
  libPoste(code: string): string {
    return this.postes().find(p => p.code === code)?.libelle ?? code;
  }

  borne(min: number | null, max: number | null): string {
    if (min == null && max == null) return '—';
    if (min != null && max != null) return `${min.toLocaleString('fr-FR')} – ${max.toLocaleString('fr-FR')}`;
    return (min ?? max)!.toLocaleString('fr-FR');
  }

  private erreur(e: { error?: { message?: string } }): void {
    this.snack.open(e?.error?.message || 'Opération impossible.', 'OK', { duration: 5000 });
  }
}
