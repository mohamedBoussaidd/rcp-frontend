import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BadgeComponent } from './badge.component';
import { EntiteBadgeService } from '../../../core/services/entite-badge.service';
import { AuthService } from '../../../core/services/auth.service';
import { BadgeDef } from './badge.model';

/**
 * Assignation des tags à une entité — RÉSERVÉ au super-admin (ne s'affiche pas pour les autres).
 * Liste les tags plateforme en pastilles cliquables ; un clic pose/retire le tag et enregistre.
 * `<app-badge-assign type="EXERCICE" [entiteId]="e.id" />`.
 */
@Component({
  selector: 'app-badge-assign',
  standalone: true,
  imports: [BadgeComponent],
  template: `
    @if (visible()) {
      <div class="ba">
        <span class="ba__lbl">Étiquettes</span>
        @for (t of pool(); track t.cle) {
          <button type="button" class="ba__chip" [class.ba__chip--on]="estAssigne(t)" (click)="basculer(t)"
                  [title]="estAssigne(t) ? 'Retirer' : 'Ajouter'">
            <app-badge [type]="t.cle" [label]="t.label" [icon]="t.icone" />
            <span class="ba__mk">{{ estAssigne(t) ? '✓' : '+' }}</span>
          </button>
        }
        @if (!pool().length) {
          <span class="ba__empty">Aucun tag disponible — créez-en dans <em>Gestion du club → Badges</em>.</span>
        }
      </div>
    }
  `,
  styles: [`
    .ba { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0; }
    .ba__lbl { font-size: 11.5px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: .03em; margin-right: 2px; }
    .ba__chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px 2px 4px; border: 1px dashed var(--border-strong); border-radius: var(--r-pill, 999px); background: var(--surface-2); cursor: pointer; }
    .ba__chip--on { border-style: solid; border-color: var(--copper); background: var(--copper-soft); }
    .ba__mk { font-size: 12px; font-weight: 800; color: var(--text-3); width: 14px; text-align: center; }
    .ba__chip--on .ba__mk { color: var(--copper); }
    .ba__empty { font-size: 12px; color: var(--text-4); }
  `],
})
export class BadgeAssignComponent {
  private http = inject(HttpClient);
  private svc = inject(EntiteBadgeService);
  private auth = inject(AuthService);

  readonly type = input.required<string>();
  readonly entiteId = input<string | null | undefined>();

  readonly pool = signal<BadgeDef[]>([]);
  readonly assignes = signal<string[]>([]);

  readonly visible = computed(() => this.auth.hasRole('SUPER_ADMIN') && !!this.entiteId());

  constructor() {
    effect(() => { if (this.auth.hasRole('SUPER_ADMIN')) this.chargerPool(); });
    effect(() => {
      const id = this.entiteId();
      if (id && this.auth.hasRole('SUPER_ADMIN')) this.chargerAssignes(this.type(), id);
    });
  }

  private chargerPool(): void {
    this.http.get<BadgeDef[]>('/api/admin/badges').subscribe({
      next: b => this.pool.set(b.filter(x => x.portee === 'PLATEFORME')),
      error: () => {},
    });
  }

  private chargerAssignes(type: string, id: string): void {
    this.svc.badgesDe(type, id).subscribe({
      next: b => this.assignes.set(b.map(x => x.id).filter((v): v is string => !!v)),
      error: () => {},
    });
  }

  estAssigne(t: BadgeDef): boolean {
    return !!t.id && this.assignes().includes(t.id);
  }

  basculer(t: BadgeDef): void {
    const id = this.entiteId();
    if (!id || !t.id) return;
    const set = new Set(this.assignes());
    if (set.has(t.id)) set.delete(t.id); else set.add(t.id);
    const ids = [...set];
    this.assignes.set(ids);
    this.svc.assigner(this.type(), id, ids).subscribe({ error: () => {} });
  }
}
