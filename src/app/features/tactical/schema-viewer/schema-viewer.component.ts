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

interface SchemaElement { id: string; type: string; couleur?: string; numero?: number; label?: string; joueurId?: string; rotation?: number; x: number; y: number; }
interface SchemaTrace { id: string; type: string; points: number[]; elementId?: string; ballId?: string; }
interface Keyframe { t: number; positions: Record<string, { x: number; y: number }>; }

// Alignés avec l'éditeur (Brique 3).
const VITESSE_DEFAUT_KMH = 24;
const BALLE_KMH = 60;
const RAYON_LIEN = 60;
// Tension de la spline Konva : identique à l'éditeur (rendu + échantillonnage cheminRendu),
// pour que la courbe affichée et la trajectoire du jeton soient les mêmes des deux côtés.
const TENSION_TRACE = 0.8;

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
  private modeAnim: 'temps' | 'vitesse' = 'temps';
  private metriqueVitesse: 'max' | 'moyenne' = 'moyenne';
  private terrain: Terrain = 'complet';
  private W = 1040;
  private vitesses = new Map<string, { vmax: number | null; vmoy: number | null }>();
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
    this.modeAnim = data.modeAnim === 'temps' ? 'vitesse' : 'temps';
    this.metriqueVitesse = data.metriqueVitesse === 'max' ? 'max' : 'moyenne';
    this.animable = this.keyframes.length > 1 || this.construireTrajectoires().size > 0;
  }

  // ── Lecture animée ──
  basculerLecture(): void { this.enLecture ? this.pause() : this.play(); }

  private play(): void {
    const coucheVide = new Konva.Layer();
    if (!this.animable || !this.stage) return;
    // En mode vitesse, durée d'animation = fin de la plus longue séquence.
    let duree = this.dureeSecondes;
    if (this.modeAnim === 'vitesse') {
      for (const legs of this.construireTrajectoires().values())
        for (const lg of legs) if (lg.t1 > duree) duree = lg.t1;
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
    const traj = this.construireTrajectoires();
    this.elements.forEach(el => {
      const legs = traj.get(el.id);
      const p = legs ? this.posTrajectoire(legs, t) : this.posElement(el, t);
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

  // Même modèle que l'éditeur : chaque mobile suit ses flèches, minutage global
  // (une conduite attend joueur + ballon). Positions de repos = el.x/el.y (non mutées ici).
  private construireTrajectoires(): Map<string, { t0: number; t1: number; pts: number[] }[]> {
    const res = new Map<string, { t0: number; t1: number; pts: number[] }[]>();
    const fleches = this.traces.filter(t => t.points.length >= 4);
    if (!fleches.length) return res;

    // Échantillonne la courbe rendue (tension) pour que le jeton suive la flèche dessinée.
    const rendu = new Map<string, number[]>();
    fleches.forEach(a => rendu.set(a.id, this.cheminRendu(a.points)));

    const debut = (a: SchemaTrace) => ({ x: a.points[0], y: a.points[1] });
    const fin = (a: SchemaTrace) => ({ x: a.points[a.points.length - 2], y: a.points[a.points.length - 1] });
    const estBallon = (a: SchemaTrace) => a.type === 'conduite' || a.type === 'passe' || a.type === 'tir';
    const estJoueur = (a: SchemaTrace) => a.type === 'conduite' || a.type === 'deplacement';
    const plusProche = (type: string, p: { x: number; y: number }): SchemaElement | undefined => {
      let best: SchemaElement | undefined; let dMin = RAYON_LIEN;
      for (const e of this.elements) {
        if (e.type !== type) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= dMin) { dMin = d; best = e; }
      }
      return best;
    };
    const predNature = (a: SchemaTrace, estType: (x: SchemaTrace) => boolean): SchemaTrace | undefined => {
      let best: SchemaTrace | undefined; let dMin = RAYON_LIEN;
      for (const b of fleches) {
        if (b.id === a.id || !estType(b)) continue;
        const d = Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y);
        if (d <= dMin) { dMin = d; best = b; }
      }
      return best;
    };

    // Lien EXPLICITE posé au dessin : une flèche dessinée sur un jeton/ballon lui est réservée
    // — prioritaire sur toute déduction géométrique (aligné sur schema-editor).
    const explicite = (a: SchemaTrace, type: 'ballon' | 'joueur'): SchemaElement | undefined => {
      const id = type === 'joueur'
        ? (estJoueur(a) ? a.elementId : undefined)
        : (a.type === 'conduite' ? a.ballId : (estBallon(a) ? a.elementId : undefined));
      return id ? this.elements.find(e => e.id === id && e.type === type) : undefined;
    };

    const memo = { ballon: new Map<string, SchemaElement | undefined>(), joueur: new Map<string, SchemaElement | undefined>() };
    const owner = (a: SchemaTrace, type: 'ballon' | 'joueur', estType: (x: SchemaTrace) => boolean, vu = new Set<string>()): SchemaElement | undefined => {
      const m = memo[type];
      if (m.has(a.id)) return m.get(a.id);
      const ex = explicite(a, type);
      if (ex) { m.set(a.id, ex); return ex; }
      if (vu.has(a.id)) return undefined;
      vu.add(a.id);
      const p = predNature(a, estType);
      const r = p ? owner(p, type, estType, vu) : plusProche(type, debut(a));
      m.set(a.id, r);
      return r;
    };

    // Arrivants de a : les chaînes de deux joueurs DIFFÉRENTS ne se synchronisent pas entre
    // elles, sauf remise/relais où le MÊME ballon passe de l'un à l'autre (aligné schema-editor).
    const arrivants = (a: SchemaTrace) => fleches.filter(b => {
      if (b.id === a.id || Math.hypot(debut(a).x - fin(b).x, debut(a).y - fin(b).y) > RAYON_LIEN) return false;
      const ja = estJoueur(a) ? owner(a, 'joueur', estJoueur) : undefined;
      const jb = estJoueur(b) ? owner(b, 'joueur', estJoueur) : undefined;
      if (ja && jb && ja.id !== jb.id) {
        const ba = estBallon(a) ? owner(a, 'ballon', estBallon) : undefined;
        const bb = estBallon(b) ? owner(b, 'ballon', estBallon) : undefined;
        return !!ba && !!bb && ba.id === bb.id;
      }
      return true;
    });

    // Vitesse (px/s) d'un segment : mode vitesse = vitesse réelle du joueur / de la balle ;
    // mode temps = distance brute (1), l'échelle ramène la plus longue séquence à la durée.
    const vitLeg = (a: SchemaTrace): number => {
      if (this.modeAnim !== 'vitesse') return 1;
      if (a.type === 'passe' || a.type === 'tir') return this.vitesseBallePxS();
      return this.vitesseJoueurPxS(owner(a, 'joueur', estJoueur));
    };

    const t0 = new Map<string, number>(), t1 = new Map<string, number>();
    const enCalcul = new Set<string>();
    const calc = (a: SchemaTrace): number => {
      if (t1.has(a.id)) return t1.get(a.id)!;
      if (enCalcul.has(a.id)) { t0.set(a.id, 0); t1.set(a.id, this.longueurChemin(rendu.get(a.id)!) / vitLeg(a)); return t1.get(a.id)!; }
      enCalcul.add(a.id);
      const inc = arrivants(a);
      const dep = inc.length ? Math.max(...inc.map(calc)) : 0;
      t0.set(a.id, dep); t1.set(a.id, dep + this.longueurChemin(rendu.get(a.id)!) / vitLeg(a));
      enCalcul.delete(a.id);
      return t1.get(a.id)!;
    };
    fleches.forEach(calc);

    const maxT = Math.max(1, ...fleches.map(a => t1.get(a.id)!));
    const sc = this.modeAnim === 'vitesse' ? 1 : this.dureeSecondes / maxT;

    const pousser = (id: string, a: SchemaTrace) => {
      const arr = res.get(id) ?? [];
      arr.push({ t0: t0.get(a.id)! * sc, t1: t1.get(a.id)! * sc, pts: rendu.get(a.id)! });
      res.set(id, arr);
    };
    for (const a of fleches) {
      if (estJoueur(a)) { const j = owner(a, 'joueur', estJoueur); if (j) pousser(j.id, a); }
      if (estBallon(a)) { const b = owner(a, 'ballon', estBallon); if (b) pousser(b.id, a); }
    }
    for (const arr of res.values()) arr.sort((x, y) => x.t0 - y.t0);
    return res;
  }

  private get pxParMetre(): number { return this.W / espace(this.terrain).metres; }

  /** Hauteur de la scène : dépend de l'espace (la zone libre est carrée, pas 680 px). */
  private get Hauteur(): number { return espace(this.terrain).H; }
  private kmhEnPxS(kmh: number): number { return (kmh / 3.6) * this.pxParMetre; }
  private vitesseBallePxS(): number { return this.kmhEnPxS(BALLE_KMH); }
  private vitesseJoueurPxS(joueur?: SchemaElement): number {
    const v = joueur?.joueurId ? this.vitesses.get(joueur.joueurId) : undefined;
    const kmh = v ? (this.metriqueVitesse === 'max' ? v.vmax : v.vmoy) : null;
    return this.kmhEnPxS(kmh && kmh > 0 ? kmh : VITESSE_DEFAUT_KMH);
  }

  private posTrajectoire(legs: { t0: number; t1: number; pts: number[] }[], t: number): { x: number; y: number } {
    if (t <= legs[0].t0) return { x: legs[0].pts[0], y: legs[0].pts[1] };
    for (let i = 0; i < legs.length; i++) {
      const lg = legs[i];
      if (t <= lg.t1) {
        if (t < lg.t0) { const pv = legs[i - 1].pts; return { x: pv[pv.length - 2], y: pv[pv.length - 1] }; }
        const r = lg.t1 > lg.t0 ? (t - lg.t0) / (lg.t1 - lg.t0) : 1;
        return this.pointLeLongDe(lg.pts, Math.max(0, Math.min(1, r)));
      }
    }
    const last = legs[legs.length - 1].pts;
    return { x: last[last.length - 2], y: last[last.length - 1] };
  }

  // Développe une polyligne en la courbe rendue par Konva (tension), pour que le jeton
  // suive la flèche dessinée. Identique à l'éditeur (réplique Konva Util._expandPoints).
  private cheminRendu(pts: number[]): number[] {
    const len = pts.length;
    if (len <= 4) return pts;
    const tp = this.pointsTension(pts, TENSION_TRACE);
    const PAS = 16;
    const out = [pts[0], pts[1]];
    this.echQuad(out, pts[0], pts[1], tp[0], tp[1], tp[2], tp[3], PAS);
    for (let n = 4; n < tp.length - 2; n += 6) {
      const x0 = out[out.length - 2], y0 = out[out.length - 1];
      this.echCubic(out, x0, y0, tp[n], tp[n + 1], tp[n + 2], tp[n + 3], tp[n + 4], tp[n + 5], PAS);
    }
    const x0 = out[out.length - 2], y0 = out[out.length - 1];
    this.echQuad(out, x0, y0, tp[tp.length - 2], tp[tp.length - 1], pts[len - 2], pts[len - 1], PAS);
    return out;
  }

  private pointsTension(p: number[], t: number): number[] {
    const out: number[] = [];
    for (let n = 2; n < p.length - 2; n += 2) {
      const x0 = p[n - 2], y0 = p[n - 1], x1 = p[n], y1 = p[n + 1], x2 = p[n + 2], y2 = p[n + 3];
      const d01 = Math.hypot(x1 - x0, y1 - y0), d12 = Math.hypot(x2 - x1, y2 - y1);
      const fa = (t * d01) / (d01 + d12) || 0, fb = (t * d12) / (d01 + d12) || 0;
      out.push(x1 - fa * (x2 - x0), y1 - fa * (y2 - y0), x1, y1, x1 + fb * (x2 - x0), y1 + fb * (y2 - y0));
    }
    return out;
  }

  private echQuad(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, pas: number): void {
    for (let i = 1; i <= pas; i++) {
      const s = i / pas, u = 1 - s;
      out.push(u * u * x0 + 2 * u * s * cx + s * s * x1, u * u * y0 + 2 * u * s * cy + s * s * y1);
    }
  }

  private echCubic(out: number[], x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, pas: number): void {
    for (let i = 1; i <= pas; i++) {
      const s = i / pas, u = 1 - s;
      const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
      out.push(a * x0 + b * c1x + c * c2x + d * x1, a * y0 + b * c1y + c * c2y + d * y1);
    }
  }

  private longueurChemin(pts: number[]): number {
    let L = 0;
    for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    return L;
  }

  private pointLeLongDe(pts: number[], p: number): { x: number; y: number } {
    if (pts.length < 4) return { x: pts[0], y: pts[1] };
    const cible = p * this.longueurChemin(pts);
    let acc = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (acc + seg >= cible) {
        const r = seg ? (cible - acc) / seg : 0;
        return { x: pts[i - 2] + (pts[i] - pts[i - 2]) * r, y: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * r };
      }
      acc += seg;
    }
    return { x: pts[pts.length - 2], y: pts[pts.length - 1] };
  }

  private posElement(el: SchemaElement, t: number): { x: number; y: number } {
    const kfs = this.keyframes.filter(k => k.positions[el.id]);
    if (kfs.length === 0) return { x: el.x, y: el.y };
    if (t <= kfs[0].t) return kfs[0].positions[el.id];
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (t >= a.t && t <= b.t) {
        const r = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        const pa = a.positions[el.id], pb = b.positions[el.id];
        return { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r };
      }
    }
    return kfs[kfs.length - 1].positions[el.id];
  }

  // Terrain : rendu partagé SchemaTerrainRenderer (la copie locale historique est supprimée).

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
