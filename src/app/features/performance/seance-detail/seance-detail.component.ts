import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PredictionService, RapportSeance, LigneRapport } from '@core/services/prediction.service';
import { SeanceService, LignePresence, StatutPresence, Seance } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

const COULEURS_TYPE: Record<string, string> = {
  MATCH:        '#ef4444',
  MATCH_AMICAL: '#f97316',
  INTENSIF:     '#6366f1',
  TECHNIQUE:    '#0ea5a0',
  REPRISE:      '#22c55e',
  PRE_MATCH:    '#eab308',
  FORCE:        '#8b5cf6',
};

@Component({
  selector: 'app-seance-detail',
  standalone: true,
  templateUrl: './seance-detail.component.html',
  styleUrl: './seance-detail.component.scss',
  imports: [
    MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell,
    MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow,
    MatIcon, DecimalPipe, DatePipe, FormsModule,
  ]
})
export class SeanceDetailComponent implements OnInit {

  rapport: RapportSeance | null = null;
  loading = true;
  error   = false;

  // ── Onglets ──
  onglet = signal<'gps' | 'presence'>('gps');

  // ── Présence ──
  seanceId = '';
  lignesPresence: LignePresence[] = [];
  loadingPresence = false;
  savingPresence = new Set<string>();   // joueurIds en cours de sauvegarde

  readonly statutsPresence: { val: StatutPresence; label: string; cls: string }[] = [
    { val: 'PRESENT',  label: 'Présent',  cls: 'btn-present'  },
    { val: 'RETARD',   label: 'Retard',   cls: 'btn-retard'   },
    { val: 'EXCUSE',   label: 'Excusé',   cls: 'btn-excuse'   },
    { val: 'ABSENT',   label: 'Absent',   cls: 'btn-absent'   },
  ];

  readonly colonnesBase  = ['joueur', 'poste', 'duree', 'dist_reelle', 'ratio_reel', 'dist_attendue', 'delta', 'statut', 'vitesse', 'sprints'];
  readonly colonnesMatch = [...this.colonnesBase, 'objectif'];

  get displayedColumns(): string[] {
    if (!this.rapport) return this.colonnesBase;
    return ['MATCH', 'MATCH_AMICAL'].includes(this.rapport.type_code) ? this.colonnesMatch : this.colonnesBase;
  }

  get nbPresents(): number  { return this.lignesPresence.filter(l => l.statut === 'PRESENT').length;  }
  get nbAbsents(): number   { return this.lignesPresence.filter(l => l.statut === 'ABSENT').length;   }
  get nbExcuses(): number   { return this.lignesPresence.filter(l => l.statut === 'EXCUSE').length;   }
  get nbRetards(): number   { return this.lignesPresence.filter(l => l.statut === 'RETARD').length;   }
  get nbNonRens(): number   { return this.lignesPresence.filter(l => !l.statut).length;               }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private predictionService: PredictionService,
    private seanceService: SeanceService,
    public auth: AuthService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.seanceId = this.route.snapshot.paramMap.get('id')!;
    const ongletParam = this.route.snapshot.queryParamMap.get('onglet');
    if (ongletParam === 'presence') this.onglet.set('presence');
    this.predictionService.getRapportSeance(this.seanceId).subscribe({
      next: data => { this.rapport = data; this.loading = false; },
      error: () => { this.loading = false; this.error = true; }
    });
    this.chargerPresence();
  }

  ouvrirOnglet(o: 'gps' | 'presence'): void {
    this.onglet.set(o);
    if (o === 'presence' && !this.lignesPresence.length) this.chargerPresence();
  }

  private chargerPresence(): void {
    this.loadingPresence = true;
    this.seanceService.getFeuille(this.seanceId).subscribe({
      next: f => { this.lignesPresence = f.lignes; this.loadingPresence = false; },
      error: () => { this.loadingPresence = false; }
    });
  }

  setStatut(ligne: LignePresence, statut: StatutPresence): void {
    if (!this.auth.hasRole('ENTRAINEUR', 'PREPARATEUR', 'PRESIDENT', 'SUPER_ADMIN')) return;
    const prev = ligne.statut;
    ligne.statut = statut;
    this.savingPresence.add(ligne.joueurId);
    this.seanceService.savePresenceJoueur(this.seanceId, ligne.joueurId, statut, ligne.note).subscribe({
      next: updated => {
        ligne.statut = updated.statut;
        this.savingPresence.delete(ligne.joueurId);
      },
      error: () => {
        ligne.statut = prev;
        this.savingPresence.delete(ligne.joueurId);
        this.snack.open('Erreur de sauvegarde', 'Fermer', { duration: 2500 });
      }
    });
  }

  marquerTousPresents(): void {
    const lignes = this.lignesPresence.filter(l => !l.statut);
    if (!lignes.length) return;
    lignes.forEach(l => l.statut = 'PRESENT');
    const payload = this.lignesPresence
      .filter(l => l.statut)
      .map(l => ({ joueurId: l.joueurId, statut: l.statut!, note: l.note }));
    this.seanceService.saveFeuille(this.seanceId, payload).subscribe({
      next: f => { this.lignesPresence = f.lignes; },
      error: () => this.snack.open('Erreur de sauvegarde', 'Fermer', { duration: 2500 })
    });
  }

  retourSeances(): void { this.router.navigate(['/seances']); }

  couleurType(code: string): string { return COULEURS_TYPE[code] ?? '#6366f1'; }

  statutClass(statut: string): string {
    return { SOUS_NORME: 'statut-sous', DANS_NORME: 'statut-dans', SUR_NORME: 'statut-sur', SANS_BASELINE: 'statut-sans' }[statut] ?? '';
  }
  statutLibelle(statut: string): string {
    return { SOUS_NORME: 'Sous la norme', DANS_NORME: 'Dans la norme', SUR_NORME: 'Sur la norme', SANS_BASELINE: 'Pas de baseline' }[statut] ?? statut;
  }
  statutBadgeClass(statut: string): string {
    return { SOUS_NORME: 'badge--bad', DANS_NORME: 'badge--ok', SUR_NORME: 'badge--info', SANS_BASELINE: 'badge--neutral' }[statut] ?? 'badge--neutral';
  }
  deltaClass(delta: number | null): string {
    if (delta === null) return '';
    return delta < 0 ? 'delta-neg' : delta > 0 ? 'delta-pos' : '';
  }

  get lignesSorted(): LigneRapport[] {
    if (!this.rapport) return [];
    const order: Record<string, number> = { SOUS_NORME: 0, SANS_BASELINE: 1, DANS_NORME: 2, SUR_NORME: 3 };
    return [...this.rapport.lignes].sort((a, b) => (order[a.statut] ?? 9) - (order[b.statut] ?? 9));
  }
}
