import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { MesEntretiensService, MonEntretien } from '@core/services/mes-entretiens.service';
import { AgendaEntretien } from '@core/services/entretien.service';

/**
 * PWA joueur — « Mes entretiens » : les rendez-vous à venir (planifiés par le staff — créneau
 * seulement, jamais les notes) puis les entretiens partagés (comptes-rendus).
 */
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
  readonly rdvs = signal<AgendaEntretien[]>([]);
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
    // RDV à venir : fenêtre aujourd'hui → +90 j (best-effort, section masquée si vide).
    const debut = this.dateStr(new Date());
    const fin = this.dateStr(new Date(Date.now() + 90 * 86_400_000));
    this.service.monAgenda(debut, fin).subscribe({
      next: r => this.rdvs.set(r),
      error: () => this.rdvs.set([]),
    });
  }

  /** Jours restants avant une date ISO ; 0 = aujourd'hui. */
  joursAvant(date: string): number {
    return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000));
  }

  heureCourte(heure?: string | null): string {
    return heure ? heure.slice(0, 5) : '';
  }

  private dateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${j}`;
  }
}
