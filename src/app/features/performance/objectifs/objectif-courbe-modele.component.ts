import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { Metrique, Phase } from '@core/services/objectifs.service';

/** Un point manipulable de la courbe : le début ou la fin d'une phase. */
interface Poignee { pi: number; edge: 'debut' | 'fin'; x: number; y: number; v: number; }
interface Bande { x: number; w: number; nom: string; poids: number; pair: boolean; }

/** Géométrie du dessin, en unités du viewBox — jamais en pixels d'écran. */
const X0 = 62, X1 = 748, YT = 14, YB = 252, VMAX = 130;
const VB_W = 760, VB_H = 264;

/**
 * La courbe d'un modèle d'objectif : la forme de la progression, dessinée et corrigeable au doigt.
 *
 * <p>Un modèle est une grille de pourcentages — quatre phases × sept métriques font cinquante-six
 * nombres. On peut les lire un par un et ne jamais voir que la décharge de la semaine 4 est plus
 * profonde que le pic de la semaine 3 n'est haut. La courbe dit ça d'un coup d'œil, et les
 * <b>courbes fantômes</b> derrière montrent que les six autres métriques suivent la même forme —
 * ou qu'une seule décroche.
 *
 * <p>La largeur de chaque bande est le <b>poids</b> de la phase, pas son nombre de semaines : une
 * phase de poids 2 occupe deux fois plus de place qu'une phase de poids 1, exactement comme elle
 * recevra deux fois plus de semaines. Le dessin porte donc la même règle que le moteur.
 *
 * <p>Pas d'ApexCharts ici, et ce n'est pas un oubli : aucune bibliothèque de graphes ne sait
 * rendre un point saisissable qui réécrit la donnée source. Le SVG est écrit à la main pour ça.
 */
@Component({
  selector: 'app-objectif-courbe-modele',
  standalone: true,
  template: `
    <div class="omc">
      <div class="omc-head">
        <h4 class="omc-titre">La courbe que vous dessinez</h4>
        <span class="omc-ref">
          <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden="true">
            <line x1="0" y1="2" x2="18" y2="2" stroke="var(--info)" stroke-width="1.5" stroke-dasharray="4 4" />
          </svg>
          100 % du référentiel
        </span>
        <span class="omc-spacer"></span>
        <span class="omc-hint">tirez un point pour corriger</span>
      </div>

      <div class="omc-boite">
        @if (phases.length === 0) {
          <p class="omc-vide">Ajoutez une phase : la courbe se dessine à partir d'elles.</p>
        } @else {
          <svg #svg [attr.viewBox]="'0 0 ' + VB_W + ' ' + VB_H" class="omc-svg"
               (pointermove)="deplacer($event)" (pointerup)="relacher()" (pointerleave)="relacher()">

            <!-- Bandes de phase : leur largeur EST le poids de durée. -->
            @for (b of bandes(); track b.x) {
              <rect [attr.x]="b.x" [attr.y]="YT" [attr.width]="b.w" [attr.height]="YB - YT"
                    [attr.fill]="b.pair ? 'var(--surface-2)' : 'var(--surface-3)'" />
              <line [attr.x1]="b.x" [attr.y1]="YT" [attr.x2]="b.x" [attr.y2]="YB"
                    stroke="var(--border-strong)" stroke-width="1" />
            }

            <!-- Grille horizontale -->
            @for (g of graduations; track g) {
              <line [attr.x1]="X0" [attr.y1]="y(g)" [attr.x2]="X1" [attr.y2]="y(g)"
                    stroke="var(--border)" stroke-width="1" />
              <text [attr.x]="X0 - 8" [attr.y]="y(g) + 4" text-anchor="end"
                    class="omc-axe">{{ g }}</text>
            }

            <!-- Les autres métriques, en fantôme : la forme d'ensemble se lit derrière. -->
            @for (m of fantomes(); track m.code) {
              <polyline [attr.points]="ligne(m.code)" fill="none"
                        stroke="var(--slate-300)" stroke-width="1.4" />
            }

            <!-- Aire remplie + ligne de la métrique en cours -->
            <polygon [attr.points]="aire(focus())" fill="var(--green-100)" opacity=".75" />
            <polyline [attr.points]="ligne(focus())" fill="none" stroke="var(--green-600)"
                      stroke-width="2.6" stroke-linejoin="round" />

            <!-- 100 % : le repère du référentiel, jamais un maximum -->
            <line [attr.x1]="X0" [attr.y1]="y(100)" [attr.x2]="X1" [attr.y2]="y(100)"
                  stroke="var(--info)" stroke-width="1" stroke-dasharray="4 4" opacity=".75" />

            @for (h of poignees(); track h.pi + h.edge) {
              <text [attr.x]="h.x" [attr.y]="h.y - 10" [attr.text-anchor]="h.edge === 'debut' ? 'start' : 'end'"
                    class="omc-val">{{ h.v }}</text>
              <circle [attr.cx]="h.x" [attr.cy]="h.y" [attr.r]="actif(h) ? 8 : 6"
                      fill="var(--surface)" stroke="var(--green-600)" stroke-width="2.4"
                      class="omc-poignee"
                      (pointerdown)="saisir($event, h)" />
            }
          </svg>

          <!-- Pied de bandes : nom et poids, alignés sur le tracé (62 px et 12 px du viewBox). -->
          <div class="omc-pieds">
            @for (b of bandes(); track b.x) {
              <div class="omc-pied" [style.flex]="b.poids">
                <span class="omc-pied__nom">{{ b.nom || '—' }}</span>
                <span class="omc-pied__poids">poids {{ b.poids }}</span>
              </div>
            }
          </div>

          <div class="omc-chips">
            @for (m of metriques; track m.code) {
              <button type="button" class="omc-chip" [class.omc-chip--on]="focus() === m.code"
                      (click)="focus.set(m.code)">
                <span class="omc-chip__trait" [class.omc-chip__trait--on]="focus() === m.code"></span>
                {{ m.libelle }}
                @if (m.nature === 'EXPOSITION') {
                  <span class="omc-chip__cible"
                        title="Pour l'exposition à haute vitesse, le pourcentage EST la cible : un % du record personnel, pas un % du référentiel.">cible directe</span>
                }
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .omc { display: flex; flex-direction: column; gap: 9px; }
    .omc-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .omc-titre { margin: 0; font-size: 13.5px; font-weight: 600; }
    .omc-ref { display: inline-flex; align-items: center; gap: 6px;
               font-size: 11.5px; color: var(--info); }
    .omc-spacer { flex: 1; }
    .omc-hint { font-size: 11.5px; color: var(--text-3); }

    .omc-boite { border: 1px solid var(--border); border-radius: var(--r-lg);
                 background: var(--surface); padding: 11px 11px 4px;
                 box-shadow: var(--shadow-xs); }
    .omc-vide { margin: 0; padding: 26px 0; text-align: center;
                font-size: 13px; color: var(--text-4); }
    .omc-svg { width: 100%; height: auto; display: block; touch-action: none;
               user-select: none; }
    .omc-axe { font-family: var(--font-num); font-size: 11px; fill: var(--text-3); }
    .omc-val { font-family: var(--font-num); font-size: 11px; font-weight: 600;
               fill: var(--green-800); pointer-events: none; }
    .omc-poignee { cursor: ns-resize; }

    /* 62/760 = 8.16 % de marge gauche, 12/760 = 1.58 % à droite : les pieds tombent
       exactement sous les bandes du tracé. */
    .omc-pieds { display: flex; padding: 0 1.58% 0 8.16%;
                 border-top: 1px solid var(--border); margin-top: 2px; }
    .omc-pied { min-width: 0; padding: 6px 4px; text-align: center;
                border-left: 1px solid var(--border); }
    .omc-pied:first-child { border-left: 0; }
    .omc-pied__nom { display: block; font-size: 11.5px; color: var(--text-2);
                     overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .omc-pied__poids { display: block; font-family: var(--font-num); font-size: 10.5px;
                       color: var(--text-4); }

    .omc-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 9px 2px; }
    .omc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
                border: 1px solid var(--border); border-radius: var(--r-pill);
                background: var(--surface); cursor: pointer; font: inherit;
                font-size: 11.5px; color: var(--text-3); }
    .omc-chip:hover { border-color: var(--border-strong); color: var(--text-2); }
    .omc-chip--on { background: var(--green-50); border-color: var(--green-300);
                    color: var(--green-800); font-weight: 600; }
    .omc-chip__trait { width: 14px; height: 2px; border-radius: 2px; background: var(--slate-300); }
    .omc-chip__trait--on { background: var(--green-600); }
    .omc-chip__cible { font-size: 10px; padding: 0 5px; border-radius: var(--r-pill);
                       background: var(--cuivre); color: #fff; cursor: help; }
  `],
})
export class ObjectifCourbeModeleComponent {

  @Input({ required: true }) phases: Phase[] = [];
  @Input({ required: true }) metriques: Metrique[] = [];

  /** Une poignée relâchée : le parent écrit la valeur dans la phase concernée. */
  @Output() majPct = new EventEmitter<{ index: number; metrique: string; borne: 'debut' | 'fin'; valeur: number }>();

  readonly X0 = X0; readonly X1 = X1; readonly YT = YT; readonly YB = YB;
  readonly VB_W = VB_W; readonly VB_H = VB_H;
  readonly graduations = [0, 25, 50, 75, 100, 125];

  focus = signal<string>('distance_totale');
  private tire = signal<Poignee | null>(null);

  actif(h: Poignee): boolean {
    const t = this.tire();
    return !!t && t.pi === h.pi && t.edge === h.edge;
  }

  /** Métrique focalisée, retombant sur la première du catalogue si le code n'existe plus. */
  private codeFocus(): string {
    const f = this.focus();
    if (this.metriques.some(m => m.code === f)) return f;
    return this.metriques[0]?.code ?? '';
  }

  fantomes(): Metrique[] {
    return this.metriques.filter(m => m.code !== this.codeFocus());
  }

  y(v: number): number {
    return YB - (Math.max(0, Math.min(VMAX, v)) / VMAX) * (YB - YT);
  }

  /**
   * Bandes de phase. Leur largeur suit le poids de durée : c'est la même règle que celle du
   * moteur de répartition, donc le dessin ne peut pas mentir sur la place réelle d'une phase.
   */
  bandes(): Bande[] {
    const poids = this.phases.map(p => Math.max(1, p.poidsDuree || 1));
    const total = poids.reduce((s, w) => s + w, 0) || 1;
    let x = X0;
    return this.phases.map((p, i) => {
      const w = (X1 - X0) * poids[i] / total;
      const b: Bande = { x, w, nom: p.nom, poids: poids[i], pair: i % 2 === 0 };
      x += w;
      return b;
    });
  }

  /** Deux points par phase : le début à l'entrée de la bande, la fin à sa sortie. */
  poignees(): Poignee[] {
    const code = this.codeFocus();
    const out: Poignee[] = [];
    this.bandes().forEach((b, i) => {
      const v = this.phases[i].valeurs.find(x => x.metrique === code);
      const d = v?.pctDebut ?? 100, f = v?.pctFin ?? 100;
      out.push({ pi: i, edge: 'debut', x: b.x, y: this.y(d), v: d });
      out.push({ pi: i, edge: 'fin', x: b.x + b.w, y: this.y(f), v: f });
    });
    return out;
  }

  private serie(code: string): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    this.bandes().forEach((b, i) => {
      const v = this.phases[i].valeurs.find(x => x.metrique === code);
      pts.push({ x: b.x, y: this.y(v?.pctDebut ?? 100) });
      pts.push({ x: b.x + b.w, y: this.y(v?.pctFin ?? 100) });
    });
    return pts;
  }

  ligne(code: string): string {
    return this.serie(code).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  aire(code: string): string {
    const pts = this.serie(code);
    if (pts.length === 0) return '';
    const der = pts[pts.length - 1], prem = pts[0];
    return `${this.ligne(code)} ${der.x.toFixed(1)},${YB} ${prem.x.toFixed(1)},${YB}`;
  }

  // ── Manipulation ──

  saisir(ev: PointerEvent, h: Poignee): void {
    ev.preventDefault();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    this.tire.set(h);
  }

  /**
   * Le SVG est mis à l'échelle (largeur 100 %) : on repasse par le rectangle réel pour convertir
   * la position du curseur en unité du viewBox. Sans ça, la poignée dérive dès que la fenêtre
   * n'est pas exactement à 760 px.
   */
  deplacer(ev: PointerEvent): void {
    const t = this.tire();
    if (!t) return;
    const rect = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
    if (!rect.height) return;
    const yVb = (ev.clientY - rect.top) / rect.height * VB_H;
    const v = Math.round(Math.max(0, Math.min(VMAX, (YB - yVb) / (YB - YT) * VMAX)));
    this.majPct.emit({ index: t.pi, metrique: this.codeFocus(), borne: t.edge, valeur: v });
  }

  relacher(): void {
    if (this.tire()) this.tire.set(null);
  }
}
