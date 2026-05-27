import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
    selector: 'app-badge-risque',
    standalone: true,
    templateUrl: './badge-risque.component.html',
    styleUrl: './badge-risque.component.scss',
    imports: [NgClass]
})
export class BadgeRisqueComponent {
  @Input() niveau: 'FAIBLE' | 'MODERE' | 'ELEVE' = 'FAIBLE';
  @Input() score: number = 0;

  get color(): string {
    switch (this.niveau) {
      case 'ELEVE': return 'warn';
      case 'MODERE': return 'accent';
      default: return 'primary';
    }
  }

  get bgClass(): string {
    switch (this.niveau) {
      case 'ELEVE': return 'badge-rouge';
      case 'MODERE': return 'badge-orange';
      default: return 'badge-vert';
    }
  }
}
