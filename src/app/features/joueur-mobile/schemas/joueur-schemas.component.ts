import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MonSchema, SchemaPartageService } from '@core/services/schema-partage.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';

/**
 * PWA joueur — « Mes schémas » : ce que le staff lui a partagé, rejouable.
 *
 * Le lecteur est le MÊME composant que côté staff ({@link SchemaViewerComponent}) : animation,
 * cadrage de projection et étapes-chapitres compris. Un schéma vu par le joueur est donc
 * exactement celui que le coach a montré en salle.
 *
 * Un seul schéma est déplié à la fois : sur un téléphone, deux terrains côte à côte ne se lisent
 * pas, et chaque lecteur monte un Konva complet.
 */
@Component({
  selector: 'app-joueur-schemas',
  standalone: true,
  imports: [DatePipe, SchemaViewerComponent],
  template: `
  <div class="js">
    @if (chargement()) {
      <div class="js__vide">Chargement…</div>
    } @else if (!schemas().length) {
      <div class="js__vide">
        <b>Aucun schéma partagé pour le moment.</b>
        <span>Le staff peut t'envoyer ici des consignes de placement, avec l'animation.</span>
      </div>
    } @else {
      @for (s of schemas(); track s.id) {
        <div class="js__carte" [class.ouvert]="ouvert() === s.id">
          <button class="js__tete" (click)="basculer(s)">
            @if (s.apercu) {
              <img class="js__vignette" [src]="s.apercu" alt="">
            } @else {
              <span class="js__vignette js__vignette--vide">⚽</span>
            }
            <span class="js__infos">
              <b>{{ s.titre }}</b>
              <span class="js__meta">
                {{ s.partageLe | date:'dd/MM' }}
                @if (s.pourMoiSeul) { · <em>pour toi</em> }
              </span>
            </span>
            <span class="js__chev">{{ ouvert() === s.id ? '▾' : '▸' }}</span>
          </button>

          @if (ouvert() === s.id) {
            <div class="js__corps">
              @if (s.message) { <p class="js__message">{{ s.message }}</p> }
              <app-schema-viewer [schemaJson]="s.schemaJson" [largeur]="largeur" [controlesStyle]="true" />
            </div>
          }
        </div>
      }
    }
  </div>
  `,
  styles: [`
    .js { display:flex; flex-direction:column; gap:10px; padding:12px; }
    .js__vide { display:flex; flex-direction:column; gap:6px; padding:28px 16px; text-align:center;
                color:var(--text-3); font-size:.88rem; }
    .js__carte { border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:hidden; }
    .js__carte.ouvert { border-color:var(--green-600); }
    .js__tete { display:flex; align-items:center; gap:10px; width:100%; padding:10px;
                border:0; background:transparent; color:inherit; font-family:inherit; text-align:left; cursor:pointer; }
    .js__vignette { width:56px; height:38px; object-fit:cover; border-radius:7px; background:var(--surface-2); flex:0 0 auto; }
    .js__vignette--vide { display:flex; align-items:center; justify-content:center; font-size:1.1rem; }
    .js__infos { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
    .js__infos b { font-size:.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .js__meta { font-size:.74rem; color:var(--text-3); }
    .js__chev { opacity:.5; }
    .js__corps { padding:0 10px 12px; display:flex; flex-direction:column; gap:8px; align-items:center; }
    .js__message { margin:0; align-self:stretch; font-size:.85rem; padding:8px 10px; border-radius:8px;
                   background:var(--surface-2); }
  `],
})
export class JoueurSchemasComponent implements OnInit {

  private service = inject(SchemaPartageService);

  readonly schemas = signal<MonSchema[]>([]);
  readonly chargement = signal(true);
  /** Id du partage déplié (un seul à la fois). */
  readonly ouvert = signal<string | null>(null);

  /** Largeur du terrain : celle de l'écran, plafonnée — le lecteur dessine à taille fixe. */
  readonly largeur = Math.min(560, Math.max(280, window.innerWidth - 44));

  ngOnInit(): void {
    this.service.mesSchemas().subscribe({
      next: s => {
        this.schemas.set(s);
        this.chargement.set(false);
        if (s.length === 1) this.ouvert.set(s[0].id);   // un seul schéma : autant l'ouvrir
      },
      error: () => this.chargement.set(false),
    });
  }

  basculer(s: MonSchema): void {
    this.ouvert.set(this.ouvert() === s.id ? null : s.id);
  }
}
