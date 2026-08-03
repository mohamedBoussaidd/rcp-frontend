import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import Konva from 'konva';
import { JoueurService } from '@core/services/joueur.service';
import { PreferencesService, PREF_ANGLE_SCHEMA, PREF_STYLE_RENDU_SCHEMA } from '@core/services/preferences.service';
import { SchemaTerrainRenderer } from '../schema-editor/schema-terrain.renderer';
import { Terrain, espace } from '../schema-editor/schema-espaces';
import {
  FOULEE, FormeRendue, StyleRendu, animerJoueur, dessinerContenuForme, dessinerCorpsElement,
  ordonnerParProfondeur, orienterBallon, orienterJoueur,
} from '../schema-render/schema-render';
import {
  Camera, CAMERA_PRESENTATION, INCLINAISON_MAX, ParamsCamera, PRESETS_CAMERA,
} from '../schema-render/schema-camera';
import { GroupeRendu, dessinerGroupes } from '../schema-render/schema-groupes';
import {
  Keyframe, MetriqueVitesse, Minutage, ModeAnim, ModeTraces, Segment, Vie, VitesseGps,
  aUneVie, distanceKeyframes, distanceParcourue, dureeMaxTrajectoires, etatTrace, frappes,
  minuter, opaciteVie, posKeyframes, posTrajectoire, vitesseBallePxS, vitesseJoueurPxS,
} from '../schema-render/schema-animation';
// Tension de la spline Konva : MÊME constante que l'éditeur (rendu + échantillonnage de
// trajectoire). Elle était redéclarée ici à 0,8 alors que l'éditeur est à 0,5 — un jeton ne
// suivait donc pas la même courbe en projection qu'au dessin.
import { TENSION_TRACE, sousChemin } from '../schema-editor/schema-geometrie';
import {
  Cadrage, Chapitre, normaliserCadrage, normaliserChapitres,
} from '../schema-editor/schema-serialisation';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; label?: string; joueurId?: string; rotation?: number; vie?: Vie; x: number; y: number; }
interface SchemaTrace { id: string; type: string; points: number[]; elementId?: string; ballId?: string; }
interface SchemaForme extends FormeRendue { id: string; vie?: Vie; }

/** Rendu en lecture seule d'un schéma tactique (terrain + éléments + tracés) + lecture animée.
 *  Styles partagés avec l'éditeur (schema-render) : tableau / réaliste, et en mode
 *  présentation (diaporama) un terrain en perspective « tribune ». */
@Component({
  selector: 'app-schema-viewer',
  standalone: true,
  template: `
    <div class="sv-wrap">
      <div #c class="sv-container"></div>
      @if (animable) {
        <button type="button" class="sv-play" (click)="basculerLecture()" [title]="enLecture ? 'Pause' : 'Lire'">
          {{ enLecture ? '⏸' : '▶' }}
        </button>
        <!-- Vitesse : celle enregistrée avec le schéma, ajustable en séance sans le modifier. -->
        <button type="button" class="sv-vit" (click)="cyclerVitesse()"
                title="Vitesse de lecture (n'est pas enregistrée : le schéma garde la sienne)">
          {{ libelleVitesse() }}
        </button>
        <!-- Chapitres : la lecture s'arrête à chaque étape pour laisser commenter. -->
        @if (chapitres.length) {
          <div class="sv-chap">
            <button type="button" (click)="chapitrePrecedent()" [disabled]="etape <= 0" title="Étape précédente">◀</button>
            <span>{{ libelleEtape() }}</span>
            <button type="button" (click)="chapitreSuivant()" title="Étape suivante">▶</button>
          </div>
        }
      }
      @if (controlesStyle) {
        <div class="sv-styles">
          <button type="button" [class.on]="styleRendu() === 'tableau'" (click)="choisirStyle('tableau')" title="Vue tableau">▦</button>
          <button type="button" [class.on]="styleRendu() === 'realiste'" (click)="choisirStyle('realiste')" title="Vue réaliste">⚽</button>
          @if (presentation) {
            <button type="button" [class.on]="perspective" (click)="basculerPerspective()" title="Terrain en perspective">⛰</button>
            @if (perspective && styleRendu() === 'realiste') {
              <button type="button" [class.on]="reglageAngle" (click)="reglageAngle = !reglageAngle"
                      title="Régler l'angle de la caméra">⟳</button>
            }
          }
        </div>
      }
      <!-- Réglage d'angle : même angle persisté que l'éditeur. -->
      @if (reglageAngle && perspective && styleRendu() === 'realiste') {
        <div class="sv-angle">
          <div class="sv-presets">
            @for (p of presetsCamera; track p.cle) {
              <button type="button" [class.on]="presetActif() === p.cle" (click)="appliquerPreset(p.cle)">{{ p.libelle }}</button>
            }
          </div>
          <label>
            <span>Inclinaison</span>
            <input type="range" min="0" [max]="inclinaisonMax" step="1"
                   [value]="angle.inclinaison" (input)="reglerInclinaison(+$any($event.target).value)">
            <b>{{ angle.inclinaison }}°</b>
          </label>
          <label>
            <span>Rotation</span>
            <input type="range" min="-180" max="180" step="1"
                   [value]="angle.rotation" (input)="reglerRotation(+$any($event.target).value)">
            <b>{{ angle.rotation }}°</b>
          </label>
        </div>
      }
    </div>
  `,
  styles: [`
    .sv-wrap { display:inline-block; position:relative; }
    .sv-container { display:block; border-radius:6px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,.25); }
    .sv-play {
      position:absolute; left:8px; bottom:8px;
      width:34px; height:34px; border-radius:50%;
      border:1px solid #ffffff66; background:rgba(20,24,40,.78); color:#fff;
      font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:background .12s;
    }
    .sv-play:hover { background:rgba(20,24,40,.95); }
    .sv-vit {
      position:absolute; left:48px; bottom:8px;
      height:34px; min-width:38px; padding:0 8px; border-radius:17px;
      border:1px solid #ffffff66; background:rgba(20,24,40,.78); color:#fff;
      font-size:.78rem; font-weight:600; font-family:inherit; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      font-variant-numeric:tabular-nums;
    }
    .sv-vit:hover { background:rgba(20,24,40,.95); }
    .sv-chap {
      position:absolute; left:92px; bottom:8px; height:34px;
      display:flex; align-items:center; gap:6px; padding:0 8px; border-radius:17px;
      border:1px solid #ffffff66; background:rgba(20,24,40,.78); color:#fff; font-size:.76rem;
    }
    .sv-chap button {
      border:0; background:transparent; color:#fff; cursor:pointer; font-size:.8rem; padding:0 2px;
    }
    .sv-chap button:disabled { opacity:.35; cursor:default; }
    .sv-chap span { white-space:nowrap; max-width:190px; overflow:hidden; text-overflow:ellipsis; }
    .sv-styles {
      position:absolute; right:8px; bottom:8px; display:flex; gap:4px;
    }
    .sv-styles button {
      width:28px; height:28px; border-radius:7px;
      border:1px solid #ffffff55; background:rgba(20,24,40,.7); color:#fff;
      font-size:.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center;
    }
    .sv-styles button.on { background:#1A9C4D; border-color:#1A9C4D; }
    .sv-angle {
      position:absolute; right:8px; bottom:44px; width:216px;
      display:flex; flex-direction:column; gap:7px;
      padding:9px 10px; border-radius:9px;
      border:1px solid #ffffff33; background:rgba(20,24,40,.9); color:#fff;
      font-size:.7rem;
    }
    .sv-presets { display:flex; flex-wrap:wrap; gap:4px; }
    .sv-presets button {
      flex:1 1 auto; padding:3px 6px; border-radius:6px; cursor:pointer;
      border:1px solid #ffffff44; background:transparent; color:#fff; font-size:.68rem;
    }
    .sv-presets button.on { background:#1A9C4D; border-color:#1A9C4D; }
    .sv-angle label { display:flex; align-items:center; gap:6px; }
    .sv-angle label span { flex:0 0 60px; opacity:.75; }
    .sv-angle label input { flex:1; min-width:0; accent-color:#1A9C4D; cursor:pointer; }
    .sv-angle label b { flex:0 0 34px; text-align:right; font-variant-numeric:tabular-nums; font-weight:600; }
  `],
})
export class SchemaViewerComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() schemaJson?: string | null;
  @Input() largeur = 460;
  /** Affiche les boutons de style (tableau/réaliste) en overlay. */
  @Input() controlesStyle = false;
  /** Mode présentation (diaporama) : propose en plus le terrain en perspective. */
  @Input() presentation = false;

  /** Terrain en perspective (réservé au mode présentation). */
  perspective = false;
  /** Panneau de réglage de l'angle ouvert (mode présentation). */
  reglageAngle = false;

  readonly presetsCamera = PRESETS_CAMERA;
  readonly inclinaisonMax = INCLINAISON_MAX;
  /** Angle courant — MÊME préférence que l'éditeur : un angle réglé une fois vaut partout. */
  angle: ParamsCamera = { ...CAMERA_PRESENTATION };
  private camera?: Camera;

  @ViewChild('c', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage?: Konva.Stage;
  private fond?: Konva.Layer;
  private couche?: Konva.Layer;
  private majAngle?: ReturnType<typeof setTimeout>;
  private pret = false;

  private nodesById = new Map<string, Konva.Group>();
  private traceNodes = new Map<string, Konva.Group>();
  private formeNodes = new Map<string, Konva.Group>();
  private groupes: GroupeRendu[] = [];
  private groupesNode?: Konva.Group;
  /** Facteur de vitesse de lecture : celui du schéma, ajustable pendant la projection. */
  vitesse = 1;
  /** Écart de temps servant à lire la tangente d'une trajectoire (orientation des joueurs). */
  private static readonly DELTA_DIR = 0.15;
  private dirJoueur = new Map<string, number>();

  /** Direction du déplacement, ou la dernière connue si le joueur est immobile. */
  private directionCourse(id: string, a: { x: number; y: number }, b: { x: number; y: number }): number | null {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) > 0.6) {
      const dir = Math.atan2(dy, dx);
      this.dirJoueur.set(id, dir);
      return dir;
    }
    return this.dirJoueur.get(id) ?? null;
  }
  private elements: SchemaElement[] = [];
  private traces: SchemaTrace[] = [];
  private formes: SchemaForme[] = [];
  private keyframes: Keyframe[] = [];
  private dureeSecondes = 10;
  private modeAnim: ModeAnim = 'temps';
  private metriqueVitesse: MetriqueVitesse = 'moyenne';
  private modeTraces: ModeTraces = 'toujours';
  private terrain: Terrain = 'complet';
  private W = 1040;
  private vitesses = new Map<string, VitesseGps>();
  private anim?: Konva.Animation;

  animable = false;
  enLecture = false;

  /** Étapes de lecture posées par l'auteur (vide = lecture d'une traite, comme avant). */
  chapitres: Chapitre[] = [];
  /** Dernière étape atteinte (−1 = on est au début, avant le premier chapitre). */
  etape = -1;
  /** Instant courant : sert de point de départ quand on relance à un chapitre. */
  private tCourant = 0;
  /**
   * Animation menée jusqu'au bout. Sans ce drapeau, le diaporama restait PRISONNIER d'une diapo
   * à étapes : la fin de lecture remet `tCourant` à 0, donc « il reste une étape » redevenait
   * vrai et la flèche rejouait le schéma au lieu de passer à la diapo suivante.
   */
  private termine = false;
  /** Zone de terrain à montrer (absente = tout le terrain). */
  private cadrage?: Cadrage;
  private tweenCadrage?: Konva.Tween;

  private joueurService = inject(JoueurService);
  private prefs = inject(PreferencesService);
  private terrainRenderer = inject(SchemaTerrainRenderer);

  /** Style de rendu (préférence par utilisateur, persistée serveur). */
  styleRendu(): StyleRendu {
    return this.prefs.valeur(PREF_STYLE_RENDU_SCHEMA) === 'realiste' ? 'realiste' : 'tableau';
  }

  choisirStyle(style: StyleRendu): void {
    if (this.styleRendu() === style) return;
    this.prefs.definir(PREF_STYLE_RENDU_SCHEMA, style);
    if (style === 'tableau') this.perspective = false;
    this.rendre();
  }

  basculerPerspective(): void {
    this.perspective = !this.perspective;
    if (!this.perspective) this.reglageAngle = false;
    this.rendre();
  }

  presetActif(): string {
    return this.presetsCamera.find(p => p.params.inclinaison === this.angle.inclinaison
      && p.params.rotation === this.angle.rotation)?.cle ?? '';
  }

  appliquerPreset(cle: string): void {
    const p = this.presetsCamera.find(x => x.cle === cle);
    if (p) this.definirAngle({ ...p.params });
  }

  reglerInclinaison(v: number): void { this.definirAngle({ ...this.angle, inclinaison: v }); }
  reglerRotation(v: number): void { this.definirAngle({ ...this.angle, rotation: v }); }

  private definirAngle(a: ParamsCamera): void {
    this.angle = a;
    this.reprojeter();
    // Persistance différée : un glisser de slider émet des dizaines d'événements, et
    // chacun déclencherait sinon un PUT.
    clearTimeout(this.majAngle);
    this.majAngle = setTimeout(() => this.prefs.definir(PREF_ANGLE_SCHEMA, `${a.inclinaison}:${a.rotation}`), 400);
  }

  /**
   * Reprojette la scène au nouvel angle SANS la reconstruire : reconstruire couperait
   * l'animation en cours, or c'est précisément pendant une présentation qu'on ajuste la vue.
   */
  private reprojeter(): void {
    if (!this.stage || !this.fond || !this.couche) return;
    const avant = this.camera;
    this.camera = this.enPerspective() ? new Camera(this.W, this.Hauteur, this.angle) : undefined;
    if (this.camera) this.terrainRenderer.dessinerPerspective(this.fond, this.terrain, this.W, this.Hauteur, this.camera);
    else this.terrainRenderer.dessiner(this.fond, this.terrain, this.W, this.Hauteur);
    // Les jetons sont replacés depuis leur position ÉCRAN courante — la seule qui reflète
    // une animation en cours — déprojetée par l'ANCIENNE caméra, celle qui l'avait produite.
    this.elements.forEach(el => {
      const n = this.nodesById.get(el.id);
      if (n) this.placerNode(el.id, avant ? avant.deprojeter(n.x(), n.y()) : { x: n.x(), y: n.y() });
    });
    this.couche.find('.trace').forEach(n => n.destroy());
    this.traceNodes.clear();
    this.traces.forEach(t => this.dessinerTrace(this.couche!, t));
    // Les zones sont décrites en absolu une fois projetées : elles se reconstruisent au
    // nouvel angle, en gardant leur nœud (et donc leur état de scène).
    this.formes.forEach(f => {
      const g = this.formeNodes.get(f.id);
      if (g) dessinerContenuForme(g, f, this.camera);
    });
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
    this.rafraichirGroupes();   // les cotes sont en mètres : elles se reprojettent aussi
    // Le centre visé est projeté : changer d'angle déplace donc le cadrage, il se refait.
    this.appliquerCadrage(false);
    this.fond.draw(); this.couche.draw();
  }

  /** Reprend l'angle enregistré (par l'éditeur ou par une session précédente). */
  private chargerAngle(): void {
    const [i, r] = (this.prefs.valeur(PREF_ANGLE_SCHEMA) ?? '').split(':').map(Number);
    if (Number.isFinite(i) && Number.isFinite(r)) {
      this.angle = {
        inclinaison: Math.max(0, Math.min(INCLINAISON_MAX, i)),
        rotation: Math.max(-180, Math.min(180, r)),
      };
    }
  }

  /** Perspective effective : demandée ET en mode présentation ET style réaliste. */
  private enPerspective(): boolean {
    return this.perspective && this.presentation && this.styleRendu() === 'realiste';
  }

  ngAfterViewInit(): void {
    this.pret = true;
    this.prefs.charger();
    this.chargerAngle();
    this.joueurService.getVitesses().subscribe({
      next: vs => { this.vitesses.clear(); vs.forEach(v => this.vitesses.set(v.joueurId, { vmax: v.vmaxKmh, vmoy: v.vmoyKmh })); },
      error: () => { },
    });
    this.rendre();
  }
  ngOnChanges(): void { if (this.pret) this.rendre(); }
  ngOnDestroy(): void {
    clearTimeout(this.majAngle);
    this.anim?.stop();
    this.tweenCadrage?.destroy();
    this.stage?.destroy();
  }

  /** PNG du schéma (pour l'impression). */
  toDataURL(): string | null {
    return this.stage ? this.stage.toDataURL({ pixelRatio: 2 }) : null;
  }

  private rendre(): void {
    this.anim?.stop(); this.anim = undefined; this.enLecture = false;
    this.stage?.destroy();
    this.nodesById.clear(); this.traceNodes.clear(); this.formeNodes.clear();
    this.elements = []; this.traces = []; this.formes = []; this.keyframes = []; this.animable = false;
    if (!this.schemaJson) return;
    let data: {
      terrain: string; elements: SchemaElement[]; traces: SchemaTrace[]; formes?: SchemaForme[];
      groupes?: GroupeRendu[];
      keyframes?: Keyframe[]; dureeSecondes?: number; modeAnim?: 'temps' | 'vitesse';
      metriqueVitesse?: 'max' | 'moyenne'; modeTraces?: ModeTraces; vitesseLecture?: number;
      cadrage?: unknown; chapitres?: unknown;
    };
    try { data = JSON.parse(this.schemaJson); } catch { return; }

    // Espace inconnu (schéma plus récent que ce front) : repli sur le terrain complet.
    const esp = espace(data.terrain);
    this.terrain = esp.cle;
    const W = esp.W;
    this.W = W;
    const H = esp.H;
    const s = this.largeur / W;

    this.stage = new Konva.Stage({ container: this.containerRef.nativeElement, width: W * s, height: H * s, scaleX: s, scaleY: s });
    const fond = new Konva.Layer();
    const couche = new Konva.Layer();
    this.fond = fond; this.couche = couche;
    this.stage.add(fond); this.stage.add(couche);
    // Terrain partagé avec l'éditeur (une seule source de rendu) ; en mode présentation,
    // variante perspective « tribune ».
    this.camera = this.enPerspective() ? new Camera(W, H, this.angle) : undefined;
    if (this.camera) {
      this.terrainRenderer.dessinerPerspective(fond, this.terrain, W, H, this.camera);
    } else {
      this.terrainRenderer.dessiner(fond, this.terrain, W, H);
    }
    this.elements = data.elements ?? [];
    this.traces = data.traces ?? [];
    this.formes = data.formes ?? [];
    // Groupes tactiques : absents de tout schéma antérieur, et membres inconnus écartés
    // (un schéma peut avoir été tronqué ou édité ailleurs).
    const ids = new Set(this.elements.map(e => e.id));
    this.groupes = (data.groupes ?? [])
      .filter(g => g && Array.isArray(g.membres))
      .map(g => ({ ...g, membres: g.membres.filter(m => ids.has(m)) }))
      .filter(g => g.membres.length >= 2);
    // Les groupes passent tout au fond : ils soulignent une organisation, ils ne masquent rien.
    this.groupesNode = new Konva.Group({ name: 'groupes', listening: false });
    couche.add(this.groupesNode);
    // Les zones passent SOUS les jetons et les flèches, comme dans l'éditeur.
    this.formes.forEach(f => this.dessinerForme(couche, f));
    this.elements.forEach(el => this.dessinerElement(couche, el));
    this.traces.forEach(t => this.dessinerTrace(couche, t));
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
    this.rafraichirGroupes();
    fond.draw(); couche.draw();

    // Animation dispo si plusieurs keyframes OU au moins une flèche liée à un élément.
    this.keyframes = (data.keyframes ?? []).slice().sort((a, b) => a.t - b.t);
    this.dureeSecondes = data.dureeSecondes ?? 10;
    // Le mode enregistré était INVERSÉ ici (`=== 'temps' ? 'vitesse' : 'temps'`) : un schéma
    // sauvé en « temps » se rejouait en « vitesse » et réciproquement. Défaut = 'temps', comme
    // dans l'éditeur.
    this.modeAnim = data.modeAnim === 'vitesse' ? 'vitesse' : 'temps';
    this.metriqueVitesse = data.metriqueVitesse === 'max' ? 'max' : 'moyenne';
    // Mise en scène voulue par l'auteur du schéma ; absente sur tout schéma d'avant, d'où le
    // repli sur l'affichage permanent des flèches.
    this.modeTraces = data.modeTraces === 'action' || data.modeTraces === 'aucun' ? data.modeTraces : 'toujours';
    // Vitesse voulue par l'auteur du schéma ; absente sur les schémas d'avant → temps réel.
    const v = data.vitesseLecture;
    this.vitesse = typeof v === 'number' && v >= 0.25 && v <= 4 ? v : 1;
    // Mise en scène de projection (lot « cadrage & chapitres ») : absente partout avant, donc
    // terrain entier et lecture d'une traite pour tout schéma existant.
    this.cadrage = normaliserCadrage(data.cadrage);
    this.chapitres = normaliserChapitres(data.chapitres) ?? [];
    this.etape = -1;
    this.tCourant = 0;
    this.termine = false;
    this.appliquerCadrage(false);
    if (this.modeTraces === 'aucun') this.appliquerScene(0, this.minutage());
    this.animable = this.keyframes.length > 1 || this.trajectoires().size > 0;
  }

  // ── Cadrage de projection ──
  /**
   * Montre la zone de terrain demandée. Le cadrage est décrit en coordonnées TERRAIN : son
   * centre est donc projeté par la caméra courante avant d'être visé, sinon un schéma cadré
   * à plat viserait à côté en vue inclinée.
   *
   * Le zoom ne descend jamais sous 1 : un cadrage ne sert qu'à se rapprocher.
   */
  private appliquerCadrage(anime: boolean): void {
    if (!this.stage) return;
    const base = this.largeur / this.W;                 // échelle « tout le terrain »
    const vueW = this.stage.width(), vueH = this.stage.height();
    let s = base, x = 0, y = 0;
    if (this.cadrage) {
      const c = this.cadrage;
      const zoom = Math.max(1, Math.min(4, Math.min(this.W / c.w, this.Hauteur / c.h)));
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const centre = this.camera ? this.camera.projeter(cx, cy) : { x: cx, y: cy };
      s = base * zoom;
      x = vueW / 2 - centre.x * s;
      y = vueH / 2 - centre.y * s;
    }
    this.tweenCadrage?.destroy();
    this.tweenCadrage = undefined;
    if (!anime) { this.stage.scale({ x: s, y: s }); this.stage.position({ x, y }); this.stage.batchDraw(); return; }
    this.tweenCadrage = new Konva.Tween({
      node: this.stage, duration: 0.45, easing: Konva.Easings.EaseInOut,
      scaleX: s, scaleY: s, x, y,
    });
    this.tweenCadrage.play();
  }

  // ── Chapitres ──
  libelleEtape(): string {
    const c = this.etape >= 0 ? this.chapitres[this.etape] : undefined;
    const n = this.etape + 1;
    return c?.titre ? `${n}/${this.chapitres.length} · ${c.titre}` : `${n}/${this.chapitres.length}`;
  }

  /**
   * Reste-t-il quelque chose à dérouler ? Le diaporama s'en sert pour savoir si son geste
   * « suivant » doit avancer d'une étape ou passer à la diapo — sans ça, le segment entre le
   * DERNIER chapitre et la fin de l'animation ne serait jamais joué.
   */
  aEncoreUneEtape(): boolean {
    if (this.termine) return false;
    return this.chapitres.some(c => c.t > this.tCourant + 0.01)
      || this.tCourant < this.dureeLecture() - 0.01;
  }

  /** Lance la lecture jusqu'au chapitre suivant (ou jusqu'à la fin s'il n'y en a plus). */
  chapitreSuivant(): void {
    if (this.enLecture) { this.pause(true); return; }   // 2e appui = pause, comme le bouton ▶
    const suivant = this.chapitres.findIndex(c => c.t > this.tCourant + 0.01);
    this.etape = suivant >= 0 ? suivant : this.chapitres.length - 1;
    this.play(suivant >= 0 ? this.chapitres[suivant].t : undefined);
  }

  /** Revient à l'étape précédente : image figée à cet instant, prête à être commentée. */
  chapitrePrecedent(): void {
    if (this.enLecture) this.pause();
    const i = Math.max(0, this.etape - 1);
    this.etape = this.chapitres.length ? i : -1;
    const t = this.chapitres[i]?.t ?? 0;
    this.tCourant = this.etape < 0 ? 0 : t;
    this.termine = false;                       // on est revenu en arrière : il reste à jouer
    this.appliquerPositions(this.tCourant);
    this.stage?.batchDraw();
  }

  // ── Lecture animée ──
  // Avec des chapitres, une pause n'efface pas la mise en scène : on s'arrête pour commenter.
  basculerLecture(): void { this.enLecture ? this.pause(this.chapitres.length > 0) : this.play(); }

  /**
   * Lance la lecture, éventuellement jusqu'à un instant donné (fin d'un chapitre).
   *
   * Avec des chapitres, la lecture REPREND où elle s'était arrêtée : c'est ce qui permet
   * d'enchaîner étape par étape en salle au lieu de tout rejouer à chaque fois.
   */
  /** Durée totale de lecture : en mode vitesse, la fin de la plus longue séquence. */
  private dureeLecture(): number {
    return this.modeAnim === 'vitesse'
      ? Math.max(this.dureeSecondes, dureeMaxTrajectoires(this.trajectoires()))
      : this.dureeSecondes;
  }

  private play(jusqua?: number): void {
    if (!this.animable || !this.stage) return;
    const duree = this.dureeLecture();
    const fin = Math.min(duree, jusqua ?? duree);
    const couche = this.stage.getLayers()[1];
    let t = this.chapitres.length ? this.tCourant : 0;
    if (t >= fin - 0.01) { t = 0; this.etape = jusqua === undefined ? -1 : this.etape; }  // relance depuis le début
    this.termine = false;
    let last = performance.now();
    this.enLecture = true;
    this.anim = new Konva.Animation(() => {
      const now = performance.now();
      // Temps ACCUMULÉ et non « maintenant − départ » : le facteur de vitesse peut changer
      // en pleine lecture (bouton ×), sans faire sauter l'animation.
      t += (now - last) / 1000 * this.vitesse;
      last = now;
      if (t >= fin) {
        this.appliquerPositions(fin);
        this.tCourant = fin;
        // Fin réelle de l'animation : la diapo est « consommée », la flèche suivante doit
        // pouvoir sortir du schéma. Sur un chapitre, on GARDE l'image qu'on commente.
        const auChapitre = fin < duree - 0.01;
        this.termine = !auChapitre;
        this.pause(auChapitre);
        return false;
      }
      this.appliquerPositions(t);
      this.tCourant = t;
      return undefined;
    }, couche);
    this.anim.start();
  }

  /** Paliers du bouton de vitesse, en projection comme à l'édition. */
  private static readonly PALIERS_VITESSE = [0.5, 1, 1.5, 2, 3];

  /**
   * Vitesse suivante. Le réglage est celui de la SÉANCE en cours de commentaire : il ne
   * modifie pas le schéma (celui-ci porte la vitesse voulue par son auteur).
   */
  cyclerVitesse(): void {
    const p = SchemaViewerComponent.PALIERS_VITESSE;
    const i = p.findIndex(v => Math.abs(v - this.vitesse) < 0.01);
    this.vitesse = p[(i + 1) % p.length];
  }

  libelleVitesse(): string { return `${this.vitesse}×`; }

  private pause(garderScene = false): void {
    this.anim?.stop(); this.anim = undefined; this.enLecture = false;
    // Animation terminée : on revient à l'image complète du schéma. Un lecteur à l'arrêt est
    // une illustration, pas la dernière image d'une mise en scène — SAUF à un chapitre, où
    // l'image de cet instant est justement ce que le coach est en train de commenter.
    if (!garderScene) {
      this.tCourant = 0;
      this.etape = -1;
      this.afficherTout();
    }
  }

  private appliquerPositions(t: number): void {
    const m = this.minutage();
    const style = this.styleRendu(), d = SchemaViewerComponent.DELTA_DIR;
    // Gestes de frappe à cet instant (la flèche part du ballon : le tireur est déduit).
    const gestes = style === 'realiste'
      ? frappes(this.traces, m.fenetres, this.elements.filter(e => e.type === 'joueur'), t)
      : new Map<string, number>();
    this.elements.forEach(el => {
      const legs = m.mobiles.get(el.id);
      const p = legs ? posTrajectoire(legs, t) : posKeyframes(el, t, this.keyframes);
      this.placerNode(el.id, p);
      const n = this.nodesById.get(el.id);
      if (!n) return;
      // Roulement du ballon : même règle qu'à l'édition (fonction de la distance parcourue).
      if (el.type === 'ballon' && legs) orienterBallon(n, distanceParcourue(legs, t));
      // Orientation des joueurs : même règle également — direction relue à chaque instant.
      if (el.type === 'joueur' && style === 'realiste') {
        const q = legs ? posTrajectoire(legs, t + d) : posKeyframes(el, t + d, this.keyframes);
        orienterJoueur(n, {
          el, style, cam: this.camera ?? null, x: p.x, y: p.y,
          dir: this.directionCourse(el.id, p, q),
        });
        // Foulée calée sur la distance parcourue, comme à l'édition.
        const parcourue = legs ? distanceParcourue(legs, t) : distanceKeyframes(el, t, this.keyframes);
        animerJoueur(n, {
          style,
          phase: Math.hypot(q.x - p.x, q.y - p.y) > 0.6 ? (parcourue / FOULEE) * Math.PI * 2 : null,
          frappe: gestes.get(el.id) ?? 0,
        });
      }
    });
    this.appliquerScene(t, m);
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
  }

  /**
   * Mise en scène à l'instant t : flèches selon le mode du schéma, zones et jetons selon leur
   * fenêtre. Même règle que l'éditeur, à une différence près : en projection, ce qui n'est pas
   * en scène est ABSENT (l'éditeur l'estompe pour qu'il reste attrapable).
   */
  private appliquerScene(t: number, m: Minutage): void {
    this.traces.forEach(tr => {
      const grp = this.traceNodes.get(tr.id);
      if (!grp) return;
      const et = etatTrace(m.fenetres.get(tr.id), t, this.modeTraces);
      grp.visible(et.opacite > 0.01);
      grp.opacity(et.opacite);
      if (!grp.visible()) return;
      const ligne = grp.findOne<Konva.Line>('.ligne');
      if (!ligne) return;
      const bout = grp.findOne<Konva.Circle>('.bout');
      if (et.fraction >= 1) {
        ligne.points(this.projeterPoints(tr.points));
        ligne.tension(TENSION_TRACE);
        bout?.visible(true);
      } else {
        // Chemin déjà développé : on le tronque et on annule la tension (le recourber une
        // seconde fois écarterait la flèche du mobile qui la suit).
        ligne.points(this.projeterPoints(sousChemin(m.chemins.get(tr.id) ?? tr.points, et.fraction)));
        ligne.tension(0);
        bout?.visible(false);
      }
    });
    const poser = (n: Konva.Node | undefined, vie: Vie | undefined) => {
      if (!n) return;
      const o = aUneVie(vie) ? opaciteVie(vie, m.fenetres, t) : 1;
      n.visible(o > 0.01);
      n.opacity(o);
    };
    this.formes.forEach(f => poser(this.formeNodes.get(f.id), f.vie));
    this.elements.forEach(el => poser(this.nodesById.get(el.id), el.vie));
    // Après les visibilités : un groupe ne compte que ses membres en scène.
    this.rafraichirGroupes();
  }

  /**
   * (Re)dessine les groupes tactiques. Même module que l'éditeur : ce qui a été composé sur
   * le terrain se rejoue à l'identique en projection, y compris la déformation du bloc.
   */
  private rafraichirGroupes(): void {
    if (!this.groupesNode || !this.groupes.length) return;
    dessinerGroupes(this.groupesNode, this.groupes, {
      position: id => {
        const n = this.nodesById.get(id);
        if (!n || !n.visible()) return undefined;
        return this.camera ? this.camera.deprojeter(n.x(), n.y()) : { x: n.x(), y: n.y() };
      },
      projeter: pts => this.projeterPoints(pts),
      pxParMetre: this.pxParMetre,
    });
    this.groupesNode.moveToBottom();
  }

  /** Tout à l'écran (hors mode « aucune flèche », qui est un choix de l'auteur). */
  private afficherTout(): void {
    this.traceNodes.forEach(g => { g.visible(this.modeTraces !== 'aucun'); g.opacity(1); });
    this.formeNodes.forEach(g => { g.visible(true); g.opacity(1); });
    this.nodesById.forEach(g => { g.visible(true); g.opacity(1); });
    this.rafraichirGroupes();   // tous les membres redeviennent en scène : blocs complets
    this.couche?.batchDraw();
  }

  /** Positionne un jeton : coordonnées vue-de-dessus, projetées (+ échelle) en perspective. */
  private placerNode(id: string, p: { x: number; y: number }): void {
    const n = this.nodesById.get(id);
    if (!n) return;
    if (this.camera) {
      const pr = this.camera.projeter(p.x, p.y);
      n.position({ x: pr.x, y: pr.y });
      n.scale({ x: pr.echelle, y: pr.echelle });
    } else {
      n.position(p);
      n.scale({ x: 1, y: 1 });
    }
  }

  /**
   * Trajectoires des mobiles — calcul PARTAGÉ avec l'éditeur (schema-animation).
   * Le lecteur ne mute jamais `el.x/el.y` (il ne déplace que les nœuds Konva) : les positions
   * de repos sont donc directement celles des éléments.
   */
  private minutage(): Minutage {
    return minuter({
      elements: this.elements,
      traces: this.traces,
      modeAnim: this.modeAnim,
      dureeSecondes: this.dureeSecondes,
      repos: e => ({ x: e.x, y: e.y }),
      vitesseBallePxS: () => vitesseBallePxS(this.pxParMetre),
      vitesseJoueurPxS: j => vitesseJoueurPxS(j, this.vitesses, this.metriqueVitesse, this.pxParMetre),
    });
  }

  private trajectoires(): Map<string, Segment[]> { return this.minutage().mobiles; }

  /** Points d'un tracé ramenés à l'écran (identité hors perspective). */
  private projeterPoints(pts: number[]): number[] {
    return this.camera ? this.camera.projeterPolyligne(pts) : pts;
  }

  private get pxParMetre(): number { return this.W / espace(this.terrain).metres; }

  /** Hauteur de la scène : dépend de l'espace (la zone libre est carrée, pas 680 px). */
  private get Hauteur(): number { return espace(this.terrain).H; }

  // Terrain : rendu partagé SchemaTerrainRenderer (la copie locale historique est supprimée).
  // Géométrie et minutage : partagés (schema-geometrie / schema-animation).

  private dessinerElement(layer: Konva.Layer, el: SchemaElement): void {
    const g = new Konva.Group({ x: el.x, y: el.y });
    // Visuel de base partagé avec l'éditeur (styles tableau / réaliste). En projection, le
    // matériel devient un volume : il lui faut la caméra et sa position au sol.
    dessinerCorpsElement(g, el, this.styleRendu(), this.camera ? { cam: this.camera, x: el.x, y: el.y } : null);
    this.nodesById.set(el.id, g);
    layer.add(g);
    this.placerNode(el.id, { x: el.x, y: el.y });
  }

  /**
   * Une flèche = un GROUPE nommé `trace`, contenant la ligne (`ligne`) et, pour un tir, son
   * point d'impact (`bout`). Le groupe permet de piloter la flèche entière — apparition,
   * effacement, tracé progressif — sans retrouver ses morceaux un par un.
   */
  private dessinerTrace(layer: Konva.Layer, t: SchemaTrace): void {
    const couleur = '#fde047';
    const grp = new Konva.Group({ name: 'trace' });
    // Les tracés gardent leur rendu dans les deux styles ; en perspective, seuls les
    // points sont projetés (le style de flèche reste identique).
    const pts = this.projeterPoints(t.points);
    const base = { name: 'ligne', points: pts, stroke: couleur, strokeWidth: 3, tension: TENSION_TRACE, lineCap: 'round' as const, lineJoin: 'round' as const };
    if (t.type === 'deplacement') {
      grp.add(new Konva.Arrow({ ...base, dash: [11, 7], fill: couleur, pointerLength: 11, pointerWidth: 11 }));
    } else if (t.type === 'passe') {
      grp.add(new Konva.Arrow({ ...base, fill: couleur, pointerLength: 12, pointerWidth: 12 }));
    } else if (t.type === 'conduite') {
      grp.add(new Konva.Line({ ...base }));
    } else {
      grp.add(new Konva.Line({ ...base }));
      const n = pts.length;
      grp.add(new Konva.Circle({ name: 'bout', x: pts[n - 2], y: pts[n - 1], radius: 6, fill: couleur }));
    }
    grp.visible(this.modeTraces !== 'aucun');
    this.traceNodes.set(t.id, grp);
    layer.add(grp);
  }

  /** Zone d'annotation : rendu PARTAGÉ avec l'éditeur (schema-render). */
  private dessinerForme(layer: Konva.Layer, f: SchemaForme): void {
    const g = new Konva.Group({ listening: false });
    dessinerContenuForme(g, f, this.camera);
    this.formeNodes.set(f.id, g);
    layer.add(g);
  }

}
