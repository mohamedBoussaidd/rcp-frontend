import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { SeanceService, Seance, TypeSeance } from '@core/services/seance.service';
import { EspaceJoueurService } from '@core/services/espace-joueur.service';
import { ContexteService } from '@core/services/contexte.service';
import { SeanceFormDialogComponent, SeanceFormResult } from './seance-form-dialog/seance-form-dialog.component';
import { SeanceContenuDialogComponent } from './seance-contenu-dialog/seance-contenu-dialog.component';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe, LowerCasePipe, SlicePipe, NgTemplateOutlet } from '@angular/common';
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
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Une cellule de jour (grille semaine ou mois). */
interface JourCell {
  label: string;        // 'Lundi'
  labelCourt: string;   // 'Lun'
  date: Date;
  dateStr: string;      // 'yyyy-MM-dd'
  numero: number;       // quantième du mois
  inMonth: boolean;     // dans le mois affiché (grille mensuelle)
}

type Vue = 'liste' | 'calendrier';
type SousVue = 'jour' | 'semaine' | 'mois';

@Component({
  selector: 'app-calendrier',
  standalone: true,
  templateUrl: './calendrier.component.html',
  styleUrl: './calendrier.component.scss',
  imports: [MatTooltip, DatePipe, LowerCasePipe, SlicePipe, NgTemplateOutlet, FormsModule]
})
export class CalendrierComponent implements OnInit {

  typeSeances: TypeSeance[] = [];
  seances: Seance[] = [];

  // Mode d'affichage : Liste (défaut) ou Calendrier (Jour / Semaine / Mois).
  vue: Vue = 'liste';
  sousVue: SousVue = 'semaine';
  /** Filtre par type (code) ; null = Tous. */
  typeFiltre: string | null = null;
  /** Date de référence de la période affichée. */
  ancre: Date = new Date();

  joursGrid: JourCell[] = [];   // semaine de l'ancre (Liste + Calendrier/Semaine)
  moisGrid: JourCell[] = [];    // grille mensuelle complète (Calendrier/Mois)

  readonly today = this.toDateStr(new Date());
  readonly jours = JOURS;
  readonly joursCourts = JOURS_COURTS;
  readonly couleursType = COULEURS_TYPE;
  readonly infosType = INFOS_TYPE;

  constructor(
    private seanceService: SeanceService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router,
    public auth: AuthService,
    public contexte: ContexteService,
    private espaceJoueur: EspaceJoueurService
  ) {}

  /** Joueur : calendrier en lecture seule, données scopées via /api/moi (endpoints staff bloqués). */
  get lectureSeule(): boolean { return this.auth.hasRole('JOUEUR'); }

  ngOnInit(): void {
    if (!this.lectureSeule) this.seanceService.getTypeSeances().subscribe(t => this.typeSeances = t);
    this.charger();
  }

  // ══════════ Chargement / période ══════════

  charger(): void {
    this.buildGrids();
    const [debut, fin] = this.periode();
    const seances$ = this.lectureSeule
      ? this.espaceJoueur.getSeances(this.toDateStr(debut), this.toDateStr(fin))
      : this.seanceService.getSemaine(this.toDateStr(debut), this.toDateStr(fin));
    seances$.subscribe(s => this.seances = s);
  }

  /** Plage [début, fin] à charger selon la vue active. */
  private periode(): [Date, Date] {
    if (this.vue === 'calendrier' && this.sousVue === 'jour') {
      const d = this.startOfDay(this.ancre);
      return [d, d];
    }
    if (this.vue === 'calendrier' && this.sousVue === 'mois') {
      return [this.debutGrilleMois(), this.finGrilleMois()];
    }
    // Liste + Calendrier/Semaine : semaine de l'ancre (lundi → dimanche).
    const lundi = this.lundiDe(this.ancre);
    return [lundi, this.addDays(lundi, 6)];
  }

  private buildGrids(): void {
    const lundi = this.lundiDe(this.ancre);
    this.joursGrid = JOURS.map((label, i) => this.cell(this.addDays(lundi, i), label, JOURS_COURTS[i], this.ancre.getMonth()));

    if (this.vue === 'calendrier' && this.sousVue === 'mois') {
      const debut = this.debutGrilleMois();
      const mois = this.ancre.getMonth();
      this.moisGrid = Array.from({ length: 42 }, (_, i) => {
        const d = this.addDays(debut, i);
        const idx = (d.getDay() + 6) % 7;
        return this.cell(d, JOURS[idx], JOURS_COURTS[idx], mois);
      });
    }
  }

  private cell(d: Date, label: string, labelCourt: string, moisRef: number): JourCell {
    return {
      label, labelCourt, date: d, dateStr: this.toDateStr(d),
      numero: d.getDate(), inMonth: d.getMonth() === moisRef,
    };
  }

  // ══════════ Navigation ══════════

  precedent(): void { this.decaler(-1); }
  suivant(): void { this.decaler(1); }
  aujourdhui(): void { this.ancre = new Date(); this.charger(); }

  private decaler(sens: number): void {
    const d = new Date(this.ancre);
    if (this.vue === 'calendrier' && this.sousVue === 'mois')      d.setMonth(d.getMonth() + sens);
    else if (this.vue === 'calendrier' && this.sousVue === 'jour') d.setDate(d.getDate() + sens);
    else                                                          d.setDate(d.getDate() + 7 * sens);
    this.ancre = d;
    this.charger();
  }

  choisirVue(v: Vue): void {
    if (this.vue === v) return;
    this.vue = v;
    this.charger();
  }

  choisirSousVue(sv: SousVue): void {
    if (this.sousVue === sv) return;
    this.sousVue = sv;
    this.charger();
  }

  // ══════════ Filtres ══════════

  toggleTypeFiltre(code: string | null): void {
    this.typeFiltre = code;
  }

  /** Séances de la période filtrées par type. */
  get seancesVisibles(): Seance[] {
    return this.typeFiltre
      ? this.seances.filter(s => s.typeSeance?.code === this.typeFiltre)
      : this.seances;
  }

  seancesDuJour(dateStr: string): Seance[] {
    return this.seancesVisibles
      .filter(s => s.date === dateStr)
      .sort((a, b) => (a.heureDebut ?? '').localeCompare(b.heureDebut ?? ''));
  }

  /** Couleurs distinctes des séances d'un jour (pastilles d'en-tête en vue Liste). */
  couleursJour(dateStr: string): string[] {
    const vues = new Set<string>();
    const res: string[] = [];
    for (const s of this.seancesDuJour(dateStr)) {
      const c = this.couleur(s.typeSeance?.code);
      if (!vues.has(c)) { vues.add(c); res.push(c); }
    }
    return res;
  }

  /** Jours de la semaine courante qui portent au moins une séance (vue Liste). */
  get joursAvecSeances(): JourCell[] {
    return this.joursGrid.filter(j => this.seancesDuJour(j.dateStr).length > 0);
  }

  // ══════════ Contexte équipe ══════════

  get equipesDispo() { return this.contexte.equipesDispo(); }

  equipeActiveId(): string | null {
    const ids = this.contexte.equipesActives();
    return ids.length === 1 ? ids[0] : null;
  }

  changerEquipe(id: string | null): void {
    this.contexte.choisirEquipe(id);
    this.charger();
  }

  // ══════════ Libellés ══════════

  /** Sous-titre de l'en-tête : équipe · semaine ISO · plage. */
  get sousTitre(): string {
    const semaine = this.numeroSemaineIso(this.lundiDe(this.ancre));
    return `${this.contexte.libelleEquipe()} · Semaine ${semaine} · ${this.plageTexte()}`;
  }

  /** Libellé de la zone de navigation (dépend de la sous-vue). */
  get titreNav(): string {
    if (this.vue === 'calendrier' && this.sousVue === 'mois') {
      return this.cap(this.ancre.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
    }
    if (this.vue === 'calendrier' && this.sousVue === 'jour') {
      return this.cap(this.ancre.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    }
    return this.plageTexte();
  }

  private plageTexte(): string {
    const lundi = this.lundiDe(this.ancre);
    const dim = this.addDays(lundi, 6);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${lundi.toLocaleDateString('fr-FR', opts)} → ${dim.toLocaleDateString('fr-FR', opts)} ${dim.getFullYear()}`;
  }

  get jourAncre(): JourCell | undefined {
    const ds = this.toDateStr(this.ancre);
    return this.joursGrid.find(j => j.dateStr === ds);
  }

  // ══════════ Actions séance (inchangées) ══════════

  ouvrirCreation(dateStr?: string): void {
    if (!this.typeSeances.length) return;
    const ref = this.dialog.open(SeanceFormDialogComponent, {
      width: '760px', maxWidth: '96vw', panelClass: 'dark-dialog',
      data: { typeSeances: this.typeSeances, date: dateStr ?? this.toDateStr(this.ancre) }
    });
    ref.afterClosed().subscribe((result: SeanceFormResult | null) => {
      if (result) {
        const { exercices, ...seance } = result;
        this.seanceService.create(seance).subscribe(creee => {
          if (exercices.length) {
            this.seanceService.remplacerExercices(creee.id, exercices).subscribe({
              next: () => this.charger(), error: () => this.charger(),
            });
          } else {
            this.charger();
          }
        });
      }
    });
  }

  editerSeance(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    const ref = this.dialog.open(SeanceFormDialogComponent, {
      width: '760px', maxWidth: '96vw', panelClass: 'dark-dialog',
      data: { typeSeances: this.typeSeances, date: seance.date, seance }
    });
    ref.afterClosed().subscribe((result: SeanceFormResult | null) => {
      if (result) {
        const { exercices, ...payload } = result;
        this.seanceService.update(seance.id, payload as Partial<Seance>).subscribe({
          next: () => {
            this.seanceService.remplacerExercices(seance.id, exercices).subscribe({
              next: () => { this.charger(); this.snackBar.open('Séance modifiée', 'OK', { duration: 2500 }); },
              error: () => { this.charger(); this.snackBar.open('Séance modifiée', 'OK', { duration: 2500 }); },
            });
          },
          error: () => this.snackBar.open('Modification impossible', 'OK', { duration: 3000 }),
        });
      }
    });
  }

  /** Détail séance : contenu (schéma + exercices) pour tous. L'analyse GPS par joueur
   *  vit dans la Vue séance (menu GPS), pas ici. */
  ouvrirDetail(seance: Seance): void {
    const titre = seance.titre || seance.typeSeance?.libelle || 'Séance';
    const contenu$ = this.lectureSeule
      ? this.espaceJoueur.getContenuSeance(seance.id)
      : this.seanceService.getContenu(seance.id);
    contenu$.subscribe({
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
      this.charger();
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
    this.seanceService.delete(seance.id).subscribe(() => this.charger());
  }

  libelleStatut(statut: string): string {
    return statut === 'REALISEE' ? 'Réalisée' : statut === 'ANNULEE' ? 'Annulée' : 'Planifiée';
  }

  couleur(code?: string): string {
    return (code && COULEURS_TYPE[code]) || '#6366f1';
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ══════════ Utilitaires dates ══════════

  private startOfDay(d: Date): Date {
    const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
  }

  private addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(0, 0, 0, 0); return r;
  }

  private lundiDe(d: Date): Date {
    const r = this.startOfDay(d);
    const day = r.getDay();
    r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
    return r;
  }

  private debutGrilleMois(): Date {
    const premier = new Date(this.ancre.getFullYear(), this.ancre.getMonth(), 1);
    return this.lundiDe(premier);
  }

  private finGrilleMois(): Date {
    return this.addDays(this.debutGrilleMois(), 41);
  }

  private numeroSemaineIso(d: Date): number {
    const target = this.startOfDay(d);
    const dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.getTime();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.round((firstThursday - target.getTime()) / 604800000);
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${j}`;
  }
}
