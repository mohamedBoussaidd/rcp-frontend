import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ContexteService } from '@core/services/contexte.service';
import { SaisonContexteService } from '@core/services/saison-contexte.service';
import { ObjectifsService, Adoption, EtatPeriode } from '@core/services/objectifs.service';
import { ObjectifsAssistantComponent } from './objectifs-assistant.component';

/**
 * Point d'entrée des objectifs de performance : un état des lieux, et un bouton qui ouvre
 * l'assistant.
 *
 * <p>La configuration elle-même vit dans une modale ({@link ObjectifsAssistantComponent}) plutôt
 * que dans cette page : c'est ce qui lui permet d'être ouverte aussi depuis une période de
 * l'écran Saison, sans dupliquer un seul écran.
 */
@Component({
  selector: 'app-objectifs-hub',
  standalone: true,
  imports: [MatIconModule, ObjectifsAssistantComponent],
  template: `
    <div class="hub">
      <header class="page-head">
        <div>
          <h1 class="page-head__title">Objectifs de performance</h1>
          <p class="page-head__sub">
            Ce qui est attendu d'un joueur à son poste et à son niveau, décliné sur les périodes de
            la saison. Se règle une fois, se relit ensuite chaque semaine dans la charge d'équipe.
          </p>
        </div>
        <div class="page-head__actions">
          <button class="btn btn--primary" (click)="ouvrir(1)">
            <mat-icon>tune</mat-icon> Configurer les objectifs
          </button>
        </div>
      </header>

      <section class="card">
        <h2 class="card__title">État de la configuration</h2>
        <div class="etats">
          <button class="etat" [class.etat--ok]="adoptions().length > 0" (click)="ouvrir(1)">
            <mat-icon>{{ adoptions().length > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <span class="etat__t">Référentiel</span>
            <span class="etat__v">
              @if (adoptions().length > 0) { {{ adoptions().length }} adoption(s) }
              @else { Aucun — pas de colonne « Attendu » }
            </span>
          </button>

          <button class="etat" [class.etat--ok]="nbModeles() > 0" (click)="ouvrir(2)">
            <mat-icon>{{ nbModeles() > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <span class="etat__t">Modèles</span>
            <span class="etat__v">{{ nbModeles() }} disponible(s)</span>
          </button>

          <button class="etat" [class.etat--ok]="nbFaites() > 0" (click)="ouvrir(3)">
            <mat-icon>{{ nbFaites() > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <span class="etat__t">Périodes</span>
            <span class="etat__v">
              @if (periodes().length > 0) { {{ nbFaites() }} / {{ periodes().length }} avec objectifs }
              @else { Aucune période lue }
            </span>
          </button>
        </div>

        @if (aMaj()) {
          <p class="maj">
            <mat-icon>update</mat-icon>
            Une version plus récente d'un référentiel est publiée. Vos valeurs ne bougeront pas
            tant que vous n'aurez pas migré.
            <button class="btn btn--sm" (click)="ouvrir(1)">Voir</button>
          </p>
        }
      </section>

      <section class="card card--suite">
        <h2 class="card__title">Et ensuite ?</h2>
        <p class="card__hint">
          Le suivi hebdomadaire — <strong>Habituel / Attendu / Retenu</strong> par joueur — se lit
          dans <strong>Performance › Charge d'entraînement</strong>, onglet « Objectif ». Cette page
          ne sert qu'à la configuration, qui ne bouge que quelques fois par saison.
        </p>
      </section>

      @if (assistant()) {
        <app-objectifs-assistant [etapeInitiale]="etapeInitiale()" (fermer)="fermer()" />
      }
    </div>
  `,
  styles: [`
    .hub { display: flex; flex-direction: column; gap: 1rem; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .etats { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: .8rem; }
    .etat { display: flex; flex-direction: column; align-items: flex-start; gap: .15rem;
            text-align: left; cursor: pointer; font: inherit; padding: .8rem .9rem;
            border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fff); }
    .etat:hover { border-color: var(--primary, #2563eb); }
    .etat mat-icon { color: var(--text-muted, #94a3b8); }
    .etat--ok mat-icon { color: #16a34a; }
    .etat__t { font-weight: 700; font-size: .95rem; }
    .etat__v { font-size: .82rem; color: var(--text-muted, #64748b); }
    .maj { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin: .9rem 0 0;
           padding: .55rem .7rem; border-radius: 6px; background: #eff6ff; color: #1e40af; font-size: .86rem; }
    .maj mat-icon { font-size: 1.15rem; width: 1.15rem; height: 1.15rem; }
    .card--suite .card__hint { max-width: 78ch; }
  `],
})
export class ObjectifsHubComponent implements OnInit {

  private api = inject(ObjectifsService);
  private contexte = inject(ContexteService);
  private saisonCtx = inject(SaisonContexteService);

  adoptions = signal<Adoption[]>([]);
  periodes = signal<EtatPeriode[]>([]);
  nbModeles = signal(0);
  assistant = signal(false);
  etapeInitiale = signal<1 | 2 | 3 | 4>(1);

  nbFaites = computed(() => this.periodes().filter(p => p.objectifsDefinis).length);
  aMaj = computed(() => this.adoptions().some(a => !!a.versionDisponibleId));

  ngOnInit(): void { this.charger(); }

  private charger(): void {
    this.api.adoptions().subscribe({ next: a => this.adoptions.set(a), error: () => this.adoptions.set([]) });
    this.api.modeles().subscribe({ next: m => this.nbModeles.set(m.length), error: () => this.nbModeles.set(0) });
    this.saisonCtx.charger().subscribe({ next: () => this.chargerPeriodes(), error: () => {} });
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

  ouvrir(etape: 1 | 2 | 3 | 4): void {
    this.etapeInitiale.set(etape);
    this.assistant.set(true);
  }

  fermer(): void {
    this.assistant.set(false);
    this.charger();
  }
}
