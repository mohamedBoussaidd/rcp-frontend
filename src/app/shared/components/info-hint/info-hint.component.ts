import { Component, ElementRef, HostListener, Input, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';

/** Une ligne de composition d'un score : le fait mesuré + les points qu'il apporte. */
export interface LigneComposition {
  libelle: string;
  points?: number | null;
  /** Étiquette physiologique suggérée (« fatigue neuromusculaire explosive probable »), en second rang. */
  type?: string | null;
}

/**
 * Petite bulle d'aide réutilisable : une icône « ? » qui ouvre au clic
 * (et non au survol, pour rester utilisable au doigt sur mobile) un popover
 * expliquant un indicateur : à quoi il répond + comment il est calculé, en gros.
 *
 *   <app-info-hint titre="ACWR" texte="Charge des 7 derniers jours / moyenne…"></app-info-hint>
 *
 * Peut aussi porter la COMPOSITION d'un score affiché (pour qu'un chiffre ne soit jamais
 * un nombre magique) et un LIEN vers l'explication détaillée. Le lien est à la main de
 * l'appelant : /methodologie est gardée par le module prépa physique, donc un médecin ou un
 * joueur ne doit pas le voir — l'appelant ne le passe que si le droit est là.
 */
@Component({
  selector: 'app-info-hint',
  standalone: true,
  imports: [MatIcon, RouterLink, DecimalPipe],
  template: `
    <span class="hint">
      <button type="button" class="hint__btn"
              [attr.aria-label]="'Aide : ' + titre"
              [attr.aria-expanded]="open()"
              (click)="toggle($event)">
        <mat-icon>help_outline</mat-icon>
      </button>
      @if (open()) {
        <span class="hint__pop" [class.hint__pop--left]="align === 'left'" (click)="$event.stopPropagation()">
          @if (titre) { <span class="hint__title">{{ titre }}</span> }
          @if (texte) { <span class="hint__text">{{ texte }}</span> }

          @if (composition.length) {
            <span class="hint__sep"></span>
            <span class="hint__subtitle">{{ compositionTitre }}</span>
            <span class="hint__list">
              @for (l of composition; track $index) {
                <span class="hint__li">
                  <span class="hint__li-txt">
                    {{ l.libelle }}
                    @if (l.type) { <em class="hint__li-type">{{ l.type }}</em> }
                  </span>
                  @if (l.points != null) { <b class="hint__li-pts">+{{ l.points | number:'1.0-0' }}</b> }
                </span>
              }
            </span>
            @if (compositionVide) { <span class="hint__empty">{{ compositionVide }}</span> }
          }

          @if (lien) {
            <span class="hint__sep"></span>
            <a class="hint__lien" [routerLink]="lien" [fragment]="ancre || undefined">
              {{ lienLibelle }} <mat-icon>arrow_forward</mat-icon>
            </a>
          }
        </span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .hint { position: relative; display: inline-flex; }
    .hint__btn {
      display: inline-grid; place-items: center;
      width: 18px; height: 18px; padding: 0; margin: 0;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-3); border-radius: 50%;
    }
    .hint__btn:hover { color: var(--text-1); }
    .hint__btn mat-icon {
      font-size: 16px; width: 16px; height: 16px; line-height: 16px;
    }
    .hint-scrim { position: fixed; inset: 0; z-index: 40; }
    .hint__pop {
      position: absolute; z-index: 41; top: calc(100% + 6px); left: 0;
      width: 300px; max-width: 78vw;
      background: var(--surface-1, #fff);
      border: 1px solid var(--border, #E5E9EF);
      border-radius: 10px; padding: 10px 12px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, .16);
      font-size: 12px; line-height: 1.45; color: var(--text-2);
      text-align: left; white-space: normal; cursor: default;
    }
    .hint__pop--left { left: auto; right: 0; }
    .hint__title {
      display: block; font-weight: 600; font-size: 12.5px;
      color: var(--text-1); margin-bottom: 3px;
    }
    .hint__text { display: block; }
    .hint__sep {
      display: block; height: 1px; margin: 8px 0 7px;
      background: var(--border, #E5E9EF);
    }
    .hint__subtitle {
      display: block; font-weight: 600; font-size: 11px;
      text-transform: uppercase; letter-spacing: .03em;
      color: var(--text-3); margin-bottom: 4px;
    }
    .hint__list { display: flex; flex-direction: column; gap: 4px; }
    .hint__li { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .hint__li-txt { flex: 1; }
    .hint__li-type {
      display: block; font-style: normal; font-size: 11px; color: var(--text-3);
    }
    .hint__li-pts { color: var(--text-1); font-variant-numeric: tabular-nums; }
    .hint__empty { display: block; color: var(--text-3); }
    .hint__lien {
      display: inline-flex; align-items: center; gap: 3px;
      font-weight: 600; color: var(--green-700, #15803d); text-decoration: none;
    }
    .hint__lien:hover { text-decoration: underline; }
    .hint__lien mat-icon { font-size: 14px; width: 14px; height: 14px; line-height: 14px; }
  `],
})
export class InfoHintComponent {
  @Input() titre = '';
  @Input() texte = '';
  /** Sens d'ouverture du popover si proche du bord droit. */
  @Input() align: 'left' | 'right' = 'right';

  /** Composition du score affiché : d'où vient le chiffre. Vide = section masquée. */
  @Input() composition: LigneComposition[] = [];
  @Input() compositionTitre = 'Composition du score';
  /** Message affiché quand la composition est demandée mais qu'aucun facteur ne ressort. */
  @Input() compositionVide: string | null = null;

  /** Route de l'explication détaillée (ex. '/methodologie'). Omise = pas de lien. */
  @Input() lien: string | null = null;
  /** `undefined` accepté : les entrées de `AIDES_INDICATEURS` n'ont pas toutes une ancre. */
  @Input() ancre: string | null | undefined = null;
  @Input() lienLibelle = 'Voir la méthodologie';

  readonly open = signal(false);

  private host = inject(ElementRef);

  toggle(e: Event): void { e.stopPropagation(); this.open.update(v => !v); }
  close(e: Event): void { e.stopPropagation(); this.open.set(false); }

  /** Ferme dès qu'on clique hors de la bulle (fiable même à l'intérieur d'un <label>). */
  @HostListener('document:click', ['$event'])
  fermerSiDehors(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target)) {
      this.open.set(false);
    }
  }
}
