import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ObjectifsService, Metrique, ModeleResume, ModeleDetail, Phase, PhaseValeur, Priorite,
} from '@core/services/objectifs.service';
import { InfoBulleComponent } from '@shared/components/info-bulle/info-bulle.component';
import { INFOBULLES_OBJECTIFS } from './infobulles-objectifs';

const TYPES = [
  { v: 'PREPARATION', l: 'Préparation' },
  { v: 'COMPETITION', l: 'Compétition' },
  { v: 'REPRISE', l: 'Reprise' },
];

const PRIORITES: { v: Priorite; l: string; aide: string }[] = [
  { v: 'SECONDAIRE', l: 'Secondaire', aide: 'Absorbe la baisse en premier — la monnaie d\'échange.' },
  { v: 'IMPORTANT', l: 'Important', aide: 'Réduit seulement une fois le secondaire épuisé.' },
  { v: 'INTOUCHABLE', l: 'Intouchable', aide: 'Jamais réduit. Si c\'est impossible, l\'application le dit.' },
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
  imports: [FormsModule, MatIconModule, InfoBulleComponent],
  template: `
    <div class="modeles">
      <header class="modeles__head">
        <div>
          <h3 class="modeles__titre">Modèles d'objectif</h3>
          <p class="modeles__sub">
            La forme d'une période : ses phases, leur durée relative et le niveau de charge de
            chacune, en pourcentage de la cible du référentiel.
          </p>
        </div>
        <button class="btn btn--primary" (click)="nouveau()"><mat-icon>add</mat-icon> Nouveau modèle</button>
      </header>

      <div class="modeles__corps">
        <ul class="liste">
          @for (m of modeles(); track m.id) {
            <li class="liste__item" [class.liste__item--on]="courant()?.entete?.id === m.id"
                (click)="ouvrir(m)">
              <div>
                <strong>{{ m.nom }}</strong>
                <small>{{ libType(m.typePeriode) }} · {{ m.nbPhases }} phase{{ m.nbPhases > 1 ? 's' : '' }}</small>
              </div>
              @if (m.nbUtilisations > 0) {
                <span class="chip" [title]="m.nbUtilisations + ' période(s) l\\'utilisent'">{{ m.nbUtilisations }}</span>
              }
            </li>
          } @empty {
            <li class="vide">Aucun modèle pour l'instant.</li>
          }
        </ul>

        @if (courant(); as c) {
          <section class="detail">
            <div class="detail__head">
              <label class="field"><span>Nom</span>
                <input [(ngModel)]="nom" maxlength="160" placeholder="ex. Prépa — progression classique">
              </label>
              <label class="field">
                <span>Type de période <app-info-bulle [texte]="aide.typePeriodeModele" /></span>
                <select [(ngModel)]="typePeriode">
                  @for (t of types; track t.v) { <option [value]="t.v">{{ t.l }}</option> }
                </select>
              </label>
              <div class="detail__actions">
                <button class="btn btn--primary" (click)="sauver()">Enregistrer</button>
                @if (c.entete.id) {
                  <button class="btn btn--danger" (click)="supprimer(c.entete)">Supprimer</button>
                }
              </div>
            </div>

            @if (c.entete.nbUtilisations > 0) {
              <p class="note note--info">
                <mat-icon>info</mat-icon>
                {{ c.entete.nbUtilisations }} période(s) utilisent ce modèle. Le modifier ne les change
                pas : leurs valeurs ont été figées à la génération.
              </p>
            }

            <div class="phases">
              @for (p of phases(); track $index; let i = $index) {
                <div class="phase">
                  <div class="phase__head" [style.background]="couleurPhase(p.nom)">
                    <button class="ic ic--plier" [title]="estReplie(i) ? 'Déplier' : 'Replier'"
                            (click)="basculer(i)">
                      <mat-icon>{{ estReplie(i) ? 'chevron_right' : 'expand_more' }}</mat-icon>
                    </button>
                    <input class="phase__nom" [(ngModel)]="p.nom" placeholder="Nom de la phase">
                    <label class="poids">
                      poids<app-info-bulle [texte]="aide.poidsDuree" />
                      <input type="number" min="1" max="9" class="mini" [(ngModel)]="p.poidsDuree">
                    </label>
                    @if (estReplie(i)) { <span class="resume">{{ resumePhase(p) }}</span> }
                    <button class="ic" title="Monter" (click)="deplacer(i, -1)" [disabled]="i === 0">
                      <mat-icon>arrow_upward</mat-icon>
                    </button>
                    <button class="ic" title="Descendre" (click)="deplacer(i, 1)"
                            [disabled]="i === phases().length - 1"><mat-icon>arrow_downward</mat-icon></button>
                    <button class="ic" title="Supprimer" (click)="retirerPhase(i)"><mat-icon>delete</mat-icon></button>
                  </div>

                  <table class="tbl" [hidden]="estReplie(i)">
                    <thead>
                      <tr>
                        <th>Métrique <app-info-bulle [texte]="aide.pourcentageParMetrique" /></th>
                        <th class="num">Début % <app-info-bulle [texte]="aide.pourcentages" /></th>
                        <th class="num">Fin %</th>
                        <th>Priorité <app-info-bulle [texte]="aide.priorite" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of metriques; track m.code) {
                        <tr>
                          <td class="nom">
                            {{ m.libelle }}
                            @if (m.nature === 'EXPOSITION') {
                              <small title="Ici le pourcentage EST la cible : % du record personnel, pas un % du référentiel.">cible directe</small>
                            }
                          </td>
                          <td class="num">
                            <input type="number" class="mini" [ngModel]="lire(p, m.code, 'debut')"
                                   (ngModelChange)="ecrire(p, m.code, 'debut', $event)">
                          </td>
                          <td class="num">
                            <input type="number" class="mini" [ngModel]="lire(p, m.code, 'fin')"
                                   (ngModelChange)="ecrire(p, m.code, 'fin', $event)">
                          </td>
                          <td>
                            <select class="prio-sel" [ngModel]="lirePriorite(p, m.code)"
                                    (ngModelChange)="ecrirePriorite(p, m.code, $event)"
                                    [title]="aidePriorite(lirePriorite(p, m.code))">
                              @for (pr of priorites; track pr.v) { <option [value]="pr.v">{{ pr.l }}</option> }
                            </select>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              <button class="btn" (click)="ajouterPhase()">
                <mat-icon>add</mat-icon> Ajouter une phase
              </button>
              <app-info-bulle [texte]="aide.phase" />
            </div>

            @if (phases().length > 0) {
              <div class="simul">
                <h4 class="simul__titre">
                  Répartition selon la durée réelle de la période
                  <app-info-bulle [texte]="aide.simulationRepartition" />
                </h4>
                <p class="card__hint">
                  Les poids donnent la durée. Une phase a son propre bloc de semaines, ou elle n'existe
                  pas — c'est ce qui empêche la décharge de se diluer quand la période s'allonge.
                </p>
                <table class="tbl tbl--simul">
                  <thead>
                    <tr><th>Durée</th>@for (p of phases(); track $index) { <th class="num">{{ p.nom || '—' }}</th> }</tr>
                  </thead>
                  <tbody>
                    @for (n of dureesTest; track n) {
                      <tr>
                        <td class="nom">{{ n }} sem.</td>
                        @for (v of repartition(n); track $index) {
                          <td class="num" [class.zero]="v === 0">{{ v === 0 ? '—' : v }}</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: [`
    .modeles { display: flex; flex-direction: column; gap: .8rem; }
    .modeles__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .modeles__titre { margin: 0; font-size: 1.05rem; }
    .modeles__sub { margin: .15rem 0 0; color: var(--text-muted, #64748b); font-size: .85rem; max-width: 60ch; }
    .modeles__corps { display: grid; grid-template-columns: minmax(200px, 260px) 1fr; gap: 1rem; align-items: start; }
    .liste { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; overflow: hidden; }
    .liste__item { display: flex; justify-content: space-between; align-items: center; gap: .5rem;
                   padding: .55rem .7rem; cursor: pointer; border-bottom: 1px solid var(--border, #eef2f7); }
    .liste__item:last-child { border-bottom: 0; }
    .liste__item--on { background: var(--surface-2, #f1f5f9); }
    .liste__item small { display: block; color: var(--text-muted, #94a3b8); font-size: .78rem; }
    .chip { font-size: .72rem; padding: .1rem .4rem; border-radius: 999px; background: #dbeafe; color: #1d4ed8; }
    .detail__head { display: flex; gap: .7rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: .6rem; }
    .detail__actions { display: flex; gap: .4rem; margin-left: auto; }
    .phases { display: flex; flex-direction: column; gap: .8rem; }
    .phase { border: 1px solid var(--border, #e2e8f0); border-radius: 8px; overflow: hidden; }
    .phase__head { display: flex; align-items: center; gap: .5rem; padding: .4rem .6rem; }
    .phase__nom { font-weight: 700; border: 0; background: transparent; font-size: .95rem; flex: 1; min-width: 8rem; }
    .ic--plier { color: #334155; }
    .resume { font-size: .8rem; color: #334155; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .poids { display: inline-flex; align-items: center; gap: .3rem; font-size: .78rem; color: #334155; }
    .mini { width: 4.2rem; text-align: right; padding: .22rem .3rem;
            border: 1px solid var(--border, #e2e8f0); border-radius: 4px; }
    .prio-sel { padding: .2rem; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; font-size: .82rem; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
    .tbl th, .tbl td { padding: .32rem .5rem; border-bottom: 1px solid var(--border, #f1f5f9); text-align: left; }
    .tbl .num { text-align: right; }
    .tbl .nom { font-weight: 500; }
    .tbl .nom small { color: var(--text-muted, #94a3b8); font-weight: 400; margin-left: .3rem; font-style: italic; }
    .tbl--simul .zero { color: #b45309; }
    .simul { margin-top: 1rem; padding-top: .8rem; border-top: 1px dashed var(--border, #e2e8f0); }
    .simul__titre { margin: 0 0 .2rem; font-size: .92rem; }
    .note { display: flex; align-items: center; gap: .4rem; font-size: .85rem; padding: .45rem .65rem;
            border-radius: 6px; margin: 0 0 .6rem; }
    .note--info { color: #1d4ed8; background: #eff6ff; }
    .note mat-icon { font-size: 1.05rem; width: 1.05rem; height: 1.05rem; }
    .ic { background: none; border: 0; cursor: pointer; color: #475569; padding: .1rem; }
    .ic:disabled { opacity: .3; cursor: default; }
    .btn--danger { background: #dc2626; color: #fff; }
    .vide { padding: .7rem; color: var(--text-muted, #94a3b8); font-size: .88rem; }
    @media (max-width: 860px) { .modeles__corps { grid-template-columns: 1fr; } }
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
