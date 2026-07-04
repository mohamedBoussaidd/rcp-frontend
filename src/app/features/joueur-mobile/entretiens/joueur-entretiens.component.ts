import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { MesEntretiensService, MonEntretien } from '@core/services/mes-entretiens.service';

/** PWA joueur — « Mes entretiens » : uniquement les entretiens partagés par le staff. */
@Component({
  selector: 'app-joueur-entretiens',
  standalone: true,
  templateUrl: './joueur-entretiens.component.html',
  styleUrl: './joueur-entretiens.component.scss',
  imports: [DatePipe, LowerCasePipe],
})
export class JoueurEntretiensComponent implements OnInit {

  private service = inject(MesEntretiensService);

  readonly entretiens = signal<MonEntretien[]>([]);
  readonly chargement = signal(true);

  readonly TYPE_ICONS: Record<string, string> = { VIDEO: '🎬', TERRAIN: '🥅', DISCUSSION: '💬' };
  readonly TYPE_LABELS: Record<string, string> = { VIDEO: 'Séance vidéo', TERRAIN: 'Séance terrain', DISCUSSION: 'Discussion' };
  readonly TEND_ICONS: Record<string, string> = { EN_PROGRES: '↗', STAGNE: '→', REGRESSE: '↘' };
  readonly TEND_TONE: Record<string, string> = { EN_PROGRES: 'up', STAGNE: 'flat', REGRESSE: 'down' };
  readonly CAT_LABELS: Record<string, string> = { TECHNIQUE: 'Technique', TACTIQUE: 'Tactique', MENTAL: 'Mental', PHYSIQUE: 'Physique' };

  ngOnInit(): void {
    this.service.mesEntretiens().subscribe({
      next: e => { this.entretiens.set(e); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }
}
