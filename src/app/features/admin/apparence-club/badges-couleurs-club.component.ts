import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BadgeRegistryService } from '@core/services/badge-registry.service';
import { ClubTonCouleur } from '../../../shared/components/badge/badge.model';
import { contrasteWcag } from '../../../shared/components/badge/badge-contraste';

interface LigneTon {
  ton: string; libelle: string; actif: boolean; couleurBg: string; couleurFg: string;
}

/** Défauts affichés (tons informatifs solides) — alignés sur :root / le seed V79. BRAND (IA) exclu :
 *  le dégradé de marque reste piloté par le super-admin. */
const DEFAUTS: { ton: string; libelle: string; bg: string; fg: string }[] = [
  { ton: 'NEUTRAL', libelle: 'Neutre',      bg: '#E5E9EF', fg: '#1E293B' },
  { ton: 'INFO',    libelle: 'Information',  bg: '#EFF6FF', fg: '#1D4ED8' },
  { ton: 'SUCCESS', libelle: 'Validé',       bg: '#ECFDF5', fg: '#15803D' },
  { ton: 'WARNING', libelle: 'Attention',    bg: '#FFFBEB', fg: '#B45309' },
  { ton: 'DANGER',  libelle: 'Alerte',       bg: '#FEF2F2', fg: '#B91C1C' },
];

/**
 * Section « Couleurs des badges » de l'onglet Apparence : le club réajuste, pour lui-même, la
 * couleur des tons informatifs des badges système. Le reste (badges de marque/IA, tags) n'est pas
 * modifiable ici. Enregistrer recharge le registre → réinjection immédiate des variables CSS.
 */
@Component({
  selector: 'app-badges-couleurs-club',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="bcc">
      <h3 class="bcc__title">Couleurs des badges</h3>
      <p class="bcc__hint">Ajustez, pour votre club, la couleur des badges informatifs. Cochez un ton pour le personnaliser ; décoché, il reprend la couleur par défaut.</p>

      @for (l of lignes(); track l.ton) {
        <div class="bcc__row" [class.bcc__row--off]="!l.actif">
          <span class="badge" [style.background]="l.couleurBg" [style.color]="l.couleurFg" [style.borderColor]="'transparent'">{{ l.libelle }}</span>
          <label class="chk"><input type="checkbox" [(ngModel)]="l.actif"> Personnaliser</label>
          @if (l.actif) {
            <label class="fld">Fond <input type="color" [(ngModel)]="l.couleurBg"></label>
            <label class="fld">Texte <input type="color" [(ngModel)]="l.couleurFg"></label>
            @if (alerte(l)) { <span class="warn" title="Contraste faible">⚠</span> }
          }
        </div>
      }

      <div class="bcc__actions">
        <button class="btn btn--primary btn--sm" [disabled]="saving()" (click)="enregistrer()">Enregistrer les couleurs</button>
      </div>
    </section>
  `,
  styles: [`
    .bcc { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }
    .bcc__title { margin: 0 0 4px; font-size: 15px; }
    .bcc__hint { margin: 0 0 14px; font-size: 12.5px; color: var(--text-3); }
    .bcc__row { display: flex; align-items: center; gap: 14px; padding: 8px 0; flex-wrap: wrap; }
    .bcc__row--off { opacity: .6; }
    .bcc__row .badge { min-width: 96px; justify-content: center; }
    .chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-2); }
    .fld { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); }
    .fld input[type=color] { width: 34px; height: 30px; padding: 0; border: 1px solid var(--border-strong); border-radius: 7px; background: none; }
    .warn { color: var(--bad); font-weight: 800; }
    .bcc__actions { margin-top: 14px; }
  `],
})
export class BadgesCouleursClubComponent implements OnInit {

  private registry = inject(BadgeRegistryService);
  private snack = inject(MatSnackBar);

  readonly lignes = signal<LigneTon[]>(DEFAUTS.map(d => ({
    ton: d.ton, libelle: d.libelle, actif: false, couleurBg: d.bg, couleurFg: d.fg,
  })));
  readonly saving = signal(false);

  ngOnInit(): void {
    this.registry.couleursClub().subscribe({
      next: (overrides: ClubTonCouleur[]) => {
        this.lignes.update(ls => ls.map(l => {
          const o = overrides.find(x => x.ton === l.ton);
          return o ? { ...l, actif: true, couleurBg: o.couleurBg, couleurFg: o.couleurFg } : l;
        }));
      },
      error: () => {},
    });
  }

  alerte(l: LigneTon): boolean {
    const c = contrasteWcag(l.couleurBg, l.couleurFg);
    return c !== null && c < 3;
  }

  enregistrer(): void {
    this.saving.set(true);
    const valeurs: ClubTonCouleur[] = this.lignes()
      .filter(l => l.actif)
      .map(l => ({ ton: l.ton as ClubTonCouleur['ton'], couleurBg: l.couleurBg, couleurFg: l.couleurFg }));
    this.registry.majCouleursClub(valeurs).subscribe({
      next: () => { this.saving.set(false); this.snack.open('Couleurs des badges enregistrées', 'Fermer', { duration: 2500 }); },
      error: () => { this.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }
}
