import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { NotificationPushService } from '@core/services/notification-push.service';
import { NotificationService } from '@core/services/notification.service';
import { ResumeSeance, Seance, SeanceService } from '@core/services/seance.service';
import { NotificationBellComponent } from '@shared/components/notification-bell/notification-bell.component';
import { TerrainZonesComponent } from '@shared/components/terrain-zones/terrain-zones.component';

/** Une ligne de la feuille de route : ce que CE membre du staff fait sur un bloc précis. */
export interface EtapeFeuilleRoute {
  seance: string;
  bloc: string;
  dureeMinutes?: number;
  sequencage?: string;
  zones: number[];
  /** Rôles tenus, déjà mis en forme (« ⚖ Arbitre »). Vide = présent sans rôle précisé. */
  roles: string[];
}

/**
 * Accueil de l'espace staff mobile : salutation + cloche, sélecteur d'équipe
 * (staff multi-équipes), bannière d'activation du push, séances du jour et
 * tuiles vers les sections. Aucune logique métier nouvelle : tout est branché
 * sur les services existants.
 */
@Component({
  selector: 'app-staff-home',
  standalone: true,
  templateUrl: './staff-home.component.html',
  styleUrl: './staff-home.component.scss',
  imports: [DatePipe, FormsModule, RouterLink, NotificationBellComponent, TerrainZonesComponent],
})
export class StaffHomeComponent implements OnInit {

  auth = inject(AuthService);
  contexte = inject(ContexteService);
  push = inject(NotificationPushService);
  notifications = inject(NotificationService);
  private seanceService = inject(SeanceService);
  private router = inject(Router);

  readonly today = new Date();
  readonly seancesJour = signal<Seance[]>([]);

  readonly prenom = computed(() => this.auth.currentUser()?.prenom ?? '');
  readonly equipeChoisie = computed(() => this.contexte.equipesActives()[0] ?? '');

  ngOnInit(): void {
    this.chargerJour();
  }

  salutation(): string {
    const h = this.today.getHours();
    return h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  }

  initiales(): string {
    const u = this.auth.currentUser();
    return ((u?.prenom?.[0] ?? '') + (u?.nom?.[0] ?? '')).toUpperCase() || '?';
  }

  changerEquipe(id: string): void {
    this.contexte.choisirEquipe(id || null);
    this.chargerJour();
  }

  estMatch(s: Seance): boolean {
    return !!s.adversaire || s.typeSeance?.code?.toLowerCase() === 'match';
  }

  /**
   * Feuille de route personnelle : les blocs du jour où CE membre du staff est affecté, avec
   * son rôle et sa zone. C'est le vrai gain des rôles de bloc — on passe d'une fiche que le
   * coach lit pour tout le monde à « Bloc 2 · 15 min · zone 3 — tu arbitres » sur son téléphone.
   */
  readonly feuilleRoute = signal<EtapeFeuilleRoute[]>([]);
  /** Feuille de route repliée par défaut (pour ne pas encombrer l'accueil). */
  readonly routeOuverte = signal(false);
  basculerRoute(): void { this.routeOuverte.update(o => !o); }

  private static readonly ICONES: Record<string, string> = {
    MENEUR: '▶ Tu mènes ce bloc', ARBITRE: '⚖ Tu arbitres', BALLONS: '⚽ Tu donnes les ballons',
    CHRONO: '⏱ Tu tiens le chrono', OBSERVATION: '👁 Tu observes', SOINS: '🩺 Soins / sécurité',
  };

  private chargerJour(): void {
    const jour = this.today.toISOString().slice(0, 10);
    this.seanceService.getSemaine(jour, jour).subscribe({
      next: s => {
        const seances = s.filter(x => x.statut !== 'ANNULEE');
        this.seancesJour.set(seances);
        this.chargerFeuilleRoute(seances);
      },
      error: () => { this.seancesJour.set([]); this.feuilleRoute.set([]); },
    });
  }

  private chargerFeuilleRoute(seances: Seance[]): void {
    const moi = this.auth.currentUser()?.id;
    this.feuilleRoute.set([]);
    if (!moi) return;
    for (const s of seances) {
      this.seanceService.getResume(s.id).subscribe({
        next: (r: ResumeSeance) => {
          const etapes: EtapeFeuilleRoute[] = [];
          r.blocs.forEach((b, i) => {
            const moiDansBloc = (b.bloc.staff ?? []).find(st => st.id === moi);
            if (!moiDansBloc) return;
            etapes.push({
              seance: r.typeLibelle || 'Séance',
              bloc: `${i + 1} · ${b.bloc.libelle}`,
              dureeMinutes: b.bloc.dureeMinutes,
              sequencage: b.bloc.sequencage,
              zones: b.bloc.zones ?? [],
              roles: (moiDansBloc.roleBloc ?? [])
                .map(c => StaffHomeComponent.ICONES[c]).filter(x => !!x),
            });
          });
          if (etapes.length) this.feuilleRoute.update(f => [...f, ...etapes]);
        },
        error: () => {},
      });
    }
  }

  deconnexion(): void { this.auth.logout(); }

  /** Bascule vers l'interface web complète : accueil desktop du rôle. */
  versionComplete(): void { this.router.navigateByUrl(this.auth.homeRoute()); }
}
