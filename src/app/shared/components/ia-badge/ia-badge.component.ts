import { Component, input } from '@angular/core';
import { BadgeComponent } from '../badge/badge.component';

/**
 * Badge « IA » : simple PRÉRÉGLAGE de {@link BadgeComponent} (`type="ia"`). Conservé pour ne pas
 * toucher aux usages déjà posés (`<app-ia-badge />`, `[flottant]`, `titre`) — toute la logique de
 * rendu et de couleur vit désormais dans `<app-badge>` (registry + ton BRAND). Pour un nouveau
 * badge, préférer directement `<app-badge type="…" />`.
 *
 * <p>Usages : `<app-ia-badge />`, `<app-ia-badge label="Proposée par IA" />`,
 * `<app-ia-badge [flottant]="true" />` (pastille en coin d'un conteneur `.badge-host`).</p>
 */
@Component({
  selector: 'app-ia-badge',
  standalone: true,
  imports: [BadgeComponent],
  template: `
    <app-badge type="ia"
               [label]="label()"
               [mode]="flottant() ? 'CORNER' : 'INLINE'"
               [tooltip]="titre()" />
  `,
  styles: [`:host { display: inline-flex; }`],
})
export class IaBadgeComponent {
  /** Texte du badge (ex. « IA », « Proposée par IA »). */
  readonly label = input<string>('IA');
  /** Pastille flottante posée en coin (hôte `.badge-host` / `position: relative`). */
  readonly flottant = input<boolean>(false);
  /** Infobulle. */
  readonly titre = input<string>("Proposé / généré par l'IA");
}
