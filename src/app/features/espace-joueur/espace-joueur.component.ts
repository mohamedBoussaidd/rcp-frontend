import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { EspaceJoueurService, MaPesee } from '../../core/services/espace-joueur.service';
import { Joueur, GpsPoint } from '../../core/services/joueur.service';
import { Blessure } from '../../core/services/blessure.service';

@Component({
  selector: 'app-espace-joueur',
  standalone: true,
  templateUrl: './espace-joueur.component.html',
  styleUrl: './espace-joueur.component.scss',
  imports: [DatePipe, DecimalPipe, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class EspaceJoueurComponent implements OnInit {

  profil = signal<Joueur | null>(null);
  pesees = signal<MaPesee[]>([]);
  blessures = signal<Blessure[]>([]);
  gps = signal<GpsPoint[]>([]);
  loading = signal(true);
  nonLie = signal(false);

  readonly dernierPoids = computed(() => this.pesees()[0]?.poids ?? null);
  readonly ecartCible = computed(() => {
    const p = this.profil();
    const dp = this.dernierPoids();
    if (!p || p.poidsFormeCible == null || dp == null) return null;
    return Math.round((dp - p.poidsFormeCible) * 10) / 10;
  });

  constructor(private service: EspaceJoueurService) {}

  ngOnInit(): void {
    this.service.getProfil().subscribe({
      next: p => { this.profil.set(p); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 409) this.nonLie.set(true);
      },
    });
    this.service.getPesees().subscribe({ next: d => this.pesees.set(d), error: () => {} });
    this.service.getBlessures().subscribe({ next: d => this.blessures.set(d), error: () => {} });
    this.service.getGps().subscribe({ next: d => this.gps.set(d), error: () => {} });
  }

  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }
}
