import { Component, computed, input } from '@angular/core';

/**
 * Chip « créateur / auteur » réutilisable : pastille d'initiales + nom, présentation sobre et
 * moderne (cf. planche de référence). À utiliser partout où l'on affichait le nom du créateur en
 * texte brut (`creeParNom`). Le préfixe (« créé par », « par », « proposé par »…) est réglable.
 *
 * <p>Rien ne s'affiche si aucun nom n'est fourni — un auteur inconnu n'a pas à occuper l'espace.</p>
 */
@Component({
  selector: 'app-auteur-chip',
  standalone: true,
  template: `
    @if (nomAffiche()) {
      <span class="auteur-chip" [title]="prefixe() + ' ' + nomAffiche()">
        <span class="auteur-chip__ava" aria-hidden="true">{{ initiales() }}</span>
        <span class="auteur-chip__txt">
          @if (prefixe()) { <span class="auteur-chip__pre">{{ prefixe() }}</span> }
          <span class="auteur-chip__nom">{{ nomAffiche() }}</span>
          @if (equipe()) { <span class="auteur-chip__eq">· {{ equipe() }}</span> }
        </span>
      </span>
    }
  `,
  styles: [`
    :host { display: inline-flex; min-width: 0; }
    .auteur-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      padding: 3px 9px 3px 3px;
      border: 1px solid var(--border);
      border-radius: var(--r-pill);
      background: var(--surface);
      min-width: 0;
    }
    .auteur-chip__ava {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--surface-3);
      color: var(--text-2);
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .auteur-chip__txt {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      min-width: 0;
      font-size: 12px;
      line-height: 1.3;
      overflow: hidden;
      white-space: nowrap;
    }
    .auteur-chip__pre { color: var(--text-3); font-weight: 500; flex-shrink: 0; }
    .auteur-chip__nom { color: var(--text); font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
    .auteur-chip__eq { color: var(--text-3); font-weight: 500; flex-shrink: 0; }
  `],
})
export class AuteurChipComponent {
  /** Nom complet du créateur (ex. « Mohamed Boussaid »). Vide/absent → rien ne s'affiche. */
  readonly nom = input<string | null | undefined>(null);
  /** Équipe/contexte d'origine, optionnel (affiché après le nom). */
  readonly equipe = input<string | null | undefined>(null);
  /** Préfixe éditorial devant le nom. Passer '' pour n'afficher que le nom. */
  readonly prefixe = input<string>('créé par');

  readonly nomAffiche = computed(() => (this.nom() ?? '').trim());

  /** Initiales : 1ʳᵉ lettre des deux premiers mots (ou « ? » si vraiment rien). */
  readonly initiales = computed(() => {
    const mots = this.nomAffiche().split(/\s+/).filter(Boolean);
    if (!mots.length) return '?';
    return (mots[0][0] + (mots.length > 1 ? mots[mots.length - 1][0] : '')).toUpperCase();
  });
}
