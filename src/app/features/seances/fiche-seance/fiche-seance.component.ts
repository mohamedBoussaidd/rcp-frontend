import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ResumeSeance, SeanceService } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';

/**
 * Fiche séance (résumé) — triple usage : vérification après création (?verif=1),
 * consultation d'une séance existante, et fiche imprimable (CSS @media print +
 * window.print()). Lisible par tout le staff : les sections avancées (dominantes,
 * projet de jeu, blocs, effectifs) n'apparaissent que si elles sont remplies.
 */
@Component({
  selector: 'app-fiche-seance',
  standalone: true,
  templateUrl: './fiche-seance.component.html',
  styleUrl: './fiche-seance.component.scss',
  imports: [DatePipe, SchemaViewerComponent],
})
export class FicheSeanceComponent implements OnInit {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private seanceService = inject(SeanceService);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);

  resume = signal<ResumeSeance | null>(null);
  loading = signal(true);
  partageEnCours = signal(false);
  /** Arrivée depuis la création (mode avancé) : bandeau de vérification. */
  verif = signal(false);

  readonly clubNom = computed(() => this.contexte.clubActif()?.nom ?? '');
  readonly clubInitiales = computed(() => {
    const nom = this.clubNom();
    if (!nom) return '·';
    return nom.split(/\s+/).map(m => m[0]).join('').slice(0, 2).toUpperCase();
  });

  peutEcrire(): boolean { return this.auth.has('seances:write'); }

  ngOnInit(): void {
    this.verif.set(this.route.snapshot.queryParamMap.get('verif') === '1');
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/calendrier']); return; }
    this.seanceService.getResume(id).subscribe({
      next: r => { this.resume.set(r); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.snack.open('Fiche introuvable', 'Fermer', { duration: 3000 });
        this.router.navigate(['/calendrier']);
      },
    });
  }

  imprimer(): void { window.print(); }

  retour(): void { this.router.navigate(['/calendrier']); }

  partager(): void {
    const r = this.resume();
    if (!r || this.partageEnCours()) return;
    this.partageEnCours.set(true);
    this.seanceService.partagerAuStaff(r.seanceId).subscribe({
      next: res => {
        this.partageEnCours.set(false);
        this.snack.open(`Fiche partagée à ${res.notifies} membre${res.notifies > 1 ? 's' : ''} du staff`, 'OK', { duration: 3000 });
      },
      error: () => {
        this.partageEnCours.set(false);
        this.snack.open('Partage impossible', 'Fermer', { duration: 3000 });
      },
    });
  }

  /** Retourne au calendrier en rouvrant l'édition de la séance. */
  modifier(): void {
    const r = this.resume();
    if (!r) return;
    this.router.navigate(['/calendrier'], { queryParams: { editer: r.seanceId } });
  }

  /** Nb de joueurs répartis + auto (bandeau « effectif prévu »). */
  effectifPrevu(): number {
    const r = this.resume();
    if (!r) return 0;
    return r.groupesAuto.disponibles.length;
  }

  chipsDominantes(famille: 'SEANCE' | 'ATHLETIQUE'): string[] {
    return (this.resume()?.dominantes ?? []).filter(d => d.groupe === famille).map(d => d.libelle);
  }

  /** Sous-principes préfixés par leur phase (ex. « OFF · Conservation »). */
  chipsProjet(): string[] {
    const libelles: Record<string, string> = {
      OFF: 'OFF', DEF: 'DEF', T_OD: 'Transition OFF', T_DO: 'Transition DEF',
      CPA_OFF: 'CPA OFF', CPA_DEF: 'CPA DEF',
    };
    return (this.resume()?.sousPrincipes ?? [])
      .map(p => `${libelles[p.groupe] ?? p.groupe} · ${p.libelle}`);
  }

  aObjectifs(): boolean {
    const o = this.resume()?.objectifs;
    return !!(o && (o.tactiqueOrg || o.tactiqueFonc || o.mental || o.technique || o.athletique));
  }

  aChargeCible(): boolean {
    const r = this.resume();
    return !!(r && (r.objectifDistanceM || r.objectifDistanceHauteIntensiteM || r.objectifIntensite));
  }
}
