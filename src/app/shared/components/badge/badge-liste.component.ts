import { Component, computed, effect, inject, input } from '@angular/core';
import { BadgeComponent } from './badge.component';
import { EntiteBadgeService } from '../../../core/services/entite-badge.service';
import { BadgeDef } from './badge.model';

/**
 * Affiche les tags (badges plateforme) posés sur une entité. Lecture via le cache PAR TYPE
 * d'{@link EntiteBadgeService} → aucune requête par card. À poser sur les cards/fiches
 * exercice/séance/joueur : `<app-badge-liste type="EXERCICE" [entiteId]="e.id" />`.
 */
@Component({
  selector: 'app-badge-liste',
  standalone: true,
  imports: [BadgeComponent],
  template: `
    @for (b of badges(); track b.cle) {
      <app-badge [type]="b.cle" [label]="b.label" [icon]="b.icone" [tooltip]="b.tooltip ?? null" />
    }
  `,
  styles: [`:host { display: contents; }`],
})
export class BadgeListeComponent {
  private svc = inject(EntiteBadgeService);

  readonly type = input.required<string>();
  readonly entiteId = input<string | null | undefined>();

  constructor() {
    effect(() => this.svc.ensureLoaded(this.type()));
  }

  readonly badges = computed<BadgeDef[]>(() => this.svc.lookup(this.type(), this.entiteId()));
}
