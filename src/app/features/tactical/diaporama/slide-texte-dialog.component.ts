import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  AlignH, BlocTexte, BlocType, StyleTexte, blocsVersTexte, normaliserBlocs, styleBloc,
} from './diaporama.service';

export interface SlideTexteData { texte: string; style: StyleTexte; }
export interface SlideTexteResultat { texte: string; style: StyleTexte; }

const STYLE_DEFAUT: StyleTexte = {
  couleurTexte: '#FFFFFF', couleurFond: '#0B0E16', taille: 52,
  alignH: 'center', alignV: 'center', gras: true,
};

/** Édition d'un slide TEXTE : pile de blocs typés (Titre / Paragraphe / Liste), réglages
 *  globaux hérités par chaque bloc avec overrides optionnels, aperçu plein écran en direct. */
@Component({
  selector: 'app-slide-texte-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="st">
      <div class="st__form">
        <h3 class="st__h">Slide texte</h3>

        <!-- Réglages globaux (défauts hérités par les blocs) -->
        <div class="st__global">
          <div class="st__row">
            <div>
              <label class="st__lbl">Fond</label>
              <div class="st__swatches">
                @for (c of couleursFond; track c) {
                  <button class="st__sw" [class.st__sw--on]="style.couleurFond === c" [style.background]="c" (click)="style.couleurFond = c"></button>
                }
                <input type="color" class="st__pick" [(ngModel)]="style.couleurFond">
              </div>
            </div>
            <div>
              <label class="st__lbl">Position verticale</label>
              <div class="st__seg">
                <button [class.on]="style.alignV==='flex-start'" (click)="style.alignV='flex-start'">↑</button>
                <button [class.on]="style.alignV==='center'" (click)="style.alignV='center'">↕</button>
                <button [class.on]="style.alignV==='flex-end'" (click)="style.alignV='flex-end'">↓</button>
              </div>
            </div>
          </div>

          <label class="st__lbl">Taille par défaut — {{ style.taille }} px</label>
          <input type="range" min="20" max="110" step="2" [(ngModel)]="style.taille">

          <div class="st__row">
            <div>
              <label class="st__lbl">Couleur par défaut</label>
              <div class="st__swatches">
                @for (c of couleursTexte; track c) {
                  <button class="st__sw" [class.st__sw--on]="style.couleurTexte === c" [style.background]="c" (click)="style.couleurTexte = c"></button>
                }
                <input type="color" class="st__pick" [(ngModel)]="style.couleurTexte">
              </div>
            </div>
            <div>
              <label class="st__lbl">Alignement par défaut</label>
              <div class="st__seg">
                <button [class.on]="style.alignH==='left'" (click)="style.alignH='left'">⟸</button>
                <button [class.on]="style.alignH==='center'" (click)="style.alignH='center'">≡</button>
                <button [class.on]="style.alignH==='right'" (click)="style.alignH='right'">⟹</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Pile de blocs -->
        <label class="st__lbl st__lbl--section">Contenu</label>
        @for (b of blocs; track b; let i = $index) {
          <div class="st__bloc">
            <div class="st__bloc-head">
              <div class="st__seg st__seg--type">
                <button [class.on]="b.type==='TITRE'" (click)="changerType(b, 'TITRE')">Titre</button>
                <button [class.on]="b.type==='PARAGRAPHE'" (click)="changerType(b, 'PARAGRAPHE')">Paragraphe</button>
                <button [class.on]="b.type==='LISTE'" (click)="changerType(b, 'LISTE')">Liste</button>
              </div>
              <div class="st__bloc-actions">
                <button class="st__ic" (click)="monter(i)" [disabled]="i===0" title="Monter">↑</button>
                <button class="st__ic" (click)="descendre(i)" [disabled]="i===blocs.length-1" title="Descendre">↓</button>
                <button class="st__ic" [class.on]="ouvert(b)" (click)="basculer(b)" title="Mise en forme">⚙</button>
                <button class="st__ic st__ic--danger" (click)="supprimerBloc(i)" [disabled]="blocs.length===1" title="Supprimer">✕</button>
              </div>
            </div>

            @if (b.type === 'LISTE') {
              <div class="st__seg st__seg--puces">
                <button [class.on]="!b.ordonnee" (click)="b.ordonnee=false">• Puces</button>
                <button [class.on]="b.ordonnee" (click)="b.ordonnee=true">1. Numéros</button>
              </div>
              <textarea class="st__area" rows="3" placeholder="Un élément par ligne"
                        [ngModel]="itemsTexte(b)" (ngModelChange)="setItems(b, $event)"></textarea>
            } @else {
              <textarea class="st__area" [rows]="b.type==='TITRE' ? 2 : 3" [(ngModel)]="b.texte"
                        [placeholder]="b.type==='TITRE' ? 'Titre de la diapo…' : 'Votre texte…'"></textarea>
            }

            @if (ouvert(b)) {
              <div class="st__over">
                <div>
                  <label class="st__lbl">Taille</label>
                  <input type="number" class="st__num" min="14" max="140" placeholder="auto"
                         [ngModel]="b.taille ?? null" (ngModelChange)="b.taille = ($event === null || $event === '') ? undefined : +$event">
                </div>
                <div>
                  <label class="st__lbl">Couleur</label>
                  <div class="st__swatches">
                    <button class="st__sw st__sw--herite" [class.st__sw--on]="b.couleurTexte === undefined" (click)="b.couleurTexte = undefined" title="Hériter">A</button>
                    @for (c of couleursTexte; track c) {
                      <button class="st__sw" [class.st__sw--on]="b.couleurTexte === c" [style.background]="c" (click)="b.couleurTexte = c"></button>
                    }
                  </div>
                </div>
                <div>
                  <label class="st__lbl">Gras</label>
                  <div class="st__seg">
                    <button [class.on]="b.gras===undefined" (click)="b.gras=undefined">Auto</button>
                    <button [class.on]="b.gras===true" (click)="b.gras=true">B</button>
                    <button [class.on]="b.gras===false" (click)="b.gras=false">N</button>
                  </div>
                </div>
                <div>
                  <label class="st__lbl">Alignement</label>
                  <div class="st__seg">
                    <button [class.on]="b.alignH===undefined" (click)="b.alignH=undefined">Auto</button>
                    <button [class.on]="b.alignH==='left'" (click)="b.alignH='left'">⟸</button>
                    <button [class.on]="b.alignH==='center'" (click)="b.alignH='center'">≡</button>
                    <button [class.on]="b.alignH==='right'" (click)="b.alignH='right'">⟹</button>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <div class="st__add">
          <span class="st__add-lbl">Ajouter :</span>
          <button class="btn btn--secondary btn--sm" (click)="ajouterBloc('TITRE')">＋ Titre</button>
          <button class="btn btn--secondary btn--sm" (click)="ajouterBloc('PARAGRAPHE')">＋ Paragraphe</button>
          <button class="btn btn--secondary btn--sm" (click)="ajouterBloc('LISTE')">＋ Liste</button>
        </div>

        <div class="st__actions">
          <button class="btn btn--secondary btn--sm" (click)="annuler()">Annuler</button>
          <button class="btn btn--primary btn--sm" (click)="valider()" [disabled]="!aDuContenu()">Valider</button>
        </div>
      </div>

      <!-- Aperçu plein écran -->
      <div class="st__preview" [style.background]="style.couleurFond" [style.justifyContent]="style.alignV">
        @for (b of blocs; track b) {
          @if (estVide(b)) {} @else {
            @if (b.type === 'LISTE') {
              @if (b.ordonnee) {
                <ol [style.color]="sb(b).couleur" [style.fontSize.px]="apercuTaille(b)" [style.fontWeight]="sb(b).gras ? 800 : 500" [style.textAlign]="sb(b).alignH" class="st__pl">
                  @for (it of itemsNonVides(b); track $index) { <li>{{ it }}</li> }
                </ol>
              } @else {
                <ul [style.color]="sb(b).couleur" [style.fontSize.px]="apercuTaille(b)" [style.fontWeight]="sb(b).gras ? 800 : 500" [style.textAlign]="sb(b).alignH" class="st__pl">
                  @for (it of itemsNonVides(b); track $index) { <li>{{ it }}</li> }
                </ul>
              }
            } @else {
              <div [style.color]="sb(b).couleur" [style.fontSize.px]="apercuTaille(b)" [style.fontWeight]="sb(b).gras ? 800 : 500" [style.textAlign]="sb(b).alignH" class="st__pp">{{ b.texte }}</div>
            }
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display:block; }
    .st, .st * { box-sizing:border-box; }
    .st { display:grid; grid-template-columns: 360px 1fr; gap:0; width:100%; max-width:100%; overflow:hidden; background:var(--surface); color:var(--text); }
    .st__form { padding:18px 20px; min-width:0; max-height:78vh; overflow:auto; }
    .st__preview { display:flex; flex-direction:column; gap:.5em; padding:26px; min-height:300px; min-width:0; }
    .st__h { font-weight:700; margin:0 0 14px; }
    .st__global { border:1px solid var(--border); border-radius:10px; padding:12px 14px; background:var(--surface-2); }
    .st__lbl { display:block; font-size:.78rem; color:var(--text-3); margin:12px 0 6px; font-weight:600; }
    .st__lbl:first-child { margin-top:0; }
    .st__lbl--section { font-size:.84rem; color:var(--text-2); margin:18px 0 8px; }
    .st__area { width:100%; border:1px solid var(--border-strong); border-radius:8px; padding:9px 11px; font:inherit; resize:vertical; }
    input[type=range] { width:100%; }
    .st__num { width:78px; border:1px solid var(--border-strong); border-radius:8px; padding:6px 9px; font:inherit; }
    .st__row { display:flex; gap:18px; flex-wrap:wrap; }
    .st__swatches { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .st__sw { width:24px; height:24px; border-radius:50%; border:2px solid var(--border-strong); cursor:pointer; padding:0; }
    .st__sw--on { border-color:var(--text); box-shadow:0 0 0 2px var(--border-strong); }
    .st__sw--herite { background:var(--surface-3); color:var(--text-2); font-size:.7rem; font-weight:700; line-height:1; display:inline-flex; align-items:center; justify-content:center; }
    .st__pick { width:28px; height:28px; border:none; background:none; padding:0; cursor:pointer; }
    .st__seg { display:inline-flex; background:var(--surface-3); border-radius:8px; padding:3px; gap:2px; flex-wrap:wrap; }
    .st__seg button { border:none; background:transparent; cursor:pointer; padding:5px 11px; border-radius:6px; font-size:.85rem; color:var(--text-2); }
    .st__seg button.on { background:var(--surface); color:var(--text); font-weight:700; box-shadow:0 1px 2px rgba(0,0,0,.12); }
    .st__seg--type button { padding:5px 9px; }
    .st__seg--puces { margin-bottom:8px; }
    .st__bloc { border:1px solid var(--border); border-radius:10px; padding:11px 12px; margin-bottom:10px; }
    .st__bloc-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
    .st__bloc-actions { display:flex; gap:3px; }
    .st__ic { width:28px; height:28px; border:1px solid var(--border); background:var(--surface); border-radius:7px; cursor:pointer; color:var(--text-2); font-size:.85rem; }
    .st__ic:hover:not(:disabled) { background:var(--surface-3); }
    .st__ic.on { background:var(--surface-3); color:var(--text); border-color:var(--border-strong); }
    .st__ic:disabled { opacity:.3; cursor:default; }
    .st__ic--danger:hover:not(:disabled) { color:#ef4444; border-color:#ef4444; }
    .st__over { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px 14px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--border); }
    .st__over .st__lbl { margin-top:0; }
    .st__add { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:4px; }
    .st__add-lbl { font-size:.8rem; color:var(--text-3); font-weight:600; }
    .st__actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
    .st__pp { white-space:pre-wrap; line-height:1.15; width:100%; }
    .st__pl { width:100%; margin:0; padding-left:1.4em; line-height:1.2; }
    .st__pl li { margin:.1em 0; }
    @media (max-width:760px){ .st{ grid-template-columns:1fr; } .st__preview{ border-radius:0 0 8px 8px; min-height:200px; } }
  `],
})
export class SlideTexteDialogComponent {

  readonly couleursTexte = ['#FFFFFF', '#0B1220', '#15803D', '#eab308', '#ef4444', '#3b82f6'];
  readonly couleursFond = ['#0B0E16', '#FFFFFF', '#15803D', '#1D4ED8', '#0F172A', '#F4F6FA'];

  style: StyleTexte;
  blocs: BlocTexte[];
  private ouverts = new WeakSet<BlocTexte>();

  constructor(
    private ref: MatDialogRef<SlideTexteDialogComponent, SlideTexteResultat>,
    @Inject(MAT_DIALOG_DATA) data: SlideTexteData | null,
  ) {
    this.style = { ...STYLE_DEFAUT, ...(data?.style ?? {}) };
    // Clone profond des blocs (ne pas muter l'entrée), avec reconstitution monobloc si besoin.
    this.blocs = normaliserBlocs(data?.style, data?.texte).map(b => ({ ...b, items: b.items ? [...b.items] : undefined }));
    delete (this.style as { blocs?: unknown }).blocs; // les blocs vivent dans this.blocs, pas dans style
  }

  // ── Blocs ──
  ajouterBloc(type: BlocType): void {
    const b: BlocTexte = type === 'LISTE' ? { type, items: [''], ordonnee: false } : { type, texte: '' };
    this.blocs.push(b);
    this.ouverts.add(b);   // ouvre les réglages des listes ? non : on ouvre rien, reste compact
    this.ouverts.delete(b);
  }
  changerType(b: BlocTexte, type: BlocType): void {
    if (b.type === type) return;
    if (type === 'LISTE') { b.items = b.texte ? b.texte.split('\n') : ['']; b.texte = undefined; if (b.ordonnee === undefined) b.ordonnee = false; }
    else { if (b.items) b.texte = b.items.join('\n'); b.items = undefined; }
    b.type = type;
  }
  supprimerBloc(i: number): void { if (this.blocs.length > 1) this.blocs.splice(i, 1); }
  monter(i: number): void { if (i > 0) this.blocs.splice(i - 1, 0, this.blocs.splice(i, 1)[0]); }
  descendre(i: number): void { if (i < this.blocs.length - 1) this.blocs.splice(i + 1, 0, this.blocs.splice(i, 1)[0]); }

  ouvert(b: BlocTexte): boolean { return this.ouverts.has(b); }
  basculer(b: BlocTexte): void { this.ouverts.has(b) ? this.ouverts.delete(b) : this.ouverts.add(b); }

  // ── Items de liste (1 ligne = 1 item) ──
  itemsTexte(b: BlocTexte): string { return (b.items ?? []).join('\n'); }
  setItems(b: BlocTexte, v: string): void { b.items = v.split('\n'); }
  itemsNonVides(b: BlocTexte): string[] { return (b.items ?? []).filter(i => i.trim().length); }

  // ── Aperçu ──
  sb(b: BlocTexte) { return styleBloc(b, this.style); }
  /** Taille réduite pour l'aperçu (zone plus petite que le plein écran). */
  apercuTaille(b: BlocTexte): number { return Math.round(this.sb(b).taille * 0.55); }
  estVide(b: BlocTexte): boolean {
    return b.type === 'LISTE' ? this.itemsNonVides(b).length === 0 : !(b.texte ?? '').trim();
  }

  aDuContenu(): boolean { return this.blocs.some(b => !this.estVide(b)); }

  annuler(): void { this.ref.close(); }
  valider(): void {
    // Nettoyage : retire items vides, supprime les blocs vides.
    const blocs = this.blocs
      .map(b => b.type === 'LISTE' ? { ...b, items: this.itemsNonVides(b) } : { ...b })
      .filter(b => !this.estVide(b));
    if (!blocs.length) return;
    const style: StyleTexte = { ...this.style, blocs };
    this.ref.close({ texte: blocsVersTexte(blocs), style });
  }
}
