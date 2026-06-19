import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '@core/services/auth.service';
import { EspaceJoueurService } from '@core/services/espace-joueur.service';
import { SuiviSubjectifService, Wellness, Rpe } from '@core/services/suivi-subjectif.service';
import { Conseil, ConseilRequest, ConseilService } from '@core/services/conseil.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { Seance } from '@core/services/seance.service';

/** Item de l'indice de Hooper. Échelle 1..5, sens « 1 = bon → 5 = mauvais » (Hooper standard). */
interface HooperItem {
  key: 'fatigue' | 'sommeil' | 'stress' | 'douleur' | 'humeur';
  label: string;
  bas: string;   // sens de la valeur 1
  haut: string;  // sens de la valeur 5
}

/** Point du graphe 7 jours : barre Hooper (/25) + point RPE (/10). */
interface JourSerie {
  date: string;
  jour: string;        // libellé court (Lun, Mar…)
  hooper: number | null;
  rpe: number | null;
  aujourdhui: boolean;
}

/** Ligne de la vue équipe (lecture staff). */
interface LigneEquipe {
  joueurId: string;
  nom: string;
  prenom: string;
  poste?: string;
  hooper: number | null;
  rpe: number | null;
  charge: number | null;
  gene: boolean;
  remplitAuj: boolean;
  derniere: string | null;
}

/** Icônes proposées pour un conseil (clé stockée + icône Material). */
const ICONES_CONSEIL: { key: string; label: string; icon: string }[] = [
  { key: 'HYDRATATION', label: 'Hydratation', icon: 'water_drop' },
  { key: 'SOMMEIL',     label: 'Sommeil',     icon: 'bedtime' },
  { key: 'MOBILITE',    label: 'Mobilité',    icon: 'self_improvement' },
  { key: 'NUTRITION',   label: 'Nutrition',   icon: 'restaurant' },
  { key: 'RECUP',       label: 'Récupération', icon: 'spa' },
  { key: 'ALERTE',      label: 'Vigilance',   icon: 'priority_high' },
  { key: 'GENERAL',     label: 'Général',     icon: 'lightbulb' },
];

@Component({
  selector: 'app-suivi-subjectif',
  standalone: true,
  templateUrl: './suivi-subjectif.component.html',
  styleUrl: './suivi-subjectif.component.scss',
  imports: [DatePipe, DecimalPipe, NgTemplateOutlet, FormsModule, MatIcon],
})
export class SuiviSubjectifComponent implements OnInit {

  readonly today = new Date();

  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private espace = inject(EspaceJoueurService);
  private suivi = inject(SuiviSubjectifService);
  private conseilService = inject(ConseilService);
  private joueurService = inject(JoueurService);

  /** Fenêtre d'historique (jours) : 7 ou 14, au choix. */
  fenetreJours = signal<7 | 14>(7);
  /** Tri « non-remplis aujourd'hui en tête » de la vue équipe (déclenché via ?focus=non-remplis). */
  triNonRemplis = signal(false);

  // ── Rôle ──
  readonly isJoueur = this.auth.hasRole('JOUEUR');
  readonly isStaff = !this.isJoueur;
  // Getter (et non champ figé) : les permissions sont chargées en async après le boot.
  get peutEditerConseils(): boolean { return this.auth.canEditerConseils(); }

  readonly NOTES_HOOPER = [1, 2, 3, 4, 5];
  readonly NOTES_RPE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly ICONES = ICONES_CONSEIL;
  readonly HOOPER_ITEMS: HooperItem[] = [
    { key: 'fatigue', label: 'Fatigue générale',   bas: 'Très frais',  haut: 'Épuisé' },
    { key: 'sommeil', label: 'Qualité du sommeil', bas: 'Excellente',  haut: 'Très mauvaise' },
    { key: 'stress',  label: 'Stress',             bas: 'Aucun',       haut: 'Important' },
    { key: 'douleur', label: 'Douleurs musculaires', bas: 'Aucune',    haut: 'Très marquées' },
    { key: 'humeur',  label: 'Humeur',             bas: 'Excellente',  haut: 'Très mauvaise' },
  ];

  // ── État commun ──
  loading = signal(true);
  nonLie = signal(false);
  wellness = signal<Wellness[]>([]);
  rpe = signal<Rpe[]>([]);
  conseils = signal<Conseil[]>([]);

  // ── Joueur ──
  profil = signal<Joueur | null>(null);
  seances = signal<Seance[]>([]);

  // ── Staff ──
  joueurs = signal<Joueur[]>([]);
  selectedJoueurId = signal<string>('');   // '' = toute l'équipe

  readonly modeEquipe = computed(() => this.isStaff && !this.selectedJoueurId());

  /** Joueur affiché en vue détaillée (lecture staff ou édition joueur). */
  readonly joueurCourant = computed<{ id: string; nom: string; prenom: string; poste?: string } | null>(() => {
    if (this.isJoueur) {
      const p = this.profil();
      return p ? { id: p.id, nom: p.nom, prenom: p.prenom, poste: p.postePrincipal } : null;
    }
    const id = this.selectedJoueurId();
    if (!id) return null;
    const j = this.joueurs().find(x => x.id === id);
    return j ? { id: j.id, nom: j.nom, prenom: j.prenom, poste: j.postePrincipal } : null;
  });

  // ── Formulaire wellness (joueur) ──
  wForm = signal<Record<HooperItem['key'], number>>({ fatigue: 3, sommeil: 3, stress: 3, douleur: 3, humeur: 3 });
  commentaire = signal('');
  wEnvoi = signal(false);

  // Gêne (optionnelle, repliée par défaut)
  readonly ZONES_GENE = ['ischio_jambiers', 'quadriceps', 'mollet', 'cheville', 'genou', 'hanche', 'dos', 'epaule', 'adducteurs', 'autre'];
  readonly MOMENTS_GENE: { val: string; label: string }[] = [
    { val: 'EFFORT', label: "À l'effort" }, { val: 'APRES', label: 'Juste après' }, { val: 'REPOS', label: 'Au repos' },
  ];
  geneActive = signal(false);
  gForm = signal<{ zone: string; intensite: number; moment: string }>({ zone: 'cheville', intensite: 2, moment: 'EFFORT' });

  geneEnvoi = signal(false);

  // ── Formulaire sRPE (joueur) ──
  rpeSeanceId = signal<string>('');
  rpeIntensite = signal<number>(0);
  rpeDuree = signal<number | null>(null);
  rpeEnvoi = signal(false);

  readonly chargeCalculee = computed(() => {
    const i = this.rpeIntensite();
    const d = this.rpeDuree();
    return i > 0 && d ? i * d : null;
  });

  // ── Conseils (édition staff) ──
  conseilFormOuvert = signal(false);
  conseilEditId = signal<string | null>(null);
  cForm = signal<{ titre: string; texte: string; icone: string; cibleEquipe: boolean }>(
    { titre: '', texte: '', icone: 'GENERAL', cibleEquipe: true });
  cEnvoi = signal(false);

  ngOnInit(): void {
    if (this.isJoueur) {
      this.espace.getProfil().subscribe({
        next: p => { this.profil.set(p); this.loading.set(false); this.prefillForm(); },
        error: err => { this.loading.set(false); if (err.status === 409) this.nonLie.set(true); },
      });
      this.espace.getWellness().subscribe({ next: d => { this.wellness.set(d); this.prefillForm(); }, error: () => {} });
      this.espace.getRpe().subscribe({ next: d => this.rpe.set(d), error: () => {} });
      this.espace.getSeances().subscribe({ next: d => this.seances.set(d), error: () => {} });
      this.espace.getConseils().subscribe({ next: d => this.conseils.set(d), error: () => {} });
    } else {
      this.triNonRemplis.set(this.route.snapshot.queryParamMap.get('focus') === 'non-remplis');
      this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
      this.chargerStaff();
    }
  }

  setFenetre(n: 7 | 14): void { this.fenetreJours.set(n); }

  // ──────────────────────────── Chargement staff ────────────────────────────

  chargerStaff(): void {
    this.loading.set(true);
    const id = this.selectedJoueurId() || undefined;
    this.suivi.getWellness(id).subscribe({ next: d => { this.wellness.set(d); this.loading.set(false); }, error: () => this.loading.set(false) });
    this.suivi.getRpe(id).subscribe({ next: d => this.rpe.set(d), error: () => {} });
    this.conseilService.getConseils(id).subscribe({ next: d => this.conseils.set(d), error: () => {} });
  }

  onSelectJoueur(id: string): void {
    this.selectedJoueurId.set(id);
    this.conseilFormOuvert.set(false);
    this.chargerStaff();
  }

  // ──────────────────────────── Calculs Hooper / série ────────────────────────────

  hooperTotal(w: Wellness): number {
    return w.sommeil + w.fatigue + w.douleur + w.stress + w.humeur;
  }

  /** Saisie wellness la plus récente du joueur courant (vue détaillée). */
  readonly wellnessCourant = computed<Wellness | null>(() => {
    const rows = [...this.wellness()].sort((a, b) => b.date.localeCompare(a.date));
    return rows[0] ?? null;
  });

  readonly totalCourant = computed(() => {
    const w = this.wellnessCourant();
    return w ? this.hooperTotal(w) : null;
  });

  /** Saisie wellness d'aujourd'hui (joueur connecté) — une seule par jour. */
  readonly wellnessDuJour = computed<Wellness | null>(() => {
    const auj = this.dateISO(new Date());
    return this.wellness().find(w => w.date === auj) ?? null;
  });
  /** Le wellness du jour a déjà été validé : le Hooper se verrouille. */
  readonly dejaValide = computed(() => !!this.wellnessDuJour());

  /** RPE le plus récent du joueur courant (affichage lecture sRPE). */
  readonly rpeCourant = computed<Rpe | null>(() => {
    const rows = [...this.rpe()].sort((a, b) => b.date.localeCompare(a.date));
    return rows[0] ?? null;
  });

  /** Valeur affichée d'un item : le brouillon en édition joueur, sinon la dernière saisie. */
  valeurItem(key: HooperItem['key']): number | null {
    if (this.isJoueur) return this.wForm()[key];
    const w = this.wellnessCourant();
    return w ? w[key] : null;
  }

  /** Badge d'état global d'après le total Hooper (5..25, plus bas = mieux). */
  readonly etatBadge = computed<{ label: string; classe: string } | null>(() => {
    const t = this.totalCourant();
    if (t == null) return null;
    if (t <= 11) return { label: 'Bon état général', classe: 'ok' };
    if (t <= 17) return { label: 'État correct', classe: 'moyen' };
    return { label: 'Vigilance', classe: 'bad' };
  });

  /** Série des N derniers jours (7 ou 14) pour le joueur courant : barre Hooper + point RPE. */
  readonly serie7j = computed<JourSerie[]>(() => {
    const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const auj = this.dateISO(new Date());
    const wByDate = new Map(this.wellness().map(w => [w.date, w]));
    const rpeByDate = new Map<string, number>();
    for (const r of this.rpe()) {
      rpeByDate.set(r.date, Math.max(rpeByDate.get(r.date) ?? 0, r.rpe));
    }
    const out: JourSerie[] = [];
    for (let i = this.fenetreJours() - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = this.dateISO(d);
      const w = wByDate.get(iso);
      out.push({
        date: iso,
        jour: jours[d.getDay()],
        hooper: w ? this.hooperTotal(w) : null,
        rpe: rpeByDate.get(iso) ?? null,
        aujourdhui: iso === auj,
      });
    }
    return out;
  });

  /**
   * Points de la courbe (polyline SVG, repère 0..100 × 0..100) reliant le SOMMET
   * de la barre Hooper de chaque jour rempli. La valeur RPE est affichée sur le point.
   */
  readonly rpeCourbe = computed(() => {
    const n = this.serie7j().length || 1;
    return this.serie7j()
      .map((d, i) => d.hooper != null ? `${((i + 0.5) / n * 100).toFixed(2)},${(100 - this.barH(d.hooper)).toFixed(2)}` : null)
      .filter((p): p is string => p !== null)
      .join(' ');
  });

  readonly hooperMoyen = computed(() => {
    const vals = this.serie7j().map(j => j.hooper).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  /** Charge cumulée sur les 7 derniers jours (somme des charges sRPE). */
  readonly chargeCumulee = computed(() => {
    const limite = this.dateISO(new Date(Date.now() - (this.fenetreJours() - 1) * 86400000));
    return this.rpe()
      .filter(r => r.date >= limite && r.charge != null)
      .reduce((tot, r) => tot + (r.charge ?? 0), 0);
  });

  readonly joursRemplis = computed(() => this.serie7j().filter(j => j.hooper != null).length);

  /** Hauteur de barre Hooper en % (max 25). */
  barH(v: number | null): number { return v == null ? 0 : Math.round(v / 25 * 100); }
  /** Position verticale du point RPE en % (0 en bas, max 10). */
  pointRpe(v: number | null): number { return v == null ? 0 : Math.round((1 - v / 10) * 100); }

  hooperBarClasse(v: number | null): string {
    if (v == null) return '';
    if (v <= 11) return 'ok';
    if (v <= 17) return 'moyen';
    return 'bad';
  }

  // ──────────────────────────── Vue équipe (staff) ────────────────────────────

  readonly lignesEquipe = computed<LigneEquipe[]>(() => {
    const auj = this.dateISO(new Date());
    const limite = this.dateISO(new Date(Date.now() - 6 * 86400000));
    return this.joueurs().map(j => {
      const wRows = this.wellness().filter(w => w.joueurId === j.id).sort((a, b) => b.date.localeCompare(a.date));
      const rRows = this.rpe().filter(r => r.joueurId === j.id).sort((a, b) => b.date.localeCompare(a.date));
      const latest = wRows[0] ?? null;
      const latestRpe = rRows[0] ?? null;
      return {
        joueurId: j.id,
        nom: j.nom,
        prenom: j.prenom,
        poste: j.postePrincipal,
        hooper: latest ? this.hooperTotal(latest) : null,
        rpe: latestRpe ? latestRpe.rpe : null,
        charge: latestRpe ? (latestRpe.charge ?? null) : null,
        gene: wRows.some(w => w.geneZone && !w.geneTraitee && w.date >= limite),
        remplitAuj: latest?.date === auj,
        derniere: latest?.date ?? null,
      };
    }).sort((a, b) => {
      // Option : non-remplis du jour en tête (depuis le dashboard via ?focus=non-remplis).
      if (this.triNonRemplis() && a.remplitAuj !== b.remplitAuj) return a.remplitAuj ? 1 : -1;
      return a.nom.localeCompare(b.nom);
    });
  });

  readonly moyenneEquipe = computed(() => {
    const lignes = this.lignesEquipe();
    const hoopers = lignes.map(l => l.hooper).filter((v): v is number => v != null);
    const charges = lignes.map(l => l.charge).filter((v): v is number => v != null);
    const total = lignes.length;
    return {
      hooper: hoopers.length ? hoopers.reduce((a, b) => a + b, 0) / hoopers.length : null,
      charge: charges.length ? charges.reduce((a, b) => a + b, 0) / charges.length : null,
      remplisAuj: lignes.filter(l => l.remplitAuj).length,
      total,
      pctRemplis: total ? Math.round(lignes.filter(l => l.remplitAuj).length / total * 100) : 0,
      nbGenes: lignes.filter(l => l.gene).length,
    };
  });

  // ──────────────────────────── Conseils ────────────────────────────

  readonly conseilsEquipe = computed(() => this.conseils().filter(c => c.equipe));
  readonly conseilsPerso = computed(() => this.conseils().filter(c => !c.equipe));

  iconeOf(key?: string | null): string {
    return this.ICONES.find(i => i.key === key)?.icon ?? 'lightbulb';
  }

  ouvrirConseil(c?: Conseil): void {
    if (c) {
      this.conseilEditId.set(c.id);
      this.cForm.set({ titre: c.titre, texte: c.texte, icone: c.icone ?? 'GENERAL', cibleEquipe: c.equipe });
    } else {
      this.conseilEditId.set(null);
      // En vue 1 joueur, par défaut le conseil cible ce joueur ; en vue équipe, l'équipe.
      this.cForm.set({ titre: '', texte: '', icone: 'GENERAL', cibleEquipe: this.modeEquipe() });
    }
    this.conseilFormOuvert.set(true);
  }
  annulerConseil(): void { this.conseilFormOuvert.set(false); this.conseilEditId.set(null); }

  setCForm(key: 'titre' | 'texte' | 'icone' | 'cibleEquipe', val: string | boolean): void {
    this.cForm.update(f => ({ ...f, [key]: val }));
  }

  enregistrerConseil(): void {
    const f = this.cForm();
    if (!f.titre.trim() || !f.texte.trim()) return;
    const cible = this.joueurCourant();
    const req: ConseilRequest = {
      joueurId: f.cibleEquipe ? null : (cible?.id ?? null),
      titre: f.titre.trim(),
      texte: f.texte.trim(),
      icone: f.icone,
    };
    this.cEnvoi.set(true);
    const id = this.conseilEditId();
    const obs = id ? this.conseilService.modifier(id, req) : this.conseilService.creer(req);
    obs.subscribe({
      next: c => {
        this.conseils.update(list => id ? list.map(x => x.id === id ? c : x) : [c, ...list]);
        this.cEnvoi.set(false);
        this.conseilFormOuvert.set(false);
        this.conseilEditId.set(null);
      },
      error: () => this.cEnvoi.set(false),
    });
  }

  supprimerConseil(c: Conseil): void {
    if (!confirm(`Supprimer le conseil « ${c.titre} » ?`)) return;
    this.conseilService.supprimer(c.id).subscribe({
      next: () => this.conseils.update(list => list.filter(x => x.id !== c.id)),
      error: () => {},
    });
  }

  // ──────────────────────────── Saisie joueur ────────────────────────────

  /** Pré-remplit le formulaire depuis la saisie du jour si elle existe. */
  private prefillForm(): void {
    const auj = this.dateISO(new Date());
    const w = this.wellness().find(x => x.date === auj);
    if (!w) return;
    this.wForm.set({ fatigue: w.fatigue, sommeil: w.sommeil, stress: w.stress, douleur: w.douleur, humeur: w.humeur });
    this.commentaire.set(w.commentaire ?? '');
    this.geneActive.set(!!w.geneZone);
    if (w.geneZone) this.gForm.set({ zone: w.geneZone, intensite: w.geneIntensite ?? 2, moment: w.geneMoment ?? 'EFFORT' });
  }

  setW(key: HooperItem['key'], val: number): void {
    this.wForm.update(f => ({ ...f, [key]: val }));
  }
  setG(key: 'zone' | 'intensite' | 'moment', val: string | number): void {
    this.gForm.update(f => ({ ...f, [key]: val }));
  }

  /** Séances passées (≤14 j) non encore notées par le joueur, pour le sélecteur sRPE. */
  readonly seancesANoter = computed(() => {
    const auj = this.dateISO(new Date());
    const limite = this.dateISO(new Date(Date.now() - 14 * 86400000));
    const notes = new Set(this.rpe().map(r => r.seanceId));
    return this.seances()
      .filter(s => s.statut !== 'ANNULEE' && s.date <= auj && s.date >= limite && !notes.has(s.id))
      .map(s => ({ id: s.id, date: s.date, titre: s.titre || s.typeSeance?.libelle || 'Séance', duree: s.dureeMinutes }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  onSelectSeance(id: string): void {
    this.rpeSeanceId.set(id);
    const s = this.seancesANoter().find(x => x.id === id);
    if (s?.duree) this.rpeDuree.set(s.duree);
  }

  /**
   * Enregistre le wellness du jour (POST upsert joueur+date). Sert à la fois à la
   * première validation (Hooper + gêne) et à la mise à jour de la gêne en cours de
   * journée — dans ce dernier cas le Hooper est verrouillé donc inchangé.
   */
  private postWellness(termine: () => void): void {
    const f = this.wForm();
    const g = this.geneActive() ? this.gForm() : null;
    this.espace.saisirWellness({
      ...f,
      commentaire: this.commentaire(),
      geneZone: g ? g.zone : null,
      geneIntensite: g ? g.intensite : null,
      geneMoment: g ? g.moment : null,
    }).subscribe({
      next: w => { this.wellness.update(list => [w, ...list.filter(x => x.date !== w.date)]); termine(); },
      error: () => termine(),
    });
  }

  /** Première validation du jour : Hooper + gêne. Bloquée si déjà validé. */
  validerWellness(): void {
    if (!this.isJoueur || this.dejaValide()) return;
    this.wEnvoi.set(true);
    this.postWellness(() => this.wEnvoi.set(false));
  }

  /** Met à jour la gêne en cours de journée (Hooper déjà validé, conservé tel quel). */
  enregistrerGene(): void {
    if (!this.isJoueur) return;
    this.geneEnvoi.set(true);
    this.postWellness(() => this.geneEnvoi.set(false));
  }

  /** Enregistre le sRPE de la séance sélectionnée (indépendant du wellness). */
  enregistrerRpe(): void {
    if (!this.isJoueur) return;
    const seanceId = this.rpeSeanceId();
    const intensite = this.rpeIntensite();
    if (!seanceId || intensite <= 0) return;
    this.rpeEnvoi.set(true);
    this.espace.saisirRpe({ seanceId, seanceType: 'PHYSIQUE', rpe: intensite, dureeMinutes: this.rpeDuree() ?? undefined }).subscribe({
      next: r => {
        this.rpe.update(list => [r, ...list.filter(x => x.seanceId !== r.seanceId)]);
        this.rpeSeanceId.set(''); this.rpeIntensite.set(0); this.rpeDuree.set(null);
        this.rpeEnvoi.set(false);
      },
      error: () => this.rpeEnvoi.set(false),
    });
  }

  // ──────────────────────────── Utilitaires ────────────────────────────

  private dateISO(d: Date): string {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  joli(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }
  initiales(prenom?: string, nom?: string): string {
    return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '?';
  }
}
