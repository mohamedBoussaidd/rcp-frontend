import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { ESPACES, Terrain, apercuEspace } from '../schema-editor/schema-espaces';

/**
 * Sélecteur d'espace de jeu : une vignette par format. Les vignettes sont générées à
 * partir des marquages réels (cf. apercuEspace) — pas de dessin figé à maintenir en
 * parallèle du rendu.
 */
@Component({
  selector: 'app-schema-espace-dialog',
  standalone: true,
  imports: [MatIcon],
  template: `
    <div class="tete">
      <h2>Espace de jeu</h2>
      <button class="ferme" (click)="ref.close()" aria-label="Fermer"><mat-icon>close</mat-icon></button>
    </div>
    <div class="grille">
      @for (e of espaces; track e.cle) {
        <button class="vignette" [class.is-active]="e.cle === courant" (click)="ref.close(e.cle)">
          <div class="cadre">
            @let a = apercu(e.cle);
            <svg [attr.viewBox]="'0 0 ' + a.W + ' ' + a.H" preserveAspectRatio="xMidYMid meet">
              <rect x="0" y="0" [attr.width]="a.W" [attr.height]="a.H" class="gazon" />
              @for (f of a.formes; track $index) {
                @if (f.points) { <polyline [attr.points]="f.points" /> }
                @if (f.cercle) { <circle [attr.cx]="f.cercle.cx" [attr.cy]="f.cercle.cy" [attr.r]="f.cercle.r" class="plein" /> }
              }
            </svg>
          </div>
          <span class="nom">{{ e.libelle }}</span>
          <span class="detail">{{ e.detail }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 18px 20px 20px; }
    .tete { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    h2 { margin: 0; font-size: 17px; font-weight: 700; }
    .ferme { background: none; border: 0; cursor: pointer; color: var(--text-3); display: flex; }

    .grille {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
      gap: 12px;
    }

    .vignette {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      padding: 8px;
      background: var(--surface-2);
      border: 2px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      text-align: left;
      transition: border-color .15s, transform .15s;

      &:hover { border-color: var(--copper); transform: translateY(-2px); }
      &.is-active { border-color: var(--copper); background: color-mix(in srgb, var(--copper) 10%, var(--surface-2)); }
    }

    .cadre {
      height: 84px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }
    svg { width: 100%; height: 100%; }
    .gazon { fill: #128A4A; }
    polyline { fill: none; stroke: rgba(255,255,255,.9); stroke-width: 5; }
    circle.plein { fill: rgba(255,255,255,.9); }

    .nom { font-size: 12.5px; font-weight: 650; }
    .detail { font-size: 11px; color: var(--text-3); }
  `],
})
export class SchemaEspaceDialogComponent {
  readonly ref = inject<MatDialogRef<SchemaEspaceDialogComponent, Terrain>>(MatDialogRef);
  readonly courant = inject<{ courant: Terrain }>(MAT_DIALOG_DATA).courant;
  readonly espaces = ESPACES;
  apercu = apercuEspace;
}
