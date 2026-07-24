import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { contrasteWcag } from '../../../shared/components/badge/badge-contraste';

interface BadgeAdmin {
  id: string; cle: string; label: string; icone: string | null; ton: string;
  mode: string; portee: string; couleurBg: string | null; couleurFg: string | null;
  tooltip: string | null; ordre: number; actif: boolean;
}
interface PaletteTon {
  ton: string; libelle: string; couleurBg: string; couleurFg: string; personnalise: boolean;
}

const TONS = [
  { v: 'NEUTRAL', l: 'Neutre' }, { v: 'INFO', l: 'Information' }, { v: 'SUCCESS', l: 'Validé / vert' },
  { v: 'WARNING', l: 'Attention' }, { v: 'DANGER', l: 'Alerte' }, { v: 'BRAND', l: 'IA / marque' },
];

/**
 * Gestion des badges (super-admin) : édition des badges système (label/icône/ton/couleur/activation)
 * et de la palette des 6 tons (paire fond/texte + contraste). Aperçu live sur chaque ligne. Les tags
 * plateforme (création/assignation) arriveront dans une phase suivante.
 */
@Component({
  selector: 'app-badges-admin',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  template: `
    <div class="badges-admin">
      <header class="page-head">
        <div>
          <h1 class="page-head__title">Badges</h1>
          <p class="page-head__sub">Libellés, icônes et couleurs des badges de l'application. Les clubs peuvent ensuite réajuster les couleurs des 6 tons pour eux-mêmes.</p>
        </div>
      </header>

      <section class="card">
        <h2 class="card__title">Badges système</h2>
        <p class="card__hint">Ces badges sont posés par l'application. On peut changer leur texte, leur icône, leur ton (couleur) et les désactiver — mais pas les supprimer. Laisser une couleur vide = suit le ton.</p>

        @for (b of badgesSysteme(); track b.cle) {
          <div class="row" [class.row--off]="!b.actif">
            <div class="row__preview">
              <span class="badge"
                    [style.background]="apercuBg(b)" [style.color]="apercuFg(b)"
                    [style.borderColor]="'transparent'">
                @if (b.icone) { <mat-icon>{{ b.icone }}</mat-icon> }{{ b.label || b.cle }}
              </span>
              <code class="row__cle">{{ b.cle }}</code>
            </div>
            <div class="row__fields">
              <label class="field"><span>Libellé</span><input [(ngModel)]="b.label" maxlength="60"></label>
              <label class="field"><span>Icône (mat-icon)</span><input [(ngModel)]="b.icone" placeholder="ex. schema"></label>
              <label class="field"><span>Ton</span>
                <select [(ngModel)]="b.ton">
                  @for (t of tons; track t.v) { <option [value]="t.v">{{ t.l }}</option> }
                </select>
              </label>
              <label class="field field--sm"><span>Fond (option.)</span><input [(ngModel)]="b.couleurBg" placeholder="hérite du ton"></label>
              <label class="field field--sm"><span>Texte (option.)</span><input [(ngModel)]="b.couleurFg" placeholder="hérite du ton"></label>
              <label class="field field--wide"><span>Infobulle</span><input [(ngModel)]="b.tooltip"></label>
              <label class="chk"><input type="checkbox" [(ngModel)]="b.actif"> Actif</label>
            </div>
            <div class="row__side">
              @if (alerteContraste(apercuBg(b), apercuFg(b))) { <span class="warn" title="Contraste faible : le texte peut être peu lisible">⚠ contraste</span> }
              <button class="btn btn--primary btn--sm" (click)="sauverBadge(b)">Enregistrer</button>
            </div>
          </div>
        }
      </section>

      <section class="card">
        <h2 class="card__title">Étiquettes (tags)</h2>
        <p class="card__hint">Étiquettes libres (« Nouveau », « À revoir »…) à assigner ensuite aux exercices, séances ou joueurs depuis leur fiche. Elles gardent la couleur choisie ici pour tous les clubs.</p>

        <div class="row row--create">
          <div class="row__preview">
            <span class="badge" [style.background]="nouveau.couleurBg" [style.color]="nouveau.couleurFg" [style.borderColor]="'transparent'">
              @if (nouveau.icone) { <mat-icon>{{ nouveau.icone }}</mat-icon> }{{ nouveau.label || 'Aperçu' }}
            </span>
          </div>
          <div class="row__fields">
            <label class="field"><span>Libellé</span><input [(ngModel)]="nouveau.label" maxlength="60" placeholder="ex. Nouveau"></label>
            <label class="field"><span>Icône (option.)</span><input [(ngModel)]="nouveau.icone" placeholder="ex. star"></label>
            <label class="field"><span>Fond</span><input type="color" class="pick" [(ngModel)]="nouveau.couleurBg"></label>
            <label class="field"><span>Texte</span><input type="color" class="pick" [(ngModel)]="nouveau.couleurFg"></label>
            <label class="field field--wide"><span>Infobulle</span><input [(ngModel)]="nouveau.tooltip"></label>
          </div>
          <div class="row__side">
            @if (alerteContraste(nouveau.couleurBg, nouveau.couleurFg)) { <span class="warn" title="Contraste faible">⚠ contraste</span> }
            <button class="btn btn--primary btn--sm" [disabled]="!nouveau.label.trim()" (click)="creerTag()">Créer</button>
          </div>
        </div>

        @for (b of tags(); track b.cle) {
          <div class="row">
            <div class="row__preview">
              <span class="badge" [style.background]="apercuBg(b)" [style.color]="apercuFg(b)" [style.borderColor]="'transparent'">
                @if (b.icone) { <mat-icon>{{ b.icone }}</mat-icon> }{{ b.label }}
              </span>
            </div>
            <div class="row__fields">
              <label class="field"><span>Libellé</span><input [(ngModel)]="b.label" maxlength="60"></label>
              <label class="field"><span>Icône</span><input [(ngModel)]="b.icone"></label>
              <label class="field field--sm"><span>Fond</span><input [(ngModel)]="b.couleurBg"></label>
              <label class="field field--sm"><span>Texte</span><input [(ngModel)]="b.couleurFg"></label>
              <label class="field field--wide"><span>Infobulle</span><input [(ngModel)]="b.tooltip"></label>
            </div>
            <div class="row__side">
              <button class="btn btn--primary btn--sm" (click)="sauverBadge(b)">Enregistrer</button>
              <button class="btn btn--ghost btn--sm" (click)="supprimerTag(b)">Supprimer</button>
            </div>
          </div>
        }
        @if (!tags().length) { <p class="card__hint">Aucune étiquette pour l'instant.</p> }
      </section>

      <section class="card">
        <h2 class="card__title">Palette des tons</h2>
        <p class="card__hint">Les 6 familles de couleur. Modifier un ton recolore tous les badges qui l'utilisent. « Personnalisé » désactivé = le ton reprend la couleur par défaut de l'application (adaptée au thème clair/sombre).</p>

        @for (t of palette(); track t.ton) {
          <div class="row">
            <div class="row__preview">
              <span class="badge" [style.background]="t.couleurBg" [style.color]="t.couleurFg" [style.borderColor]="'transparent'">
                {{ t.libelle }}
              </span>
            </div>
            <div class="row__fields">
              <label class="field"><span>Fond</span><input [(ngModel)]="t.couleurBg" placeholder="#RRGGBB ou dégradé"></label>
              @if (estHex(t.couleurBg)) { <input type="color" class="pick" [(ngModel)]="t.couleurBg"> }
              <label class="field"><span>Texte</span><input [(ngModel)]="t.couleurFg" placeholder="#RRGGBB"></label>
              @if (estHex(t.couleurFg)) { <input type="color" class="pick" [(ngModel)]="t.couleurFg"> }
              <label class="chk"><input type="checkbox" [(ngModel)]="t.personnalise"> Personnalisé</label>
            </div>
            <div class="row__side">
              @if (alerteContraste(t.couleurBg, t.couleurFg)) { <span class="warn" title="Contraste faible">⚠ contraste</span> }
            </div>
          </div>
        }
        <div class="card__actions">
          <button class="btn btn--primary" (click)="sauverPalette()">Enregistrer la palette</button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .badges-admin { max-width: 1100px; margin: 0 auto; padding: 8px 4px 40px; display: flex; flex-direction: column; gap: 20px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg, 14px); padding: 18px 20px; }
    .card__title { margin: 0 0 4px; font-size: 16px; }
    .card__hint { margin: 0 0 14px; font-size: 12.5px; color: var(--text-3); }
    .card__actions { margin-top: 14px; }
    .row { display: flex; align-items: flex-start; gap: 16px; padding: 12px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .row:first-of-type { border-top: none; }
    .row--off { opacity: .55; }
    .row__preview { display: flex; flex-direction: column; gap: 6px; min-width: 130px; }
    .row__cle { font-size: 10.5px; color: var(--text-4); }
    .row__fields { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; flex: 1; }
    .row__side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--text-3); }
    .field span { font-weight: 600; }
    .field input, .field select { min-width: 120px; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface-input); color: var(--text); font-size: 13px; }
    .field--sm input { min-width: 92px; }
    .field--wide { flex: 1; }
    .field--wide input { min-width: 180px; width: 100%; }
    .pick { width: 34px; height: 34px; padding: 0; border: 1px solid var(--border-strong); border-radius: 8px; background: none; align-self: flex-end; }
    .chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-2); align-self: flex-end; }
    .warn { font-size: 11px; font-weight: 700; color: var(--bad); white-space: nowrap; }
  `],
})
export class BadgesAdminComponent implements OnInit {

  private http = inject(HttpClient);
  private snack = inject(MatSnackBar);

  readonly tons = TONS;
  private readonly _badges = signal<BadgeAdmin[]>([]);
  readonly palette = signal<PaletteTon[]>([]);

  readonly badgesSysteme = computed(() => this._badges().filter(b => b.portee === 'SYSTEME'));
  readonly tags = computed(() => this._badges().filter(b => b.portee === 'PLATEFORME'));

  nouveau = { label: '', icone: '', couleurBg: '#EEF2FF', couleurFg: '#3730A3', tooltip: '' };

  ngOnInit(): void {
    this.http.get<BadgeAdmin[]>('/api/admin/badges').subscribe({
      next: b => this._badges.set(b),
      error: () => this.snack.open('Chargement des badges impossible', 'Fermer', { duration: 3000 }),
    });
    this.http.get<PaletteTon[]>('/api/admin/badges/palette').subscribe({
      next: p => this.palette.set(p),
      error: () => {},
    });
  }

  /** Couleur de fond de l'aperçu : override explicite, sinon la couleur du ton (palette). */
  apercuBg(b: BadgeAdmin): string {
    if (b.couleurBg) return b.couleurBg;
    return this.palette().find(t => t.ton === b.ton)?.couleurBg ?? '#E5E9EF';
  }
  apercuFg(b: BadgeAdmin): string {
    if (b.couleurFg) return b.couleurFg;
    return this.palette().find(t => t.ton === b.ton)?.couleurFg ?? '#1E293B';
  }

  estHex(v: string): boolean {
    return /^#?[0-9a-f]{6}$/i.test((v ?? '').trim());
  }

  alerteContraste(bg: string, fg: string): boolean {
    const c = contrasteWcag(bg, fg);
    return c !== null && c < 3;
  }

  sauverBadge(b: BadgeAdmin): void {
    const dto = {
      label: b.label, icone: b.icone, ton: b.ton, mode: b.mode,
      couleurBg: b.couleurBg, couleurFg: b.couleurFg, tooltip: b.tooltip,
      actif: b.actif, ordre: b.ordre,
    };
    this.http.put<BadgeAdmin>(`/api/admin/badges/${b.cle}`, dto).subscribe({
      next: () => this.snack.open(`Badge « ${b.label} » enregistré`, 'Fermer', { duration: 2000 }),
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  creerTag(): void {
    if (!this.nouveau.label.trim()) return;
    const d = {
      label: this.nouveau.label, icone: this.nouveau.icone || null, ton: 'NEUTRAL',
      couleurBg: this.nouveau.couleurBg, couleurFg: this.nouveau.couleurFg, tooltip: this.nouveau.tooltip || null,
    };
    this.http.post<BadgeAdmin>('/api/admin/badges', d).subscribe({
      next: b => {
        this._badges.update(list => [...list, b]);
        this.nouveau = { label: '', icone: '', couleurBg: '#EEF2FF', couleurFg: '#3730A3', tooltip: '' };
        this.snack.open('Étiquette créée', 'Fermer', { duration: 2000 });
      },
      error: () => this.snack.open('Création impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimerTag(b: BadgeAdmin): void {
    this.http.delete(`/api/admin/badges/${b.cle}`).subscribe({
      next: () => {
        this._badges.update(list => list.filter(x => x.cle !== b.cle));
        this.snack.open('Étiquette supprimée', 'Fermer', { duration: 2000 });
      },
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  sauverPalette(): void {
    this.http.put<PaletteTon[]>('/api/admin/badges/palette', this.palette()).subscribe({
      next: p => { this.palette.set(p); this.snack.open('Palette enregistrée', 'Fermer', { duration: 2000 }); },
      error: () => this.snack.open('Enregistrement de la palette impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
