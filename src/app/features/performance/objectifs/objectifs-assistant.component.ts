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
 *
 * <p>La bande <b>Habituel / Attendu / Retenu</b> sous la timeline n'est pas décorative : ces trois
 * mots portent tout l'écran, et l'assistant est justement l'endroit où on les rencontre pour la
 * première fois. La laisser à l'écran en permanence coûte 30 px et évite d'avoir à les redéfinir
 * dans chaque paragraphe.
 */
@Component({
  selector: 'app-objectifs-assistant',
  standalone: true,
  imports: [FormsModule, MatIconModule, DatePipe, InfoBulleComponent,
            ModeleObjectifEditeurComponent, ObjectifPeriodeEditeurComponent,
            BilanPeriodeComponent],
  template: `
    <div class="oa-overlay" (click)="fermerSiFond($event)">
      <div class="oa-modale" role="dialog" aria-modal="true">

        <header class="oa-head">
          <div class="oa-head__txt">
            <div class="oa-head__ligne">
              <h2 class="oa-head__titre">Objectifs de performance</h2>
              <span class="oa-head__kicker">assistant de configuration</span>
            </div>
            <p class="oa-head__sub">
              On y règle l'<strong>Attendu</strong> et le <strong>Retenu</strong>.
              Le suivi hebdomadaire se lit ailleurs.
            </p>
          </div>

          <!-- Rien à valider à la fin : le seul retour d'écriture est cette pastille. -->
          <span class="oa-save" [class.oa-save--busy]="enregistrement()">
            <span class="oa-save__dot"></span>
            {{ enregistrement() ? 'Enregistrement…' : 'Tout est enregistré' }}
          </span>

          <span class="oa-ctx">
            @if (equipeNomCourant(); as e) { <strong>{{ e }}</strong> }
            @if (equipeNomCourant() && saisonNom()) { <span class="oa-ctx__sep">·</span> }
            @if (saisonNom(); as s) { <span class="num">{{ s }}</span> }
          </span>

          <button class="oa-ic" title="Fermer" (click)="fermer.emit()"><mat-icon>close</mat-icon></button>
        </header>

        <!-- Timeline navigable : chaque pastille est un bouton, dans les deux sens. -->
        <nav class="oa-timeline">
          @for (e of etapes; track e.n) {
            <button class="oa-pas" [class.oa-pas--on]="etape() === e.n"
                    [class.oa-pas--ok]="estFaite(e.n)" (click)="aller(e.n)">
              <span class="oa-pas__rond">
                @if (estFaite(e.n) && etape() !== e.n) { <mat-icon>check</mat-icon> } @else { {{ e.n }} }
              </span>
              <span class="oa-pas__lib">
                <strong>{{ e.titre }}</strong>
                <small>{{ etatCourt(e.n) }}</small>
              </span>
            </button>
            @if (!$last) { <span class="oa-trait" [class.oa-trait--ok]="estFaite(e.n)"></span> }
          }
        </nav>

        <!-- Les trois notions : le vocabulaire imposé, toujours à l'écran. -->
        <div class="oa-lex">
          <span class="oa-lex__t">Les trois notions</span>
          <span class="oa-lex__i"><i class="oa-dot oa-dot--hab"></i><b>Habituel</b> ce que ce joueur fait d'ordinaire</span>
          <span class="oa-lex__i"><i class="oa-dot oa-dot--att"></i><b>Attendu</b> ce que fait normalement son poste à ce niveau</span>
          <span class="oa-lex__i"><i class="oa-dot oa-dot--ret"></i><b>Retenu</b> ce que le club décide pour la semaine</span>
        </div>

        <div class="oa-corps">

          <!-- ─────────── Étape 1 : référentiel ─────────── -->
          @if (etape() === 1) {
            <section class="oa-e1">
              <div class="oa-e1__main">
                <div class="oa-intro">
                  <h3 class="oa-titre">
                    Quel référentiel sert de repère ? <app-info-bulle [texte]="aide.referentiel" />
                  </h3>
                  <p class="oa-aide">
                    Le référentiel dit ce qu'un joueur de tel poste fait normalement à votre niveau
                    de jeu : c'est lui qui remplit la colonne <strong>Attendu</strong>. La plateforme
                    le publie, vous l'adoptez. Une équipe première et une U19 ne jouent pas au même
                    niveau : chaque équipe peut donc adopter le sien.
                  </p>
                </div>

                <div class="oa-bloc">
                  <div class="oa-bloc__head">
                    <h4 class="oa-bloc__titre">Adoptions</h4>
                    <span class="oa-bloc__hint">une ligne pour tout le club, puis une par équipe</span>
                    <span class="oa-bloc__compte num">
                      {{ adoptions().length }} / {{ equipes().length + 1 }}
                    </span>
                  </div>

                  <div class="oa-ligne oa-ligne--defaut">
                    <div class="oa-ligne__nom">
                      <strong>Tout le club</strong>
                      <small>valeur par défaut <app-info-bulle [texte]="aide.adoptionEquipe" /></small>
                    </div>
                    <div class="oa-ligne__act">
                      <select class="oa-select" [ngModel]="referentielDe(null)"
                              (ngModelChange)="adopter(null, $event)">
                        <option [ngValue]="null">— aucune adoption —</option>
                        @for (r of adoptables(); track r.id) {
                          <option [ngValue]="r.id">{{ r.nom }}{{ r.plateforme ? '' : ' (copie club)' }}</option>
                        }
                      </select>
                      <span class="oa-ver num">{{ versionDe(null) }}
                        <app-info-bulle [texte]="aide.versionEpinglee" /></span>
                      @if (adoptionDe(null); as a) {
                        @if (a.versionDisponibleId) {
                          <button class="badge badge--info oa-maj-btn" (click)="voirEcart(a)">
                            <mat-icon>arrow_upward</mat-icon> {{ a.versionDisponibleNom }}
                          </button>
                        }
                      } @else {
                        <span class="badge badge--warn">pas d'Attendu</span>
                      }
                    </div>
                  </div>

                  @for (e of equipes(); track e.id) {
                    <div class="oa-ligne">
                      <div class="oa-ligne__nom">
                        <strong>{{ e.nom }}</strong>
                        <small>{{ adoptionDe(e.id) ? 'adoption propre' : 'suit le club' }}</small>
                      </div>
                      <div class="oa-ligne__act">
                        <select class="oa-select" [ngModel]="referentielDe(e.id)"
                                (ngModelChange)="adopter(e.id, $event)">
                          <option [ngValue]="null">— suit le club —</option>
                          @for (r of adoptables(); track r.id) {
                            <option [ngValue]="r.id">{{ r.nom }}{{ r.plateforme ? '' : ' (copie club)' }}</option>
                          }
                        </select>
                        <span class="oa-ver num">{{ versionDe(e.id) }}</span>
                        @if (adoptionDe(e.id); as a) {
                          @if (a.versionDisponibleId) {
                            <button class="badge badge--info oa-maj-btn" (click)="voirEcart(a)">
                              <mat-icon>arrow_upward</mat-icon> {{ a.versionDisponibleNom }}
                            </button>
                          }
                        }
                      </div>
                    </div>
                  } @empty {
                    <div class="oa-ligne"><p class="oa-vide">Aucune équipe accessible dans votre périmètre.</p></div>
                  }
                </div>

                @if (adoptionsAvecMaj().length > 0) {
                  <div class="oa-updates">
                    <div class="oa-updates__head">
                      <h4>Mises à jour disponibles</h4>
                      <span>rien ne change tant que vous n'avez pas migré
                        <app-info-bulle [texte]="aide.versionEpinglee" /></span>
                    </div>
                    @for (a of adoptionsAvecMaj(); track a.id) {
                      <div class="oa-update">
                        <div class="oa-update__txt">
                          <strong>{{ a.equipeNom }}</strong>
                          <span class="num">v{{ a.version }}</span> →
                          <span class="num">{{ a.versionDisponibleNom }}</span>
                        </div>
                        <button class="btn btn--secondary btn--sm" (click)="voirEcart(a)">Changements</button>
                        <button class="btn btn--primary btn--sm" (click)="migrer(a)">Migrer</button>
                      </div>
                    }
                  </div>
                }

                <div class="oa-dup">
                  <div class="oa-dup__head">
                    <h4>Dupliquer puis personnaliser</h4>
                    <span>partez d'un référentiel publié — une grille vierge fait 140 cases
                      <app-info-bulle [texte]="aide.duplication" /></span>
                  </div>
                  <div class="oa-dup__act">
                    <select class="oa-select" [(ngModel)]="sourceDuplication">
                      <option [ngValue]="null">Choisir le référentiel source…</option>
                      @for (r of adoptables(); track r.id) { <option [ngValue]="r.id">{{ r.nom }}</option> }
                    </select>
                    <button class="btn btn--secondary" (click)="dupliquer()"
                            [disabled]="!sourceDuplication">Dupliquer</button>
                  </div>
                </div>
              </div>

              <!-- Aperçu : sans lui, on choisit un référentiel sans savoir ce qu'il contient. -->
              <aside class="oa-apercu">
                <div class="oa-apercu__head">
                  <h4>Aperçu</h4>
                  <span>avant d'adopter, regardez les valeurs</span>
                </div>
                <select class="oa-select oa-select--full" [(ngModel)]="apercuId"
                        (ngModelChange)="chargerApercu()">
                  <option [ngValue]="null">— choisir un référentiel —</option>
                  @for (r of adoptables(); track r.id) { <option [ngValue]="r.id">{{ r.nom }}</option> }
                </select>

                @if (apercu(); as a) {
                  <div class="oa-apercu__barre">
                    <div class="segmented">
                      @for (c of ['SEMAINE', 'MATCH']; track c) {
                        <button [class.is-active]="ctxApercu() === c" (click)="ctxApercu.set(c)">
                          {{ c === 'MATCH' ? 'Match' : 'Semaine' }}
                        </button>
                      }
                    </div>
                    <app-info-bulle [texte]="aide.contexteMatchSemaine" />
                    <label class="oa-chk">
                      <input type="checkbox" [(ngModel)]="apercuToutes"> Les 7 métriques
                    </label>
                  </div>

                  <div class="oa-apercu__carte">
                    <div class="oa-apercu__carteHead">
                      <span class="oa-apercu__nom">{{ a.entete.nom }}</span>
                      @if (a.entete.statut !== 'PUBLIE') {
                        <span class="badge badge--neutral">
                          {{ a.entete.statut === 'BROUILLON' ? 'brouillon' : 'archivé' }}
                        </span>
                      }
                      <span class="oa-apercu__meta">valeurs Attendu par poste, contexte {{ ctxApercu() }}</span>
                    </div>
                    <div class="oa-apercu__scroll">
                      <table class="oa-tbl oa-tbl--mini">
                        <thead>
                          <tr>
                            <th>Métrique</th>
                            @for (p of postesApercu(); track p.code) { <th class="r">{{ p.libelle }}</th> }
                          </tr>
                        </thead>
                        <tbody>
                          @for (m of metriquesApercu(); track m.code) {
                            <tr>
                              <td class="oa-tbl__nom">{{ m.libelle }}<small>{{ m.unite }}</small></td>
                              @for (p of postesApercu(); track p.code) {
                                <td class="r num">{{ celluleApercu(p.code, m) }}</td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    <p class="oa-apercu__pied num">
                      {{ a.valeurs.length }} valeurs · {{ postesApercu().length }} postes
                    </p>
                  </div>
                } @else {
                  <p class="oa-vide">Choisissez un référentiel pour voir ses valeurs avant de l'adopter.</p>
                }
              </aside>
            </section>
          }

          <!-- ─────────── Étape 2 : modèles ─────────── -->
          @if (etape() === 2) {
            <section class="oa-etape">
              <div class="oa-intro">
                <h3 class="oa-titre">
                  Quelle forme doit prendre la montée en charge ? <app-info-bulle [texte]="aide.modele" />
                </h3>
                <p class="oa-aide">
                  Un modèle décrit la forme d'une progression, le référentiel en donne l'échelle : le
                  même « Prépa 6 semaines » sert un club national et un club régional. Il se compose
                  de phases et jamais de semaines fixes — c'est ce qui protège la semaine de décharge
                  quand la période s'allonge.
                </p>
              </div>
              <app-modele-objectif-editeur [metriques]="metriques()" (change)="apresEcriture()" />
            </section>
          }

          <!-- ─────────── Étape 3 : périodes ─────────── -->
          @if (etape() === 3) {
            <section class="oa-etape">
              <div class="oa-intro">
                <h3 class="oa-titre">
                  Que retient-on, semaine par semaine ?
                  <app-info-bulle [texte]="aide.trajectoireVsPostes" />
                </h3>
                <p class="oa-aide">
                  On applique un modèle à chaque période de la saison : la forme du modèle rencontre
                  l'échelle du référentiel, et il en sort le <strong>Retenu</strong> de chaque
                  semaine. Vous pouvez ensuite corriger n'importe quelle case à la main.
                  <app-info-bulle [texte]="aide.bascPeriode" />
                </p>
              </div>

              <div class="oa-barre">
                <select class="oa-select" [ngModel]="equipeChoisie()" (ngModelChange)="choisirEquipe($event)">
                  <option [ngValue]="null">— choisir une équipe —</option>
                  @for (e of equipes(); track e.id) { <option [ngValue]="e.id">{{ e.nom }}</option> }
                </select>
                @if (saisonNom(); as s) {
                  <span class="badge badge--ok"><span class="oa-dot oa-dot--ret"></span>{{ s }}</span>
                }
                <span class="oa-barre__hint">l'assistant charge lui-même les équipes autorisées</span>
              </div>

              @if (!saisonId()) {
                <div class="oa-empty">
                  <span class="oa-empty__ic"><mat-icon>warning</mat-icon></span>
                  <h4>Aucune saison active</h4>
                  <p>
                    Les périodes viennent du calendrier de la saison. Activez une saison dans
                    <strong>Planning › Saison</strong> puis revenez ici : les étapes 1 et 2 restent
                    valables, rien n'est perdu.
                  </p>
                </div>
              } @else if (!equipeChoisie()) {
                <p class="oa-vide">Choisissez une équipe pour voir ses périodes.</p>
              } @else if (periodes().length === 0) {
                <div class="oa-empty">
                  <span class="oa-empty__ic"><mat-icon>event_busy</mat-icon></span>
                  <h4>Aucune période pour cette équipe</h4>
                  <p>Créez-les depuis <strong>Planning › Saison</strong>, puis revenez ici.</p>
                </div>
              } @else {
                <div class="oa-per__head">
                  <h4>Périodes</h4>
                  <span class="oa-per__compte num">
                    {{ nbPeriodesFaites() }} / {{ nbPeriodesAConfigurer() }}
                  </span>
                  <span class="oa-per__hint">les périodes hors charge ne comptent pas dans ce total</span>
                </div>

                <div class="oa-cartes">
                  @for (p of periodes(); track p.periodeId) {
                    <div class="oa-carte"
                         [class.oa-carte--on]="edition()?.periodeId === p.periodeId"
                         [class.oa-carte--repos]="sansCharge(p)"
                         (click)="editer(p)">
                      <div class="oa-carte__haut">
                        <div class="oa-carte__txt">
                          <strong class="oa-carte__nom">{{ p.libelle }}</strong>
                          <span class="oa-carte__dates">
                            <span class="num">{{ p.dateDebut | date : 'd MMM' }} → {{ p.dateFin | date : 'd MMM' }}</span>
                            · {{ p.nbSemaines }} sem.
                          </span>
                        </div>
                        @if (sansCharge(p)) {
                          <span class="badge badge--neutral">hors charge</span>
                        } @else if (p.objectifsDefinis) {
                          <span class="badge badge--ok">défini</span>
                        } @else {
                          <span class="badge badge--warn">à définir</span>
                        }
                      </div>
                      <div class="oa-carte__note">{{ noteCarte(p) }}</div>
                      <!-- Le bilan n'apparaît que si la période a commencé ET porte des objectifs :
                           proposer un bilan vide sur une période à venir n'a aucun sens. -->
                      @if (p.objectifsDefinis && !sansCharge(p) && aCommence(p)) {
                        <button class="btn btn--secondary btn--sm oa-carte__bilan"
                                (click)="ouvrirBilan(p, $event)">
                          <mat-icon>insights</mat-icon> Bilan
                        </button>
                      }
                    </div>
                  }
                </div>

                @if (edition(); as p) {
                  <div class="oa-editeur">
                    <app-objectif-periode-editeur
                      [periode]="p" [metriques]="metriques()" [postes]="postes()"
                      (fermer)="edition.set(null)" (enregistre)="apresEcriture()" />
                  </div>
                }

                @if (bilanPeriodeId(); as pid) {
                  <app-bilan-periode [periodeId]="pid" (fermer)="bilanPeriodeId.set(null)" />
                }
              }
            </section>
          }

          <!-- ─────────── Étape 4 : résumé ─────────── -->
          @if (etape() === 4) {
            <section class="oa-etape oa-etape--etroite">
              <div class="oa-intro">
                <h3 class="oa-titre">Où en est la configuration ?</h3>
                <p class="oa-aide">
                  Tout ce qui est ci-dessous est déjà enregistré. Vous pouvez fermer et revenir
                  corriger une seule case dans six mois : la timeline mène directement à chaque étape.
                </p>
              </div>

              <div class="oa-resume">
                @for (s of resume(); track s.n) {
                  <div class="oa-res" [class.oa-res--ok]="s.ok">
                    <span class="oa-res__n num">{{ s.n }}</span>
                    <div class="oa-res__txt">
                      <div class="oa-res__ligne">
                        <h4>{{ s.titre }}</h4>
                        <span class="oa-res__compte num">{{ s.compte }}</span>
                      </div>
                      <p>{{ s.texte }}</p>
                      @if (s.alerte) { <div class="oa-res__alerte">{{ s.alerte }}</div> }
                    </div>
                    <button class="btn btn--secondary btn--sm" (click)="aller(s.n)">Ouvrir</button>
                  </div>
                }
              </div>
            </section>
          }
        </div>

        <footer class="oa-pied">
          <span class="oa-pied__hint">
            Chaque modification part sur le serveur au moment où vous la faites. Il n'y a rien à
            valider à la fin : fermez quand vous voulez.
          </span>
          <button class="btn btn--secondary" (click)="aller(precedente())" [disabled]="etape() === 1">
            <mat-icon>arrow_back</mat-icon> Précédent
          </button>
          @if (etape() < 4) {
            <button class="btn btn--primary" (click)="aller(suivante())">
              Suivant <mat-icon>arrow_forward</mat-icon>
            </button>
          } @else {
            <button class="btn btn--primary" (click)="fermer.emit()">Terminer</button>
          }
        </footer>
      </div>

      <!-- Le diff de version est une décision à part entière : il mérite sa modale, pas un bloc
           qui pousse le reste de l'étape 1 vers le bas. -->
      @if (ecart(); as e) {
        <div class="oa-diff" (click)="ecart.set(null)">
          <div class="oa-diff__boite" (click)="$event.stopPropagation()">
            <div class="oa-diff__head">
              <span class="oa-diff__kicker">Changements</span>
              <div class="oa-diff__titre">
                <span>{{ e.avantNom }}</span>
                <mat-icon>arrow_forward</mat-icon>
                <span class="badge badge--ok">{{ e.apresNom }}</span>
              </div>
            </div>
            <div class="oa-diff__corps">
              @if (e.lignes.length === 0) {
                <div class="oa-empty">
                  <h4>Aucune valeur ne change</h4>
                  <p>Cette version corrige des libellés et des infobulles. Migrer ne modifiera
                     aucun Attendu.</p>
                </div>
              } @else {
                <table class="oa-tbl">
                  <thead>
                    <tr><th>Poste</th><th>Contexte</th><th>Métrique</th>
                        <th class="r">Avant</th><th class="r">Après</th></tr>
                  </thead>
                  <tbody>
                    @for (l of e.lignes; track l.poste + l.contexte + l.metrique) {
                      <tr>
                        <td>{{ libPoste(l.poste) }}</td>
                        <td class="oa-tbl__ctx">{{ l.contexte === 'MATCH' ? 'Match' : 'Semaine' }}</td>
                        <td>{{ libMetrique(l.metrique) }}</td>
                        <td class="r num oa-tbl__av">{{ borne(l.avantMin, l.avantMax) }}</td>
                        <td class="r num oa-tbl__ap">{{ borne(l.apresMin, l.apresMax) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
            <div class="oa-diff__pied">
              <button class="btn btn--secondary" (click)="ecart.set(null)">Fermer</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes oaIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    .oa-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; padding: 20px;
                  background: rgba(11, 18, 32, .45); font-size: 14px; line-height: 1.45; }
    .oa-modale { flex: 1; min-width: 0; display: flex; flex-direction: column;
                 background: var(--surface); border-radius: var(--r-2xl);
                 box-shadow: var(--shadow-xl); overflow: hidden;
                 animation: oaIn .28s var(--ease-out); }
    .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }

    /* ── En-tête ── */
    .oa-head { display: flex; align-items: center; gap: 16px; padding: 14px 20px;
               border-bottom: 1px solid var(--border); }
    .oa-head__txt { flex: 1; min-width: 0; }
    .oa-head__ligne { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
    .oa-head__titre { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
    .oa-head__kicker { font-size: 12.5px; color: var(--text-3); }
    .oa-head__sub { margin: 3px 0 0; font-size: 12.5px; color: var(--text-3); }
    .oa-head__sub strong { color: var(--text-2); font-weight: 600; }

    .oa-save { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px;
               border: 1px solid var(--border); border-radius: var(--r-pill);
               background: var(--surface-2); font-size: 12.5px; color: var(--text-2);
               white-space: nowrap; }
    .oa-save__dot { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--green-500); }
    .oa-save--busy .oa-save__dot { background: var(--warn); }

    .oa-ctx { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px;
              border: 1px solid var(--border); border-radius: var(--r-pill);
              font-size: 12.5px; color: var(--text-2); white-space: nowrap; }
    .oa-ctx__sep { color: var(--text-4); }
    .oa-ic { width: 32px; height: 32px; display: grid; place-items: center; flex: none;
             border: 0; background: none; cursor: pointer; color: var(--text-3);
             border-radius: var(--r-md); }
    .oa-ic:hover { background: var(--surface-3); color: var(--text); }

    /* ── Timeline ── */
    .oa-timeline { display: flex; align-items: center; gap: 0; padding: 12px 20px;
                   background: var(--surface-2); border-bottom: 1px solid var(--border);
                   overflow-x: auto; }
    .oa-pas { display: flex; align-items: center; gap: 10px; padding: 5px 12px 5px 5px;
              border: 0; background: none; cursor: pointer; font: inherit; color: inherit;
              border-radius: var(--r-pill); text-align: left; white-space: nowrap; }
    .oa-pas:hover { background: var(--surface-3); }
    .oa-pas__rond { width: 26px; height: 26px; flex: none; display: grid; place-items: center;
                    border-radius: var(--r-pill); border: 1px solid var(--border-strong);
                    background: var(--surface); color: var(--text-3);
                    font-family: var(--font-num); font-size: 12px; font-weight: 600; }
    .oa-pas--ok .oa-pas__rond { background: var(--ok-bg); border-color: var(--ok-bd); color: var(--ok); }
    .oa-pas--on .oa-pas__rond { background: var(--green-600); border-color: var(--green-700); color: #fff; }
    .oa-pas__rond mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .oa-pas__lib { display: flex; flex-direction: column; line-height: 1.2; }
    .oa-pas__lib strong { font-size: 13px; font-weight: 500; color: var(--text-3); }
    .oa-pas--on .oa-pas__lib strong { font-weight: 700; color: var(--text); }
    .oa-pas--ok .oa-pas__lib strong { color: var(--text-2); }
    .oa-pas__lib small { font-size: 11px; color: var(--text-4); font-family: var(--font-num); }
    .oa-trait { flex: 1 1 24px; min-width: 18px; height: 1px; background: var(--border-strong); }
    .oa-trait--ok { background: var(--ok-bd); }

    /* ── Bande de vocabulaire ── */
    .oa-lex { display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
              padding: 7px 20px; border-bottom: 1px solid var(--border);
              background: var(--surface); font-size: 11.5px; color: var(--text-3); }
    .oa-lex__t { font-size: 10px; font-weight: 700; letter-spacing: .09em;
                 text-transform: uppercase; color: var(--text-4); }
    .oa-lex__i { display: inline-flex; align-items: center; gap: 6px; }
    .oa-lex__i b { font-weight: 600; color: var(--text-2); }
    .oa-dot { width: 6px; height: 6px; border-radius: var(--r-pill); flex: none; }
    .oa-dot--hab { background: var(--slate-400); }
    .oa-dot--att { background: var(--info); }
    .oa-dot--ret { background: var(--green-500); }

    /* ── Corps ── */
    .oa-corps { flex: 1; min-height: 0; overflow: auto; background: var(--surface); }
    .oa-etape { padding: 22px 24px 36px; }
    .oa-etape--etroite { max-width: 900px; }
    .oa-intro { max-width: 74ch; margin-bottom: 18px; }
    .oa-titre { margin: 0 0 7px; font-size: 20px; font-weight: 600; letter-spacing: -.015em;
                display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .oa-aide { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--text-2); }
    .oa-aide strong { font-weight: 600; color: var(--text); }
    .oa-vide { color: var(--text-4); font-size: 13px; padding: 8px 0; }

    .oa-select { padding: 7px 10px; border: 1px solid var(--border-strong);
                 border-radius: var(--r-sm); background: var(--surface);
                 font: inherit; font-size: 13px; color: var(--text); max-width: 100%; }
    .oa-select--full { width: 100%; margin: 10px 0 12px; }
    .oa-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px;
              color: var(--text-2); cursor: pointer; }
    .oa-chk input { accent-color: var(--green-600); }

    /* ── Étape 1 ── */
    .oa-e1 { display: flex; flex-wrap: wrap; align-items: flex-start; min-height: 100%; }
    .oa-e1__main { flex: 1; min-width: 520px; padding: 22px 24px 36px; }

    .oa-bloc { border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden;
               margin-bottom: 18px; box-shadow: var(--shadow-xs); }
    .oa-bloc__head { display: flex; align-items: center; gap: 10px; padding: 11px 15px;
                     background: var(--surface-2); border-bottom: 1px solid var(--border); }
    .oa-bloc__titre { margin: 0; font-size: 13.5px; font-weight: 600; }
    .oa-bloc__hint { font-size: 12.5px; color: var(--text-3); }
    .oa-bloc__compte { margin-left: auto; font-size: 11.5px; color: var(--text-3); }
    .oa-ligne { display: flex; align-items: center; gap: 14px; padding: 10px 15px;
                border-bottom: 1px solid var(--border); }
    .oa-ligne:last-child { border-bottom: 0; }
    .oa-ligne--defaut { background: var(--surface-2); }
    .oa-ligne__nom { width: 190px; flex: none; display: flex; flex-direction: column; }
    .oa-ligne__nom strong { font-size: 13.5px; font-weight: 600; }
    .oa-ligne__nom small { font-size: 11.5px; color: var(--text-3); }
    .oa-ligne__act { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .oa-ligne__act .oa-select { flex: 1; min-width: 200px; max-width: 400px; }
    .oa-ver { font-size: 12px; color: var(--text-3); white-space: nowrap; }
    .oa-maj-btn { cursor: pointer; font-family: inherit; }

    .oa-updates { border: 1px solid var(--info-bd); background: var(--info-bg);
                  border-radius: var(--r-lg); padding: 13px 15px; margin-bottom: 18px; }
    .oa-updates__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
                        margin-bottom: 4px; }
    .oa-updates__head h4 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--info); }
    .oa-updates__head span { font-size: 12.5px; color: var(--text-2); }
    .oa-update { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                 padding: 9px 0; border-top: 1px solid var(--info-bd); }
    .oa-update__txt { flex: 1; min-width: 0; font-size: 12.5px; color: var(--text-2); }
    .oa-update__txt strong { display: block; font-size: 13.5px; color: var(--text); }

    .oa-dup { border: 1px solid var(--border); border-radius: var(--r-lg);
              padding: 13px 15px; background: var(--surface-2); }
    .oa-dup__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 9px; }
    .oa-dup__head h4 { margin: 0; font-size: 13.5px; font-weight: 600; }
    .oa-dup__head span { font-size: 12.5px; color: var(--text-3); }
    .oa-dup__act { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .oa-dup__act .oa-select { flex: 1; min-width: 220px; max-width: 400px; }

    .oa-apercu { width: 420px; flex: none; align-self: stretch; padding: 22px 20px 36px;
                 border-left: 1px solid var(--border); background: var(--surface-2);
                 position: sticky; top: 0; }
    .oa-apercu__head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .oa-apercu__head h4 { margin: 0; font-size: 13.5px; font-weight: 600; }
    .oa-apercu__head span { font-size: 12px; color: var(--text-3); }
    .oa-apercu__barre { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                        margin-bottom: 12px; }
    .oa-apercu__barre .oa-chk { margin-left: auto; }
    .oa-apercu__carte { border: 1px solid var(--border); border-radius: var(--r-md);
                        background: var(--surface); overflow: hidden; }
    .oa-apercu__carteHead { padding: 9px 11px; border-bottom: 1px solid var(--border);
                            display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .oa-apercu__nom { font-size: 13.5px; font-weight: 600; }
    .oa-apercu__meta { flex-basis: 100%; font-size: 11.5px; color: var(--text-3); }
    .oa-apercu__scroll { overflow: auto; max-height: calc(100vh - 380px); }
    .oa-apercu__pied { padding: 7px 11px 9px; font-size: 11px; color: var(--text-4); margin: 0; }

    /* ── Tables ── */
    .oa-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .oa-tbl th { position: sticky; top: 0; z-index: 1; text-align: left; padding: 7px 9px;
                 background: var(--surface-2); border-bottom: 1px solid var(--border-strong);
                 font-size: 10px; letter-spacing: .07em; text-transform: uppercase;
                 color: var(--text-3); font-weight: 700; white-space: nowrap; }
    .oa-tbl td { padding: 6px 9px; border-bottom: 1px solid var(--border); }
    .oa-tbl .r { text-align: right; }
    .oa-tbl--mini { font-size: 12px; }
    .oa-tbl__nom { white-space: nowrap; }
    .oa-tbl__nom small { display: block; font-size: 10.5px; color: var(--text-4); }
    .oa-tbl__ctx { color: var(--text-3); font-size: 12px; }
    .oa-tbl__av { color: var(--text-3); text-decoration: line-through; }
    .oa-tbl__ap { font-weight: 600; color: var(--green-700); }

    /* ── Étape 3 ── */
    .oa-barre { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
    .oa-barre__hint { font-size: 12.5px; color: var(--text-3); }
    .oa-per__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 9px; }
    .oa-per__head h4 { margin: 0; font-size: 13.5px; font-weight: 600; }
    .oa-per__compte { font-size: 12px; padding: 2px 9px; border-radius: var(--r-pill);
                      background: var(--surface-3); color: var(--text-2); }
    .oa-per__hint { font-size: 12px; color: var(--text-3); }

    .oa-cartes { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
                 gap: 10px; margin-bottom: 24px; }
    .oa-carte { border: 1px solid var(--border); border-radius: var(--r-lg);
                background: var(--surface); padding: 11px 12px; cursor: pointer;
                box-shadow: var(--shadow-xs); transition: box-shadow 160ms var(--ease-out),
                border-color 160ms var(--ease-out); }
    .oa-carte:hover { box-shadow: var(--shadow-md); }
    .oa-carte--on { border-color: var(--green-500); box-shadow: 0 0 0 2px var(--green-100); }
    .oa-carte--repos { background: var(--surface-2); }
    .oa-carte__haut { display: flex; align-items: flex-start; gap: 8px; }
    .oa-carte__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .oa-carte__nom { font-size: 13.5px; font-weight: 600; }
    .oa-carte__dates { font-size: 11.5px; color: var(--text-3); margin-top: 1px; }
    .oa-carte__note { margin-top: 8px; font-size: 11.5px; color: var(--text-3); min-height: 16px; }
    .oa-carte__bilan { margin-top: 8px; }
    .oa-editeur { padding-top: 16px; border-top: 1px solid var(--border); }

    .oa-empty { max-width: 620px; margin: 30px auto; text-align: center; padding: 26px;
                border: 1px dashed var(--border-strong); border-radius: var(--r-xl);
                background: var(--surface-2); }
    .oa-empty__ic { width: 42px; height: 42px; margin: 0 auto 12px; display: grid;
                    place-items: center; border-radius: var(--r-pill);
                    background: var(--warn-bg); border: 1px solid var(--warn-bd); }
    .oa-empty__ic mat-icon { color: var(--warn); }
    .oa-empty h4 { margin: 0 0 5px; font-size: 15px; font-weight: 600; }
    .oa-empty p { margin: 0; font-size: 13px; color: var(--text-2); }

    /* ── Étape 4 ── */
    .oa-resume { display: flex; flex-direction: column; gap: 10px; }
    .oa-res { display: flex; gap: 13px; align-items: flex-start; padding: 14px 15px;
              border: 1px solid var(--warn-bd); background: var(--warn-bg);
              border-radius: var(--r-lg); }
    .oa-res--ok { border-color: var(--border); background: var(--surface-2); }
    .oa-res__n { width: 26px; height: 26px; flex: none; display: grid; place-items: center;
                 border-radius: var(--r-pill); background: var(--warn-bg);
                 border: 1px solid var(--warn-bd); color: var(--warn);
                 font-size: 12px; font-weight: 600; }
    .oa-res--ok .oa-res__n { background: var(--ok-bg); border-color: var(--ok-bd); color: var(--ok); }
    .oa-res__txt { flex: 1; min-width: 0; }
    .oa-res__ligne { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .oa-res__ligne h4 { margin: 0; font-size: 14px; font-weight: 600; }
    .oa-res__compte { font-size: 11.5px; color: var(--text-3); }
    .oa-res__txt p { margin: 4px 0 0; font-size: 13px; color: var(--text-2); }
    .oa-res__alerte { margin-top: 8px; padding: 8px 11px; border-radius: var(--r-md);
                      background: var(--surface); border: 1px solid var(--warn-bd);
                      font-size: 12.5px; color: var(--text-2); }

    /* ── Pied ── */
    .oa-pied { display: flex; align-items: center; gap: 12px; padding: 11px 20px;
               border-top: 1px solid var(--border); background: var(--surface-2); }
    .oa-pied__hint { flex: 1; font-size: 12.5px; color: var(--text-3); }

    /* ── Modale de diff ── */
    .oa-diff { position: fixed; inset: 0; z-index: 1010; display: grid; place-items: center;
               padding: 36px; background: rgba(11, 18, 32, .5); }
    .oa-diff__boite { width: min(760px, 100%); max-height: 80vh; display: flex;
                      flex-direction: column; background: var(--surface);
                      border-radius: var(--r-xl); box-shadow: var(--shadow-xl);
                      overflow: hidden; animation: oaIn .2s var(--ease-out); }
    .oa-diff__head { padding: 15px 18px; border-bottom: 1px solid var(--border); }
    .oa-diff__kicker { font-size: 10.5px; font-weight: 700; letter-spacing: .09em;
                       text-transform: uppercase; color: var(--text-3); }
    .oa-diff__titre { margin-top: 4px; display: flex; align-items: center; gap: 10px;
                      flex-wrap: wrap; font-size: 15px; font-weight: 600; }
    .oa-diff__titre mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--text-3); }
    .oa-diff__corps { flex: 1; overflow: auto; padding: 14px 18px; }
    .oa-diff__pied { display: flex; justify-content: flex-end; padding: 11px 18px;
                     border-top: 1px solid var(--border); background: var(--surface-2); }

    @media (max-width: 1120px) {
      .oa-e1__main { min-width: 100%; }
      .oa-apercu { width: 100%; border-left: 0; border-top: 1px solid var(--border); position: static; }
    }
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
  /** Pastille d'écriture : le seul retour visible d'un enregistrement immédiat. */
  enregistrement = signal(false);
  private minuteur: ReturnType<typeof setTimeout> | null = null;

  apercu = signal<ReferentielDetail | null>(null);
  apercuId: string | null = null;
  apercuToutes = false;
  ctxApercu = signal<string>('SEMAINE');
  sourceDuplication: string | null = null;

  metriques = computed<Metrique[]>(() => this.catalogue()?.metriques ?? []);
  postes = computed<PosteRef[]>(() => this.catalogue()?.postes ?? []);
  saisonId = computed<string | null>(() => this.saisonCtx.enCours()?.id ?? null);
  saisonNom = computed<string | null>(() => this.saisonCtx.enCours()?.libelle ?? null);

  equipeNomCourant = computed<string | null>(() => {
    const id = this.equipeChoisie();
    return id ? (this.equipes().find(e => e.id === id)?.nom ?? null) : null;
  });

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

  /** Les trois lignes du résumé, avec la phrase qui dit ce qui manque plutôt qu'un simple compte. */
  resume = computed(() => [
    {
      n: 1 as Etape, titre: 'Référentiel', ok: this.adoptions().length > 0,
      compte: `${this.adoptions().length} adoption(s)`,
      texte: 'L\'échelle des valeurs : ce qu\'un joueur de tel poste fait normalement à votre niveau.',
      alerte: this.adoptions().length === 0
        ? 'Sans adoption, aucune colonne « Attendu » ne s\'affichera nulle part dans l\'application.' : null,
    },
    {
      n: 2 as Etape, titre: 'Modèles d\'objectif', ok: this.nbModeles() > 0,
      compte: `${this.nbModeles()} modèle(s)`,
      texte: 'La forme des progressions : des phases et des poids, jamais des semaines fixes.',
      alerte: this.nbModeles() === 0
        ? 'Sans modèle, l\'étape 3 n\'a rien à appliquer sur les périodes.' : null,
    },
    {
      n: 3 as Etape, titre: 'Périodes de la saison', ok: this.nbPeriodesFaites() > 0,
      compte: `${this.nbPeriodesFaites()} / ${this.nbPeriodesAConfigurer()}`,
      texte: this.equipeNomCourant()
        ? `Pour ${this.equipeNomCourant()}. C'est ici que le « Retenu » de chaque semaine est calculé.`
        : 'C\'est ici que le « Retenu » de chaque semaine est calculé.',
      alerte: this.periodes().length > this.nbPeriodesAConfigurer()
        ? `${this.periodes().length - this.nbPeriodesAConfigurer()} période(s) hors charge (trêve, intersaison) sont exclues du décompte.`
        : null,
    },
  ]);

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
    if ((ev.target as HTMLElement).classList.contains('oa-overlay')) this.fermer.emit();
  }

  /** Fait clignoter la pastille d'écriture : l'utilisateur voit que c'est parti sur le serveur. */
  private touche(): void {
    if (this.minuteur) clearTimeout(this.minuteur);
    this.enregistrement.set(true);
    this.minuteur = setTimeout(() => this.enregistrement.set(false), 700);
  }

  /** Un enfant (modèles, période) vient d'écrire : on rafraîchit les compteurs de la timeline. */
  apresEcriture(): void {
    this.touche();
    this.api.modeles().subscribe({ next: m => this.nbModeles.set(m.length), error: () => {} });
    this.rechargerPeriodes();
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
      this.touche();
      this.api.retirerAdoption(a.id).subscribe({
        next: () => { this.rechargerAdoptions(); this.snack.open('Adoption retirée.', 'OK', { duration: 2500 }); },
        error: e => this.erreur(e),
      });
      return;
    }
    this.touche();
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
    this.touche();
    this.api.adopter(a.versionDisponibleId, a.equipeId).subscribe({
      next: () => { this.ecart.set(null); this.rechargerAdoptions(); this.snack.open('Migration effectuée.', 'OK', { duration: 3000 }); },
      error: e => this.erreur(e),
    });
  }

  dupliquer(): void {
    if (!this.sourceDuplication) return;
    this.touche();
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

  /** Ligne du bas d'une carte de période : elle dit ce qu'il reste à faire, pas ce qu'elle est. */
  noteCarte(p: EtatPeriode): string {
    if (this.sansCharge(p)) return 'Aucune charge à planifier — exclue du décompte.';
    if (p.objectifsDefinis) return p.modeleNom ? `Modèle : ${p.modeleNom}` : 'Objectifs posés.';
    return `${this.libTypePeriode(p.typePeriode)} — aucun modèle appliqué.`;
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
