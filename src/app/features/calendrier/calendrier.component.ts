import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { SeanceService, Seance, TypeSeance } from '@core/services/seance.service';
import { EspaceJoueurService } from '@core/services/espace-joueur.service';
import { ContexteService } from '@core/services/contexte.service';
import { AgendaEntretien, EntretienService } from '@core/services/entretien.service';
import { MesEntretiensService } from '@core/services/mes-entretiens.service';
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
/** Couches d'événements affichées : séances, rendez-vous d'entretien, ou les deux. */
type Couche = 'tout' | 'seances' | 'rdv';

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
  /** Couche RDV : entretiens de la période (staff : équipe ; joueur : ses RDV planifiés). */
  rdvs: AgendaEntretien[] = [];

  // Mode d'affichage : Liste (défaut) ou Calendrier (Jour / Semaine / Mois).
  vue: Vue = 'calendrier';
  sousVue: SousVue = 'semaine';
  /** Filtre par type (code) ; null = Tous. */
  typeFiltre: string | null = null;
  /** Couches affichées : séances / RDV entretiens / tout (défaut). */
  couche: Couche = 'tout';
  /** Date de référence de la période affichée. */
  ancre: Date = new Date();

  joursGrid: JourCell[] = [];   // semaine de l'ancre (Liste + Calendrier/Semaine)
  moisGrid: JourCell[] = [];    // grille mensuelle complète (Calendrier/Mois)

  readonly today = this.toDateStr(new Date());
  readonly jours = JOURS;
  readonly joursCourts = JOURS_COURTS;
  readonly couleursType = COULEURS_TYPE;
  readonly infosType = INFOS_TYPE;

  private seanceService = inject(SeanceService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);
  contexte = inject(ContexteService);
  private espaceJoueur = inject(EspaceJoueurService);
  private entretienService = inject(EntretienService);
  private mesEntretiens = inject(MesEntretiensService);

  /** Joueur : calendrier en lecture seule, données scopées via /api/moi (endpoints staff bloqués). */
  get lectureSeule(): boolean { return this.auth.hasRole('JOUEUR'); }

  /**
   * Noms du staff par id : depuis V65 la séance porte un `responsableId` (compte réel) et non
   * plus un nom tapé à la main. La liste résout donc l'id en nom ici, sans alourdir l'API.
   */
  private nomsStaff = new Map<string, string>();

  nomResponsable(s: Seance): string | null {
    return s.responsableId ? (this.nomsStaff.get(s.responsableId) ?? null) : null;
  }

  private chargerStaff(): void {
    if (this.lectureSeule) return;   // le joueur ne voit pas l'affectation du staff
    this.seanceService.getStaffClub().subscribe({
      next: liste => this.nomsStaff = new Map(liste.map(st => [st.id, st.nom])),
      error: () => {},
    });
  }

  /** Filtre de couche affiché si la couche RDV peut exister (droit staff, ou espace joueur). */
  get montrerFiltreCouche(): boolean {
    return this.lectureSeule || this.auth.has('entretien:read');
  }

  ngOnInit(): void {
    if (!this.lectureSeule) {
      this.seanceService.getTypeSeances().subscribe(t => {
        this.typeSeances = t;
        this.ouvrirEditionDemandee();
      });
      this.chargerStaff();
    }
    this.charger();
  }

  /** ?editer=<id> (bouton « Modifier » de la fiche séance) : rouvre le dialog d'édition. */
  private ouvrirEditionDemandee(): void {
    const id = this.route.snapshot.queryParamMap.get('editer');
    if (!id) return;
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.seanceService.getAll().subscribe(seances => {
      const s = seances.find(x => x.id === id);
      if (s) this.editerSeance(s, new MouseEvent('click'));
    });
  }

  // ══════════ Chargement / période ══════════

  charger(): void {
    this.buildGrids();
    const [debut, fin] = this.periode();
    const d = this.toDateStr(debut), f = this.toDateStr(fin);
    const seances$ = this.lectureSeule
      ? this.espaceJoueur.getSeances(d, f)
      : this.seanceService.getSemaine(d, f);
    seances$.subscribe(s => this.seances = s);
    this.chargerRdvs(d, f);
  }

  /** Couche RDV entretiens — best-effort : sans permission ou module inactif (403), couche vide. */
  private chargerRdvs(debut: string, fin: string): void {
    const rdvs$ = this.lectureSeule
      ? this.mesEntretiens.monAgenda(debut, fin)
      : (this.auth.has('entretien:read') ? this.entretienService.agenda(debut, fin) : null);
    if (!rdvs$) { this.rdvs = []; return; }
    rdvs$.subscribe({ next: r => this.rdvs = r, error: () => this.rdvs = [] });
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

  choisirCouche(c: Couche): void {
    this.couche = c;
  }

  /** Séances de la période filtrées par type (et masquées si la couche RDV est seule affichée). */
  get seancesVisibles(): Seance[] {
    if (this.couche === 'rdv') return [];
    return this.typeFiltre
      ? this.seances.filter(s => s.typeSeance?.code === this.typeFiltre)
      : this.seances;
  }

  /** RDV entretiens affichés (couche « séances » seule → masqués). */
  get rdvsVisibles(): AgendaEntretien[] {
    return this.couche === 'seances' ? [] : this.rdvs;
  }

  seancesDuJour(dateStr: string): Seance[] {
    return this.seancesVisibles
      .filter(s => s.date === dateStr)
      .sort((a, b) => (a.heureDebut ?? '').localeCompare(b.heureDebut ?? ''));
  }

  rdvsDuJour(dateStr: string): AgendaEntretien[] {
    return this.rdvsVisibles
      .filter(r => r.dateEntretien === dateStr)
      .sort((a, b) => (a.heure ?? '').localeCompare(b.heure ?? ''));
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

  /** Jours de la semaine courante qui portent au moins un événement (vue Liste). */
  get joursAvecSeances(): JourCell[] {
    return this.joursGrid.filter(j =>
      this.seancesDuJour(j.dateStr).length > 0 || this.rdvsDuJour(j.dateStr).length > 0);
  }

  // ══════════ RDV entretiens (couche calendrier) ══════════

  readonly RDV_ICONS: Record<string, string> = { VIDEO: '🎬', TERRAIN: '🥅', DISCUSSION: '💬' };
  readonly RDV_LABELS: Record<string, string> = { VIDEO: 'Vidéo', TERRAIN: 'Terrain', DISCUSSION: 'Discussion' };

  rdvNom(r: AgendaEntretien): string {
    const nom = `${r.joueurPrenom ?? ''} ${r.joueurNom ?? ''}`.trim();
    return this.lectureSeule ? 'Mon entretien' : (nom || 'Entretien');
  }

  rdvHeure(r: AgendaEntretien): string {
    return r.heure ? r.heure.slice(0, 5) : '';
  }

  /** Clic sur un RDV : staff → onglet Suivi de la fiche joueur ; joueur → ses entretiens PWA. */
  ouvrirRdv(r: AgendaEntretien): void {
    if (this.lectureSeule) this.router.navigate(['/joueur/entretiens']);
    else this.router.navigate(['/joueurs', r.joueurId], { queryParams: { tab: 'suivi' } });
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
      width: '1180px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'app-dialog',
      data: { typeSeances: this.typeSeances, date: dateStr ?? this.toDateStr(this.ancre) }
    });
    ref.afterClosed().subscribe((result: SeanceFormResult | null) => {
      if (result) {
        const { exercices, avance, ...seance } = result;
        this.seanceService.create(seance).subscribe(creee => {
          const apres = () => {
            this.charger();
            // Mode avancé : ouvre la fiche pour vérification (impression / partage / retouche).
            if (avance) this.router.navigate(['/seances', creee.id, 'fiche'], { queryParams: { verif: 1 } });
          };
          if (avance) {
            this.seanceService.remplacerContenuAvance(creee.id, { ...avance, exercices }).subscribe({
              next: apres, error: apres,
            });
          } else if (exercices.length) {
            this.seanceService.remplacerExercices(creee.id, exercices).subscribe({
              next: apres, error: apres,
            });
          } else {
            apres();
          }
        });
      }
    });
  }

  editerSeance(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    const ref = this.dialog.open(SeanceFormDialogComponent, {
      width: '1180px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'app-dialog',
      data: { typeSeances: this.typeSeances, date: seance.date, seance }
    });
    ref.afterClosed().subscribe((result: SeanceFormResult | null) => {
      if (result) {
        const { exercices, avance, ...payload } = result;
        this.seanceService.update(seance.id, payload as Partial<Seance>).subscribe({
          next: () => {
            const fini = () => { this.charger(); this.snackBar.open('Séance modifiée', 'OK', { duration: 2500 }); };
            if (avance) {
              this.seanceService.remplacerContenuAvance(seance.id, { ...avance, exercices }).subscribe({
                next: fini, error: fini,
              });
            } else {
              this.seanceService.remplacerExercices(seance.id, exercices).subscribe({
                next: fini, error: fini,
              });
            }
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
      next: contenu => this.ouvrirContenuDialog(titre, seance.date, contenu, seance),
      error: () => this.ouvrirContenuDialog(titre, seance.date, null, seance),
    });
  }

  private ouvrirContenuDialog(titre: string, date: string, contenu: any, seance: Seance): void {
    const ref = this.dialog.open(SeanceContenuDialogComponent, {
      width: '900px', maxWidth: '96vw', panelClass: 'app-dialog',
      data: { titre, date, contenu, seance },
    });
    // Joueur : complète (best-effort) avec sa fiche filtrée serveur — déroulé en blocs + SON groupe.
    if (this.lectureSeule) {
      this.espaceJoueur.getFicheSeance(seance.id).subscribe({
        next: fiche => { ref.componentInstance.ficheJoueur = fiche; },
        error: () => {},
      });
    }
  }

  marquerRealisee(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    this.seanceService.marquerRealisee(seance.id).subscribe({
      next: () => {
        this.charger();
        this.snackBar.open('Séance marquée comme réalisée', 'OK', { duration: 3000 });
      },
      error: e => {
        const msg = e?.status === 409
          ? 'Impossible : une séance future ne peut pas être marquée réalisée.'
          : 'Action impossible';
        this.snackBar.open(msg, 'OK', { duration: 4000 });
      },
    });
  }

  /** Retour arrière : repasse une séance réalisée en planifiée (bloqué si données GPS attachées). */
  devaliderSeance(seance: Seance, event: MouseEvent): void {
    event.stopPropagation();
    const nom = seance.titre || seance.typeSeance.libelle;
    if (!confirm(`Repasser "${nom}" en planifiée ?`)) return;
    this.seanceService.annulerRealisation(seance.id).subscribe({
      next: () => {
        this.charger();
        this.snackBar.open('Séance repassée en planifiée', 'OK', { duration: 3000 });
      },
      error: e => {
        const msg = e?.status === 409
          ? 'Impossible : des données GPS sont attachées. Supprime-les d\'abord.'
          : 'Action impossible';
        this.snackBar.open(msg, 'OK', { duration: 4000 });
      },
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
