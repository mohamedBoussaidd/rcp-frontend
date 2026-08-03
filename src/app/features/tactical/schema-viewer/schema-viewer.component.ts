import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import Konva from 'konva';
import { JoueurService } from '@core/services/joueur.service';
import { PreferencesService, PREF_ANGLE_SCHEMA, PREF_STYLE_RENDU_SCHEMA } from '@core/services/preferences.service';
import { SchemaTerrainRenderer } from '../schema-editor/schema-terrain.renderer';
import { Terrain, espace } from '../schema-editor/schema-espaces';
import {
  StyleRendu, dessinerCorpsElement, ordonnerParProfondeur,
} from '../schema-render/schema-render';
import {
  Camera, CAMERA_PRESENTATION, INCLINAISON_MAX, ParamsCamera, PRESETS_CAMERA,
} from '../schema-render/schema-camera';
import {
  Keyframe, MetriqueVitesse, ModeAnim, Segment, VitesseGps,
  construireTrajectoires, dureeMaxTrajectoires, posKeyframes, posTrajectoire,
  vitesseBallePxS, vitesseJoueurPxS,
} from '../schema-render/schema-animation';
// Tension de la spline Konva : MÊME constante que l'éditeur (rendu + échantillonnage de
// trajectoire). Elle était redéclarée ici à 0,8 alors que l'éditeur est à 0,5 — un jeton ne
// suivait donc pas la même courbe en projection qu'au dessin.
import { TENSION_TRACE } from '../schema-editor/schema-geometrie';

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; label?: string; joueurId?: string; rotation?: number; x: number; y: number; }
interface SchemaTrace { id: string; type: string; points: number[]; elementId?: string; ballId?: string; }

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
  private elements: SchemaElement[] = [];
  private traces: SchemaTrace[] = [];
  private keyframes: Keyframe[] = [];
  private dureeSecondes = 10;
  private modeAnim: ModeAnim = 'temps';
  private metriqueVitesse: MetriqueVitesse = 'moyenne';
  private terrain: Terrain = 'complet';
  private W = 1040;
  private vitesses = new Map<string, VitesseGps>();
  private anim?: Konva.Animation;

  animable = false;
  enLecture = false;

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
    this.traces.forEach(t => this.dessinerTrace(this.couche!, t));
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
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
  ngOnDestroy(): void { clearTimeout(this.majAngle); this.anim?.stop(); this.stage?.destroy(); }

  /** PNG du schéma (pour l'impression). */
  toDataURL(): string | null {
    return this.stage ? this.stage.toDataURL({ pixelRatio: 2 }) : null;
  }

  private rendre(): void {
    this.anim?.stop(); this.anim = undefined; this.enLecture = false;
    this.stage?.destroy();
    this.nodesById.clear();
    this.elements = []; this.traces = []; this.keyframes = []; this.animable = false;
    if (!this.schemaJson) return;
    let data: { terrain: string; elements: SchemaElement[]; traces: SchemaTrace[]; keyframes?: Keyframe[]; dureeSecondes?: number; modeAnim?: 'temps' | 'vitesse'; metriqueVitesse?: 'max' | 'moyenne' };
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
    this.elements.forEach(el => this.dessinerElement(couche, el));
    this.traces.forEach(t => this.dessinerTrace(couche, t));
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
    fond.draw(); couche.draw();

    // Animation dispo si plusieurs keyframes OU au moins une flèche liée à un élément.
    this.keyframes = (data.keyframes ?? []).slice().sort((a, b) => a.t - b.t);
    this.dureeSecondes = data.dureeSecondes ?? 10;
    // Le mode enregistré était INVERSÉ ici (`=== 'temps' ? 'vitesse' : 'temps'`) : un schéma
    // sauvé en « temps » se rejouait en « vitesse » et réciproquement. Défaut = 'temps', comme
    // dans l'éditeur.
    this.modeAnim = data.modeAnim === 'vitesse' ? 'vitesse' : 'temps';
    this.metriqueVitesse = data.metriqueVitesse === 'max' ? 'max' : 'moyenne';
    this.animable = this.keyframes.length > 1 || this.trajectoires().size > 0;
  }

  // ── Lecture animée ──
  basculerLecture(): void { this.enLecture ? this.pause() : this.play(); }

  private play(): void {
    if (!this.animable || !this.stage) return;
    // En mode vitesse, durée d'animation = fin de la plus longue séquence.
    let duree = this.dureeSecondes;
    if (this.modeAnim === 'vitesse') {
      duree = Math.max(duree, dureeMaxTrajectoires(this.trajectoires()));
    }
    const couche = this.stage.getLayers()[1];
    const debut = Date.now();
    this.enLecture = true;
    this.anim = new Konva.Animation(() => {
      const t = (Date.now() - debut) / 1000;
      if (t >= duree) { this.appliquerPositions(duree); this.pause(); return false; }
      this.appliquerPositions(t);
      return undefined;
    }, couche);
    this.anim.start();
  }

  private pause(): void { this.anim?.stop(); this.anim = undefined; this.enLecture = false; }

  private appliquerPositions(t: number): void {
    const traj = this.trajectoires();
    this.elements.forEach(el => {
      const legs = traj.get(el.id);
      const p = legs ? posTrajectoire(legs, t) : posKeyframes(el, t, this.keyframes);
      this.placerNode(el.id, p);
    });
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
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
  private trajectoires(): Map<string, Segment[]> {
    return construireTrajectoires({
      elements: this.elements,
      traces: this.traces,
      modeAnim: this.modeAnim,
      dureeSecondes: this.dureeSecondes,
      repos: e => ({ x: e.x, y: e.y }),
      vitesseBallePxS: () => vitesseBallePxS(this.pxParMetre),
      vitesseJoueurPxS: j => vitesseJoueurPxS(j, this.vitesses, this.metriqueVitesse, this.pxParMetre),
    });
  }

  private get pxParMetre(): number { return this.W / espace(this.terrain).metres; }

  /** Hauteur de la scène : dépend de l'espace (la zone libre est carrée, pas 680 px). */
  private get Hauteur(): number { return espace(this.terrain).H; }

  // Terrain : rendu partagé SchemaTerrainRenderer (la copie locale historique est supprimée).
  // Géométrie et minutage : partagés (schema-geometrie / schema-animation).

  private dessinerElement(layer: Konva.Layer, el: SchemaElement): void {
    const g = new Konva.Group({ x: el.x, y: el.y });
    // Visuel de base partagé avec l'éditeur (styles tableau / réaliste).
    dessinerCorpsElement(g, el, this.styleRendu());
    this.nodesById.set(el.id, g);
    layer.add(g);
    this.placerNode(el.id, { x: el.x, y: el.y });
  }

  private dessinerTrace(layer: Konva.Layer, t: SchemaTrace): void {
    //decommentez pour  enleve les fleches dans le visuel
    // t = { ...t, points: [], elementId: undefined, ballId: undefined };
    const couleur = '#fde047';
    // Les tracés gardent leur rendu dans les deux styles ; en perspective, seuls les
    // points sont projetés (le style de flèche reste identique).
    const pts = this.camera ? this.camera.projeterPolyligne(t.points) : t.points;
    const base = { points: pts, name: 'trace', stroke: couleur, strokeWidth: 3, tension: TENSION_TRACE, lineCap: 'round' as const, lineJoin: 'round' as const };
    if (t.type === 'deplacement') {
      layer.add(new Konva.Arrow({ ...base, dash: [11, 7], fill: couleur, pointerLength: 11, pointerWidth: 11 }));
    } else if (t.type === 'passe') {
      layer.add(new Konva.Arrow({ ...base, fill: couleur, pointerLength: 12, pointerWidth: 12 }));
    } else if (t.type === 'conduite') {
      layer.add(new Konva.Line({ ...base }));
    } else {
      layer.add(new Konva.Line({ ...base }));
      const n = pts.length;
      layer.add(new Konva.Circle({ x: pts[n - 2], y: pts[n - 1], radius: 6, fill: couleur, name: 'trace' }));
    }
  }

}
