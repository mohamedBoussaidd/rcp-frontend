import { Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BadgeRegistryService } from '../../../core/services/badge-registry.service';
import { BadgeDef, BadgeMode, BadgeTon } from './badge.model';

/**
 * Badge unifié de l'application. Trois usages :
 *  - typé (registry) : `<app-badge type="ia" />`, `<app-badge type="blessure" />` ;
 *  - texte dynamique : `<app-badge type="auteur" [label]="'Créé par ' + p.nom" />` ;
 *  - ad-hoc          : `<app-badge ton="NEUTRAL" [label]="'45 min'" />` (sans clé).
 *
 * Couleur : si la définition porte une couleur explicite (tags) et qu'aucun `ton` n'est forcé, on
 * l'applique en style inline ; sinon on applique la classe de ton `.badge--ton-*` (theme-aware,
 * réajustable par le club). `mode="corner"` (ou une def CORNER) pose la pastille en coin — l'hôte
 * doit porter `.badge-host` (position: relative) pour l'ancrer.
 */
@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [MatIconModule],
  template: `
    @if (visible()) {
      <span class="badge"
            [class]="tonClass()"
            [class.badge--corner]="corner()"
            [style.background]="styleBg()"
            [style.color]="styleFg()"
            [style.borderColor]="styleBg() ? 'transparent' : null"
            [title]="tooltip()"
            [attr.aria-label]="labelAffiche() || tooltip()">
        @if (icone()) { <mat-icon>{{ icone() }}</mat-icon> }{{ labelAffiche() }}
      </span>
    }
  `,
  styles: [`:host { display: inline-flex; }`],
})
export class BadgeComponent {

  private registry = inject(BadgeRegistryService);

  /** Clé du badge dans la registry (badge système ou tag). Absent = badge ad-hoc (ton + label). */
  readonly type = input<string | null | undefined>(null);
  /** Force le ton (sinon celui de la def, sinon NEUTRAL). Ignore la couleur explicite de la def. */
  readonly ton = input<BadgeTon | null | undefined>(null);
  /** Remplace / fournit le texte (dynamique). */
  readonly label = input<string | null | undefined>(null);
  /** Remplace l'icône (mat-icon). */
  readonly icon = input<string | null | undefined>(null);
  /** Force la présentation. */
  readonly mode = input<BadgeMode | null | undefined>(null);
  /** Infobulle (sinon celle de la def, sinon le label). */
  readonly tooltipIn = input<string | null | undefined>(null, { alias: 'tooltip' });

  private readonly def = computed<BadgeDef | undefined>(() => this.registry.resolve(this.type()));

  readonly tonEffectif = computed<BadgeTon>(() => this.ton() ?? this.def()?.ton ?? 'NEUTRAL');
  readonly labelAffiche = computed(() => this.label() ?? this.def()?.label ?? '');
  readonly icone = computed(() => this.icon() ?? this.def()?.icone ?? null);
  readonly corner = computed(() => (this.mode() ?? this.def()?.mode ?? 'INLINE') === 'CORNER');
  readonly tooltip = computed(() => this.tooltipIn() ?? this.def()?.tooltip ?? this.labelAffiche());

  /** Couleur explicite (tags) : seulement si la def en porte une ET qu'aucun ton n'est forcé. */
  readonly styleBg = computed(() => (!this.ton() && this.def()?.couleurBg) ? this.def()!.couleurBg! : null);
  readonly styleFg = computed(() => (!this.ton() && this.def()?.couleurFg) ? this.def()!.couleurFg! : null);
  readonly tonClass = computed(() => this.styleBg() ? '' : 'badge--ton-' + this.tonEffectif().toLowerCase());

  /** Rien à afficher si ni texte ni icône (ex. clé inconnue sans label). */
  readonly visible = computed(() => !!this.labelAffiche() || !!this.icone());
}
