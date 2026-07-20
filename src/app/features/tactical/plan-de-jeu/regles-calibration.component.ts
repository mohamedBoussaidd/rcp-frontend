import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import Konva from 'konva';
import { AuthService } from '@core/services/auth.service';
import {
  RegleTactiqueDetail, RegleTactiqueResume, ReglesTactiquesService,
} from '@core/services/regles-tactiques.service';
import { SchemaTerrainRenderer } from '../schema-editor/schema-terrain.renderer';
import { jetonChip } from '../schema-render/schema-render';
import {
  GRILLE_C, GRILLE_H, PHASES, PhaseKey, Posture, ReglesJson, SYSTEMES,
  centreZone, ciblesPhase, miroir, nbZonesCalibrees, parseRegles, postureParDefaut,
  pxVersRel, reglesVierges, relVersPx, zoneKey,
} from '../moteur/moteur-tactique';

/**
 * Calibration des règles du moteur tactique (onglet « Règles de jeu » du Plan de jeu).
 * Le coach choisit un jeu (NOUS par système, ou profil ADVERSAIRE), une phase et une zone
 * de ballon, puis place ses 11 slots sur le terrain : chaque glisser enregistre la posture
 * de la zone (PUT débouncé). Le mode « Tester » fait glisser un ballon pour visualiser
 * l'interpolation en continu.
 */
@Component({
  selector: 'app-regles-calibration',
  standalone: true,
  imports: [FormsModule, MatIcon],
  template: `
  <div class="cal">

    <!-- ── Barre jeu de règles ── -->
    <div class="cal-bar card">
      <div class="cal-bar__left">
        <span class="cal-label">Jeu de règles</span>
        <select class="input cal-select" [ngModel]="jeuActif()?.id ?? ''" (ngModelChange)="choisirJeu($event)">
          <option value="" disabled>— Choisir —</option>
          @for (j of jeux(); track j.id) {
            <option [value]="j.id">{{ j.type === 'NOUS' ? 'Nous · ' + j.systeme : 'Adversaire · ' + j.nom }}</option>
          }
        </select>
        @if (jeuActif(); as j) {
          <span class="badge" [class.badge--nous]="j.type === 'NOUS'" [class.badge--adv]="j.type === 'ADVERSAIRE'">
            {{ j.type === 'NOUS' ? 'Notre identité' : 'Profil adverse' }} · {{ j.systeme }}
          </span>
        }
      </div>
      @if (peutEcrire) {
        <div class="cal-bar__actions">
          <button class="btn btn--secondary btn--sm" (click)="creation.set(!creation())"><mat-icon>add</mat-icon>Nouveau</button>
          @if (jeuActif()) {
            <button class="btn btn--secondary btn--sm" (click)="renommer()" title="Renommer"><mat-icon>edit</mat-icon></button>
            <button class="btn btn--danger btn--sm" (click)="supprimer()" title="Supprimer ce jeu de règles"><mat-icon>delete_outline</mat-icon></button>
          }
          @if (saving()) { <span class="cal-save">Enregistrement…</span> }
          @else if (savedAt()) { <span class="cal-save ok">✓ Enregistré</span> }
        </div>
      }
    </div>

    <!-- ── Création ── -->
    @if (creation()) {
      <div class="card cal-new">
        <div class="cal-new__row">
          <span class="segmented">
            <button [class.is-active]="formType() === 'NOUS'" (click)="formType.set('NOUS')">Nous</button>
            <button [class.is-active]="formType() === 'ADVERSAIRE'" (click)="formType.set('ADVERSAIRE')">Adversaire</button>
          </span>
          <select class="input cal-select" [(ngModel)]="formSysteme" name="sys">
            @for (s of systemes; track s) { <option [value]="s">{{ s }}</option> }
          </select>
          @if (formType() === 'ADVERSAIRE') {
            <input class="input" style="min-width:180px" [(ngModel)]="formNom" name="nom" placeholder="Nom du profil (ex. Bloc bas, FC X…)">
            @if (jeuNousPourSysteme()) {
              <label class="cal-check"><input type="checkbox" [(ngModel)]="formMiroir" name="mir"> Partir du miroir de notre jeu ({{ formSysteme }})</label>
            }
          }
          <button class="btn btn--primary btn--sm" [disabled]="formType() === 'ADVERSAIRE' && !formNom.trim()" (click)="creer()">Créer</button>
          <button class="btn btn--ghost btn--sm" (click)="creation.set(false)">Annuler</button>
        </div>
        <p class="cal-aide">« Nous » = l'identité de l'équipe pour un système (un seul jeu par système). « Adversaire » = profil réutilisable, attachable à un match.</p>
      </div>
    }

    @if (!jeuActif()) {
      <div class="card card--padded"><div class="empty-state">
        @if (jeux().length === 0) { Aucun jeu de règles pour cette équipe. {{ peutEcrire ? 'Crée le premier avec « Nouveau ».' : '' }} }
        @else { Choisis un jeu de règles pour commencer. }
      </div></div>
    } @else {

      <!-- ── Phases + grille de zones ── -->
      <div class="cal-main">
        <div class="cal-side card">
          <div class="cal-howto">
            <b>Comment ça marche</b>
            <ol>
              <li>Choisis une <b>phase</b> puis une <b>zone du ballon</b> dans la grille.</li>
              <li>Place tes 11 jetons : c'est ta posture d'équipe quand le ballon est dans cette zone (chaque déplacement l'enregistre).</li>
              <li>Répète sur quelques zones clés — le moteur <b>interpole</b> tout le reste. Vérifie avec « Tester ».</li>
            </ol>
            <span class="cal-howto__sens">Le terrain est toujours affiché dans <b>notre sens</b> : nous attaquons vers la droite, l'adversaire attaque vers la gauche (il défend le but de droite).</span>
          </div>

          <div class="cal-side__titre">Phase de jeu</div>
          <div class="cal-phases">
            @for (p of phases; track p.key) {
              <button class="cal-phase" [class.on]="phase() === p.key" (click)="changerPhase(p.key)" [title]="p.label">
                <span>{{ p.court }}</span>
                <b>{{ compte(p.key) }}/12</b>
              </button>
            }
          </div>

          <div class="cal-side__titre">Zone du ballon <span class="cal-hint">(terrain dans notre sens)</span></div>
          <div class="cal-grid">
            @for (c of couloirs; track c) {
              <div class="cal-grid__row">
                @for (h of hauteurs; track h) {
                  <button class="cal-cell"
                          [class.done]="estCalibree(h, c)"
                          [class.on]="zone().h === h && zone().c === c"
                          (click)="choisirZone(h, c)"
                          [title]="'Zone ' + (h + 1) + '·' + (c + 1) + (estCalibree(h, c) ? ' — calibrée' : '')"></button>
                }
              </div>
            }
          </div>
          <p class="cal-aide">Zone verte = posture calibrée. Clique une zone puis place les jetons : chaque déplacement enregistre la posture.</p>

          @if (peutEcrire) {
            <div class="cal-side__titre">Actions sur la zone</div>
            <div class="cal-actions">
              <button class="btn btn--secondary btn--sm" (click)="calibrerZone()" [disabled]="testMode()">
                <mat-icon>check</mat-icon>{{ estCalibree(zone().h, zone().c) ? 'Ré-enregistrer la posture' : 'Calibrer avec cette posture' }}
              </button>
              <button class="btn btn--secondary btn--sm" (click)="symetrie()" [disabled]="testMode()" title="Copie cette posture, retournée gauche/droite, dans la zone symétrique">
                <mat-icon>flip</mat-icon>Symétrie G/D
              </button>
              <div class="cal-inline">
                <select class="input cal-select sm" [(ngModel)]="zoneSource" name="zsrc">
                  <option value="" disabled>Copier depuis…</option>
                  @for (z of zonesCalibrees(); track z) { <option [value]="z">Zone {{ +z[1] + 1 }}·{{ +z[2] + 1 }}</option> }
                </select>
                <button class="btn btn--secondary btn--sm" [disabled]="!zoneSource || testMode()" (click)="copierDepuis()">OK</button>
              </div>
              <div class="cal-inline">
                <select class="input cal-select sm" [(ngModel)]="phaseCible" name="phc">
                  <option value="" disabled>Recopier vers…</option>
                  @for (p of phases; track p.key) {
                    @if (p.key !== phase()) { <option [value]="p.key">{{ p.label }}</option> }
                  }
                </select>
                <button class="btn btn--secondary btn--sm" [disabled]="!phaseCible" (click)="recopierVersPhase()">OK</button>
              </div>
              @if (estCalibree(zone().h, zone().c)) {
                <button class="btn btn--danger btn--sm" (click)="viderZone()"><mat-icon>backspace</mat-icon>Vider la zone</button>
              }
            </div>
          }

          <div class="cal-side__titre">Vérifier</div>
          <button class="btn btn--sm" [class.btn--primary]="testMode()" [class.btn--secondary]="!testMode()" (click)="basculerTest()">
            <mat-icon>sports_soccer</mat-icon>{{ testMode() ? 'Arrêter le test' : 'Tester (glisser le ballon)' }}
          </button>
          <p class="cal-aide">Le ballon devient déplaçable : le bloc suit en continu selon les postures calibrées de la phase.</p>
        </div>

        <!-- ── Terrain ── -->
        <div class="cal-pitch card">
          <div #pitchHost class="cal-pitch__host"></div>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
    .cal { display: flex; flex-direction: column; gap: 12px; }
    .cal-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 16px; }
    .cal-bar__left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .cal-bar__actions { display: flex; align-items: center; gap: 8px; }
    .cal-label { font-weight: 600; opacity: .8; font-size: .9rem; }
    .cal-select { min-width: 210px; }
    .cal-select.sm { min-width: 130px; }
    .badge--nous { background: rgba(124,58,237,.15); color: #a78bfa; }
    .badge--adv { background: rgba(31,41,55,.5); color: #cbd5e1; }
    .cal-save { font-size: .82rem; opacity: .7; }
    .cal-save.ok { color: #22c55e; opacity: 1; }
    .cal-new { padding: 12px 16px; }
    .cal-new__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .cal-check { display: flex; align-items: center; gap: 6px; font-size: .86rem; }
    .cal-main { display: grid; grid-template-columns: 300px 1fr; gap: 12px; align-items: start; }
    @media (max-width: 980px) { .cal-main { grid-template-columns: 1fr; } }
    .cal-side { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .cal-side__titre { font-weight: 700; font-size: .82rem; text-transform: uppercase; letter-spacing: .4px; opacity: .65; margin-top: 4px; }
    .cal-howto { font-size: .8rem; background: rgba(124,58,237,.08); border: 1px solid rgba(124,58,237,.3); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
    .cal-howto ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
    .cal-howto__sens { opacity: .7; font-size: .74rem; }
    .cal-hint { text-transform: none; letter-spacing: 0; font-weight: 400; }
    .cal-phases { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .cal-phase { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 6px; border-radius: 10px;
                 border: 1px solid rgba(148,163,184,.25); background: transparent; cursor: pointer; color: inherit; font-size: .82rem; }
    .cal-phase b { font-size: .78rem; opacity: .7; }
    .cal-phase.on { border-color: #7c3aed; background: rgba(124,58,237,.14); }
    .cal-grid { display: flex; flex-direction: column; gap: 5px; background: #118A4A22; padding: 8px; border-radius: 10px; }
    .cal-grid__row { display: flex; gap: 5px; }
    .cal-cell { flex: 1; aspect-ratio: 1.4; border-radius: 6px; border: 1px solid rgba(148,163,184,.35); background: rgba(148,163,184,.12); cursor: pointer; }
    .cal-cell.done { background: rgba(34,197,94,.4); border-color: rgba(34,197,94,.7); }
    .cal-cell.on { outline: 2px solid #fde047; outline-offset: 1px; }
    .cal-actions { display: flex; flex-direction: column; gap: 7px; }
    .cal-inline { display: flex; gap: 6px; align-items: center; }
    .cal-aide { font-size: .78rem; opacity: .6; margin: 0; }
    .cal-pitch { padding: 12px; }
    .cal-pitch__host { width: 100%; display: flex; justify-content: center; }
  `],
})
export class ReglesCalibrationComponent implements AfterViewInit, OnDestroy {

  @ViewChild('pitchHost') pitchHost?: ElementRef<HTMLDivElement>;

  private service = inject(ReglesTactiquesService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private terrainRenderer = inject(SchemaTerrainRenderer);

  readonly peutEcrire = this.auth.has('regles_tactiques:write');
  readonly phases = PHASES;
  readonly systemes = SYSTEMES;
  readonly hauteurs = Array.from({ length: GRILLE_H }, (_, i) => i);
  readonly couloirs = Array.from({ length: GRILLE_C }, (_, i) => i);

  jeux = signal<RegleTactiqueResume[]>([]);
  jeuActif = signal<RegleTactiqueDetail | null>(null);
  regles: ReglesJson | null = null;

  phase = signal<PhaseKey>('OFF');
  zone = signal<{ h: number; c: number }>({ h: 1, c: 1 });
  testMode = signal(false);
  saving = signal(false);
  savedAt = signal<number | null>(null);
  /** Compteurs par phase (signal de version pour rafraîchir les computed après mutation). */
  version = signal(0);

  // Création
  creation = signal(false);
  formType = signal<'NOUS' | 'ADVERSAIRE'>('NOUS');
  formSysteme = SYSTEMES[0];
  formNom = '';
  formMiroir = true;
  zoneSource = '';
  phaseCible: PhaseKey | '' = '';

  // Konva
  private stage?: Konva.Stage;
  private fieldLayer?: Konva.Layer;
  private gridLayer?: Konva.Layer;
  private layer?: Konva.Layer;
  private tokens = new Map<string, Konva.Group>();   // slotId -> jeton
  private balle?: Konva.Group;
  private readonly W = 1040;
  private readonly H = 680;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onResize = () => this.ajuster();

  ngAfterViewInit(): void {
    this.chargerListe(true);
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.sauverMaintenant(); }
    this.stage?.destroy();
  }

  // ── Chargement ──
  private chargerListe(autoSelect: boolean): void {
    this.service.lister().subscribe({
      next: js => {
        this.jeux.set(js);
        if (autoSelect && js.length && !this.jeuActif()) {
          const nous = js.find(j => j.type === 'NOUS');
          this.choisirJeu((nous ?? js[0]).id);
        }
      },
      error: err => {
        const msg = err?.status === 409 ? 'Sélectionnez une équipe pour accéder à ses règles de jeu' : 'Erreur de chargement';
        this.snack.open(msg, 'Fermer', { duration: 3500 });
      },
    });
  }

  choisirJeu(id: string): void {
    if (!id) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.sauverMaintenant(); }
    this.service.detail(id).subscribe({
      next: d => {
        this.jeuActif.set(d);
        this.regles = parseRegles(d.reglesJson) ?? reglesVierges(d.systeme);
        this.testMode.set(false);
        this.version.update(v => v + 1);
        // (Re)construit la scène après le rendu du conteneur.
        setTimeout(() => { this.initStage(); this.chargerZone(); });
      },
      error: () => this.snack.open('Jeu de règles introuvable', 'Fermer', { duration: 3000 }),
    });
  }

  jeuNousPourSysteme(): RegleTactiqueResume | undefined {
    return this.jeux().find(j => j.type === 'NOUS' && j.systeme === this.formSysteme);
  }

  // ── Création / renommage / suppression ──
  creer(): void {
    const type = this.formType();
    const systeme = this.formSysteme;
    const nom = type === 'NOUS' ? systeme : this.formNom.trim();
    const emettre = (json: ReglesJson) => {
      this.service.creer({ type, nom, systeme, reglesJson: JSON.stringify(json) }).subscribe({
        next: d => {
          this.creation.set(false); this.formNom = '';
          this.jeux.update(l => [ { id: d.id, type: d.type as any, nom: d.nom, systeme: d.systeme, updatedAt: d.updatedAt }, ...l ]);
          this.choisirJeu(d.id);
        },
        error: err => this.snack.open(err?.status === 409
          ? 'Un jeu « Nous » existe déjà pour ce système' : 'Création impossible', 'Fermer', { duration: 3500 }),
      });
    };
    const nousSrc = type === 'ADVERSAIRE' && this.formMiroir ? this.jeuNousPourSysteme() : undefined;
    if (nousSrc) {
      this.service.detail(nousSrc.id).subscribe({
        next: d => emettre(miroir(parseRegles(d.reglesJson) ?? reglesVierges(systeme))),
        error: () => emettre(reglesVierges(systeme)),
      });
    } else {
      emettre(reglesVierges(systeme));
    }
  }

  renommer(): void {
    const j = this.jeuActif();
    if (!j || !this.regles) return;
    const nom = prompt('Nom du jeu de règles ?', j.nom);
    if (!nom?.trim()) return;
    this.jeuActif.set({ ...j, nom: nom.trim() });
    this.sauverMaintenant();
  }

  supprimer(): void {
    const j = this.jeuActif();
    if (!j) return;
    if (!confirm(`Supprimer « ${j.nom} » (${j.systeme}) ? Les postures calibrées seront perdues.`)) return;
    this.service.supprimer(j.id).subscribe({
      next: () => {
        this.jeuActif.set(null); this.regles = null;
        this.jeux.update(l => l.filter(x => x.id !== j.id));
        this.stage?.destroy(); this.stage = undefined;
      },
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── Phase / zones ──
  compte(p: PhaseKey): number {
    this.version();
    return this.regles ? nbZonesCalibrees(this.regles, p) : 0;
  }
  estCalibree(h: number, c: number): boolean {
    this.version();
    return !!this.regles?.phases[this.phase()]?.[zoneKey(h, c)];
  }
  zonesCalibrees(): string[] {
    this.version();
    return this.regles ? Object.keys(this.regles.phases[this.phase()] ?? {}).sort() : [];
  }

  changerPhase(p: PhaseKey): void {
    this.phase.set(p);
    this.zoneSource = '';
    if (this.testMode()) this.majTest();
    else this.chargerZone();
  }

  choisirZone(h: number, c: number): void {
    this.zone.set({ h, c });
    if (this.testMode()) this.basculerTest();   // revenir en mode édition sur la zone cliquée
    this.chargerZone();
  }

  /** Posture affichée pour la zone active : calibrée si elle existe, sinon proposition
   *  (interpolation des zones déjà calibrées, à défaut la formation par défaut — RETOURNÉE
   *  pour un profil ADVERSAIRE : tout est affiché dans NOTRE sens, il défend le but de droite). */
  private postureAffichee(): Posture {
    const r = this.regles!;
    const key = zoneKey(this.zone().h, this.zone().c);
    const existante = r.phases[this.phase()]?.[key];
    if (existante) return existante;
    const centre = centreZone(this.zone().h, this.zone().c);
    const interpolee = ciblesPhase(r, this.phase(), centre);
    if (interpolee) return interpolee;
    const def = postureParDefaut(r.systeme);
    if (this.jeuActif()?.type !== 'ADVERSAIRE') return def;
    return Object.fromEntries(Object.entries(def).map(([id, p]) => [id, { x: 1 - p.x, y: 1 - p.y }]));
  }

  private chargerZone(): void {
    if (!this.regles || !this.stage) return;
    const posture = this.postureAffichee();
    for (const slot of this.regles.slots) {
      const g = this.tokens.get(slot.id);
      const p = posture[slot.id];
      if (g && p) { const px = relVersPx(p, this.W, this.H); g.position(px); }
    }
    // Ballon repère au centre de la zone active.
    if (this.balle) {
      const px = relVersPx(centreZone(this.zone().h, this.zone().c), this.W, this.H);
      this.balle.position(px);
    }
    this.dessinerGrille();
    this.layer?.batchDraw();
  }

  // ── Actions zone ──
  private captureTokens(): Posture {
    const p: Posture = {};
    this.tokens.forEach((g, id) => { p[id] = pxVersRel({ x: g.x(), y: g.y() }, this.W, this.H); });
    return p;
  }

  calibrerZone(): void {
    if (!this.regles || !this.peutEcrire) return;
    this.regles.phases[this.phase()][zoneKey(this.zone().h, this.zone().c)] = this.captureTokens();
    this.version.update(v => v + 1);
    this.dessinerGrille();
    this.sauverDebounce();
  }

  viderZone(): void {
    if (!this.regles) return;
    delete this.regles.phases[this.phase()][zoneKey(this.zone().h, this.zone().c)];
    this.version.update(v => v + 1);
    this.chargerZone();
    this.sauverDebounce();
  }

  symetrie(): void {
    if (!this.regles) return;
    const { h, c } = this.zone();
    const flip: Posture = {};
    Object.entries(this.captureTokens()).forEach(([id, p]) => { flip[id] = { x: p.x, y: 1 - p.y }; });
    this.regles.phases[this.phase()][zoneKey(h, GRILLE_C - 1 - c)] = flip;
    this.version.update(v => v + 1);
    this.dessinerGrille();
    this.sauverDebounce();
    this.snack.open(`Posture recopiée en zone ${h + 1}·${GRILLE_C - c}`, 'Fermer', { duration: 2200 });
  }

  copierDepuis(): void {
    if (!this.regles || !this.zoneSource) return;
    const src = this.regles.phases[this.phase()]?.[this.zoneSource];
    if (!src) return;
    for (const [id, p] of Object.entries(src)) {
      const g = this.tokens.get(id);
      if (g) g.position(relVersPx(p, this.W, this.H));
    }
    this.layer?.batchDraw();
    this.snack.open('Posture copiée — ajuste puis « Calibrer »', 'Fermer', { duration: 2500 });
  }

  recopierVersPhase(): void {
    if (!this.regles || !this.phaseCible) return;
    const key = zoneKey(this.zone().h, this.zone().c);
    this.regles.phases[this.phaseCible as PhaseKey][key] = this.captureTokens();
    this.version.update(v => v + 1);
    this.sauverDebounce();
    this.snack.open('Posture recopiée dans la phase cible', 'Fermer', { duration: 2200 });
    this.phaseCible = '';
  }

  // ── Test (interpolation en direct) ──
  basculerTest(): void {
    const actif = !this.testMode();
    if (actif && this.regles && nbZonesCalibrees(this.regles, this.phase()) === 0) {
      this.snack.open('Calibre au moins une zone de cette phase avant de tester', 'Fermer', { duration: 3000 });
      return;
    }
    this.testMode.set(actif);
    this.balle?.draggable(actif);
    this.tokens.forEach(g => g.draggable(!actif && this.peutEcrire));
    if (actif) this.majTest();
    else this.chargerZone();
  }

  private majTest(): void {
    if (!this.regles || !this.balle) return;
    const rel = pxVersRel({ x: this.balle.x(), y: this.balle.y() }, this.W, this.H);
    const cibles = ciblesPhase(this.regles, this.phase(), rel);
    if (!cibles) return;
    for (const [id, p] of Object.entries(cibles)) {
      const g = this.tokens.get(id);
      if (g) g.position(relVersPx(p, this.W, this.H));
    }
    this.layer?.batchDraw();
  }

  // ── Sauvegarde ──
  private sauverDebounce(): void {
    if (!this.peutEcrire) return;
    this.savedAt.set(null);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.sauverMaintenant(), 900);
  }

  private sauverMaintenant(): void {
    this.saveTimer = null;
    const j = this.jeuActif();
    if (!j || !this.regles || !this.peutEcrire) return;
    this.saving.set(true);
    this.service.modifier(j.id, {
      type: j.type, nom: j.nom, systeme: j.systeme, reglesJson: JSON.stringify(this.regles),
    }).subscribe({
      next: () => { this.saving.set(false); this.savedAt.set(Date.now()); },
      error: () => { this.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── Scène Konva ──
  private initStage(): void {
    const host = this.pitchHost?.nativeElement;
    if (!host || !this.regles) return;
    this.stage?.destroy();
    this.tokens.clear();
    this.stage = new Konva.Stage({ container: host, width: this.W, height: this.H });
    this.fieldLayer = new Konva.Layer();
    this.gridLayer = new Konva.Layer({ listening: false });
    this.layer = new Konva.Layer();
    this.stage.add(this.fieldLayer, this.gridLayer, this.layer);
    this.terrainRenderer.dessiner(this.fieldLayer, 'complet', this.W, this.H);
    this.dessinerGrille();

    const adverse = this.jeuActif()?.type === 'ADVERSAIRE';
    const couleur = adverse ? '#1f2937' : '#7c3aed';
    for (const slot of this.regles.slots) {
      const g = new Konva.Group({ draggable: this.peutEcrire });
      jetonChip(g, slot.id, couleur);   // même chip que l'éditeur/viewer (rendu partagé)
      g.on('dragend', () => { this.calibrerZone(); });
      this.tokens.set(slot.id, g);
      this.layer.add(g);
    }

    // Ballon : repère de la zone active ; déplaçable en mode test.
    this.balle = new Konva.Group({ draggable: false });
    this.balle.add(new Konva.Circle({ radius: 10, fill: '#fff', stroke: '#111', strokeWidth: 2 }));
    this.balle.add(new Konva.Circle({ radius: 16, stroke: '#fde047', strokeWidth: 2, dash: [4, 3] }));
    this.balle.on('dragmove', () => { if (this.testMode()) this.majTest(); });
    this.layer.add(this.balle);

    this.ajuster();
  }

  /** Grille 4×3 en surimpression + surbrillance de la zone active + zones calibrées
   *  + flèche du sens d'attaque du jeu sélectionné (tout est affiché dans NOTRE sens). */
  private dessinerGrille(): void {
    const gl = this.gridLayer;
    if (!gl || !this.regles) return;
    gl.destroyChildren();
    const m = 24, w = (this.W - 2 * m) / GRILLE_H, h = (this.H - 2 * m) / GRILLE_C;
    for (let zh = 0; zh < GRILLE_H; zh++) {
      for (let zc = 0; zc < GRILLE_C; zc++) {
        const calibree = !!this.regles.phases[this.phase()]?.[zoneKey(zh, zc)];
        const active = this.zone().h === zh && this.zone().c === zc && !this.testMode();
        gl.add(new Konva.Rect({
          x: m + zh * w, y: m + zc * h, width: w, height: h,
          stroke: active ? '#fde047' : 'rgba(255,255,255,0.25)',
          strokeWidth: active ? 3 : 1,
          dash: active ? undefined : [6, 6],
          fill: calibree ? 'rgba(34,197,94,0.10)' : undefined,
        }));
      }
    }
    // Sens d'attaque du jeu sélectionné (l'adversaire attaque vers la gauche, défend à droite).
    const adverse = this.jeuActif()?.type === 'ADVERSAIRE';
    const cx = this.W / 2, y = 46;
    gl.add(new Konva.Arrow({
      points: adverse ? [cx + 70, y, cx - 70, y] : [cx - 70, y, cx + 70, y],
      stroke: '#fde047', fill: '#fde047', strokeWidth: 3,
      pointerLength: 12, pointerWidth: 12, opacity: 0.9,
    }));
    const label = new Konva.Text({
      text: adverse ? "Sens d'attaque de l'adversaire (il défend le but de droite)" : "Notre sens d'attaque (but adverse à droite)",
      fontSize: 13, fontStyle: 'bold', fill: '#ffffff', opacity: 0.85,
    });
    label.position({ x: cx - label.width() / 2, y: y + 10 });
    gl.add(label);
    gl.batchDraw();
  }

  private ajuster(): void {
    const host = this.pitchHost?.nativeElement;
    if (!host || !this.stage) return;
    const dispo = (host.parentElement?.clientWidth ?? this.W) - 24;
    const s = Math.max(0.3, Math.min(1.1, dispo / this.W));
    this.stage.scale({ x: s, y: s });
    this.stage.width(this.W * s);
    this.stage.height(this.H * s);
    this.stage.batchDraw();
  }
}
