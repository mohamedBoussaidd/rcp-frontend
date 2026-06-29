import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { PresenceService, HistoriqueEquipe, LigneHistoriqueSeance } from '@core/services/presence.service';
import { JoueurService, Joueur, AssiduiteJoueur, EvenementAssiduite } from '@core/services/joueur.service';
import { SaisonService, Saison } from '@core/services/saison.service';

type Vue = 'equipe' | 'joueur';
type TriCol = 'date' | 'taux' | 'presents' | 'absents';

/**
 * Page dédiée « Présence » (historique filtrable). Deux modes : Équipe (une ligne par entraînement)
 * et Joueur (bilan + événements d'un joueur). Filtres : saison (défaut EN_COURS), joueur, et période
 * libre du/au qui prime sur la saison (cf. backend). Gardée par presence:write.
 */
@Component({
  selector: 'app-historique-presence',
  standalone: true,
  templateUrl: './historique-presence.component.html',
  styleUrl: './historique-presence.component.scss',
  imports: [DatePipe, FormsModule, MatIcon],
})
export class HistoriquePresenceComponent implements OnInit {

  private presenceService = inject(PresenceService);
  private joueurService = inject(JoueurService);
  private saisonService = inject(SaisonService);
  private route = inject(ActivatedRoute);

  vue: Vue = 'equipe';
  loading = true;

  // Filtres
  saisonId: string | null = null;
  du = '';
  au = '';
  joueurId: string | null = null;

  // Référentiels
  saisons: Saison[] = [];
  joueurs: Joueur[] = [];

  // Données
  equipe: HistoriqueEquipe | null = null;
  joueurBilan: AssiduiteJoueur | null = null;

  // Tri tableau équipe
  triCol: TriCol = 'date';
  triDesc = true;

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('mode') === 'joueur') this.vue = 'joueur';
    const qpJoueur = qp.get('joueurId');
    if (qpJoueur) { this.joueurId = qpJoueur; this.vue = 'joueur'; }

    this.joueurService.getAll().subscribe(js => { this.joueurs = js; });
    this.saisonService.getAll().subscribe(ss => {
      this.saisons = ss;
      const courante = ss.find(s => s.statut === 'EN_COURS') ?? ss[0];
      if (courante && !this.saisonId) this.saisonId = courante.id;
      this.charger();
    });
  }

  private get filtre() {
    // Une période renseignée prime sur la saison : si du/au est posé, on n'envoie pas la saison.
    const periode = this.du || this.au;
    return {
      saisonId: periode ? null : this.saisonId,
      du: this.du || null,
      au: this.au || null,
    };
  }

  charger(): void {
    this.loading = true;
    if (this.vue === 'equipe') {
      this.presenceService.historiqueEquipe(this.filtre).subscribe({
        next: d => { this.equipe = d; this.loading = false; },
        error: () => { this.equipe = { du: '', au: '', seances: [] }; this.loading = false; },
      });
    } else {
      if (!this.joueurId) { this.joueurBilan = null; this.loading = false; return; }
      this.presenceService.historiqueJoueur(this.joueurId, this.filtre).subscribe({
        next: d => { this.joueurBilan = d; this.loading = false; },
        error: () => { this.joueurBilan = null; this.loading = false; },
      });
    }
  }

  setVue(v: Vue): void {
    if (this.vue === v) return;
    this.vue = v;
    this.charger();
  }

  onFiltreChange(): void { this.charger(); }

  resetPeriode(): void {
    this.du = '';
    this.au = '';
    this.charger();
  }

  // ── Tableau équipe ──
  get lignes(): LigneHistoriqueSeance[] {
    const rows = this.equipe?.seances ?? [];
    const dir = this.triDesc ? -1 : 1;
    const col = this.triCol;
    return [...rows].sort((a, b) => {
      const va = col === 'date' ? a.date : (a[col] as number);
      const vb = col === 'date' ? b.date : (b[col] as number);
      return va === vb ? 0 : (va < vb ? -1 : 1) * dir;
    });
  }

  trier(col: TriCol): void {
    if (this.triCol === col) this.triDesc = !this.triDesc;
    else { this.triCol = col; this.triDesc = true; }
  }

  // ── KPIs équipe ──
  get nbSeances(): number { return this.equipe?.seances.length ?? 0; }
  get tauxMoyen(): number | null {
    const r = this.equipe?.seances ?? [];
    return r.length ? Math.round(r.reduce((t, s) => t + s.taux, 0) / r.length) : null;
  }
  get totalDeclares(): number {
    return (this.equipe?.seances ?? []).reduce((t, s) => t + s.declaresJoueur, 0);
  }

  // ── Joueur ──
  get evenements(): EvenementAssiduite[] { return this.joueurBilan?.historique ?? []; }
  get joueurNom(): string {
    const j = this.joueurs.find(x => x.id === this.joueurId);
    return j ? `${j.prenom ?? ''} ${j.nom}`.trim() : '';
  }

  // ── Libellés / styles ──
  tauxTone(taux: number): string {
    return taux >= 90 ? 'ok' : taux >= 75 ? 'warn' : 'bad';
  }
  libelleStatut(s: string): string {
    return ({ PRESENT: 'Présent', ABSENT: 'Absent', EXCUSE: 'Excusé', RETARD: 'Retard' } as Record<string, string>)[s] ?? s;
  }
}
