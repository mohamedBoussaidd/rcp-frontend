import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';
import {
  ChargeJoueur, CompoItem, CompoStatut, JoueurCompoStats, MatchDetail, MatchResume,
  SchemaMatch, SessionGpsOption, Surveille, SurveilleCible, TechniqueService,
} from '@core/services/technique.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
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

  @ViewChild('pitch') pitchRef?: ElementRef<HTMLDivElement>;

  // ── État liste ──
  matchs = signal<MatchResume[]>([]);
  loading = signal(true);
  pasDEquipe = signal(false);

  showCreate = signal(false);
  createForm = { adversaire: '', dateMatch: '', competition: '', domicile: true };
  saving = signal(false);

  // Stats compo (apparitions par statut, sur tous les matchs de l'équipe)
  showStats = signal(false);
  stats = signal<JoueurCompoStats[]>([]);

  // ── État détail ──
  detail = signal<MatchDetail | null>(null);
  onglet = signal<'avant' | 'apres'>('avant');
  modifiable = computed(() => this.detail()?.modifiable ?? false);

  infosBuf = {
    adversaire: '', dateMatch: '', heureMatch: '', competition: '', domicile: true, consignes: '',
    lieuRdv: '', heureRdv: '', couleurMaillot: '', infosLogistiques: '',
  };
  debriefBuf = { resultat: '', score: '', notesDebrief: '' };
  savingInfos = signal(false);
  savingDebrief = signal(false);

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
      this.createForm = { adversaire: '', dateMatch: new Date().toISOString().slice(0, 10), competition: '', domicile: true };
    }
  }

  creer(): void {
    if (!this.createForm.adversaire.trim()) return;
    this.saving.set(true);
    this.service.creerMatch({
      adversaire: this.createForm.adversaire.trim(),
      dateMatch: this.createForm.dateMatch || null,
      competition: this.createForm.competition || null,
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
      js: this.joueurService.getAll(),
    }).subscribe({
      next: ({ m, js }) => {
        this.joueurs.set(js);          // alimente `blesses` (computed) avant placement
        this.appliquerDetail(m);
        this.placerIndisposAutomatiquement();
      },
      error: () => this.snack.open('Match introuvable', 'Fermer', { duration: 3000 }),
    });
    this.service.sessionsGps().subscribe({ next: s => this.sessions.set(s), error: () => {} });
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
      competition: m.competition ?? '', domicile: m.domicile, consignes: m.consignes ?? '',
      lieuRdv: m.lieuRdv ?? '', heureRdv: m.heureRdv ?? '',
      couleurMaillot: m.couleurMaillot ?? '', infosLogistiques: m.infosLogistiques ?? '',
    };
    this.debriefBuf = { resultat: m.resultat ?? '', score: m.score ?? '', notesDebrief: m.notesDebrief ?? '' };
    if (m.sessionGpsId) { this.rafraichirCharge(m.id); } else { this.charge.set([]); }
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
      domicile: this.infosBuf.domicile,
      consignes: this.infosBuf.consignes || null,
      lieuRdv: this.infosBuf.lieuRdv || null,
      heureRdv: this.infosBuf.heureRdv || null,
      couleurMaillot: this.infosBuf.couleurMaillot || null,
      infosLogistiques: this.infosBuf.infosLogistiques || null,
    }).subscribe({
      next: maj => { this.detail.set(maj); this.savingInfos.set(false); this.snack.open('Infos enregistrées', 'Fermer', { duration: 2000 }); },
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
    this.savingCompo.set(true);
    const placements = this.compo().map(c => ({ joueurId: c.joueurId, x: c.x, y: c.y, statut: c.statut, consigne: c.consigne ?? null }));
    this.service.enregistrerCompo(m.id, placements).subscribe({
      next: maj => { this.appliquerDetail(maj); this.savingCompo.set(false); this.snack.open('Compo enregistrée', 'Fermer', { duration: 2000 }); },
      error: () => { this.savingCompo.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── APRÈS : débrief ──
  enregistrerDebrief(): void {
    const m = this.detail();
    if (!m) return;
    this.savingDebrief.set(true);
    this.service.modifierMatchDebrief(m.id, {
      resultat: this.debriefBuf.resultat || null,
      score: this.debriefBuf.score || null,
      notesDebrief: this.debriefBuf.notesDebrief || null,
    }).subscribe({
      next: maj => { this.detail.set(maj); this.savingDebrief.set(false); this.snack.open('Débrief enregistré', 'Fermer', { duration: 2000 }); },
      error: () => { this.savingDebrief.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
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

  private rafraichirCharge(id: string): void {
    this.service.chargeGps(id).subscribe({ next: c => this.charge.set(c), error: () => this.charge.set([]) });
  }
}
