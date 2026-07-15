import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { Seance, SeanceService } from '@core/services/seance.service';

interface JourAgenda {
  date: string;
  seances: Seance[];
}

/**
 * Agenda hebdomadaire du staff (mobile) : séances & matchs de la semaine du
 * périmètre/équipe active, navigation semaine par semaine. Lecture seule ;
 * les séances du jour offrent un raccourci vers l'appel.
 */
@Component({
  selector: 'app-staff-agenda',
  standalone: true,
  templateUrl: './staff-agenda.component.html',
  styleUrl: './staff-agenda.component.scss',
  imports: [DatePipe, RouterLink],
})
export class StaffAgendaComponent implements OnInit {

  private seanceService = inject(SeanceService);
  auth = inject(AuthService);

  /** Lundi de la semaine affichée (ISO yyyy-MM-dd). */
  readonly lundi = signal(StaffAgendaComponent.lundiDe(new Date()));
  readonly seances = signal<Seance[]>([]);
  readonly chargement = signal(true);
  readonly aujourdHui = new Date().toISOString().slice(0, 10);

  readonly dimanche = computed(() => StaffAgendaComponent.plusJours(this.lundi(), 6));
  readonly estSemaineCourante = computed(() => this.lundi() === StaffAgendaComponent.lundiDe(new Date()));

  /** Séances regroupées par jour (jours vides omis). */
  readonly jours = computed<JourAgenda[]>(() => {
    const parJour = new Map<string, Seance[]>();
    for (const s of this.seances()) {
      if (!parJour.has(s.date)) parJour.set(s.date, []);
      parJour.get(s.date)!.push(s);
    }
    return [...parJour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, seances]) => ({
        date,
        seances: seances.sort((a, b) => (a.heureDebut ?? '').localeCompare(b.heureDebut ?? '')),
      }));
  });

  ngOnInit(): void { this.charger(); }

  semaine(sens: -1 | 1): void {
    this.lundi.set(StaffAgendaComponent.plusJours(this.lundi(), sens * 7));
    this.charger();
  }
  semaineCourante(): void {
    this.lundi.set(StaffAgendaComponent.lundiDe(new Date()));
    this.charger();
  }

  estMatch(s: Seance): boolean {
    return !!s.adversaire || s.typeSeance?.code?.toLowerCase() === 'match';
  }

  private charger(): void {
    this.chargement.set(true);
    this.seanceService.getSemaine(this.lundi(), this.dimanche()).subscribe({
      next: s => { this.seances.set(s); this.chargement.set(false); },
      error: () => { this.seances.set([]); this.chargement.set(false); },
    });
  }

  private static lundiDe(d: Date): string {
    const copie = new Date(d);
    copie.setHours(0, 0, 0, 0);
    const decalage = (copie.getDay() + 6) % 7; // lundi = 0
    copie.setDate(copie.getDate() - decalage);
    return copie.toISOString().slice(0, 10);
  }
  private static plusJours(iso: string, n: number): string {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
}
