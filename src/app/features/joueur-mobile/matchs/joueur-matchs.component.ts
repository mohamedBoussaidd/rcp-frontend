import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  EspaceJoueurService, MatchJoueurResume, MatchJoueurDetail, CompoItemJoueur, SchemaMatchJoueur,
} from '@core/services/espace-joueur.service';
import { OfflineQueueService } from '../offline-queue.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';

/**
 * Vue Match du joueur (PWA, lecture seule). Liste des matchs publiés par le staff →
 * détail : résumé VS, mon rôle + ma consigne en avant, logistique, consignes d'équipe,
 * terrain (compo complète si le staff l'autorise, sinon seulement les convoqués),
 * joueurs à surveiller, schémas. Mon maillot est mis en avant (« TOI ») via mon profil.
 * Consultable hors-ligne via le cache du service worker.
 */
@Component({
  selector: 'app-joueur-matchs',
  standalone: true,
  imports: [DatePipe, SchemaViewerComponent],
  templateUrl: './joueur-matchs.component.html',
  styleUrl: './joueur-matchs.component.scss',
})
export class JoueurMatchsComponent implements OnInit {

  private api = inject(EspaceJoueurService);
  private router = inject(Router);
  offline = inject(OfflineQueueService);

  matchs = signal<MatchJoueurResume[]>([]);
  loading = signal(true);
  detail = signal<MatchJoueurDetail | null>(null);
  loadingDetail = signal(false);

  /** Schéma ouvert en plein écran (lecture/animation), null = fermé. */
  schemaOuvert = signal<SchemaMatchJoueur | null>(null);
  /** Largeur du terrain dans la visionneuse plein écran (s'adapte à l'écran). */
  readonly viewerLargeur = signal(Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 32, 460));

  ouvrirSchema(s: SchemaMatchJoueur): void {
    this.viewerLargeur.set(Math.min(window.innerWidth - 32, 460));
    this.schemaOuvert.set(s);
  }
  fermerSchema(): void { this.schemaOuvert.set(null); }

  /** Mon id joueur (via getProfil) pour repérer mon maillot dans la compo. */
  private monId = signal<string | null>(null);

  private readonly ordreStatut = ['TITULAIRE', 'REMPLACANT', 'RESERVE', 'REPOS', 'SUSPENDU'];
  private readonly libelles: Record<string, string> = {
    TITULAIRE: 'Titulaire', REMPLACANT: 'Remplaçant', RESERVE: 'Réserve', REPOS: 'Repos', SUSPENDU: 'Suspendu',
  };
  private readonly POSTE_LABELS: Record<string, string> = {
    GK: 'Gardien', DC: 'Défenseur central', LB: 'Latéral gauche', RB: 'Latéral droit',
    MDC: 'Milieu défensif', MC: 'Milieu', MG: 'Milieu gauche', MD: 'Milieu droit',
    AG: 'Ailier gauche', AD: 'Ailier droit', ATT: 'Attaquant',
  };

  readonly titulaires = computed(() => (this.detail()?.compo ?? []).filter(c => c.statut === 'TITULAIRE'));
  readonly remplacants = computed(() => (this.detail()?.compo ?? []).filter(c => c.statut === 'REMPLACANT'));

  /** Compo regroupée par statut (hors titulaires placés sur le terrain), groupes non vides. */
  readonly groupes = computed(() => {
    const list = this.detail()?.compo ?? [];
    return this.ordreStatut.filter(s => s !== 'TITULAIRE')
      .map(code => ({ code, label: this.libelles[code], joueurs: list.filter(c => c.statut === code) }))
      .filter(g => g.joueurs.length > 0);
  });

  // ── Mon rôle (hero) ──
  readonly monStatut = computed(() => this.detail()?.monStatut ?? null);
  readonly isTitulaire = computed(() => this.monStatut() === 'TITULAIRE');
  readonly isRemplacant = computed(() => this.monStatut() === 'REMPLACANT');
  readonly isReserve = computed(() => this.monStatut() === 'RESERVE');
  /** Convoqué « actif » (banc/terrain) → hero vert/sombre ; sinon carte sobre. */
  readonly isGroupe = computed(() => ['TITULAIRE', 'REMPLACANT', 'RESERVE'].includes(this.monStatut() ?? ''));

  /** Ma ligne dans la compo (pour poste + n°), repérée par mon id joueur. */
  readonly moi = computed<CompoItemJoueur | null>(() => {
    const id = this.monId();
    if (!id) return null;
    return (this.detail()?.compo ?? []).find(c => c.joueurId === id) ?? null;
  });
  readonly monPoste = computed(() => this.posteLabel(this.moi()?.postePrincipal));

  estMoi(c: { joueurId?: string }): boolean { return !!this.monId() && c.joueurId === this.monId(); }

  ngOnInit(): void {
    this.api.getProfil().subscribe({ next: p => this.monId.set(p.id), error: () => {} });
    this.api.getMatchs().subscribe({
      next: m => { this.matchs.set(m); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  ouvrir(id: string): void {
    this.loadingDetail.set(true);
    this.api.getMatchDetail(id).subscribe({
      next: d => { this.detail.set(d); this.loadingDetail.set(false); window.scrollTo(0, 0); },
      error: () => this.loadingDetail.set(false),
    });
  }

  fermer(): void { this.detail.set(null); window.scrollTo(0, 0); }

  /** Bouton retour de l'en-tête : détail → liste, liste → accueil. */
  retour(): void {
    if (this.detail()) { this.fermer(); } else { this.router.navigate(['/joueur']); }
  }

  statutLabel(code?: string | null): string { return code ? (this.libelles[code] ?? code) : 'Non convoqué'; }
  posteLabel(poste?: string | null): string { return poste ? (this.POSTE_LABELS[poste] ?? poste) : ''; }

  nomJoueur(c: { prenom?: string; nom?: string }): string {
    return `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || '?';
  }
  nomCourt(c: { prenom?: string; nom?: string }): string { return c.nom?.trim() || this.nomJoueur(c); }
  initiales(c: { prenom?: string; nom?: string }): string {
    return ((c.prenom ?? '').charAt(0) + (c.nom ?? '').charAt(0)).toUpperCase() || '?';
  }
  /** Initiales d'un libellé d'équipe (avatar du résumé VS). */
  iniEquipe(nom?: string): string {
    const mots = (nom ?? '').trim().split(/\s+/).filter(Boolean);
    return (mots.length >= 2 ? mots[0].charAt(0) + mots[1].charAt(0) : (nom ?? '?').slice(0, 2)).toUpperCase();
  }

  /** Consigne affichée au joueur : sa consigne perso si elle existe, sinon les consignes d'équipe. */
  readonly maConsigneAffichee = computed(() => {
    const d = this.detail();
    if (!d) return null;
    return d.maConsigne?.trim() ? d.maConsigne : (d.consignes?.trim() ? d.consignes : null);
  });
  readonly consignePerso = computed(() => !!this.detail()?.maConsigne?.trim());

  /** Consignes d'équipe découpées en lignes (puces numérotées). */
  readonly consignesEquipe = computed(() =>
    (this.detail()?.consignes ?? '').split('\n').map(l => l.trim()).filter(Boolean));

  surveillesAdverses(): MatchJoueurDetail['surveilles'] { return this.detail()?.surveilles.filter(s => s.cible === 'ADVERSE') ?? []; }
  surveillesEquipe(): MatchJoueurDetail['surveilles'] { return this.detail()?.surveilles.filter(s => s.cible === 'EQUIPE') ?? []; }
}
