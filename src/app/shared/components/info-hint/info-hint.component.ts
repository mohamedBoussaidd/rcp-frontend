import { Component, Input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/**
 * Petite bulle d'aide réutilisable : une icône « ? » qui ouvre au clic
 * (et non au survol, pour rester utilisable au doigt sur mobile) un popover
 * expliquant un indicateur : à quoi il répond + comment il est calculé, en gros.
 *
 *   <app-info-hint titre="ACWR" texte="Charge des 7 derniers jours / moyenne…"></app-info-hint>
 */
@Component({
  selector: 'app-info-hint',
  standalone: true,
  imports: [MatIcon],
  template: `
    @if (open()) {
      <div class="hint-scrim" (click)="close($event)"></div>
    }
    <span class="hint">
      <button type="button" class="hint__btn"
              [attr.aria-label]="'Aide : ' + titre"
              [attr.aria-expanded]="open()"
              (click)="toggle($event)">
        <mat-icon>help_outline</mat-icon>
      </button>
      @if (open()) {
        <span class="hint__pop" [class.hint__pop--left]="align === 'left'">
          @if (titre) { <span class="hint__title">{{ titre }}</span> }
          <span class="hint__text">{{ texte }}</span>
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
      width: 260px; max-width: 78vw;
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
  `],
})
export class InfoHintComponent {
  @Input() titre = '';
  @Input() texte = '';
  /** Sens d'ouverture du popover si proche du bord droit. */
  @Input() align: 'left' | 'right' = 'right';

  readonly open = signal(false);

  toggle(e: Event): void { e.stopPropagation(); this.open.update(v => !v); }
  close(e: Event): void { e.stopPropagation(); this.open.set(false); }
}
