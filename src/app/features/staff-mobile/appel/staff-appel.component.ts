import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@core/services/auth.service';
import { LignePresence, Seance, SeanceService, StatutPresence } from '@core/services/seance.service';

/**
 * Appel de présence au bord du terrain (mobile) : séances du jour, feuille de
 * présence tactile (Présent / Absent / Excusé / Retard), sauvegarde ligne par
 * ligne via l'API présence existante. Présence par exception : une ligne sans
 * statut compte comme disponible, on ne coche que les écarts.
 */
@Component({
  selector: 'app-staff-appel',
  standalone: true,
  templateUrl: './staff-appel.component.html',
  styleUrl: './staff-appel.component.scss',
  imports: [DatePipe],
})
export class StaffAppelComponent implements OnInit {

  private seanceService = inject(SeanceService);
  private route = inject(ActivatedRoute);
  private snack = inject(MatSnackBar);
  auth = inject(AuthService);

  readonly aujourdHui = new Date().toISOString().slice(0, 10);
  readonly seances = signal<Seance[]>([]);
  readonly seanceActive = signal<Seance | null>(null);
  readonly lignes = signal<LignePresence[]>([]);
  readonly chargement = signal(true);

  readonly STATUTS: { val: StatutPresence; label: string; court: string }[] = [
    { val: 'PRESENT', label: 'Présent', court: 'P' },
    { val: 'ABSENT',  label: 'Absent',  court: 'A' },
    { val: 'EXCUSE',  label: 'Excusé',  court: 'E' },
    { val: 'RETARD',  label: 'Retard',  court: 'R' },
  ];

  readonly nbMarques = computed(() => this.lignes().filter(l => l.statut !== null).length);
  readonly nbAbsents = computed(() => this.lignes().filter(l => l.statut === 'ABSENT' || l.statut === 'EXCUSE').length);
  readonly nbBlesses = computed(() => this.lignes().filter(l => l.blesse).length);

  ngOnInit(): void {
    const cible = this.route.snapshot.queryParamMap.get('seance');
    this.seanceService.getSemaine(this.aujourdHui, this.aujourdHui).subscribe({
      next: s => {
        const jour = s.filter(x => x.statut !== 'ANNULEE');
        this.seances.set(jour);
        this.chargement.set(false);
        const choisie = jour.find(x => x.id === cible) ?? (jour.length === 1 ? jour[0] : null);
        if (choisie) this.choisirSeance(choisie);
      },
      error: () => this.chargement.set(false),
    });
  }

  choisirSeance(s: Seance): void {
    this.seanceActive.set(s);
    this.lignes.set([]);
    this.seanceService.getFeuille(s.id).subscribe({
      next: f => this.lignes.set(f.lignes),
      error: () => this.snack.open('Feuille de présence indisponible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Pose (ou retire, si déjà posé) un statut sur la ligne — sauvegarde immédiate. */
  marquer(l: LignePresence, statut: StatutPresence): void {
    const s = this.seanceActive();
    if (!s) return;
    const nouveau: StatutPresence = l.statut === statut ? 'PRESENT' : statut;
    this.seanceService.savePresenceJoueur(s.id, l.joueurId, nouveau).subscribe({
      next: maj => this.lignes.update(list => list.map(x => x.joueurId === l.joueurId ? maj : x)),
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  initiales(l: LignePresence): string {
    return ((l.prenom?.[0] ?? '') + (l.nom?.[0] ?? '')).toUpperCase() || '?';
  }

  estMatch(s: Seance): boolean {
    return !!s.adversaire || s.typeSeance?.code?.toLowerCase() === 'match';
  }
}
