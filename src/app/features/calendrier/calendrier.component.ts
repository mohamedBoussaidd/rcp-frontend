import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeanceService, Seance, TypeSeance } from '@core/services/seance.service';
import { EspaceJoueurService } from '@core/services/espace-joueur.service';
import { SeanceFormDialogComponent, SeanceFormResult } from './seance-form-dialog/seance-form-dialog.component';
import { SeanceContenuDialogComponent } from './seance-contenu-dialog/seance-contenu-dialog.component';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { AuthService } from '@core/services/auth.service';

export const COULEURS_TYPE: Record<string, string> = {
  MATCH:        '#ef4444',
  MATCH_AMICAL: '#f97316',
  INTENSIF:     '#6366f1',
  TECHNIQUE:    '#0ea5a0',
  REPRISE:      '#22c55e',
  PRE_MATCH:    '#eab308',
  FORCE:        '#8b5cf6',
};

export const INFOS_TYPE: Record<string, { intensite: number; duree: string; description: string; objectifs: string[] }> = {
  REPRISE:      { intensite: 70, duree: '40–50 min', description: 'Réactivation neuromusculaire légère après repos.',       objectifs: ['< 3 500 m total', 'Aucun sprint', 'Pas de HI'] },
  INTENSIF:     { intensite: 95, duree: '70–80 min', description: 'Haute intensité — puissance et endurance.',               objectifs: ['> 7 000 m total', '> 1 000 m à +19 km/h', 'ACWR 1.0–1.3'] },
  TECHNIQUE:    { intensite: 80, duree: '55–65 min', description: 'Travail technico-tactique à intensité modérée.',          objectifs: ['5 000–6 500 m total', 'Accélérations prioritaires', 'Peu de sprints'] },
  PRE_MATCH:    { intensite: 55, duree: '25–35 min', description: 'Activation pré-match — conserver la fraîcheur.',          objectifs: ['< 2 500 m total', 'Quelques accélérations', 'Zéro fatigue'] },
  MATCH:        { intensite: 100, duree: '90 min',   description: 'Match officiel — référence d\'intensité maximale.',       objectifs: ['8 000–12 000 m total', '> 1 500 m à +19 km/h', '10–20 sprints'] },
  MATCH_AMICAL: { intensite: 85, duree: '90 min',    description: 'Match amical — intensité proche match sans enjeu.',       objectifs: ['7 000–10 000 m total', 'Rotation effectif', 'Test tactique'] },
  FORCE:        { intensite: 60, duree: '50–60 min', description: 'Renforcement musculaire — faible distance parcourue.',    objectifs: ['< 3 000 m total', 'Charge musculaire élevée', 'Faible volume GPS'] },
};

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

@Component({
  selector: 'app-calendrier',
  standalone: true,
  templateUrl: './calendrier.component.html',
  styleUrl: './calendrier.component.scss',
  imports: [MatTooltip, DatePipe, LowerCasePipe]
})
export class CalendrierComponent implements OnInit {

  typeSeances: TypeSeance[] = [];
  seancesSemaine: Seance[] = [];
  joursGrid: { label: string; date: Date; dateStr: string }[] = [];
  lundiSemaine: Date = this.getLundiCourant();
  readonly today = this.toDateStr(new Date());
  readonly jours = JOURS;
  readonly couleursType = COULEURS_TYPE;
  readonly infosType = INFOS_TYPE;

  get estSemainePassee(): boolean {
    const lundiAuj = this.getLundiCourant();
    return this.lundiSemaine < lundiAuj;
  }

  get titreSemaine(): string {
    const fin = new Date(this.lundiSemaine);
    fin.setDate(fin.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `Semaine du ${this.lundiSemaine.toLocaleDateString('fr-FR', opts)} au ${fin.toLocaleDateString('fr-FR', opts)} ${fin.getFullYear()}`;
  }

  constructor(
    private seanceService: SeanceService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router,
    public auth: AuthService,
    private espaceJoueur: EspaceJoueurService
  ) {}

  /** Joueur : calendrier en lecture seule, données scopées via /api/moi (endpoints staff bloqués). */
  get lectureSeule(): boolean { return this.auth.hasRole('JOUEUR'); }

  ngOnInit(): void {
    // Le catalogue des types n'est utile qu'à la palette d'édition (staff) et est bloqué au joueur.
    if (!this.lectureSeule) this.seanceService.getTypeSeances().subscribe(t => this.typeSeances = t);
    this.chargerSemaine();
  }

  chargerSemaine(): void {
    this.buildGrid();
    const debut = this.toDateStr(this.lundiSemaine);
    const fin = this.toDateStr(this.getFinSemaine());
    const seances$ = this.lectureSeule
      ? this.espaceJoueur.getSeances(debut, fin)   // joueur : ses séances d'équipe (scopé)
      : this.seanceService.getSemaine(debut, fin);
    seances$.subscribe(s => this.seancesSemaine = s);
  }

  buildGrid(): void {
    this.joursGrid = JOURS.map((label, i) => {
      const d = new Date(this.lundiSemaine);
      d.setDate(d.getDate() + i);
      return { label, date: d, dateStr: this.toDateStr(d) };
    });
  }

  semainePrecedente(): void {
    this.lundiSemaine = new Date(this.lundiSemaine);
    this.lundiSemaine.setDate(this.lundiSemaine.getDate() - 7);
    this.chargerSemaine();
  }

  semaineSuivante(): void {
    this.lundiSemaine = new Date(this.lundiSemaine);
    this.lundiSemaine.setDate(this.lundiSemaine.getDate() + 7);
    this.chargerSemaine();
  }

  seancesDuJour(dateStr: string): Seance[] {
    return this.seancesSemaine.filter(s => s.date === dateStr);
  }

  /** Ouvre le formulaire de création (type choisi dans le formulaire). */
  ouvrirCreation(dateStr?: string): void {
    if (!this.typeSeances.length) return;
    const ref = this.dialog.open(SeanceFormDialogComponent, {
      width: '760px',
      maxWidth: '96vw',
      panelClass: 'dark-dialog',
      data: { typeSeances: this.typeSeances, date: dateStr ?? this.today }
    });
    ref.afterClosed().subscribe((result: SeanceFormResult | null) => {
      if (result) {
        const { exercices, ...seance } = result;
        this.seanceService.create(seance).subscribe(creee => {
          if (exercices.length) {
            this.seanceService.remplacerExercices(creee.id, exercices).subscribe({
              next: () => this.chargerSemaine(), error: () => this.chargerSemaine(),
            });
          } else {
            this.chargerSemaine();
          }
        });
      }
    });
  }

  editerSeance(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    const ref = this.dialog.open(SeanceFormDialogComponent, {
      width: '760px',
      maxWidth: '96vw',
      panelClass: 'dark-dialog',
      data: { typeSeances: this.typeSeances, date: seance.date, seance }
    });
    ref.afterClosed().subscribe((result: SeanceFormResult | null) => {
      if (result) {
        const { exercices, ...payload } = result;
        this.seanceService.update(seance.id, payload as Partial<Seance>).subscribe({
          next: () => {
            this.seanceService.remplacerExercices(seance.id, exercices).subscribe({
              next: () => { this.chargerSemaine(); this.snackBar.open('Séance modifiée', 'OK', { duration: 2500 }); },
              error: () => { this.chargerSemaine(); this.snackBar.open('Séance modifiée', 'OK', { duration: 2500 }); },
            });
          },
          error: () => this.snackBar.open('Modification impossible', 'OK', { duration: 3000 }),
        });
      }
    });
  }

  /** Détail séance : staff → page complète (contenu + GPS) ; joueur → dialog contenu seul. */
  ouvrirDetail(seance: Seance): void {
    if (!this.lectureSeule) {
      this.router.navigate(['/seances', seance.id]);
      return;
    }
    const titre = seance.titre || seance.typeSeance?.libelle || 'Séance';
    this.espaceJoueur.getContenuSeance(seance.id).subscribe({
      next: contenu => this.ouvrirContenuDialog(titre, seance.date, contenu),
      error: () => this.ouvrirContenuDialog(titre, seance.date, null),
    });
  }

  private ouvrirContenuDialog(titre: string, date: string, contenu: any): void {
    this.dialog.open(SeanceContenuDialogComponent, {
      width: '900px', maxWidth: '96vw', panelClass: 'dark-dialog',
      data: { titre, date, contenu },
    });
  }

  marquerRealisee(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    this.seanceService.marquerRealisee(seance.id).subscribe(() => {
      this.chargerSemaine();
      this.snackBar.open('Séance marquée comme réalisée', 'OK', { duration: 3000 });
    });
  }

  supprimerSeance(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    const nom = seance.titre || seance.typeSeance.libelle;
    const message = seance.statut === 'REALISEE'
      ? `⚠️ ATTENTION — Supprimer "${nom}" ?\n\nCette séance est réalisée. Sa suppression entraîne la perte DÉFINITIVE et IRRÉVERSIBLE de toutes les données GPS associées.\n\nConfirmer ?`
      : `Supprimer "${nom}" ?`;
    if (!confirm(message)) return;
    this.seanceService.delete(seance.id).subscribe(() => this.chargerSemaine());
  }

  couleur(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  private getLundiCourant(): Date {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const lundi = new Date(today);
    lundi.setDate(today.getDate() + diff);
    lundi.setHours(0, 0, 0, 0);
    return lundi;
  }

  private getFinSemaine(): Date {
    const fin = new Date(this.lundiSemaine);
    fin.setDate(fin.getDate() + 6);
    return fin;
  }

  private toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${j}`;
  }
}
