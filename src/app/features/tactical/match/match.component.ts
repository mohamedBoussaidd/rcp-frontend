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

  infosBuf = { adversaire: '', dateMatch: '', competition: '', domicile: true, consignes: '' };
  debriefBuf = { resultat: '', score: '', notesDebrief: '' };
  savingInfos = signal(false);
  savingDebrief = signal(false);

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
        this.placerBlessesAuRepos();
      },
      error: () => this.snack.open('Match introuvable', 'Fermer', { duration: 3000 }),
    });
    this.service.sessionsGps().subscribe({ next: s => this.sessions.set(s), error: () => {} });
  }

  private appliquerDetail(m: MatchDetail): void {
    this.detail.set(m);
    this.compo.set([...m.compo]);
    this.infosBuf = {
      adversaire: m.adversaire, dateMatch: m.dateMatch ?? '',
      competition: m.competition ?? '', domicile: m.domicile, consignes: m.consignes ?? '',
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
      competition: this.infosBuf.competition || null,
      domicile: this.infosBuf.domicile,
      consignes: this.infosBuf.consignes || null,
    }).subscribe({
      next: maj => { this.detail.set(maj); this.savingInfos.set(false); this.snack.open('Infos enregistrées', 'Fermer', { duration: 2000 }); },
      error: () => { this.savingInfos.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
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
    // Un joueur blessé est forcément au repos.
    const eff: CompoStatut = this.estBlesse(j.id) ? 'REPOS' : statut;
    const item: CompoItem = {
      joueurId: j.id, nom: j.nom, prenom: j.prenom, postePrincipal: j.postePrincipal,
      x: eff === 'TITULAIRE' ? 0.5 : 0, y: eff === 'TITULAIRE' ? 0.5 : 0, statut: eff,
    };
    this.compo.update(list => [...list, item]);
  }
  retirerCompo(joueurId: string): void {
    this.compo.update(list => list.filter(c => c.joueurId !== joueurId));
  }
  changerStatut(c: CompoItem, statut: CompoStatut): void {
    if (this.estBlesse(c.joueurId)) return;  // blessé → repos imposé
    this.compo.update(list => list.map(x => x.joueurId === c.joueurId
      ? { ...x, statut, x: statut === 'TITULAIRE' ? (x.x || 0.5) : 0, y: statut === 'TITULAIRE' ? (x.y || 0.5) : 0 }
      : x));
  }

  /** Place automatiquement tout joueur blessé au repos (membres existants forcés + blessés ajoutés). */
  private placerBlessesAuRepos(): void {
    if (!this.modifiable()) return;
    const bl = this.blesses();
    if (bl.size === 0) return;
    this.compo.update(list => {
      const next = list.map(c => bl.has(c.joueurId) && c.statut !== 'REPOS'
        ? { ...c, statut: 'REPOS' as CompoStatut, x: 0, y: 0 } : c);
      const present = new Set(next.map(c => c.joueurId));
      for (const j of this.joueurs()) {
        if (bl.has(j.id) && !present.has(j.id)) {
          next.push({ joueurId: j.id, nom: j.nom, prenom: j.prenom, postePrincipal: j.postePrincipal, x: 0, y: 0, statut: 'REPOS' });
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
    const placements = this.compo().map(c => ({ joueurId: c.joueurId, x: c.x, y: c.y, statut: c.statut }));
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
