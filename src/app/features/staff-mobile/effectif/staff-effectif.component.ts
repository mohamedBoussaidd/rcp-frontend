import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '@core/services/auth.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { Blessure, BlessureService } from '@core/services/blessure.service';
import { SuiviSubjectifService, Wellness } from '@core/services/suivi-subjectif.service';

/**
 * État de l'effectif en lecture (mobile staff) : disponibilités, blessures en
 * cours et gênes signalées du jour. Aucune écriture — le traitement se fait sur
 * le poste desktop. Les sections se masquent selon les permissions du rôle.
 */
@Component({
  selector: 'app-staff-effectif',
  standalone: true,
  templateUrl: './staff-effectif.component.html',
  styleUrl: './staff-effectif.component.scss',
  imports: [DatePipe],
})
export class StaffEffectifComponent implements OnInit {

  private joueurService = inject(JoueurService);
  private blessureService = inject(BlessureService);
  private suiviService = inject(SuiviSubjectifService);
  auth = inject(AuthService);

  readonly joueurs = signal<Joueur[]>([]);
  readonly blessures = signal<Blessure[]>([]);
  readonly genes = signal<Wellness[]>([]);
  readonly chargement = signal(true);

  readonly disponibles = computed(() => this.joueurs().filter(j => j.statut === 'actif'));
  readonly indisponibles = computed(() => this.joueurs().filter(j => j.statut !== 'actif'));
  readonly blessuresEnCours = computed(() => this.blessures().filter(b => b.enCours));

  ngOnInit(): void {
    this.joueurService.getAll().subscribe({
      next: j => { this.joueurs.set(j); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
    if (this.auth.has('blessures:read')) {
      this.blessureService.lister().subscribe({ next: b => this.blessures.set(b), error: () => {} });
    }
    if (this.auth.has('wellness:read')) {
      const limite = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      this.suiviService.getWellness().subscribe({
        next: w => this.genes.set(w.filter(x => x.geneZone && !x.geneTraitee && x.date >= limite)),
        error: () => {},
      });
    }
  }

  initiales(prenom?: string, nom?: string): string {
    return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '?';
  }

  statutLabel(s?: string): string {
    switch (s) {
      case 'blesse': return 'Blessé';
      case 'suspendu': return 'Suspendu';
      case 'prete': return 'Prêté';
      case 'inactif': return 'Inactif';
      default: return s ?? '';
    }
  }

  blessureDe(joueurId: string): Blessure | undefined {
    return this.blessuresEnCours().find(b => b.joueurId === joueurId);
  }

  joliLabel(v?: string): string { return v ? v.replace(/_/g, ' ') : ''; }
}
