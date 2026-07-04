import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MesEntretiensService, MonAxe } from '@core/services/mes-entretiens.service';

/**
 * PWA joueur — « Mes axes de travail ». Chaque axe EN_COURS montre la dernière évaluation du staff
 * (si partagée) et ma dernière auto-évaluation côte à côte. Le joueur peut s'auto-évaluer
 * (note 1–5 + commentaire), au plus une fois par axe et par semaine (contrôle backend).
 */
@Component({
  selector: 'app-joueur-axes',
  standalone: true,
  templateUrl: './joueur-axes.component.html',
  styleUrl: './joueur-axes.component.scss',
  imports: [DatePipe, FormsModule],
})
export class JoueurAxesComponent implements OnInit {

  private service = inject(MesEntretiensService);

  readonly axes = signal<MonAxe[]>([]);
  readonly chargement = signal(true);

  // Auto-évaluation en cours
  readonly axeActif = signal<string | null>(null);
  note = 0;
  commentaire = '';
  readonly envoi = signal(false);
  readonly message = signal<string | null>(null);
  readonly erreur = signal<string | null>(null);

  readonly CAT_LABELS: Record<string, string> = {
    TECHNIQUE: 'Technique', TACTIQUE: 'Tactique', MENTAL: 'Mental', PHYSIQUE: 'Physique',
  };
  readonly TEND_ICONS: Record<string, string> = { EN_PROGRES: '↗', STAGNE: '→', REGRESSE: '↘' };

  ngOnInit(): void { this.charger(); }

  /** true si le joueur s'est déjà auto-évalué sur cet axe pendant la semaine courante (lock hebdo). */
  dejaEvalueeCetteSemaine(a: MonAxe): boolean {
    if (!a.maDerniereAutoEvalNote || !a.maDerniereAutoEvalDate) return false;
    return new Date(a.maDerniereAutoEvalDate).getTime() >= this.debutSemaine();
  }

  /** Timestamp du lundi 00:00 de la semaine courante (heure de l'appareil). */
  private debutSemaine(): number {
    const now = new Date();
    const decalage = (now.getDay() + 6) % 7; // 0 = lundi
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - decalage).getTime();
  }

  private charger(): void {
    this.chargement.set(true);
    this.service.mesAxes().subscribe({
      next: a => { this.axes.set(a); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  ouvrir(axeId: string): void {
    this.message.set(null); this.erreur.set(null);
    this.note = 0; this.commentaire = '';
    this.axeActif.set(this.axeActif() === axeId ? null : axeId);
  }

  envoyer(axe: MonAxe): void {
    if (this.note < 1) { this.erreur.set('Choisis une note.'); return; }
    this.envoi.set(true); this.erreur.set(null);
    this.service.autoEvaluer({ axeTravailId: axe.id, note: this.note, commentaire: this.commentaire.trim() || null }).subscribe({
      next: () => {
        this.envoi.set(false);
        this.axeActif.set(null);
        this.message.set('Auto-évaluation envoyée ✓');
        this.charger();
      },
      error: err => {
        this.envoi.set(false);
        this.erreur.set(err.status === 409
          ? 'Tu t\'es déjà auto-évalué sur cet axe cette semaine.'
          : 'Échec de l\'envoi. Réessaie.');
      },
    });
  }
}
