import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '@core/services/auth.service';
import { EspaceJoueurService } from '@core/services/espace-joueur.service';
import { SuiviSubjectifService, Rpe } from '@core/services/suivi-subjectif.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { Seance, SeanceService } from '@core/services/seance.service';

/** Agrégat des retours d'UNE séance : c'est la vue « qu'ont ressenti mes joueurs ? ». */
interface SeanceRetours {
  seanceId: string;
  date: string;
  titre: string;
  dureePrevue: number | null;
  reponses: Rpe[];
  /** Intensité moyenne PONDÉRÉE par la durée — une intensité ne s'additionne pas. */
  rpeMoyen: number | null;
  chargeMoyenne: number | null;
  plaisirMoyen: number | null;
  nbGenes: number;
  nbPartiels: number;
}

/**
 * Charge perçue (sRPE) — écran dédié, séparé du ressenti quotidien depuis le lot B.
 *
 * Trois lectures selon le contexte :
 *  · <b>Équipe</b> (staff, aucun joueur choisi) : les séances récentes et leur taux de retour ;
 *  · <b>Séance</b> (`?seance=<id>`, depuis le calendrier) : le détail des retours d'une séance ;
 *  · <b>Joueur</b> : son historique, et sa saisie s'il est connecté en tant que joueur.
 */
@Component({
  selector: 'app-rpe',
  standalone: true,
  templateUrl: './rpe.component.html',
  styleUrl: './rpe.component.scss',
  imports: [DatePipe, DecimalPipe, FormsModule, MatIcon, RouterLink],
})
export class RpeComponent implements OnInit {

  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private espace = inject(EspaceJoueurService);
  private suivi = inject(SuiviSubjectifService);
  private joueurService = inject(JoueurService);
  private seanceService = inject(SeanceService);

  readonly today = new Date();
  readonly NOTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly FENETRES = [7, 14, 30, 60, 90];
  readonly ZONES_GENE = ['Cuisse droite', 'Cuisse gauche', 'Ischio droit', 'Ischio gauche', 'Mollet droit',
    'Mollet gauche', 'Genou droit', 'Genou gauche', 'Cheville droite', 'Cheville gauche',
    'Adducteurs', 'Bas du dos', 'Épaule droite', 'Épaule gauche', 'Autre'];
  readonly MOMENTS_GENE: { val: string; label: string }[] = [
    { val: 'EFFORT', label: "À l'effort" }, { val: 'APRES', label: 'Juste après' }, { val: 'REPOS', label: 'Au repos' },
  ];

  readonly isJoueur = this.auth.hasRole('JOUEUR');
  readonly isStaff = !this.isJoueur;

  loading = signal(true);
  nonLie = signal(false);
  rpe = signal<Rpe[]>([]);
  seances = signal<Seance[]>([]);
  joueurs = signal<Joueur[]>([]);

  fenetreJours = signal(30);
  selectedJoueurId = signal<string>('');
  /** Séance mise au point par le calendrier (`?seance=`) ou par un clic dans la liste. */
  seanceFocus = signal<string>('');

  // ── Saisie joueur ──
  rpeSeanceId = signal<string>('');
  rpeIntensite = signal(0);
  rpeDuree = signal<number | null>(null);
  rpePlaisir = signal(0);
  rpeCommentaire = signal('');
  geneActive = signal(false);
  gForm = signal<{ zone: string; intensite: number; moment: string }>(
    { zone: 'Cuisse droite', intensite: 4, moment: 'EFFORT' });
  rpeEnvoi = signal(false);

  readonly chargeCalculee = computed(() => {
    const i = this.rpeIntensite();
    const d = this.rpeDuree();
    return i > 0 && d ? i * d : null;
  });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.seanceFocus.set(q.get('seance') ?? '');
    this.selectedJoueurId.set(q.get('joueur') ?? '');

    if (this.isJoueur) {
      this.espace.getProfil().subscribe({
        next: () => this.loading.set(false),
        error: err => { this.loading.set(false); if (err.status === 409) this.nonLie.set(true); },
      });
      this.espace.getRpe().subscribe({ next: d => this.rpe.set(d as Rpe[]), error: () => {} });
      this.espace.getSeances().subscribe({ next: d => this.seances.set(d), error: () => {} });
    } else {
      this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
      this.seanceService.getAll().subscribe({ next: s => this.seances.set(s), error: () => {} });
      this.charger();
    }
  }

  charger(): void {
    this.loading.set(true);
    const id = this.selectedJoueurId() || undefined;
    this.suivi.getRpe(id).subscribe({
      next: d => { this.rpe.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onSelectJoueur(id: string): void {
    this.selectedJoueurId.set(id);
    this.seanceFocus.set('');
    this.syncUrl();
    this.charger();
  }

  ouvrirSeance(seanceId: string): void {
    this.seanceFocus.set(seanceId);
    this.syncUrl();
  }

  fermerSeance(): void {
    this.seanceFocus.set('');
    this.syncUrl();
  }

  /** L'URL reste partageable : un lien vers une séance précise doit survivre au rechargement. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        seance: this.seanceFocus() || null,
        joueur: this.selectedJoueurId() || null,
      },
      replaceUrl: true,
    });
  }

  setFenetre(n: number): void { this.fenetreJours.set(n); }

  // ──────────────────────────── Découpages ────────────────────────────

  readonly modeSeance = computed(() => !!this.seanceFocus());
  readonly modeEquipe = computed(() => this.isStaff && !this.selectedJoueurId() && !this.modeSeance());

  /** Bornes de la fenêtre affichée (dates ISO). */
  readonly depuis = computed(() =>
    this.dateISO(new Date(Date.now() - (this.fenetreJours() - 1) * 86400000)));

  readonly rpeFenetre = computed(() => {
    const d = this.depuis();
    return this.rpe().filter(r => r.date >= d);
  });

  /** Titre d'une séance : celui résolu côté serveur, sinon le catalogue local. */
  private titreSeance(seanceId: string, fallback?: string): string {
    if (fallback) return fallback;
    const s = this.seances().find(x => x.id === seanceId);
    return s ? (s.titre || s.typeSeance?.libelle || 'Séance') : 'Séance';
  }

  /** Retours groupés par séance, du plus récent au plus ancien. */
  readonly parSeance = computed<SeanceRetours[]>(() => {
    const groupes = new Map<string, Rpe[]>();
    for (const r of this.rpeFenetre()) {
      const liste = groupes.get(r.seanceId) ?? [];
      liste.push(r);
      groupes.set(r.seanceId, liste);
    }
    return [...groupes.entries()]
      .map(([seanceId, reponses]) => this.agreger(seanceId, reponses))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  private agreger(seanceId: string, reponses: Rpe[]): SeanceRetours {
    const dureeTotale = reponses.reduce((t, r) => t + (r.dureeMinutes ?? 0), 0);
    // Moyenne pondérée par la durée : une séance de 90 min pèse plus qu'un 20 min.
    const rpeMoyen = dureeTotale > 0
      ? reponses.reduce((t, r) => t + r.rpe * (r.dureeMinutes ?? 0), 0) / dureeTotale
      : (reponses.length ? reponses.reduce((t, r) => t + r.rpe, 0) / reponses.length : null);
    const charges = reponses.map(r => r.charge).filter((c): c is number => c != null);
    const plaisirs = reponses.map(r => r.plaisir).filter((p): p is number => p != null);
    const prevues = reponses.map(r => r.dureePrevueMinutes).filter((d): d is number => d != null);
    return {
      seanceId,
      date: reponses[0].date,
      titre: this.titreSeance(seanceId, reponses[0].seanceTitre),
      dureePrevue: prevues.length ? prevues[0] : null,
      reponses: [...reponses].sort((a, b) => (a.joueurNom ?? '').localeCompare(b.joueurNom ?? '')),
      rpeMoyen,
      chargeMoyenne: charges.length ? charges.reduce((a, b) => a + b, 0) / charges.length : null,
      plaisirMoyen: plaisirs.length ? plaisirs.reduce((a, b) => a + b, 0) / plaisirs.length : null,
      nbGenes: reponses.filter(r => r.geneZone).length,
      nbPartiels: reponses.filter(r => this.estPartiel(r)).length,
    };
  }

  /** Le joueur a fait moins que la durée planifiée : signal de participation partielle. */
  estPartiel(r: Rpe): boolean {
    return r.dureePrevueMinutes != null && r.dureeMinutes != null && r.dureeMinutes < r.dureePrevueMinutes;
  }

  /** La séance mise au point (mode séance). */
  readonly seanceCourante = computed<SeanceRetours | null>(() =>
    this.parSeance().find(s => s.seanceId === this.seanceFocus()) ?? null);

  /** Séance ciblée mais sans aucun retour : cas fréquent depuis le calendrier. */
  readonly seanceFocusVide = computed(() => this.modeSeance() && !this.seanceCourante());

  readonly titreFocusVide = computed(() => this.titreSeance(this.seanceFocus()));

  /** Effectif de référence pour le taux de retour (staff). */
  readonly effectif = computed(() => this.joueurs().length);

  /**
   * Joueurs de l'effectif SANS retour sur la séance affichée. Tout le monde est censé répondre :
   * ne montrer que ceux qui l'ont fait laissait croire à une séance complète alors qu'il
   * manquait la moitié de l'équipe — c'est particulièrement trompeur après un import CSV,
   * où les absents du fichier disparaissaient purement et simplement de l'écran.
   */
  readonly manquantsSeance = computed<Joueur[]>(() => {
    const sc = this.seanceCourante();
    if (!sc || this.isJoueur) return [];
    const ontRepondu = new Set(sc.reponses.map(r => r.joueurId));
    return this.joueurs()
      .filter(j => !ontRepondu.has(j.id))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  });

  tauxRetour(s: SeanceRetours): number | null {
    const total = this.effectif();
    return total > 0 ? Math.round(s.reponses.length / total * 100) : null;
  }

  // ── Synthèse de la fenêtre ──
  readonly synthese = computed(() => {
    const rows = this.rpeFenetre();
    const charges = rows.map(r => r.charge).filter((c): c is number => c != null);
    const plaisirs = rows.map(r => r.plaisir).filter((p): p is number => p != null);
    return {
      nbSeances: this.parSeance().length,
      nbReponses: rows.length,
      chargeTotale: charges.reduce((a, b) => a + b, 0),
      plaisirMoyen: plaisirs.length ? plaisirs.reduce((a, b) => a + b, 0) / plaisirs.length : null,
      nbGenes: rows.filter(r => r.geneZone && !r.geneTraitee).length,
      nbPartiels: rows.filter(r => this.estPartiel(r)).length,
    };
  });

  // ──────────────────────────── Saisie joueur ────────────────────────────

  /** Séances passées (≤14 j) non encore notées par le joueur. */
  readonly seancesANoter = computed(() => {
    const auj = this.dateISO(new Date());
    const limite = this.dateISO(new Date(Date.now() - 14 * 86400000));
    const notes = new Set(this.rpe().map(r => r.seanceId));
    return this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date <= auj && s.date >= limite && !notes.has(s.id))
      .map(s => ({ id: s.id, date: s.date, titre: s.titre || s.typeSeance?.libelle || 'Séance', duree: s.dureeMinutes }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly seanceANoterSel = computed(() => this.seancesANoter().find(s => s.id === this.rpeSeanceId()) ?? null);

  readonly participationPartielle = computed(() => {
    const prevue = this.seanceANoterSel()?.duree ?? null;
    const reelle = this.rpeDuree();
    return prevue != null && reelle != null && reelle < prevue;
  });

  onSelectSeance(id: string): void {
    this.rpeSeanceId.set(id);
    const s = this.seancesANoter().find(x => x.id === id);
    this.rpeDuree.set(s?.duree ?? null);
  }

  setG(key: 'zone' | 'intensite' | 'moment', val: string | number): void {
    this.gForm.update(f => ({ ...f, [key]: val }));
  }

  readonly peutEnregistrer = computed(() =>
    !!this.rpeSeanceId() && this.rpeIntensite() > 0
    && (!this.geneActive() || !!this.gForm().zone) && !this.rpeEnvoi());

  enregistrerRpe(): void {
    if (!this.isJoueur || !this.peutEnregistrer()) return;
    const g = this.geneActive() ? this.gForm() : null;
    this.rpeEnvoi.set(true);
    this.espace.saisirRpe({
      seanceId: this.rpeSeanceId(),
      seanceType: 'PHYSIQUE',
      rpe: this.rpeIntensite(),
      dureeMinutes: this.rpeDuree() ?? undefined,
      plaisir: this.rpePlaisir() || null,
      commentaire: this.rpeCommentaire().trim() || null,
      geneZone: g ? g.zone : null,
      geneIntensite: g ? g.intensite : null,
      geneMoment: g ? g.moment : null,
    }).subscribe({
      next: r => {
        this.rpe.update(list => [r as Rpe, ...list.filter(x => x.seanceId !== r.seanceId)]);
        this.reinitSaisie();
        this.rpeEnvoi.set(false);
      },
      error: () => this.rpeEnvoi.set(false),
    });
  }

  private reinitSaisie(): void {
    this.rpeSeanceId.set('');
    this.rpeIntensite.set(0);
    this.rpeDuree.set(null);
    this.rpePlaisir.set(0);
    this.rpeCommentaire.set('');
    this.geneActive.set(false);
  }

  // ──────────────────────────── Traitement des gênes (staff) ────────────────────────────

  get peutTraiterGene(): boolean { return this.auth.has('wellness:treat'); }

  traiterGene(r: Rpe, resolution: 'ARCHIVEE' | 'CONVERTIE'): void {
    this.suivi.traiterGeneRpe(r.id, resolution).subscribe({
      next: maj => this.rpe.update(list => list.map(x => x.id === maj.id ? maj : x)),
      error: () => {},
    });
  }

  // ──────────────────────────── Libellés ────────────────────────────

  /** Couleur d'une note d'effort (vert → rouge). */
  couleur(v: number | null): string {
    if (v == null) return 'var(--text-4)';
    if (v <= 3) return '#15803D';
    if (v <= 5) return '#65A30D';
    if (v <= 7) return '#CA8A04';
    if (v <= 8) return '#EA580C';
    return '#B91C1C';
  }

  /** Couleur d'une note de plaisir : échelle INVERSE de l'effort (plus haut = mieux). */
  couleurPlaisir(v: number | null): string {
    return v == null ? 'var(--text-4)' : this.couleur(11 - v);
  }

  momentLabel(v?: string): string {
    return this.MOMENTS_GENE.find(m => m.val === v)?.label ?? '—';
  }

  initiales(prenom?: string, nom?: string): string {
    return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '?';
  }

  private dateISO(d: Date): string {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
}
