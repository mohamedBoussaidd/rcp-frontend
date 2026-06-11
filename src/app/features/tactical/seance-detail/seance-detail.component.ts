import { Component, Inject, QueryList, ViewChildren } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SeanceTechnique } from '@core/services/technique.service';
import { SchemaViewerComponent } from '../schema-viewer/schema-viewer.component';

@Component({
  selector: 'app-seance-detail',
  standalone: true,
  templateUrl: './seance-detail.component.html',
  styleUrl: './seance-detail.component.scss',
  imports: [DatePipe, SchemaViewerComponent],
})
export class SeanceDetailComponent {

  readonly seance: SeanceTechnique;

  @ViewChildren(SchemaViewerComponent) viewers!: QueryList<SchemaViewerComponent>;

  constructor(
    public dialogRef: MatDialogRef<SeanceDetailComponent>,
    @Inject(MAT_DIALOG_DATA) data: { seance: SeanceTechnique },
  ) {
    this.seance = data.seance;
  }

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  fermer(): void { this.dialogRef.close(); }

  /** Imprime la séance et tous ses exercices (schémas inclus) sur une feuille. */
  imprimer(): void {
    const viewers = this.viewers.toArray();
    let vi = 0;
    const s = this.seance;

    const blocs = s.exercices.map(ex => {
      let img = '';
      if (ex.schemaJson) {
        const url = viewers[vi]?.toDataURL();
        vi++;
        if (url) img = `<img class="schema" src="${url}">`;
      }
      const meta = [ex.categorie ? this.joli(ex.categorie) : '', ex.dureeMinutes ? ex.dureeMinutes + ' min' : '', ex.intensite ? 'intensité ' + ex.intensite : '']
        .filter(Boolean).join(' · ');
      return `<div class="exo">
          <div class="exo-titre">${this.esc(ex.nom)}</div>
          <div class="exo-meta">${this.esc(meta)}</div>
          ${ex.objectif ? `<div class="exo-obj">🎯 ${this.esc(ex.objectif)}</div>` : ''}
          ${ex.description ? `<div class="exo-desc">${this.esc(ex.description)}</div>` : ''}
          ${img}
        </div>`;
    }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${this.esc(s.titre || 'Séance technique')}</title>
      <style>
        * { box-sizing: border-box; font-family: Arial, sans-serif; }
        body { margin: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 13px; margin-bottom: 14px; }
        .obj { font-size: 13px; margin-bottom: 16px; }
        .exo { border-top: 2px solid #ddd; padding: 12px 0; page-break-inside: avoid; }
        .exo-titre { font-weight: 700; font-size: 15px; }
        .exo-meta { color: #666; font-size: 12px; margin: 2px 0; }
        .exo-obj { font-size: 12px; }
        .exo-desc { font-size: 12px; color: #444; margin: 2px 0 6px; }
        .schema { display: block; max-width: 100%; width: 540px; margin-top: 6px; border: 1px solid #ccc; border-radius: 6px; }
      </style></head><body>
      <h1>${this.esc(s.titre || 'Séance technique')}</h1>
      <div class="sub">${s.date} · ${s.dureeTotaleMinutes} min · intensité ${s.intensiteMoyenne ?? '—'} · ${s.exercices.length} exercice(s)</div>
      ${s.objectif ? `<div class="obj"><b>Objectif :</b> ${this.esc(s.objectif)}</div>` : ''}
      ${s.description ? `<div class="obj">${this.esc(s.description)}</div>` : ''}
      ${blocs}
      </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  private esc(s?: string): string {
    return (s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  }
}
