import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';
import {
  ChargeJoueur, CompoItem, CompoStatut, EtatSanction, FeuilleLigne, JoueurCompoStats, MatchDetail,
  MatchResume, SanctionsMatch, SchemaMatch, SessionGpsOption, Surveille, SurveilleCible,
  TechniqueService, TypeMatch,
} from '@core/services/technique.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { AuthService } from '@core/services/auth.service';
import { RegleTactiqueResume, ReglesTactiquesService } from '@core/services/regles-tactiques.service';
import { SchemaEditorComponent } from '../schema-editor/schema-editor.component';
import { FORMATIONS, Formation } from '../schema-editor/schema-formations.data';

/**
 * Module Match (sous-menu « Match »), niveau équipe.
 * Liste de matchs → détail en deux onglets : AVANT (prépa : infos, consignes,
 * schémas adverses, compo sur terrain) et APRÈS (débrief : résultat, notes,
 * lien manuel vers une session GPS et charge par joueur).
 */
@Component({
  selector: 'app-match',
  standalone: true,
  templateUrl: './match.component.html',
  styleUrl: './match.component.scss',
  imports: [DatePipe, DecimalPipe, FormsModule, MatIcon, CdkDrag],
})
export class MatchComponent implements OnInit {

  private service = inject(TechniqueService);
  private joueurService = inject(JoueurService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);
  private reglesService = inject(ReglesTactiquesService);

  // ── Moteur tactique : profils de règles adverses attachables au match ──
  readonly moteurVisible = this.auth.has('regles_tactiques:read');
  profilsAdverses = signal<RegleTactiqueResume[]>([]);

  @ViewChild('pitch') pitchRef?: ElementRef<HTMLDivElement>;

  // ── État liste ──
  matchs = signal<MatchResume[]>([]);
  loading = signal(true);
  pasDEquipe = signal(false);

  showCreate = signal(false);
  createForm = { adversaire: '', dateMatch: '', competition: '', typeMatch: 'CHAMPIONNAT' as TypeMatch, domicile: true };
  saving = signal(false);

  // Stats compo (apparitions par statut, sur tous les matchs de l'équipe)
  showStats = signal(false);
  stats = signal<JoueurCompoStats[]>([]);

  // ── État détail ──
  detail = signal<MatchDetail | null>(null);
  onglet = signal<'avant' | 'apres'>('avant');
  modifiable = computed(() => this.detail()?.modifiable ?? false);

  infosBuf = {
    adversaire: '', dateMatch: '', heureMatch: '', competition: '', typeMatch: 'CHAMPIONNAT' as TypeMatch,
    domicile: true, consignes: '',
    lieuRdv: '', heureRdv: '', couleurMaillot: '', infosLogistiques: '',
  };
  /** Buts pour / contre plutôt qu'un score texte : eux seuls disent lequel est le nôtre. */
  debriefBuf: { resultat: string; butsPour: number | null; butsContre: number | null; notesDebrief: string } =
    { resultat: '', butsPour: null, butsContre: null, notesDebrief: '' };

  /** Types de match proposés à la saisie ; le décompte des cartons s'appuie dessus. */
  readonly typesMatch: { code: TypeMatch; label: string }[] = [
    { code: 'CHAMPIONNAT', label: 'Championnat' },
    { code: 'COUPE', label: 'Coupe' },
    { code: 'AMICAL', label: 'Amical' },
  ];
  savingInfos = signal(false);
  savingDebrief = signal(false);

  // ── Feuille de match (module add-on `stats_competition`) ──
  /** Toute la saisie d'après-match vit ici ; la fiche joueur ne fait qu'en lire l'agrégat. */
  readonly peutStats = this.auth.has('stats:read');
  readonly peutStatsEcrire = this.auth.has('stats:write');
  feuille = signal<FeuilleLigne[]>([]);
  /** Copie de référence, pour détecter une saisie non enregistrée sans re-interroger le serveur. */
  private feuilleRef = '';
  savingFeuille = signal(false);

  // ── Cumul de cartons (même module) ──
  /** L'application compte et alerte ; la commission suspend. Rien n'est imposé à la compo. */
  sanctions = signal<SanctionsMatch | null>(null);
  /** Index par joueur, pour poser un badge sans balayer la liste à chaque rendu. */
  readonly sanctionParJoueur = computed(() => {
    const map = new Map<string, EtatSanction>();
    for (const e of this.sanctions()?.joueurs ?? []) map.set(e.joueurId, e);
    return map;
  });

  // ── Publication vers les joueurs ──
  savingPublication = signal(false);
  readonly publie = computed(() => this.detail()?.publie ?? false);
  readonly compoVisible = computed(() => this.detail()?.compoVisible ?? true);

  // ── Suspendus pour ce match (indispo manuelle) ──
  suspendus = signal<Set<string>>(new Set());
  /** Formations préréglées pour le placement auto. */
  readonly formations: Formation[] = FORMATIONS;
  /** Nombre de titularisations par joueur (sur tous les matchs), pour prioriser l'auto-placement. */
  private titulCount = signal<Record<string, number>>({});

  // ── Compo ──
  joueurs = signal<Joueur[]>([]);
  compo = signal<CompoItem[]>([]);
  savingCompo = signal(false);

  /** Joueurs actuellement blessés (statut entretenu par le module médical) → repos imposé. */
  readonly blesses = computed(() => new Set(this.joueurs().filter(j => j.statut === 'blesse').map(j => j.id)));

  /** Statuts possibles (hors terrain) + libellés affichés. */
  readonly statuts: { code: CompoStatut; label: string }[] = [
    { code: 'TITULAIRE', label: 'Titulaire' },
    { code: 'REMPLACANT', label: 'Remplaçant' },
    { code: 'RESERVE', label: 'Réserve' },
    { code: 'REPOS', label: 'Repos' },
    { code: 'SUSPENDU', label: 'Suspendu' },
  ];

  readonly titulaires = computed(() => this.compo().filter(c => c.statut === 'TITULAIRE'));
  /** Places sur le terrain — même plafond que côté serveur. */
  readonly TITULAIRES_MAX = 11;
  readonly onzeAtteint = computed(() => this.titulaires().length >= this.TITULAIRES_MAX);
  /** Compo regroupée par statut (hors titulaires placés sur le terrain). */
  readonly groupes = computed(() => {
    const list = this.compo();
    return this.statuts
      .filter(s => s.code !== 'TITULAIRE')
      .map(s => ({ ...s, joueurs: list.filter(c => c.statut === s.code) }));
  });
  readonly disponibles = computed(() => {
    const pris = new Set(this.compo().map(c => c.joueurId));
    return this.joueurs().filter(j => !pris.has(j.id));
  });

  /** Roster groupé par statut pour la grille de chips (droite de la compo). */
  readonly chipGroupes = computed(() => {
    const list = this.compo();
    const defs: { code: CompoStatut; label: string; color: string }[] = [
      { code: 'TITULAIRE', label: 'Titulaires', color: '#15803D' },
      { code: 'REMPLACANT', label: 'Remplaçants', color: '#1D4ED8' },
      { code: 'RESERVE', label: 'Réserve', color: '#64748B' },
      { code: 'REPOS', label: 'Repos', color: '#B45309' },
      { code: 'SUSPENDU', label: 'Suspendus', color: '#B91C1C' },
    ];
    return defs.map(d => ({ ...d, items: list.filter(c => c.statut === d.code) }));
  });

  // ── Joueur sélectionné (éditeur sous le terrain) ──
  selectedId = signal<string | null>(null);
  readonly selected = computed(() => this.compo().find(c => c.joueurId === this.selectedId()) ?? null);

  /** Libellés lisibles des postes (codes du modèle joueur). */
  private readonly POSTE_LABELS: Record<string, string> = {
    GK: 'Gardien', DC: 'Déf. central', LB: 'Latéral gauche', RB: 'Latéral droit',
    MDC: 'Milieu défensif', MC: 'Milieu', MG: 'Milieu gauche', MD: 'Milieu droit',
    AG: 'Ailier gauche', AD: 'Ailier droit', ATT: 'Attaquant',
  };
  posteLabel(poste?: string): string { return poste ? (this.POSTE_LABELS[poste] ?? poste) : '—'; }

  /** Couleur du maillot/chip selon la grande ligne du poste. */
  roleColor(poste?: string): string {
    switch (this.ligne(poste)) {
      case 'GK': return '#D97706';
      case 'DEF': return '#2563EB';
      case 'MID': return '#15803D';
      case 'ATT': return '#DC2626';
      default: return '#64748B';
    }
  }

  /** Pastille d'état (coin du maillot) : blessé / suspendu / dispo. */
  statutDot(c: CompoItem): string {
    if (this.estBlesse(c.joueurId)) return '#B45309';
    if (this.estSuspendu(c.joueurId)) return '#B91C1C';
    return '#22C55E';
  }

  iniJoueur(j: Joueur): string {
    return ((j.prenom?.charAt(0) ?? '') + (j.nom?.charAt(0) ?? '')).toUpperCase() || '?';
  }

  /** Clique sur un maillot ou une chip déjà dans la compo : sélectionne pour édition. */
  selectChip(joueurId: string): void { this.selectedId.set(joueurId); }

  /** Ajoute un joueur disponible (remplaçant par défaut) puis le sélectionne. */
  ajouterDispo(j: Joueur): void { this.ajouterCompo(j, 'REMPLACANT'); this.selectedId.set(j.id); }

  removePlayer(joueurId: string): void {
    this.retirerCompo(joueurId);
    if (this.selectedId() === joueurId) this.selectedId.set(null);
  }

  // ── Session GPS / charge ──
  sessions = signal<SessionGpsOption[]>([]);
  charge = signal<ChargeJoueur[]>([]);

  // ── Joueurs à surveiller (bloc dédié) ──
  surveilleForm = { cible: 'ADVERSE' as SurveilleCible, joueurId: '', nom: '', note: '' };
  savingSurveille = signal(false);

  // ── Blocs pliables (comme le dashboard) ──
  panneaux = signal<Record<string, boolean>>({
    infos: true, schemas: true, surveille: true, compo: true, debrief: true, gps: true,
  });

  readonly resultats = ['VICTOIRE', 'NUL', 'DEFAITE'];

  estOuvert(cle: string): boolean { return this.panneaux()[cle] ?? true; }
  basculerPanneau(cle: string): void {
    this.panneaux.update(p => ({ ...p, [cle]: !(p[cle] ?? true) }));
  }

  ngOnInit(): void { this.chargerListe(); }

  // ════════════════ LISTE ════════════════

  chargerListe(): void {
    this.loading.set(true);
    this.detail.set(null);
    this.stats.set([]); this.showStats.set(false);  // recalcul à la réouverture (la compo a pu changer)
    this.service.listerMatchs().subscribe({
      next: m => { this.matchs.set(m); this.pasDEquipe.set(false); this.loading.set(false); },
      error: err => {
        this.loading.set(false);
        if (err?.status === 409) { this.pasDEquipe.set(true); }
        else { this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); }
      },
    });
  }

  basculerCreate(): void {
    this.showCreate.update(v => !v);
    if (this.showCreate()) {
      this.createForm = {
        adversaire: '', dateMatch: new Date().toISOString().slice(0, 10),
        competition: '', typeMatch: 'CHAMPIONNAT', domicile: true,
      };
    }
  }

  creer(): void {
    if (!this.createForm.adversaire.trim()) return;
    this.saving.set(true);
    this.service.creerMatch({
      adversaire: this.createForm.adversaire.trim(),
      dateMatch: this.createForm.dateMatch || null,
      competition: this.createForm.competition || null,
      typeMatch: this.createForm.typeMatch,
      domicile: this.createForm.domicile,
    }).subscribe({
      next: m => { this.saving.set(false); this.showCreate.set(false); this.ouvrir(m.id); },
      error: () => { this.saving.set(false); this.snack.open('Création impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  basculerStats(): void {
    this.showStats.update(v => !v);
    if (this.showStats() && this.stats().length === 0) {
      this.service.statsCompo().subscribe({
        next: s => this.stats.set(s),
        error: () => this.snack.open('Statistiques indisponibles', 'Fermer', { duration: 3000 }),
      });
    }
  }

  resultatLabel(r?: string): string {
    return r === 'VICTOIRE' ? 'Victoire' : r === 'NUL' ? 'Nul' : r === 'DEFAITE' ? 'Défaite' : '—';
  }

  // ════════════════ DÉTAIL ════════════════

  ouvrir(id: string): void {
    this.onglet.set('avant');
    forkJoin({
      m: this.service.getMatch(id),
      js: this.joueurService.getEffectifEquipe(),   // effectif de l'équipe du match, pas tout le club
    }).subscribe({
      next: ({ m, js }) => {
        this.joueurs.set(js);          // alimente `blesses` (computed) avant placement
        this.appliquerDetail(m);
        this.placerIndisposAutomatiquement();
      },
      error: () => this.snack.open('Match introuvable', 'Fermer', { duration: 3000 }),
    });
    this.service.sessionsGps().subscribe({ next: s => this.sessions.set(s), error: () => {} });
    if (this.moteurVisible) {
      this.reglesService.lister({ type: 'ADVERSAIRE' }).subscribe({
        next: p => this.profilsAdverses.set(p), error: () => {},
      });
    }
    this.service.statsCompo().subscribe({
      next: s => this.titulCount.set(Object.fromEntries(s.map(x => [x.joueurId, x.titulaire]))),
      error: () => {},
    });
  }

  private appliquerDetail(m: MatchDetail): void {
    this.detail.set(m);
    this.compo.set([...m.compo]);
    this.suspendus.set(new Set(m.suspendus ?? []));
    this.infosBuf = {
      adversaire: m.adversaire, dateMatch: m.dateMatch ?? '', heureMatch: m.heureMatch ?? '',
      competition: m.competition ?? '', typeMatch: m.typeMatch ?? 'CHAMPIONNAT',
      domicile: m.domicile, consignes: m.consignes ?? '',
      lieuRdv: m.lieuRdv ?? '', heureRdv: m.heureRdv ?? '',
      couleurMaillot: m.couleurMaillot ?? '', infosLogistiques: m.infosLogistiques ?? '',
    };
    this.debriefBuf = {
      resultat: m.resultat ?? '',
      butsPour: m.butsPour ?? null, butsContre: m.butsContre ?? null,
      notesDebrief: m.notesDebrief ?? '',
    };
    if (m.sessionGpsId) { this.rafraichirCharge(m.id); } else { this.charge.set([]); }
    this.chargerFeuille(m.id);
    this.chargerSanctions(m.id);
  }

  /**
   * Cumul de cartons du groupe. Comme la feuille de match, c'est un add-on : sans le module
   * l'appel répond 403 et l'écran se contente de ne rien afficher.
   */
  private chargerSanctions(matchId: string): void {
    this.sanctions.set(null);
    if (!this.peutStats) return;
    this.service.getSanctions(matchId).subscribe({
      next: s => this.sanctions.set(s),
      error: () => this.sanctions.set(null),
    });
  }

  /**
   * Le bloc « Infos & logistique » a son propre bouton Enregistrer : remplir les champs puis
   * changer d'onglet ou fermer le match perdait la saisie sans le moindre signe. Ces deux gardes
   * affichent un rappel tant que le buffer diverge de ce que porte le match chargé.
   */
  infosNonEnregistrees(): boolean {
    const m = this.detail();
    if (!m || !this.modifiable()) return false;
    const b = this.infosBuf;
    return b.adversaire !== (m.adversaire ?? '')
      || b.dateMatch !== (m.dateMatch ?? '')
      || this.hhmm(b.heureMatch) !== this.hhmm(m.heureMatch)
      || b.competition !== (m.competition ?? '')
      || b.typeMatch !== (m.typeMatch ?? 'CHAMPIONNAT')
      || b.domicile !== m.domicile
      || b.consignes !== (m.consignes ?? '')
      || b.lieuRdv !== (m.lieuRdv ?? '')
      || this.hhmm(b.heureRdv) !== this.hhmm(m.heureRdv)
      || b.couleurMaillot !== (m.couleurMaillot ?? '')
      || b.infosLogistiques !== (m.infosLogistiques ?? '');
  }

  debriefNonEnregistre(): boolean {
    const m = this.detail();
    if (!m || !this.modifiable()) return false;
    return this.debriefBuf.resultat !== (m.resultat ?? '')
      || (this.debriefBuf.butsPour ?? null) !== (m.butsPour ?? null)
      || (this.debriefBuf.butsContre ?? null) !== (m.butsContre ?? null)
      || this.debriefBuf.notesDebrief !== (m.notesDebrief ?? '');
  }

  /** Heure comparable : le serveur peut renvoyer « 18:30:00 » là où l'input porte « 18:30 ». */
  private hhmm(v?: string | null): string { return (v ?? '').slice(0, 5); }

  // ── Feuille de match ────────────────────────────────────────────────────

  /**
   * Charge la feuille du match. Le module `stats_competition` est un add-on : sans lui l'appel
   * répond 403, et le bloc n'est de toute façon pas rendu — on ne remonte donc pas d'erreur.
   */
  private chargerFeuille(matchId: string): void {
    this.feuille.set([]);
    this.feuilleRef = '';
    if (!this.peutStats) return;
    this.service.getFeuille(matchId).subscribe({
      next: f => { this.feuille.set(f.lignes); this.feuilleRef = this.empreinteFeuille(f.lignes); },
      error: () => { this.feuille.set([]); this.feuilleRef = ''; },
    });
  }

  enregistrerFeuille(): void {
    const m = this.detail();
    if (!m || !this.peutStatsEcrire) return;
    this.savingFeuille.set(true);
    const lignes = this.feuille().map(l => ({
      joueurId: l.joueurId,
      entreEnJeu: l.entreEnJeu,
      // Un champ vidé revient à « non renseigné » et non à zéro : les autres sources doivent
      // pouvoir reprendre la main sur ce match.
      minuteEntree: this.minuteOuNull(l.minuteEntree),
      minuteSortie: this.minuteOuNull(l.minuteSortie),
      buts: l.buts ?? 0,
      passesDecisives: l.passesDecisives ?? 0,
      cartonsJaunes: l.cartonsJaunes ?? 0,
      cartonRouge: this.rougeEffectif(l),
      // Le clean sheet n'est pas envoyé : le serveur le déduit des buts encaissés.
    }));
    this.service.enregistrerFeuille(m.id, lignes).subscribe({
      next: f => {
        this.feuille.set(f.lignes);
        this.feuilleRef = this.empreinteFeuille(f.lignes);
        this.savingFeuille.set(false);
        this.snack.open('Feuille de match enregistrée', 'Fermer', { duration: 2000 });
      },
      error: () => { this.savingFeuille.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  /**
   * Deux avertissements valent expulsion. La case rouge se coche alors d'elle-même et se verrouille
   * — en dessous, elle reste libre : un rouge direct n'a besoin d'aucun jaune.
   */
  rougeEffectif(l: FeuilleLigne): boolean {
    return l.cartonRouge || (l.cartonsJaunes ?? 0) >= 2;
  }

  rougeImpose(l: FeuilleLigne): boolean {
    return (l.cartonsJaunes ?? 0) >= 2;
  }

  /** Le second jaune coche le rouge dans la foulée, sinon la ligne mentirait jusqu'à l'enregistrement. */
  majCartonsJaunes(l: FeuilleLigne): void {
    if (this.rougeImpose(l)) l.cartonRouge = true;
  }

  /** Même garde que sur les autres blocs : une saisie perdue en changeant d'onglet ne se voit pas. */
  feuilleNonEnregistree(): boolean {
    return this.peutStatsEcrire && this.feuilleRef !== '' && this.empreinteFeuille(this.feuille()) !== this.feuilleRef;
  }

  // Le clean sheet n'entre pas dans l'empreinte : déduit du score, il change sans qu'on ait rien
  // saisi, et signalerait alors une modification en attente qui n'existe pas.
  private empreinteFeuille(lignes: FeuilleLigne[]): string {
    return lignes.map(l => [
      l.joueurId, l.entreEnJeu, l.minuteEntree ?? '', l.minuteSortie ?? '',
      l.buts, l.passesDecisives, l.cartonsJaunes, this.rougeEffectif(l),
    ].join('|')).join(';');
  }

  private minuteOuNull(v: number | null | undefined): number | null {
    return v === null || v === undefined || (v as unknown as string) === '' ? null : Number(v);
  }

  /** D'où vient la minute affichée — un relevé de capteur n'est pas une donnée officielle. */
  sourceLabel(source: string): string {
    return ({ SAISIE: 'Staff', FEDERATION: 'Fédé', GPS: 'GPS' } as Record<string, string>)[source] ?? source;
  }

  fermer(): void { this.chargerListe(); }

  supprimer(): void {
    const m = this.detail();
    if (!m || !confirm(`Supprimer le match contre ${m.adversaire} ?`)) return;
    this.service.supprimerMatch(m.id).subscribe({
      next: () => this.chargerListe(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── AVANT : infos ──
  enregistrerInfos(): void {
    const m = this.detail();
    if (!m || !this.infosBuf.adversaire.trim()) return;
    this.savingInfos.set(true);
    this.service.modifierMatchInfos(m.id, {
      adversaire: this.infosBuf.adversaire.trim(),
      dateMatch: this.infosBuf.dateMatch || null,
      heureMatch: this.infosBuf.heureMatch || null,
      competition: this.infosBuf.competition || null,
      typeMatch: this.infosBuf.typeMatch,
      domicile: this.infosBuf.domicile,
      consignes: this.infosBuf.consignes || null,
      lieuRdv: this.infosBuf.lieuRdv || null,
      heureRdv: this.infosBuf.heureRdv || null,
      couleurMaillot: this.infosBuf.couleurMaillot || null,
      infosLogistiques: this.infosBuf.infosLogistiques || null,
    }).subscribe({
      // appliquerDetail() et non detail.set() : le second laissait `infosBuf` sur la saisie de
      // l'utilisateur, si bien que les champs affichaient ce qui avait été tapé et non ce que le
      // serveur avait réellement enregistré (heure normalisée en « 18:30:00 », trim, valeur ignorée…).
      next: maj => { this.appliquerDetail(maj); this.savingInfos.set(false); this.snack.open('Infos enregistrées', 'Fermer', { duration: 2000 }); },
      error: () => { this.savingInfos.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── AVANT : publication vers les joueurs ──
  basculerPublication(): void {
    const m = this.detail();
    if (!m) return;
    this.envoyerPublication(!m.publie, m.compoVisible);
  }
  basculerCompoVisible(): void {
    const m = this.detail();
    if (!m) return;
    this.envoyerPublication(m.publie, !m.compoVisible);
  }
  private envoyerPublication(publie: boolean, compoVisible: boolean): void {
    const m = this.detail();
    if (!m) return;
    this.savingPublication.set(true);
    this.service.publierMatch(m.id, publie, compoVisible).subscribe({
      next: maj => {
        this.detail.set(maj);
        this.savingPublication.set(false);
        this.snack.open(publie ? 'Match partagé aux joueurs' : 'Match dépublié', 'Fermer', { duration: 2000 });
      },
      error: () => { this.savingPublication.set(false); this.snack.open('Action impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── AVANT : suspensions (indispo manuelle pour ce match) ──
  estSuspendu(joueurId: string): boolean { return this.suspendus().has(joueurId); }

  basculerSuspendu(joueurId: string): void {
    const next = new Set(this.suspendus());
    if (next.has(joueurId)) { next.delete(joueurId); } else { next.add(joueurId); }
    this.suspendus.set(next);
    // Un suspendu présent dans la compo passe au statut SUSPENDU.
    if (next.has(joueurId)) {
      this.compo.update(list => list.map(c => c.joueurId === joueurId
        ? { ...c, statut: 'SUSPENDU' as CompoStatut, x: 0, y: 0 } : c));
    }
    const m = this.detail();
    if (m) this.service.definirSuspendus(m.id, [...next]).subscribe({ error: () => {} });
  }

  // ── AVANT : pré-remplissage de la compo ──

  placerFormationParNom(nom: string): void {
    const f = this.formations.find(x => x.nom === nom);
    if (f) this.placerFormation(f);
  }

  /** Place une formation : 11 titulaires affectés par poste (le plus titularisé en priorité). */
  placerFormation(f: Formation): void {
    if (!this.modifiable()) return;
    const indispo = (id: string) => this.blesses().has(id) || this.suspendus().has(id);
    const pris = new Set<string>();
    const titulaires: CompoItem[] = [];
    const roles = f.roles ?? [];

    f.positions.forEach((pos, i) => {
      const role = roles[i];
      const j = this.choisirJoueur(role, pris, indispo);
      if (j) {
        pris.add(j.id);
        // Le terrain Match est VERTICAL : on passe du repère formation (x=profondeur 0→but
        // adverse, y=largeur) au repère terrain (left=largeur, top=profondeur, gardien en bas).
        const left = pos.y;
        const top = this.clamp01(0.92 - pos.x * 1.6);
        titulaires.push({ joueurId: j.id, nom: j.nom, prenom: j.prenom, postePrincipal: j.postePrincipal,
          x: left, y: top, statut: 'TITULAIRE', consigne: this.consigneDe(j.id) });
      }
    });

    // Blessés au repos, suspendus en suspendu ; le reste retourne en disponibles.
    const extras: CompoItem[] = this.joueurs()
      .filter(j => !pris.has(j.id) && indispo(j.id))
      .map(j => ({ joueurId: j.id, nom: j.nom, prenom: j.prenom, postePrincipal: j.postePrincipal,
        x: 0, y: 0, statut: this.suspendus().has(j.id) ? 'SUSPENDU' : 'REPOS', consigne: this.consigneDe(j.id) }));

    this.compo.set([...titulaires, ...extras]);
    this.snack.open(`Formation ${f.nom} placée`, 'Fermer', { duration: 2000 });
  }

  /** Meilleur joueur disponible pour un poste (exact > même ligne > n'importe lequel), le plus titularisé. */
  private choisirJoueur(role: string | undefined, pris: Set<string>, indispo: (id: string) => boolean): Joueur | null {
    const libres = this.joueurs().filter(j => !pris.has(j.id) && !indispo(j.id));
    if (libres.length === 0) return null;
    const tri = (a: Joueur, b: Joueur) => (this.titulCount()[b.id] ?? 0) - (this.titulCount()[a.id] ?? 0);
    const exact = libres.filter(j => j.postePrincipal === role).sort(tri);
    if (exact.length) return exact[0];
    if (role) {
      const ligne = libres.filter(j => this.ligne(j.postePrincipal) === this.ligne(role)).sort(tri);
      if (ligne.length) return ligne[0];
    }
    return [...libres].sort(tri)[0];
  }

  /** Grande ligne d'un poste, pour le repli de l'auto-placement. */
  private ligne(poste?: string): string {
    switch (poste) {
      case 'GK': return 'GK';
      case 'DC': case 'LB': case 'RB': return 'DEF';
      case 'MDC': case 'MC': case 'MG': case 'MD': return 'MID';
      case 'AG': case 'AD': case 'ATT': return 'ATT';
      default: return '?';
    }
  }

  private clamp01(v: number): number { return Math.min(0.95, Math.max(0.05, v)); }

  private consigneDe(joueurId: string): string | null {
    return this.compo().find(c => c.joueurId === joueurId)?.consigne ?? null;
  }

  /** Reprend la compo du match précédent (blessés au repos, suspendus en suspendu). */
  reprendreDernierMatch(): void {
    const m = this.detail();
    if (!m || !this.modifiable()) return;
    this.service.compoDernierMatch(m.id).subscribe({
      next: items => {
        if (items.length === 0) { this.snack.open('Aucun match précédent avec une compo', 'Fermer', { duration: 3000 }); return; }
        const next = items.map(c => {
          if (this.blesses().has(c.joueurId)) return { ...c, statut: 'REPOS' as CompoStatut, x: 0, y: 0 };
          if (this.suspendus().has(c.joueurId)) return { ...c, statut: 'SUSPENDU' as CompoStatut, x: 0, y: 0 };
          return { ...c };
        });
        this.compo.set(next);
        this.snack.open('Compo du dernier match reprise', 'Fermer', { duration: 2000 });
      },
      error: () => this.snack.open('Reprise impossible', 'Fermer', { duration: 3000 }),
    });
  }

  setConsigne(c: CompoItem, valeur: string): void {
    this.compo.update(list => list.map(x => x.joueurId === c.joueurId ? { ...x, consigne: valeur } : x));
  }

  // ── AVANT : joueurs à surveiller ──
  surveillesAdverses(): Surveille[] { return this.detail()?.surveilles.filter(s => s.cible === 'ADVERSE') ?? []; }
  surveillesEquipe(): Surveille[] { return this.detail()?.surveilles.filter(s => s.cible === 'EQUIPE') ?? []; }

  ajouterSurveille(): void {
    const m = this.detail();
    if (!m) return;
    const f = this.surveilleForm;
    if (f.cible === 'EQUIPE' && !f.joueurId) { this.snack.open('Choisissez un joueur', 'Fermer', { duration: 2500 }); return; }
    if (f.cible === 'ADVERSE' && !f.nom.trim()) { this.snack.open('Indiquez un nom', 'Fermer', { duration: 2500 }); return; }
    this.savingSurveille.set(true);
    this.service.ajouterSurveille(m.id, {
      cible: f.cible,
      joueurId: f.cible === 'EQUIPE' ? f.joueurId : null,
      nom: f.cible === 'ADVERSE' ? f.nom.trim() : null,
      note: f.note || null,
    }).subscribe({
      next: maj => {
        this.detail.set(maj);  // n'écrase pas la compo/brouillon en cours
        this.surveilleForm = { cible: f.cible, joueurId: '', nom: '', note: '' };
        this.savingSurveille.set(false);
      },
      error: () => { this.savingSurveille.set(false); this.snack.open('Ajout impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  supprimerSurveille(s: Surveille): void {
    this.service.supprimerSurveille(s.id).subscribe({
      next: maj => this.detail.set(maj),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── AVANT : schémas adverses ──
  ajouterSchema(): void {
    const m = this.detail();
    if (!m) return;
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: `Schéma adverse — ${m.adversaire}`,
        enregistrer: (json: string, apercu: string) => this.service.ajouterMatchSchema(m.id, { schemaJson: json, apercu }),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.recharger(); });
  }

  editerSchema(s: SchemaMatch): void {
    const m = this.detail();
    if (!m) return;
    this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: s.titre || `Schéma adverse — ${m.adversaire}`,
        schemaJson: s.schemaJson,
        enregistrer: (json: string, apercu: string) => this.service.modifierMatchSchema(s.id, { titre: s.titre, schemaJson: json, apercu }),
      },
    }).afterClosed().subscribe(saved => { if (saved) this.recharger(); });
  }

  supprimerSchema(s: SchemaMatch): void {
    if (!confirm('Supprimer ce schéma ?')) return;
    this.service.supprimerMatchSchema(s.id).subscribe({
      next: () => this.recharger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private recharger(): void {
    const m = this.detail();
    if (m) this.service.getMatch(m.id).subscribe({ next: maj => this.appliquerDetail(maj) });
  }

  // ── AVANT : compo ──
  nomJoueur(c: CompoItem): string { return `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || '?'; }
  initiales(c: CompoItem): string {
    const p = (c.prenom ?? '').charAt(0); const n = (c.nom ?? '').charAt(0);
    return (p + n).toUpperCase() || '?';
  }

  statutLabel(code: CompoStatut): string {
    return this.statuts.find(s => s.code === code)?.label ?? code;
  }

  estBlesse(joueurId: string): boolean { return this.blesses().has(joueurId); }

  ajouterCompo(j: Joueur, statut: CompoStatut): void {
    // Un joueur blessé est forcément au repos ; un suspendu, au statut suspendu.
    const eff: CompoStatut = this.estBlesse(j.id) ? 'REPOS' : this.estSuspendu(j.id) ? 'SUSPENDU' : statut;
    const item: CompoItem = {
      joueurId: j.id, nom: j.nom, prenom: j.prenom, postePrincipal: j.postePrincipal,
      x: eff === 'TITULAIRE' ? 0.5 : 0, y: eff === 'TITULAIRE' ? 0.5 : 0, statut: eff, consigne: null,
    };
    this.compo.update(list => [...list, item]);
  }
  retirerCompo(joueurId: string): void {
    this.compo.update(list => list.filter(c => c.joueurId !== joueurId));
  }
  changerStatut(c: CompoItem, statut: CompoStatut): void {
    if (this.estBlesse(c.joueurId) || this.estSuspendu(c.joueurId)) return;  // blessé/suspendu → statut imposé
    // Douze maillots sur le terrain ne se voyaient qu'au compteur de l'en-tête : on refuse ici,
    // au moment du geste, plutôt que de laisser le serveur rejeter tout l'enregistrement.
    if (statut === 'TITULAIRE' && c.statut !== 'TITULAIRE' && this.onzeAtteint()) {
      this.snack.open(`Déjà ${this.TITULAIRES_MAX} titulaires — libérez une place d'abord`, 'Fermer', { duration: 3000 });
      return;
    }
    this.compo.update(list => list.map(x => x.joueurId === c.joueurId
      ? { ...x, statut, x: statut === 'TITULAIRE' ? (x.x || 0.5) : 0, y: statut === 'TITULAIRE' ? (x.y || 0.5) : 0 }
      : x));
  }

  /** Force blessés au repos et suspendus en suspendu (membres existants ajustés + indispos ajoutés). */
  private placerIndisposAutomatiquement(): void {
    if (!this.modifiable()) return;
    const bl = this.blesses();
    const sus = this.suspendus();
    if (bl.size === 0 && sus.size === 0) return;
    const statutImpose = (id: string): CompoStatut | null =>
      bl.has(id) ? 'REPOS' : sus.has(id) ? 'SUSPENDU' : null;
    this.compo.update(list => {
      const next = list.map(c => {
        const st = statutImpose(c.joueurId);
        return st && c.statut !== st ? { ...c, statut: st, x: 0, y: 0 } : c;
      });
      const present = new Set(next.map(c => c.joueurId));
      for (const j of this.joueurs()) {
        const st = statutImpose(j.id);
        if (st && !present.has(j.id)) {
          next.push({ joueurId: j.id, nom: j.nom, prenom: j.prenom, postePrincipal: j.postePrincipal, x: 0, y: 0, statut: st, consigne: null });
        }
      }
      return next;
    });
  }

  /** Réécrit la position relative [0..1] du jeton après un glisser sur le terrain. */
  onDragEnd(c: CompoItem, ev: CdkDragEnd): void {
    const pitch = this.pitchRef?.nativeElement;
    if (!pitch) return;
    const rect = pitch.getBoundingClientRect();
    const token = (ev.source.element.nativeElement as HTMLElement).getBoundingClientRect();
    const cx = token.left + token.width / 2 - rect.left;
    const cy = token.top + token.height / 2 - rect.top;
    const x = Math.min(1, Math.max(0, cx / rect.width));
    const y = Math.min(1, Math.max(0, cy / rect.height));
    ev.source.reset();
    this.compo.update(list => list.map(item => item.joueurId === c.joueurId ? { ...item, x, y } : item));
  }

  enregistrerCompo(): void {
    const m = this.detail();
    if (!m) return;
    if (!this.confirmerAlignementSanctionnes()) return;
    this.savingCompo.set(true);
    const placements = this.compo().map(c => ({ joueurId: c.joueurId, x: c.x, y: c.y, statut: c.statut, consigne: c.consigne ?? null }));
    this.service.enregistrerCompo(m.id, placements).subscribe({
      next: maj => { this.appliquerDetail(maj); this.savingCompo.set(false); this.snack.open('Compo enregistrée', 'Fermer', { duration: 2000 }); },
      error: () => { this.savingCompo.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── Cumul de cartons : badges, déclaration, garde-fou ───────────────────

  /** L'état disciplinaire d'un joueur, s'il y a quelque chose à signaler. */
  sanctionDe(joueurId: string): EtatSanction | undefined {
    return this.sanctionParJoueur().get(joueurId);
  }

  /** Le badge ne se pose plus une fois la suspension déclarée : elle est déjà prise en compte. */
  alerteSanction(joueurId: string): EtatSanction | undefined {
    const e = this.sanctionDe(joueurId);
    return e && !e.dejaDeclareSuspendu && !this.estSuspendu(joueurId) ? e : undefined;
  }

  /** Ce qu'il reste à traiter : les suspensions déjà déclarées sortent d'elles-mêmes du bandeau. */
  readonly alertesSanction = computed(() => {
    const suspendus = this.suspendus();
    return (this.sanctions()?.joueurs ?? [])
      .filter(e => !e.dejaDeclareSuspendu && !suspendus.has(e.joueurId));
  });

  tonSanction(e: EtatSanction): 'bad' | 'warn' {
    return e.expulse || e.seuilAtteint ? 'bad' : 'warn';
  }

  iconeSanction(e: EtatSanction): string {
    return e.expulse ? 'block' : e.seuilAtteint ? 'gavel' : 'warning';
  }

  /** Joueurs alignés (titulaires ou remplaçants) alors qu'ils sont sous le coup d'une suspension. */
  private alignesSousSanction(): EtatSanction[] {
    return this.compo()
      .filter(c => c.statut === 'TITULAIRE' || c.statut === 'REMPLACANT')
      .map(c => this.alerteSanction(c.joueurId))
      .filter((e): e is EtatSanction => !!e && (e.expulse || e.seuilAtteint));
  }

  /**
   * Second filet, parce qu'un badge s'ignore : au moment d'enregistrer, on nomme les joueurs
   * concernés. Jamais bloquant — la commission peut avoir relaxé, et c'est le staff qui décide.
   */
  private confirmerAlignementSanctionnes(): boolean {
    const alignes = this.alignesSousSanction();
    if (alignes.length === 0) return true;
    const noms = alignes.map(e => `• ${e.prenom ?? ''} ${e.nom ?? ''} — ${e.libelle}`.trim()).join('\n');
    return confirm(
      `${alignes.length === 1 ? 'Un joueur est aligné' : `${alignes.length} joueurs sont alignés`}`
      + ` alors qu'ils sont sous le coup d'une suspension :\n\n${noms}\n\nEnregistrer quand même ?`);
  }

  /** Déclare la suspension suggérée : un clic, sur la case qui existait déjà. */
  declarerSuspendu(joueurId: string): void {
    if (this.estSuspendu(joueurId)) return;
    this.basculerSuspendu(joueurId);
  }

  // ── APRÈS : débrief ──
  enregistrerDebrief(): void {
    const m = this.detail();
    if (!m) return;
    this.savingDebrief.set(true);
    this.service.modifierMatchDebrief(m.id, {
      resultat: this.debriefBuf.resultat || null,
      butsPour: this.butOuNull(this.debriefBuf.butsPour),
      butsContre: this.butOuNull(this.debriefBuf.butsContre),
      notesDebrief: this.debriefBuf.notesDebrief || null,
    }).subscribe({
      next: maj => { this.appliquerDetail(maj); this.savingDebrief.set(false); this.snack.open('Débrief enregistré', 'Fermer', { duration: 2000 }); },
      error: () => { this.savingDebrief.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  /** Un champ vidé vaut « non renseigné », surtout pas zéro : zéro encaissé ferait un clean sheet. */
  private butOuNull(v: number | null | undefined): number | null {
    if (v === null || v === undefined || (v as unknown as string) === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /** Le clean sheet ne se calcule que si l'on sait combien de buts ont été encaissés. */
  cleanSheetIndetermine(): boolean {
    return this.detail()?.butsContre === null || this.detail()?.butsContre === undefined;
  }

  // ── Buteurs plafonnés par le score ──────────────────────────────────────

  butsAttribues(): number {
    return this.feuille().reduce((t, l) => t + (Number(l.buts) || 0), 0);
  }

  /** Le score de l'équipe, quand il est renseigné : au-delà, la saisie n'a plus de sens. */
  butsMax(): number | null {
    const p = this.detail()?.butsPour;
    return p === null || p === undefined ? null : p;
  }

  /**
   * Plafond de CE champ : ce qui reste à attribuer, plus ce que la ligne porte déjà. La somme
   * peut rester inférieure au score — un but contre son camp adverse n'a pas de buteur chez nous.
   */
  butsMaxLigne(l: FeuilleLigne): number | null {
    const max = this.butsMax();
    if (max === null) return null;
    return Math.max(0, max - this.butsAttribues() + (Number(l.buts) || 0));
  }

  butsDepasses(): boolean {
    const max = this.butsMax();
    return max !== null && this.butsAttribues() > max;
  }

  /** Ramène la saisie sous le plafond dès la frappe, plutôt qu'au refus du serveur. */
  majButs(l: FeuilleLigne): void {
    const plafond = this.butsMaxLigne(l);
    if (plafond !== null && (Number(l.buts) || 0) > plafond) l.buts = plafond;
  }

  // ── APRÈS : session GPS ──
  changerSession(sessionGpsId: string): void {
    const m = this.detail();
    if (!m) return;
    this.service.definirSessionGps(m.id, sessionGpsId || null).subscribe({
      next: maj => { this.appliquerDetail(maj); },
      error: () => this.snack.open('Liaison impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Attache un profil de règles adverses (moteur tactique) au match. */
  changerProfilAdverse(profilAdverseId: string): void {
    const m = this.detail();
    if (!m) return;
    this.service.definirProfilAdverse(m.id, profilAdverseId || null).subscribe({
      next: maj => { this.appliquerDetail(maj); },
      error: () => this.snack.open('Liaison du profil impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private rafraichirCharge(id: string): void {
    this.service.chargeGps(id).subscribe({ next: c => this.charge.set(c), error: () => this.charge.set([]) });
  }
}
