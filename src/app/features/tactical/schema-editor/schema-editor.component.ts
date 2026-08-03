import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import Konva from 'konva';
import { FormationCustom, SchemaTactique, TechniqueService } from '@core/services/technique.service';
import { Joueur, JoueurService, VitesseJoueur } from '@core/services/joueur.service';
import { SchemaPickerDialogComponent } from '../schema-picker-dialog/schema-picker-dialog.component';
import { MatIcon } from "@angular/material/icon";
import { TENSION_TRACE, pointDansPolygone, sousChemin } from './schema-geometrie';
import { FORMATIONS, COUPS_DE_PIED_ARRETES } from './schema-formations.data';
import { SchemaTerrainRenderer } from './schema-terrain.renderer';
import { EspaceTerrain, Terrain, espace } from './schema-espaces';
import { SchemaEspaceDialogComponent } from '../schema-espace-dialog/schema-espace-dialog.component';
import { AuthService } from '@core/services/auth.service';
import { PreferencesService, PREF_ANGLE_SCHEMA, PREF_STYLE_RENDU_SCHEMA } from '@core/services/preferences.service';
import {
  StyleRendu, centreVisuel, dessinerContenuForme, dessinerCorpsElement, ordonnerParProfondeur,
} from '../schema-render/schema-render';
import {
  Camera, CAMERA_DESSUS, INCLINAISON_MAX, ParamsCamera, PRESETS_CAMERA, estInclinee,
} from '../schema-render/schema-camera';
import {
  RegleTactiqueDetail, RegleTactiqueResume, ReglesTactiquesService,
} from '@core/services/regles-tactiques.service';
import {
  PHASES, PHASE_ADVERSE, PhaseKey, ReglesJson,
  miroir, parseRegles, pxVersRel, slotIdsPourRoles, zoneDuPoint,
} from '../moteur/moteur-tactique';
import {
  AncreTrace, BorneVie, Keyframe, Minutage, ModeTraces, RAYON_LIEN, Segment, Vie, VitesseGps,
  aUneVie, dureeMaxTrajectoires, etatTrace, minuter, opaciteVie, posKeyframes, posTrajectoire,
  resoudreBorne, vitesseBallePxS, vitesseJoueurPxS,
} from '../schema-render/schema-animation';
import {
  ContexteMoteur, evaluerPossession, planifierMoteur, posturePourCamp,
} from './schema-moteur-dynamique';
import {
  FormeType, SchemaContenu, SchemaElement, SchemaForme, SchemaTrace, TraceType, TraitForme,
  parserContenu, serialiserContenu,
} from './schema-serialisation';

/**
 * Données du dialog : éditeur de schéma générique, agnostique de la source.
 * - `titre`       : libellé affiché (nom d'exercice ou de schéma).
 * - `schemaJson`  : contenu initial à charger (vide = terrain neuf).
 * - `enregistrer` : action de sauvegarde fournie par l'appelant (exercice ou bibliothèque).
 *                   Reçoit le JSON sérialisé, renvoie l'observable de persistance.
 */
export interface SchemaEditorData {
  titre: string;
  schemaJson?: string;
  /** `apercu` = miniature PNG (data URL) du terrain, pour la grille de la bibliothèque. */
  enregistrer: (schemaJson: string, apercu: string) => Observable<unknown>;
}

type Outil = 'select' | 'deplacement' | 'conduite' | 'passe' | 'tir' | 'surveiller' | 'forme' | 'supprimer';

/**
 * Opacité des objets absents à l'instant courant, HORS lecture. Une zone qui n'apparaît qu'à
 * 4 s doit rester attrapable quand la timeline est au début : on l'estompe, on ne la retire
 * pas. En lecture, elle est réellement absente.
 */
const OPACITE_FANTOME = 0.22;

// Le modèle persisté (SchemaElement / SchemaTrace / SchemaForme + lecture défensive) vit dans
// ./schema-serialisation : c'est le même JSON que relisent le lecteur, la biblio et les diapos.

const VIOLET = '#7c3aed', JAUNE = '#eab308', ROUGE = '#ef4444';
const BLEU = '#2563eb';
const NOIR = '#1f2937';   // jetons « Adversaire » (génériques, éditables)
// Jokers : couleur PROPRE (et non le rouge de l'Équipe 1, indistinguable à l'œil comme à l'import photo).
const ORANGE = '#f97316';

// Keyframe, RAYON_LIEN et les vitesses (VITESSE_DEFAUT_KMH / BALLE_KMH) viennent de
// ../schema-render/schema-animation, partagé avec le lecteur (schema-viewer).
// TENSION_TRACE est importé de ./schema-geometrie (partagé rendu + échantillonnage).

@Component({
  selector: 'app-schema-editor',
  standalone: true,
  templateUrl: './schema-editor.component.html',
  styleUrl: './schema-editor.component.scss',
  imports: [MatIcon],
})
export class SchemaEditorComponent implements AfterViewInit, OnDestroy {

  @ViewChild('stageContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('editorRoot', { static: true }) editorRoot!: ElementRef<HTMLDivElement>;

  estPleinEcran = signal(false);

  readonly data: SchemaEditorData;
  get titre(): string { return this.data.titre; }

  // utiliser pour le trace en cours : points, type, élément lié (jeton/ballon), etc. ; mis à jour au fur et à mesure du dessin. utilise pour activer et desactiver le trace du dessin 
  /**
   * Affichage des flèches : tout le tracé (défaut historique), au fil de l'action (chaque
   * flèche se dessine au passage de son mobile puis s'efface), ou aucune.
   * Persisté avec le schéma : le diaporama rejoue la mise en scène voulue.
   */
  modeTraces = signal<ModeTraces>('toujours');

  terrain = signal<Terrain>('complet');
  outil = signal<Outil>('select');
  echelle = signal(1);
  // Mode de tracé : main libre (à la souris), semi-assisté (clics), assisté (droite départ→arrivée).
  modeDessin = signal<'libre' | 'semi' | 'assiste'>('semi');

  // ── Animation (Phase B) ──
  tempsCourant = signal(0);
  dureeSecondes = signal(10);
  enLecture = signal(false);
  boucle = signal(false);
  vitesse = signal(1);
  // Brique 2 : temps = tout le monde arrive ensemble ; vitesse = chacun son allure le long de sa flèche.
  modeAnim = signal<'temps' | 'vitesse'>('temps');
  // Brique 3 : en mode vitesse, on utilise la vraie vitesse GPS (record vmax ou moyenne vmoy).
  metriqueVitesse = signal<'max' | 'moyenne'>('moyenne');
  private vitesses = new Map<string, VitesseGps>();
  keyframes = signal<Keyframe[]>([]);
  private anim?: Konva.Animation;
  // Palette dépliable
  ouvert = signal<string | null>('formations');

  // équipes / jokers
  readonly equipeEffectif = { couleur: VIOLET, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly equipeRouge = { couleur: ROUGE, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly equipeJaune = { couleur: JAUNE, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  // Adversaire : jetons génériques numérotés, éditables (double-clic → texte libre).
  readonly adversaire = { couleur: NOIR, nums: Array.from({ length: 11 }, (_, i) => i + 1) };
  readonly jokers = { couleur: ORANGE, nums: [1, 2, 3, 4] };

  // Vrais joueurs (joueurId) actuellement posés sur le terrain : grisés/désactivés dans les
  // palettes Mon équipe / Équipe 1 / Équipe 2 tant qu'ils y sont (un joueur = un seul jeton).
  joueursPlaces = signal<Set<string>>(new Set());
  readonly equipement = [
    { type: 'plot', couleur: ROUGE, label: 'Plot rouge' },
    { type: 'plot', couleur: BLEU, label: 'Plot bleu' },
    { type: 'coupelle', couleur: '#f59e0b', label: 'Coupelle' },
    { type: 'but', couleur: '#ffffff', label: 'Mini-but' },
    { type: 'cerceau', couleur: '#f97316', label: 'Cerceau' },
    { type: 'mannequin', couleur: '#64748b', label: 'Mannequin' },
    { type: 'echelle', couleur: JAUNE, label: 'Échelle de rythme' },
    { type: 'haie', couleur: '#f97316', label: 'Haie' },
    { type: 'piquet', couleur: '#22c55e', label: 'Jalon' },
    { type: 'ballon', couleur: '#ffffff', label: 'Ballon' },
  ];

  // Quelle équipe on place : violet = nous (gauche), jaune = adverse (droite, en miroir)
  equipeFormation = signal<string>(VIOLET);
  // Positions normalisées (cf. ./schema-formations.data).
  readonly formations = FORMATIONS;
  formationsCustom = signal<FormationCustom[]>([]);

  // ── Effectif réel (Brique 1) : joueurs de l'équipe de l'utilisateur connecté ──
  effectif = signal<Joueur[]>([]);

  // ── Coups de pied arrêtés ── (données : ./schema-formations.data)
  modeArret = signal<'offensif' | 'defensif'>('offensif');
  private readonly arret = COUPS_DE_PIED_ARRETES;

  private stage!: Konva.Stage;
  private fieldLayer!: Konva.Layer;
  private layer!: Konva.Layer;          // éléments + tracés
  private elements: SchemaElement[] = [];
  private traces: SchemaTrace[] = [];
  private nodesById = new Map<string, Konva.Group>();
  /** Groupe Konva de chaque flèche, pour piloter son état image par image. */
  private traceNodes = new Map<string, Konva.Group>();

  // ── Moteur tactique (mode Dynamique) ──
  // Statique = éditeur classique. Dynamique = les jetons porteurs d'un slot (posés par une
  // formation) et SANS flèche suivent les règles de positionnement quand le ballon bouge,
  // à leur vitesse GPS réelle. Les flèches dessinées gardent le pipeline d'animation.
  modeMoteur = signal(false);
  jeuxMoteur = signal<RegleTactiqueResume[]>([]);
  jeuNousId = signal<string>('');
  profilAdverseId = signal<string>('');          // '' = miroir auto de notre jeu
  phaseMoteur = signal<PhaseKey>('OFF');
  phaseAuto = signal(false);                     // déduite de la possession (porteur du ballon)
  sauverDansRegles = signal(false);              // corrections de jetons → mise à jour des postures
  enregistrement = signal(false);                // REC : échantillonne le scénario en keyframes
  readonly phasesMoteur = PHASES;
  private jeuNous: RegleTactiqueDetail | null = null;
  private reglesNous: ReglesJson | null = null;
  private profilAdverse: RegleTactiqueDetail | null = null;
  private reglesAdverse: ReglesJson | null = null;   // profil choisi (sinon miroir auto)
  private moteurAnim?: Konva.Animation;
  private possessionNous = true;
  private transitionJusqua = 0;                  // fin de la phase transitoire (s, horloge perf)
  /** Porteur désigné à la main (clic sur un jeton en mode Dynamique) ; null = porteur auto. */
  porteurManuelId = signal<string | null>(null);
  private porteurRing?: Konva.Circle;            // halo jaune qui suit le porteur du ballon
  private recDebut = 0;                          // départ du REC (s, horloge perf)
  private recDernierEch = 0;                     // dernier échantillon keyframe (s)
  private saveReglesTimer: ReturnType<typeof setTimeout> | null = null;

  private dessinEnCours: Konva.Line | null = null;
  private pointsEnCours: number[] = [];

  // ── Formes d'annotation (zones) ──
  formeType = signal<FormeType>('rect');
  readonly palette = [
    { nom: 'Rouge', val: '#ef4444' },
    { nom: 'Jaune', val: '#eab308' },
    { nom: 'Bleu', val: '#2563eb' },
    { nom: 'Blanc', val: '#ffffff' },
    { nom: 'Noir', val: '#1f2937' },
  ];
  couleurAnnot = signal<string>('#ef4444');
  /** Les lignes ont leur propre couleur — blanche par défaut, comme un marquage au sol. */
  couleurLigne = signal<string>('#ffffff');
  traitLigne = signal<TraitForme>('plein');
  /** Épaisseurs proposées (px) : fine / moyenne / épaisse. */
  readonly epaisseursLigne = [2, 4, 8];
  epaisseurLigne = signal<number>(4);
  texteTaille = signal<number>(20);   // taille du texte écrit dans une forme (S=14 / M=20 / L=30)
  couleurTexteAnnot = signal<string>('#ffffff');
  readonly paletteTexte = [
    { nom: 'Blanc',  val: '#ffffff' },
    { nom: 'Noir',   val: '#1f2937' },
    { nom: 'Rouge',  val: '#ef4444' },
    { nom: 'Jaune',  val: '#eab308' },
    { nom: 'Bleu',   val: '#2563eb' },
  ];
  private formes: SchemaForme[] = [];
  private formeNodes = new Map<string, Konva.Group>();
  private trForme!: Konva.Transformer;          // poignées de redimensionnement de la forme sélectionnée
  private trElement!: Konva.Transformer;        // poignée d'ORIENTATION du jeton/matériel sélectionné
  private formeEnCours: Konva.Group | null = null;
  private formeEnCoursModel: SchemaForme | null = null;
  private formeStart: { x: number; y: number } | null = null;

  // ── Sélection multiple (cadre / lasso) ──
  modeSelection = signal<'cadre' | 'lasso'>('cadre');
  private selection = new Set<string>();
  private selShape: Konva.Rect | Konva.Line | null = null;   // tracé de la zone de sélection
  private selStart: { x: number; y: number } | null = null;
  private selLassoPts: number[] = [];
  private dragBase = new Map<string, { x: number; y: number }>();

  private get W() { return espace(this.terrain()).W; }
  private get H() { return espace(this.terrain()).H; }

  dialogRef = inject<MatDialogRef<SchemaEditorComponent>>(MatDialogRef);
  private service = inject(TechniqueService);
  private joueurService = inject(JoueurService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private terrainRenderer = inject(SchemaTerrainRenderer);
  private auth = inject(AuthService);
  private reglesService = inject(ReglesTactiquesService);
  private prefs = inject(PreferencesService);

  /** Le mode Dynamique n'est proposé que si le module moteur_tactique est actif (perm résolue). */
  readonly moteurDisponible = this.auth.has('regles_tactiques:read');
  readonly peutEcrireRegles = this.auth.has('regles_tactiques:write');

  /** Style de rendu (préférence par entraîneur, persistée serveur) : tableau ou réaliste. */
  styleRendu(): StyleRendu {
    return this.prefs.valeur(PREF_STYLE_RENDU_SCHEMA) === 'realiste' ? 'realiste' : 'tableau';
  }

  basculerStyleRendu(): void {
    const nouveau: StyleRendu = this.styleRendu() === 'realiste' ? 'tableau' : 'realiste';
    this.prefs.definir(PREF_STYLE_RENDU_SCHEMA, nouveau);
    this.majCamera();
  }

  // ══════════ Caméra : angle de vue du rendu incliné (préférence utilisateur) ══════════

  readonly presetsCamera = PRESETS_CAMERA;
  readonly inclinaisonMax = INCLINAISON_MAX;
  angle = signal<ParamsCamera>({ ...CAMERA_DESSUS });
  /** Sliders d'angle repliés par défaut : leur ligne coûte de la hauteur au terrain. */
  reglageFin = signal(false);

  /** Caméra courante, ou `null` en vue de dessus — auquel cas rien n'est projeté. */
  private camera: Camera | null = null;

  /** L'inclinaison n'a de sens qu'avec les sprites : en mode tableau on reste à plat. */
  private angleActif(): ParamsCamera {
    return this.styleRendu() === 'realiste' ? this.angle() : CAMERA_DESSUS;
  }

  vueInclinee(): boolean { return !!this.camera; }

  presetActif(): string {
    const a = this.angle();
    return this.presetsCamera.find(p => p.params.inclinaison === a.inclinaison && p.params.rotation === a.rotation)?.cle ?? '';
  }

  appliquerPreset(cle: string): void {
    const p = this.presetsCamera.find(x => x.cle === cle);
    if (p) this.definirAngle({ ...p.params });
  }

  reglerInclinaison(v: number): void { this.definirAngle({ ...this.angle(), inclinaison: v }); }
  reglerRotation(v: number): void { this.definirAngle({ ...this.angle(), rotation: v }); }

  private majAngle?: ReturnType<typeof setTimeout>;

  private definirAngle(a: ParamsCamera): void {
    this.angle.set(a);
    this.majCamera();
    // Persistance différée : un glisser de slider émet des dizaines d'événements, et
    // chacun déclencherait sinon un PUT.
    clearTimeout(this.majAngle);
    this.majAngle = setTimeout(() => {
      this.prefsAppliquees = `${this.prefs.valeur(PREF_STYLE_RENDU_SCHEMA) ?? ''}|${a.inclinaison}:${a.rotation}`;
      this.prefs.definir(PREF_ANGLE_SCHEMA, `${a.inclinaison}:${a.rotation}`);
    }, 400);
  }

  private chargerAngle(): void {
    const brut = this.prefs.valeur(PREF_ANGLE_SCHEMA);
    const [i, r] = (brut ?? '').split(':').map(Number);
    if (Number.isFinite(i) && Number.isFinite(r)) {
      this.angle.set({
        inclinaison: Math.max(0, Math.min(INCLINAISON_MAX, i)),
        rotation: Math.max(-180, Math.min(180, r)),
      });
    }
  }

  /** Reconstruit la caméra puis redessine terrain, jetons et tracés au nouvel angle. */
  private majCamera(): void {
    const avant = this.camera;
    const a = this.angleActif();
    this.camera = estInclinee(a) ? new Camera(this.W, this.H, a) : null;
    this.dessinerTerrain();
    this.redessinerElements(avant);
    this.redessinerTraces();
    this.redessinerFormes();
    this.appliquerScene(this.tempsCourant());   // les jetons recréés reprennent leur état de scène
  }

  /** Reprojette les zones d'annotation et rétablit leur déplaçabilité selon l'angle. */
  private redessinerFormes(): void {
    this.detacherForme();   // les poignées de redimensionnement n'ont pas de sens en incliné
    this.formeNodes.forEach((g, id) => {
      const f = this.formes.find(x => x.id === id);
      if (!f) return;
      g.draggable(!this.camera);
      this.dessinerContenuForme(g, f);
    });
    this.layer.draw();
  }

  /** Position ÉCRAN d'un point du terrain (identité en vue de dessus). */
  private versEcran(x: number, y: number): { x: number; y: number; echelle: number } {
    return this.camera ? this.camera.projeter(x, y) : { x, y, echelle: 1 };
  }

  /** Position TERRAIN d'un point d'écran — inverse exacte de {@link versEcran}. */
  private versTerrain(x: number, y: number): { x: number; y: number } {
    return this.camera ? this.camera.deprojeter(x, y) : { x, y };
  }

  /** Pointeur courant, ramené au plan du terrain. */
  private pointeurSol(): { x: number; y: number } | null {
    const p = this.stage.getRelativePointerPosition();
    return p ? this.versTerrain(p.x, p.y) : null;
  }


  /**
   * Re-rend tous les jetons avec le style et l'angle courants. La position VISUELLE peut
   * différer du modèle (animation en cours) : on la reconvertit depuis `camAvant`, la
   * caméra qui l'avait produite, pour qu'aucun jeton ne saute au changement d'angle.
   */
  private redessinerElements(camAvant: Camera | null = this.camera): void {
    this.elements.forEach(el => {
      const n = this.nodesById.get(el.id);
      const sol = n
        ? (camAvant ? camAvant.deprojeter(n.x(), n.y()) : { x: n.x(), y: n.y() })
        : { x: el.x, y: el.y };
      n?.destroy();
      this.nodesById.delete(el.id);
      this.dessinerElement(el);
      this.placerNoeud(this.nodesById.get(el.id), sol.x, sol.y);
    });
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
    this.layer.draw();
  }

  /** Place un nœud d'après des coordonnées TERRAIN (position écran + taille de profondeur). */
  private placerNoeud(n: Konva.Group | undefined, x: number, y: number): void {
    if (!n) return;
    const p = this.versEcran(x, y);
    n.position({ x: p.x, y: p.y });
    n.scale({ x: p.echelle, y: p.echelle });
  }

  /** Points d'un tracé ramenés à l'écran (identité en vue de dessus). */
  private tracePoints(pts: number[]): number[] {
    return this.camera ? this.camera.projeterPolyligne(pts) : pts;
  }

  /** Reconstruit tous les tracés au nouvel angle. */
  private redessinerTraces(): void {
    this.layer.find('.trace').forEach(n => n.destroy());
    this.traceNodes.clear();
    this.traces.forEach(t => this.dessinerTrace(t));
    this.appliquerScene(this.tempsCourant());   // les nœuds sont neufs : ils reprennent l'instant courant
    this.layer.draw();
  }

  /** Empreinte des préférences déjà appliquées, pour ne pas redessiner pour rien. */
  private prefsAppliquees = '';

  constructor() {
    const data = inject<SchemaEditorData>(MAT_DIALOG_DATA);
    this.data = data;
    if (this.data.schemaJson) {
      try { const d = JSON.parse(this.data.schemaJson); if (d.terrain) this.terrain.set(d.terrain); } catch { }
    }
    // Les préférences (style de rendu, angle) arrivent du serveur APRÈS l'ouverture du
    // dialog : sans ce rattrapage, le premier schéma d'une session s'ouvrirait toujours
    // à plat, quel que soit le réglage enregistré.
    effect(() => {
      const empreinte = `${this.prefs.valeur(PREF_STYLE_RENDU_SCHEMA) ?? ''}|${this.prefs.valeur(PREF_ANGLE_SCHEMA) ?? ''}`;
      if (!this.stage || empreinte === this.prefsAppliquees) return;
      this.prefsAppliquees = empreinte;
      this.chargerAngle();
      this.majCamera();
    });
  }

  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({ container: this.containerRef.nativeElement, width: this.W, height: this.H });
    this.fieldLayer = new Konva.Layer();
    this.layer = new Konva.Layer();
    this.stage.add(this.fieldLayer);
    this.stage.add(this.layer);
    // Transformer (poignées) pour redimensionner la forme d'annotation sélectionnée.
    this.trForme = new Konva.Transformer({ rotateEnabled: false, ignoreStroke: true, padding: 4 });
    this.layer.add(this.trForme);
    this.creerTransformerRotation();
    this.prefs.charger();   // style de rendu + angle de caméra persistés par entraîneur
    this.chargerAngle();
    this.majCamera();
    this.chargerSchema();
    this.brancherDessin();
    this.chargerFormations();
    this.chargerEffectif();
    this.chargerVitesses();
    this.chargerJeuxMoteur();
    if (this.keyframes().length === 0) this.resetKeyframes();
    this.onFs = () => { this.estPleinEcran.set(!!document.fullscreenElement); setTimeout(() => this.ajusterAuConteneur(), 60); };
    document.addEventListener('fullscreenchange', this.onFs);
    // Met le terrain à l'échelle du conteneur (tout visible, sans scroll) + suit les redimensionnements.
    window.addEventListener('resize', this.onResize);
    setTimeout(() => this.ajusterAuConteneur(), 0);
  }

  private onFs?: () => void;
  private readonly onResize = () => this.ajusterAuConteneur();

  /** Ajuste l'échelle de la scène pour que tout le terrain tienne dans la zone d'affichage. */
  private ajusterAuConteneur(): void {
    const body = this.containerRef.nativeElement.closest('.editor__pitch-body') as HTMLElement | null;
    if (!body) return;
    const dispoW = body.clientWidth - 10, dispoH = body.clientHeight - 10;   // marge de respiration
    if (dispoW <= 0 || dispoH <= 0) return;
    this.appliquerEchelle(Math.max(0.2, Math.min(dispoW / this.W, dispoH / this.H)));
  }

  /** Applique une échelle à la scène et redimensionne le canvas en conséquence. */
  private appliquerEchelle(s: number): void {
    this.echelle.set(s);
    this.stage.scale({ x: s, y: s });
    this.stage.width(this.W * s);
    this.stage.height(this.H * s);
    this.stage.batchDraw();
  }

  private chargerFormations(): void {
    this.service.listerFormations().subscribe({ next: f => this.formationsCustom.set(f), error: () => { } });
  }

  private chargerEffectif(): void {
    this.joueurService.getAll().subscribe({
      next: js => this.effectif.set(
        js.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))),
      error: () => { },
    });
  }

  private chargerVitesses(): void {
    this.joueurService.getVitesses().subscribe({
      next: (vs: VitesseJoueur[]) => {
        this.vitesses.clear();
        vs.forEach(v => this.vitesses.set(v.joueurId, { vmax: v.vmaxKmh, vmoy: v.vmoyKmh }));
      },
      error: () => { },
    });
  }

  /** px par mètre selon le terrain (pour convertir une vitesse km/h en px/s). */
  private get pxParMetre(): number {
    return this.W / espace(this.terrain()).metres;
  }

  /** Vitesse (px/s) d'un joueur : sa donnée GPS (vmax ou vmoy) sinon vitesse par défaut. */
  private vitesseJoueur(joueur?: SchemaElement): number {
    return vitesseJoueurPxS(joueur, this.vitesses, this.metriqueVitesse(), this.pxParMetre);
  }

  /** Étiquette portée par le jeton : nom de famille (initiales seulement si vraiment trop long). */
  private labelJoueur(j: Joueur): string {
    const nom = (j.nom || '').trim();
    if (nom && nom.length <= 14) return nom.toUpperCase();
    const ini = ((j.prenom?.[0] ?? '') + (nom[0] ?? '')).toUpperCase();
    return ini || nom.slice(0, 3).toUpperCase() || '?';
  }

  /** Rang de ligne d'un poste : gardien(0) → défense(1) → milieu(2-3) → attaque(5).
   *  Codes réels de l'effectif (cf. joueur-form-dialog) : GK, DC, LB, RB, MDC, MC, MG, MD, AG, AD, ATT. */
  private rangPoste(poste?: string): number {
    switch (poste) {
      case 'GK': return 0;
      case 'DC': case 'LB': case 'RB': return 1;
      case 'MDC': return 2;
      case 'MC': case 'MG': case 'MD': return 3;
      case 'AG': case 'AD': return 4;
      case 'ATT': return 5;
      default: return 6; // poste non défini → en fin de liste
    }
  }

  /** Effectif trié par ligne (gardien → attaque) puis par nom, pour remplir une formation. */
  private effectifTriParLigne(): Joueur[] {
    return this.effectif().slice().sort((a, b) =>
      this.rangPoste(a.postePrincipal) - this.rangPoste(b.postePrincipal)
      || (a.nom || '').localeCompare(b.nom || ''));
  }

  /** Ligne d'un emplacement selon sa profondeur x (0=notre but → 1=but adverse) :
   *  0 gardien, 1 défense, 2 milieu, 3 attaque. */
  private lignePosition(x: number): number {
    if (x <= 0.12) return 0;
    if (x <= 0.27) return 1;
    if (x <= 0.40) return 2;
    return 3;
  }

  /** Ligne d'un joueur d'après son poste (mêmes 4 paliers que lignePosition). */
  private ligneJoueur(j: Joueur): number {
    const r = this.rangPoste(j.postePrincipal);
    if (r === 0) return 0;          // GK
    if (r === 1) return 1;          // DC / LB / RB
    if (r <= 3) return 2;           // MDC / MC / MG / MD
    if (r <= 5) return 3;           // AG / AD / ATT
    return 2;                       // poste inconnu → milieu (neutre)
  }

  /** Affecte à chaque emplacement le meilleur joueur dispo : même ligne en priorité, puis la
   *  plus proche. Les joueurs en surnombre sur une ligne restent sur le banc (non placés)
   *  au lieu de déborder sur une autre ligne. positions = profondeurs normalisées (x∈[0,1]). */
  private affecterJoueurs(positions: { x: number; y: number }[]): (Joueur | undefined)[] {
    const pool = this.effectifTriParLigne();   // trié gardien→attaque (départage par rang puis nom)
    return positions.map(pos => {
      const lp = this.lignePosition(pos.x);
      let best = -1, bestScore = Infinity;
      pool.forEach((j, idx) => {
        const score = Math.abs(this.ligneJoueur(j) - lp);   // distance de ligne
        if (score < bestScore) { bestScore = score; best = idx; }
      });
      return best < 0 ? undefined : pool.splice(best, 1)[0];
    });
  }

  /** Ajoute un jeton lié à un vrai joueur, dans la couleur de l'équipe choisie (Mon équipe /
   *  Équipe 1 / Équipe 2). Sans effet si le joueur est déjà posé (grisé dans la palette). */
  ajouterJoueurReel(j: Joueur, couleur: string = VIOLET): void {
    if (this.joueursPlaces().has(j.id)) return;
    this.ajouterElement({
      id: this.uid(), type: 'joueur', couleur,
      label: this.labelJoueur(j), joueurId: j.id,
      x: this.W / 2, y: this.H / 2,
    });
  }

  /** Un vrai joueur est-il déjà posé sur le terrain (donc indisponible dans les palettes) ? */
  estPose(j: Joueur): boolean { return this.joueursPlaces().has(j.id); }

  /** Recalcule l'ensemble des vrais joueurs présents sur le terrain (pour le grisage). */
  private majJoueursPlaces(): void {
    this.joueursPlaces.set(new Set(
      this.elements.filter(e => e.type === 'joueur' && e.joueurId).map(e => e.joueurId!)));
  }

  ngOnDestroy(): void {
    this.pause();
    this.arreterMoteur();
    this.fermerPanneauZone();   // barrette « matérialiser » : posée sur document.body
    if (this.saveReglesTimer) { clearTimeout(this.saveReglesTimer); this.pousserRegles(); }
    if (this.majAngle) {   // angle réglé juste avant la fermeture : on le pousse quand même
      clearTimeout(this.majAngle);
      const a = this.angle();
      this.prefs.definir(PREF_ANGLE_SCHEMA, `${a.inclinaison}:${a.rotation}`);
    }
    if (this.onFs) document.removeEventListener('fullscreenchange', this.onFs);
    window.removeEventListener('resize', this.onResize);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    this.stage?.destroy();
  }

  // ── Palette ──
  basculer(section: string): void { this.ouvert.update(o => o === section ? null : section); }

  /** Palette de droite : repliable pour rendre ses 320 px de largeur au terrain. */
  panneauOuvert = signal(true);

  basculerPanneau(): void {
    this.panneauOuvert.update(o => !o);
    // La grille se recompose au cycle suivant : on remesure ensuite, pas avant.
    setTimeout(() => this.ajusterAuConteneur());
  }

  /**
   * Barre du haut (espace, vue, angle, réglages de l'outil) : repliable elle aussi.
   * Elle passe à la ligne quand la fenêtre rétrécit, donc elle mange d'autant plus de hauteur
   * que l'écran est petit — c'est le plus gros gain de terrain sur un portable.
   */
  bandeauOuvert = signal(true);

  basculerBandeau(): void {
    this.bandeauOuvert.update(o => !o);
    setTimeout(() => this.ajusterAuConteneur());
  }

  espaceCourant(): EspaceTerrain { return espace(this.terrain()); }

  /** Sélecteur d'espace de jeu (vignettes). Un changement redimensionne la scène. */
  choisirEspace(): void {
    this.dialog.open(SchemaEspaceDialogComponent, { data: { courant: this.terrain() }, width: '620px', maxWidth: '94vw' })
      .afterClosed().subscribe((t?: Terrain) => { if (t && t !== this.terrain()) this.changerTerrain(t); });
  }

  changerTerrain(t: Terrain): void {
    this.terrain.set(t);
    // Les dimensions changent : la scène, la caméra et son cadrage se refont dessus.
    this.stage.width(this.W); this.stage.height(this.H);
    this.majCamera();
    this.ajusterAuConteneur();
  }

  choisirOutil(o: Outil): void {
    this.outil.set(o);
    if (o !== 'select') this.clearSelection();
    if (o !== 'select' && o !== 'forme') this.detacherForme();
  }
  choisirForme(t: FormeType): void { this.formeType.set(t); this.outil.set('forme'); }

  /** Couleur pilotée par la palette : celle des lignes quand l'outil Ligne est actif. */
  couleurActive(): string {
    return this.outil() === 'forme' && this.formeType() === 'ligne' ? this.couleurLigne() : this.couleurAnnot();
  }
  choisirCouleur(c: string): void {
    if (this.outil() === 'forme' && this.formeType() === 'ligne') this.couleurLigne.set(c);
    else this.couleurAnnot.set(c);
  }
  estLigne(): boolean { return this.formeType() === 'ligne'; }

  // ── Ajout d'éléments ──
  ajouterJoueur(couleur: string, numero: number): void {
    this.ajouterElement({ id: this.uid(), type: 'joueur', couleur, numero, x: this.W / 2, y: this.H / 2 });
  }
  ajouterEquipement(type: string, couleur: string): void {
    this.ajouterElement({ id: this.uid(), type, couleur, x: this.W / 2, y: this.H / 2 });
  }

  private ajouterElement(el: SchemaElement): void {
    this.elements.push(el);
    this.dessinerElement(el);
    // présent dans toutes les keyframes (à la même position au départ)
    if (this.keyframes().length === 0) this.keyframes.set([{ t: 0, positions: {} }]);
    this.keyframes.update(ks => { ks.forEach(k => k.positions[el.id] = { x: el.x, y: el.y }); return [...ks]; });
    this.majJoueursPlaces();
    this.layer.draw();
  }

  /** Place une formation (11 joueurs) pour l'équipe choisie. Adverse = côté droit en miroir.
   *  Les formations standard portent des rôles → chaque jeton reçoit son slot du moteur tactique. */
  appliquerFormation(f: { nom: string; positions: { x: number; y: number }[]; roles?: string[] }): void {
    if (this.terrain() !== 'complet') this.changerTerrain('complet'); // formations pensées pour le terrain complet
    const couleur = this.equipeFormation();
    const adverse = couleur === NOIR;
    // retirer les joueurs existants de cette couleur (re-cliquer = remplacer)
    this.elements.filter(e => e.type === 'joueur' && e.couleur === couleur).forEach(e => this.nodesById.get(e.id)?.destroy());
    this.elements = this.elements.filter(e => !(e.type === 'joueur' && e.couleur === couleur));
    // « Mon équipe » (violet) = vrais joueurs affectés par ligne ; Adversaire (noir) = numéros génériques
    const affectes = adverse ? [] : this.affecterJoueurs(f.positions);
    const slotIds = f.roles ? slotIdsPourRoles(f.roles) : [];
    const m = 24;
    f.positions.forEach((pos, i) => {
      const nx = adverse ? 1 - pos.x : pos.x;
      const j = affectes[i];
      const el: SchemaElement = {
        id: this.uid(), type: 'joueur', couleur,
        ...(j ? { label: this.labelJoueur(j), joueurId: j.id } : { numero: i + 1 }),
        ...(slotIds[i] ? { slotId: slotIds[i] } : {}),
        x: m + nx * (this.W - 2 * m), y: m + pos.y * (this.H - 2 * m),
      };
      this.elements.push(el);
      this.dessinerElement(el);
    });
    this.resetKeyframes();
    this.layer.draw();
  }

  appliquerFormationCustom(f: FormationCustom): void {
    try { this.appliquerFormation({ nom: f.nom, positions: JSON.parse(f.positionsJson) }); } catch { }
  }

  /** Place un coup de pied arrêté : ballon + notre équipe + l'adversaire (rôle inverse) + mur (CF). */
  placerArret(type: 'corner' | 'cf', cote: 'D' | 'G'): void {
    if (this.terrain() !== 'complet') this.changerTerrain('complet');
    const base = this.arret[type];
    const mode = this.modeArret();
    const flipX = mode === 'defensif';   // défensif = on défend le but gauche
    const flipY = cote === 'G';
    const m = 24;
    const tr = (p: { x: number; y: number }) => ({ x: flipX ? 1 - p.x : p.x, y: flipY ? 1 - p.y : p.y });
    const px = (p: { x: number; y: number }) => ({ x: m + (tr(p).x) * (this.W - 2 * m), y: m + (tr(p).y) * (this.H - 2 * m) });
    const pxN = (p: { x: number; y: number }) => ({ x: m + p.x * (this.W - 2 * m), y: m + p.y * (this.H - 2 * m) }); // p déjà orienté

    const NOUS = this.equipeEffectif.couleur, EUX = NOIR, MANN = '#64748b';
    // on remplace : nos joueurs + adverses + ballons + mannequins
    this.elements.filter(e => e.type === 'ballon' || e.type === 'mannequin'
      || (e.type === 'joueur' && (e.couleur === NOUS || e.couleur === EUX)))
      .forEach(e => this.nodesById.get(e.id)?.destroy());
    this.elements = this.elements.filter(e => !(e.type === 'ballon' || e.type === 'mannequin'
      || (e.type === 'joueur' && (e.couleur === NOUS || e.couleur === EUX))));

    const ajout = (el: SchemaElement) => { this.elements.push(el); this.dessinerElement(el); };

    // ballon dans l'angle / à l'entrée de surface
    const b = px(base.ball);
    ajout({ id: this.uid(), type: 'ballon', couleur: '#fff', x: b.x, y: b.y });

    // offensif : nous = attaquants, eux = défenseurs ; défensif : l'inverse.
    // Positions orientées une fois (tr) ; la ligne pour l'affectation se déduit de la profondeur orientée.
    const nous = (mode === 'offensif' ? base.attaquants : base.defenseurs).map(tr);
    const eux = (mode === 'offensif' ? base.defenseurs : base.attaquants).map(tr);
    const affectes = this.affecterJoueurs(nous);   // notre équipe = vrais joueurs par ligne
    nous.forEach((p, i) => {
      const q = pxN(p); const j = affectes[i];
      ajout({
        id: this.uid(), type: 'joueur', couleur: NOUS,
        ...(j ? { label: this.labelJoueur(j), joueurId: j.id } : { numero: i + 1 }),
        x: q.x, y: q.y,
      });
    });
    eux.forEach((p, i) => { const q = pxN(p); ajout({ id: this.uid(), type: 'joueur', couleur: EUX, numero: i + 1, x: q.x, y: q.y }); });

    // mur de mannequins (coups francs)
    (base.mur ?? []).forEach(p => { const q = px(p); ajout({ id: this.uid(), type: 'mannequin', couleur: MANN, x: q.x, y: q.y }); });

    this.resetKeyframes();
    this.layer.draw();
  }

  /** Enregistre la disposition actuelle de l'équipe choisie comme formation réutilisable. */
  enregistrerFormation(): void {
    const couleur = this.equipeFormation();
    const adverse = couleur === NOIR;
    const joueurs = this.elements.filter(e => e.type === 'joueur' && e.couleur === couleur);
    if (joueurs.length === 0) { this.snack.open('Place des joueurs de cette équipe avant d\'enregistrer', 'Fermer', { duration: 3000 }); return; }
    const nom = prompt('Nom de la formation ?');
    if (!nom) return;
    const m = 24;
    const positions = joueurs.map(e => {
      let nx = (e.x - m) / (this.W - 2 * m);
      if (adverse) nx = 1 - nx;                 // stocker en orientation canonique (gauche)
      return { x: nx, y: (e.y - m) / (this.H - 2 * m) };
    });
    this.service.creerFormation({ nom, couleur, positionsJson: JSON.stringify(positions) }).subscribe({
      next: () => { this.snack.open('Formation enregistrée', 'Fermer', { duration: 2000 }); this.chargerFormations(); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  supprimerFormation(f: FormationCustom, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Supprimer la formation « ${f.nom} » ?`)) return;
    this.service.supprimerFormation(f.id).subscribe({ next: () => this.chargerFormations(), error: () => { } });
  }

  // ── Zoom ── (manuel, par-dessus l'ajustement auto au conteneur)
  zoom(delta: number): void {
    this.appliquerEchelle(Math.min(3, Math.max(0.2, this.echelle() + delta)));
  }

  // ── Sauvegarde ──
  enregistrer(): void {
    this.pause();
    this.detacherForme();      // retire les poignées de l'aperçu
    this.detacherRotation();
    this.scrub(0);   // état de départ : positions cohérentes avec le début des flèches/keyframes
    const data = serialiserContenu({
      terrain: this.terrain(),
      elements: this.elements,
      traces: this.traces,
      formes: this.formes,
      dureeSecondes: this.dureeSecondes(),
      modeAnim: this.modeAnim(),
      metriqueVitesse: this.metriqueVitesse(),
      modeTraces: this.modeTraces(),
      keyframes: this.keyframes(),
    });
    // Miniature pour la grille de la bibliothèque (pixelRatio réduit = data URL légère).
    // Toujours prise à plat : à la taille d'une vignette, une vue inclinée perd la lecture
    // des placements, qui est justement ce qu'on cherche à reconnaître dans la grille.
    const apercu = this.captureVueDeDessus(0.35);
    this.data.enregistrer(data, apercu).subscribe({
      next: () => { this.snack.open('Schéma enregistré', 'Fermer', { duration: 2000 }); this.dialogRef.close(true); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  fermer(): void { this.dialogRef.close(false); }

  /** Bascule l'éditeur en plein écran (toolbar + palette + terrain + timeline). */
  pleinEcran(): void {
    const el = this.editorRoot?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => { });
  }

  /** Vide tout le terrain (éléments + tracés). Le terrain dessiné reste. */
  viderTerrain(): void {
    if (this.elements.length === 0 && this.traces.length === 0 && this.formes.length === 0) return;
    if (!confirm('Vider tout le terrain ? (joueurs, équipement, tracés et formes)')) return;
    this.layer.destroyChildren();   // détruit aussi le transformer → on le recrée
    this.elements = [];
    this.traces = [];
    this.formes = [];
    this.nodesById.clear();
    this.formeNodes.clear();
    this.selection.clear();
    this.trForme = new Konva.Transformer({ rotateEnabled: false, ignoreStroke: true, padding: 4 });
    this.layer.add(this.trForme);
    this.creerTransformerRotation();
    this.porteurRing = undefined;   // détruit avec la couche — recréé au prochain passage en Dynamique
    this.porteurManuelId.set(null);
    if (this.modeMoteur()) this.arreterMoteur();
    this.resetKeyframes();
    this.layer.draw();
  }

  /** Rend la scène à plat le temps d'une capture, puis rétablit l'angle courant. */
  private captureVueDeDessus(pixelRatio: number): string {
    const cam = this.camera;
    if (!cam) return this.imagePleine(() => this.stage.toDataURL({ pixelRatio }));
    this.camera = null;
    this.dessinerTerrain();
    this.redessinerElements(cam);      // les nœuds étaient projetés par `cam` : on déprojette
    this.redessinerTraces();
    this.redessinerFormes();
    const url = this.imagePleine(() => this.stage.toDataURL({ pixelRatio }));
    this.camera = cam;
    this.dessinerTerrain();
    this.redessinerElements(null);     // les nœuds sont à plat : on reprojette
    this.redessinerTraces();
    this.redessinerFormes();
    return url;
  }

  /**
   * Capture avec TOUT affiché : une vignette de bibliothèque est la carte d'identité du
   * schéma, elle ne doit pas dépendre de l'instant où la timeline se trouvait — sans quoi une
   * zone qui n'apparaît qu'à 3 s y sortirait à demi effacée.
   */
  private imagePleine(prendre: () => string): string {
    const avecFleches = this.modeTraces() !== 'aucun';   // « aucune flèche » reste un choix d'auteur
    for (const tr of this.traces) {
      const grp = this.traceNodes.get(tr.id);
      if (!grp) continue;
      grp.visible(avecFleches);
      grp.findOne<Konva.Line>('.ghost')?.visible(false);
      const ligne = grp.findOne<Konva.Line>('.ligne');
      if (ligne) {
        ligne.visible(true); ligne.opacity(1);
        ligne.points(this.tracePoints(tr.points)); ligne.tension(TENSION_TRACE);
      }
      grp.findOne<Konva.Circle>('.bout')?.visible(true);
    }
    [...this.formeNodes.values(), ...this.nodesById.values()].forEach(n => { n.visible(true); n.opacity(1); });
    this.layer.draw();
    const url = prendre();
    this.appliquerScene(this.tempsCourant());   // retour à l'instant où l'on était
    this.layer.draw();
    return url;
  }

  /** Export PNG déclenché par l'utilisateur : garde l'angle qu'il a choisi à l'écran. */
  capture(): void {
    const url = this.imagePleine(() => this.stage.toDataURL({ pixelRatio: 2 }));
    const a = document.createElement('a');
    a.href = url; a.download = `schema-${this.data.titre}.png`; a.click();
  }

  // ══════════ Moteur tactique : mode Dynamique ══════════

  private chargerJeuxMoteur(): void {
    if (!this.moteurDisponible) return;
    this.reglesService.lister().subscribe({
      next: js => {
        this.jeuxMoteur.set(js);
        const nous = js.find(j => j.type === 'NOUS');
        if (nous) this.choisirJeuNous(nous.id);
      },
      error: () => { },   // hors contexte équipe (409) : le mode Dynamique restera indisponible
    });
  }

  jeuxNous(): RegleTactiqueResume[] { return this.jeuxMoteur().filter(j => j.type === 'NOUS'); }
  profilsAdverses(): RegleTactiqueResume[] { return this.jeuxMoteur().filter(j => j.type === 'ADVERSAIRE'); }

  choisirJeuNous(id: string): void {
    this.jeuNousId.set(id);
    this.jeuNous = null; this.reglesNous = null;
    if (!id) return;
    this.reglesService.detail(id).subscribe({
      next: d => { this.jeuNous = d; this.reglesNous = parseRegles(d.reglesJson); },
      error: () => { },
    });
  }

  choisirProfilAdverse(id: string): void {
    this.profilAdverseId.set(id);
    this.profilAdverse = null; this.reglesAdverse = null;
    if (!id) return;   // '' = miroir auto de notre jeu
    this.reglesService.detail(id).subscribe({
      next: d => { this.profilAdverse = d; this.reglesAdverse = parseRegles(d.reglesJson); },
      error: () => { },
    });
  }

  /** Règles adverses effectives : le profil choisi, sinon le miroir auto de notre jeu. */
  private reglesAdverseEffectives(): ReglesJson | null {
    if (this.reglesAdverse) return this.reglesAdverse;
    return this.reglesNous ? miroir(this.reglesNous) : null;
  }

  basculerMoteur(): void {
    if (this.modeMoteur()) { this.arreterMoteur(); return; }
    if (!this.jeuxMoteur().length) {
      this.snack.open('Aucun jeu de règles pour cette équipe — calibre-les dans Plan de jeu → Règles de jeu', 'Fermer', { duration: 4000 });
      return;
    }
    this.modeMoteur.set(true);
    // Un ballon est requis (c'est lui que le moteur suit) : on réutilise celui du terrain,
    // sinon on en pose un au rond central.
    if (!this.elements.some(e => e.type === 'ballon')) {
      this.ajouterElement({ id: this.uid(), type: 'ballon', couleur: '#ffffff', x: this.W / 2, y: this.H / 2 });
    }
    if (!this.porteurRing) {
      this.porteurRing = new Konva.Circle({ radius: 20, stroke: '#fde047', strokeWidth: 3, dash: [5, 4], listening: false, visible: false });
      this.layer.add(this.porteurRing);
    }
    this.moteurAnim?.stop();
    this.moteurAnim = new Konva.Animation(frame => {
      if (frame) this.tickMoteur(frame.timeDiff / 1000);
    }, this.layer);
    this.moteurAnim.start();
  }

  private arreterMoteur(): void {
    this.moteurAnim?.stop();
    this.moteurAnim = undefined;
    if (this.enregistrement()) this.arreterRec(false);
    this.porteurManuelId.set(null);
    this.porteurRing?.visible(false);
    this.modeMoteur.set(false);
  }

  /** Message d'aide contextuel du bandeau Dynamique. */
  aideMoteur(): string {
    if (this.enregistrement()) return 'REC en cours — joue ton scénario au ballon, puis Stop pour le capturer en keyframes.';
    if (this.sauverDansRegles()) return 'Corrections actives : déplacer un jeton réécrit la posture de la zone du ballon (phase en cours).';
    if (this.phaseAuto()) return 'Auto : la phase suit la possession — le ballon reste piloté par toi. Clic sur un jeton = porteur imposé.';
    return 'Glisse le ballon : le bloc suit à vitesse réelle et un porteur vient au ballon. Clic sur un jeton = porteur manuel ; les flèches priment sur le moteur.';
  }

  /** Jeton piloté par le moteur : porteur d'un slot ET sans flèche dessinée (les flèches priment). */
  private estPiloteMoteur(el: SchemaElement): boolean {
    return el.type === 'joueur' && !!el.slotId && !this.traces.some(t => t.elementId === el.id);
  }

  /** Contexte passé aux décisions du moteur (cf. ./schema-moteur-dynamique). */
  private contexteMoteur(ballon: SchemaElement): ContexteMoteur {
    return {
      elements: this.elements,
      ballon,
      W: this.W,
      H: this.H,
      phaseNous: this.phaseMoteur(),
      reglesNous: this.reglesNous,
      reglesAdverse: this.reglesAdverseEffectives(),
      estPilote: el => this.estPiloteMoteur(el as SchemaElement),
      estAdverse: el => (el as SchemaElement).couleur === NOIR,
      porteurManuel: this.porteurManuelId()
        ? this.elements.find(e => e.id === this.porteurManuelId())
        : undefined,
      phaseAuto: this.phaseAuto(),
      possessionNous: this.possessionNous,
    };
  }

  /** Une frame du moteur : cibles interpolées selon le ballon, déplacement aux vitesses réelles. */
  private tickMoteur(dt: number): void {
    const ballon = this.elements.find(e => e.type === 'ballon');
    if (!ballon || dt <= 0) return;
    const bNode = this.nodesById.get(ballon.id);
    // Suit le drag OU la timeline — le nœud est en coordonnées écran, le moteur en terrain.
    if (bNode) { const s = this.versTerrain(bNode.x(), bNode.y()); ballon.x = s.x; ballon.y = s.y; }
    const tNow = performance.now() / 1000;

    if (this.phaseAuto()) {
      const p = evaluerPossession(this.contexteMoteur(ballon), tNow, this.transitionJusqua);
      this.possessionNous = p.possessionNous;
      this.transitionJusqua = p.transitionJusqua;
      if (p.phase) this.phaseMoteur.set(p.phase);
    }

    // Décisions (porteur + cible de chaque jeton piloté) : pures, hors de ce composant.
    const plan = planifierMoteur(this.contexteMoteur(ballon));

    for (const el of this.elements) {
      const cible = plan.cibles.get(el.id) as { x: number; y: number } | undefined;
      if (!cible) continue;
      const n = this.nodesById.get(el.id);
      if (!n || n.isDragging()) continue;   // une correction en cours ne doit pas être combattue
      const dx = cible.x - el.x, dy = cible.y - el.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) continue;
      const pas = this.vitesseJoueur(el) * dt * this.vitesse();
      const r = dist <= pas ? 1 : pas / dist;
      el.x += dx * r; el.y += dy * r;
      this.placerNoeud(n, el.x, el.y);
    }

    // Halo du porteur (suit son jeton ; masqué s'il n'y en a pas).
    if (this.porteurRing) {
      const porteur = plan.porteur as SchemaElement | undefined;
      if (porteur) { const p = this.versEcran(porteur.x, porteur.y); this.porteurRing.visible(true); this.porteurRing.position({ x: p.x, y: p.y }); }
      else this.porteurRing.visible(false);
    }

    // REC : échantillonne le scénario en keyframes toutes les 0,5 s.
    if (this.enregistrement()) {
      const t = tNow - this.recDebut;
      if (t - this.recDernierEch >= 0.5) { this.recDernierEch = t; this.capturerKeyframe(t); }
    }
    // (Konva.Animation redessine la couche à chaque frame — pas de batchDraw manuel.)
  }

  /** Correction en mode Dynamique : si « enregistrer dans les règles » est actif, le déplacement
   *  d'un jeton piloté réécrit la posture de la zone du ballon pour la phase en cours. */
  private corrigerRegleDepuis(el: SchemaElement): void {
    if (!this.sauverDansRegles() || !this.peutEcrireRegles) return;
    if (el.type !== 'joueur' || !el.slotId) return;
    const adverse = el.couleur === NOIR;
    const regles = adverse ? this.reglesAdverse : this.reglesNous;
    const record = adverse ? this.profilAdverse : this.jeuNous;
    if (!regles || !record) {
      if (adverse) this.snack.open('Choisis un profil adverse enregistré pour corriger ses règles (le miroir auto n\'est pas modifiable)', 'Fermer', { duration: 3800 });
      return;
    }
    const ballon = this.elements.find(e => e.type === 'ballon');
    if (!ballon) return;
    const relB = pxVersRel({ x: ballon.x, y: ballon.y }, this.W, this.H);
    const zone = zoneDuPoint(relB.x, relB.y);
    const phase = adverse ? PHASE_ADVERSE[this.phaseMoteur()] : this.phaseMoteur();
    // Posture = positions actuelles de tous les jetons de ce camp porteurs d'un slot.
    regles.phases[phase][zone.key] = posturePourCamp(
      regles.phases[phase][zone.key], this.elements, adverse,
      e => (e as SchemaElement).couleur === NOIR, this.W, this.H,
    );
    this.snack.open(`Règle mise à jour — zone ${zone.h + 1}·${zone.c + 1}, phase ${phase}`, 'Fermer', { duration: 2000 });
    if (this.saveReglesTimer) clearTimeout(this.saveReglesTimer);
    this.saveReglesTimer = setTimeout(() => this.pousserRegles(), 1200);
  }

  /** Pousse les jeux de règles corrigés vers l'API (PUT remplace-tout, débouncé). */
  private pousserRegles(): void {
    this.saveReglesTimer = null;
    const pousser = (rec: RegleTactiqueDetail | null, regles: ReglesJson | null) => {
      if (!rec || !regles) return;
      this.reglesService.modifier(rec.id, {
        type: rec.type, nom: rec.nom, systeme: rec.systeme, reglesJson: JSON.stringify(regles),
      }).subscribe({ error: () => this.snack.open('Mise à jour des règles impossible', 'Fermer', { duration: 3000 }) });
    };
    pousser(this.jeuNous, this.reglesNous);
    pousser(this.profilAdverse, this.reglesAdverse);
  }

  // ── REC : enregistre le scénario joué (moteur + ballon) en keyframes standard ──
  basculerRec(): void {
    if (this.enregistrement()) { this.arreterRec(true); return; }
    if (!this.modeMoteur()) return;
    this.pause();
    this.resetKeyframes();   // t=0 = positions actuelles
    this.recDebut = performance.now() / 1000;
    this.recDernierEch = 0;
    this.enregistrement.set(true);
    this.snack.open('REC — déplace le ballon : le scénario s\'échantillonne en keyframes', 'Fermer', { duration: 3000 });
  }

  private arreterRec(garder: boolean): void {
    this.enregistrement.set(false);
    if (!garder) return;
    const duree = Math.max(1, performance.now() / 1000 - this.recDebut);
    this.capturerKeyframe(duree);
    this.dureeSecondes.set(Math.max(5, Math.ceil(duree)));
    this.scrub(0);
    this.snack.open('Scénario capturé — « Enregistrer » pour le conserver, ▶ pour le rejouer', 'Fermer', { duration: 3500 });
  }

  private capturerKeyframe(t: number): void {
    const positions = Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }]));
    this.keyframes.update(ks => [...ks.filter(k => Math.abs(k.t - t) >= 0.05), { t, positions }].sort((a, b) => a.t - b.t));
  }

  // ══════════ Rendu ══════════
  private chargerSchema(): void {
    const c = parserContenu(this.data.schemaJson);
    if (c) this.chargerContenu(c);
  }

  /** Charge le contenu d'un schéma (éléments, tracés, animation) sur le terrain courant. */
  private chargerContenu(c: SchemaContenu): void {
    c.formes.forEach(f => { this.formes.push(f); this.dessinerForme(f); });
    c.elements.forEach(el => { this.elements.push(el); this.dessinerElement(el); });
    if (this.styleRendu() === 'realiste') ordonnerParProfondeur(this.nodesById.values());
    c.traces.forEach(t => { this.traces.push(t); this.dessinerTrace(t); });
    // Champs absents = réglages courants conservés (compat des schémas anciens).
    if (c.modeAnim) this.modeAnim.set(c.modeAnim);
    if (c.metriqueVitesse) this.metriqueVitesse.set(c.metriqueVitesse);
    if (c.modeTraces) this.modeTraces.set(c.modeTraces);
    if (c.keyframes.length) {
      this.keyframes.set(c.keyframes);
      if (c.dureeSecondes) this.dureeSecondes.set(c.dureeSecondes);
    } else {
      this.resetKeyframes();
    }
    this.majJoueursPlaces();
    this.appliquerScene(this.tempsCourant());
    this.layer.draw();
  }

  /** Importe un schéma de la bibliothèque : COPIE son contenu dans l'éditeur (copy-on-attach).
   *  Le schéma de base n'est jamais modifié ; seul l'enregistrement écrit dans la cible courante. */
  importerDepuisBiblio(): void {
    const ref = this.dialog.open(SchemaPickerDialogComponent, {
      panelClass: 'dark-dialog', width: '760px', maxWidth: '95vw', autoFocus: false,
    });
    ref.afterClosed().subscribe((schema?: SchemaTactique) => {
      if (!schema) return;
      const occupe = this.elements.length > 0 || this.traces.length > 0;
      if (occupe && !confirm('Remplacer le contenu actuel du terrain par ce schéma ?')) return;
      this.pause();
      if (this.modeMoteur()) this.arreterMoteur();
      // Vider le terrain courant (sans la confirmation de viderTerrain).
      this.layer.destroyChildren();
      this.elements = [];
      this.traces = [];
      this.nodesById.clear();
      this.porteurRing = undefined;   // détruit avec la couche
      const c = parserContenu(schema.schemaJson);
      if (c) {
        if (c.terrain) { this.terrain.set(c.terrain); this.majCamera(); }
        this.chargerContenu(c);
      } else {
        this.resetKeyframes();
      }
      this.ajusterAuConteneur();
      this.snack.open(`Schéma « ${schema.nom} » importé`, 'Fermer', { duration: 2000 });
    });
  }

  // Rendu du terrain délégué à SchemaTerrainRenderer (./schema-terrain.renderer).
  private dessinerTerrain(): void {
    if (this.camera) this.terrainRenderer.dessinerPerspective(this.fieldLayer, this.terrain(), this.W, this.H, this.camera);
    else this.terrainRenderer.dessiner(this.fieldLayer, this.terrain(), this.W, this.H);
  }

  private dessinerElement(el: SchemaElement): void {
    const style = this.styleRendu();
    const p = this.versEcran(el.x, el.y);
    const g = new Konva.Group({ x: p.x, y: p.y, scaleX: p.echelle, scaleY: p.echelle, draggable: true });
    const centre = centreVisuel(style);
    // Halo lumineux « joueur à surveiller » (dessiné en premier = derrière le jeton).
    if (el.surveille) {
      const c = el.surveilleCouleur || '#ef4444';
      const hy = style === 'realiste' ? -16 : 0;
      g.add(new Konva.Circle({   // disque flou = effet projecteur
        y: hy, radius: 24, fill: c, opacity: 0.28,
        shadowColor: c, shadowBlur: 22, shadowOpacity: 1,
      }));
      g.add(new Konva.Circle({ y: hy, radius: 22, stroke: c, strokeWidth: 3 }));
    }
    // Visuel de base : module de rendu partagé (tableau = formes historiques, réaliste = sprites).
    dessinerCorpsElement(g, el, style);

    // Badge d'alerte « à surveiller » (au-dessus du jeton, coin haut-droit).
    if (el.surveille) {
      const badge = new Konva.Group({ x: centre.x, y: centre.y });
      badge.add(new Konva.Circle({ radius: 8, fill: '#ef4444', stroke: '#fff', strokeWidth: 1.5 }));
      const bt = new Konva.Text({ text: '!', fontSize: 12, fontStyle: 'bold', fill: '#fff', width: 16, height: 16, align: 'center', verticalAlign: 'middle' });
      bt.offsetX(8); bt.offsetY(8);
      badge.add(bt);
      g.add(badge);
    }

    // Surbrillance de sélection multiple : enfant nommé (suit le déplacement du groupe).
    if (this.selection.has(el.id)) {
      const selRect = style === 'realiste'
        ? { x: -18, y: -42, width: 36, height: 50 }
        : { x: -22, y: -18, width: 44, height: 36 };
      g.add(new Konva.Rect({ name: 'sel-hi', ...selRect, cornerRadius: 6, stroke: '#38bdf8', strokeWidth: 2, dash: [4, 3], listening: false }));
    }

    // Le glisser travaille en coordonnées ÉCRAN (Konva suit le curseur) mais le modèle
    // vit en coordonnées TERRAIN : chaque lecture de position repasse par la caméra.
    g.on('dragstart', () => {
      if (this.selection.has(el.id) && this.selection.size > 1) {
        this.dragBase.clear();
        this.dragBase.set('_anchor', this.versTerrain(g.x(), g.y()));
        this.selection.forEach(id => { const n = this.nodesById.get(id); if (n) this.dragBase.set(id, this.versTerrain(n.x(), n.y())); });
      }
    });
    g.on('dragmove', () => {
      const ici = this.versTerrain(g.x(), g.y());
      // En vue inclinée, le jeton grossit en s'approchant et rapetisse en s'éloignant.
      if (this.camera) { const s = this.versEcran(ici.x, ici.y).echelle; g.scale({ x: s, y: s }); }
      const anchor = this.dragBase.get('_anchor');
      if (!anchor || !this.selection.has(el.id)) { this.layer.batchDraw(); return; }
      // Le groupe se déplace du même vecteur AU SOL (et non du même vecteur d'écran,
      // qui ne représente pas la même distance selon la profondeur).
      const dx = ici.x - anchor.x, dy = ici.y - anchor.y;
      this.selection.forEach(id => {
        if (id === el.id) return;
        const n = this.nodesById.get(id); const base = this.dragBase.get(id);
        if (n && base) this.placerNoeud(n, base.x + dx, base.y + dy);
      });
      this.layer.batchDraw();
    });
    g.on('dragend', () => {
      const sol = this.versTerrain(g.x(), g.y());
      if (this.modeMoteur()) {
        // Mode Dynamique : on synchronise le modèle (pas de keyframe) et on traite la
        // correction éventuelle (toggle « enregistrer dans les règles »).
        el.x = sol.x; el.y = sol.y;
        this.corrigerRegleDepuis(el);
        this.dragBase.clear();
        return;
      }
      const kf = this.keyframeAt(this.tempsCourant(), true)!;   // crée une keyframe si on est entre deux
      const maj = (id: string) => {
        const n = this.nodesById.get(id); const e = this.elements.find(x => x.id === id);
        if (!n || !e) return;
        const s = this.versTerrain(n.x(), n.y());
        e.x = s.x; e.y = s.y; kf.positions[id] = { x: e.x, y: e.y };
      };
      if (this.selection.has(el.id) && this.selection.size > 1) { this.selection.forEach(maj); }
      else { maj(el.id); }
      this.dragBase.clear();
      // La profondeur a changé : on rétablit l'ordre de superposition 2.5D.
      if (this.styleRendu() === 'realiste') { ordonnerParProfondeur(this.nodesById.values()); this.layer.draw(); }
    });
    g.on('click tap', () => {
      if (this.modeMoteur()) {
        // Mode Dynamique : le clic désigne / libère le porteur manuel (pas d'édition).
        if (el.type === 'joueur' && el.slotId) {
          const deja = this.porteurManuelId() === el.id;
          this.porteurManuelId.set(deja ? null : el.id);
          this.snack.open(deja ? 'Porteur automatique' : `Porteur : ${el.label ?? el.numero ?? el.slotId}`, 'Fermer', { duration: 1600 });
        }
        return;
      }
      const o = this.outil();
      if (o === 'supprimer') {
        this.elements = this.elements.filter(e => e.id !== el.id);
        this.nodesById.delete(el.id);
        this.keyframes.update(ks => { ks.forEach(k => delete k.positions[el.id]); return [...ks]; });
        this.traces.forEach(t => { if (t.elementId === el.id) t.elementId = undefined; if (t.ballId === el.id) t.ballId = undefined; });
        if (this.porteurManuelId() === el.id) this.porteurManuelId.set(null);
        g.destroy(); this.majJoueursPlaces(); this.layer.draw();
      } else if (o === 'surveiller') {
        el.surveille = !el.surveille;  // marque/démarque le jeton à surveiller
        el.surveilleCouleur = el.surveille ? this.couleurAnnot() : undefined;
        g.destroy(); this.nodesById.delete(el.id); this.dessinerElement(el); this.layer.draw();
      } else if (o === 'select') {  // eslint pas de redraw lourd : sélection ciblée
        this.definirSelection([el.id]);   // clic simple = sélectionner ce seul jeton
      }
    });
    // Jetons génériques (sans vrai joueur) : double-clic pour éditer le texte (Adversaire, etc.).
    if (el.type === 'joueur' && !el.joueurId) {
      g.on('dblclick dbltap', () => this.editerLabelJeton(el));
    }
    this.nodesById.set(el.id, g);
    this.layer.add(g);
  }

  /** Édite le texte d'un jeton générique : input HTML superposé au jeton (Entrée/clic = valider). */
  private editerLabelJeton(el: SchemaElement): void {
    const g = this.nodesById.get(el.id);
    if (!g) return;
    const pos = g.getAbsolutePosition();
    const box = this.stage.container().getBoundingClientRect();
    const input = document.createElement('input');
    input.value = el.label ?? String(el.numero ?? '');
    input.maxLength = 14;
    Object.assign(input.style, {
      position: 'fixed', left: `${box.left + pos.x - 32}px`, top: `${box.top + pos.y - 12}px`,
      width: '64px', height: '24px', textAlign: 'center', font: 'bold 12px sans-serif',
      border: '2px solid #fff', borderRadius: '5px', background: el.couleur ?? NOIR,
      color: '#fff', outline: 'none', zIndex: '9999',
    } as CSSStyleDeclaration);
    document.body.appendChild(input);
    input.focus(); input.select();
    let fini = false;
    const valider = () => {
      if (fini) return; fini = true;
      const v = input.value.trim();
      el.label = v || undefined;   // vide → on retombe sur le numéro d'origine
      g.destroy(); this.nodesById.delete(el.id); this.dessinerElement(el); this.layer.draw();
      input.remove();
    };
    input.addEventListener('blur', valider);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { fini = true; input.remove(); }
    });
  }

  private dessinerTrace(t: SchemaTrace): Konva.Group {
    const grp = new Konva.Group();
    const couleur = '#fde047';
    const pts = this.tracePoints(t.points);
    // `ligne` est nommée : c'est elle qu'on raccourcit quand la flèche se dessine au fil de
    // l'action. `bout` (impact du tir) n'apparaît qu'une fois le tracé complet.
    const base = { name: 'ligne', points: pts, stroke: couleur, strokeWidth: 3, tension: TENSION_TRACE, lineCap: 'round' as const, lineJoin: 'round' as const };
    // Repère d'édition : le tracé complet, en pâle, sous la flèche. Hors lecture et en mode
    // « au fil de l'action », c'est lui qui reste attrapable — sans quoi une flèche qui ne
    // se joue qu'à 4 s deviendrait insélectionnable dès que la timeline est ailleurs.
    grp.add(new Konva.Line({
      name: 'ghost', points: pts, stroke: couleur, strokeWidth: 3, tension: TENSION_TRACE,
      lineCap: 'round', lineJoin: 'round', opacity: OPACITE_FANTOME, visible: false,
    }));
    if (t.type === 'deplacement') {
      grp.add(new Konva.Arrow({ ...base, dash: [11, 7], fill: couleur, pointerLength: 11, pointerWidth: 11 }));
    } else if (t.type === 'passe') {
      grp.add(new Konva.Arrow({ ...base, fill: couleur, pointerLength: 12, pointerWidth: 12 }));
    } else if (t.type === 'conduite') {
      grp.add(new Konva.Line({ ...base }));
    } else { // tir
      grp.add(new Konva.Line({ ...base }));
      const n = pts.length;
      grp.add(new Konva.Circle({ name: 'bout', x: pts[n - 2], y: pts[n - 1], radius: 6, fill: couleur }));
    }
    grp.on('click tap', () => {
      if (this.outil() === 'supprimer') {
        this.traces = this.traces.filter(x => x.id !== t.id);
        this.traceNodes.delete(t.id);
        grp.destroy(); this.layer.draw();
      }
    });
    grp.name('trace');
    this.traceNodes.set(t.id, grp);
    grp.visible(this.modeTraces() !== 'aucun');   // état réel posé juste après, par appliquerScene

    this.layer.add(grp);
    this.remonterElements();   // les jetons/joueurs restent visuellement au-dessus des tracés
    return grp;
  }

  /**
   * État d'une flèche à l'instant `temps` : visible ou non, et jusqu'où elle est tracée.
   *
   * Hors lecture, ce qui n'est pas encore (ou plus) à l'écran reste affiché en FANTÔME :
   * sinon une flèche ou une zone qui n'existe qu'à 4 s deviendrait impossible à sélectionner
   * et à modifier une fois l'animation revenue au début.
   */
  private appliquerEtatTrace(t: SchemaTrace, grp: Konva.Group, m: Minutage, temps: number): void {
    const mode = this.modeTraces();
    if (mode === 'aucun') { grp.visible(false); return; }   // masquage explicite : pas de repère
    grp.visible(true);
    const et = etatTrace(m.fenetres.get(t.id), temps, mode);
    const ligne = grp.findOne<Konva.Line>('.ligne');
    const ghost = grp.findOne<Konva.Line>('.ghost');
    const bout = grp.findOne<Konva.Circle>('.bout');

    // Hors lecture, le repère pâle prend le relais dès que la flèche n'est pas pleinement là.
    const repere = !this.enLecture() && et.opacite < 1;
    if (ghost) {
      ghost.visible(repere);
      if (repere) { ghost.points(this.tracePoints(t.points)); ghost.tension(TENSION_TRACE); }
    }
    if (!ligne) return;

    ligne.opacity(et.opacite);
    ligne.visible(et.opacite > 0.01 && et.fraction > 0);
    bout?.visible(et.fraction >= 1 && et.opacite > 0.01);
    if (!ligne.visible()) return;
    if (et.fraction >= 1) {
      ligne.points(this.tracePoints(t.points));
      ligne.tension(TENSION_TRACE);
    } else {
      // Le chemin développé EST la courbe rendue : on le tronque et on annule la tension,
      // la recourber une seconde fois écarterait la flèche du jeton qui la suit.
      ligne.points(this.tracePoints(sousChemin(m.chemins.get(t.id) ?? t.points, et.fraction)));
      ligne.tension(0);
    }
  }


  /** Garde les éléments (jetons, ballon, équipement) au premier plan, au-dessus des tracés. */
  private remonterElements(): void {
    this.nodesById.forEach(g => g.moveToTop());
    this.trForme?.moveToTop();
    this.trElement?.moveToTop();
  }

  // ══════════ Sélection multiple (cadre / lasso) ══════════
  /** Vrai si le clic est sur un élément/forme déplaçable ou sur une poignée du transformer. */
  private surInteractif(e: Konva.KonvaEventObject<any>): boolean {
    if (this.surElement(e)) return true;
    let p: Konva.Node | null = e.target.getParent();
    while (p) { if (p === this.trForme || p === this.trElement) return true; p = p.getParent(); }
    return false;
  }

  private definirSelection(ids: string[]): void {
    this.selection = new Set(ids);
    this.detacherForme();
    this.majSurbrillance();
    // Un seul jeton sélectionné → poignée d'orientation (échelle en diagonale, cage de biais…)
    // et barre d'apparition sur la timeline.
    if (ids.length === 1) {
      this.attacherRotation(ids[0]);
      const el = this.elements.find(e => e.id === ids[0]);
      if (el) this.cibleVie.set({ id: el.id, genre: 'element', nom: el.label || el.type });
    } else {
      this.detacherRotation();
    }
  }
  private clearSelection(): void {
    this.cibleVie.set(null);
    this.detacherRotation();
    if (this.selection.size) { this.selection.clear(); this.majSurbrillance(); }
  }

  // ══════════ Orientation d'un élément ══════════

  /**
   * Poignée de rotation libre, avec aimantation tous les 45° si Maj est enfoncée.
   * Le transformer fait tourner le GROUPE pendant le geste ; au relâchement l'angle passe dans
   * `el.rotation` et le groupe revient à 0 — ainsi seul le visuel tourne au redessin, jamais le
   * badge « à surveiller » ni l'étiquette du joueur (cf. dessinerCorpsElement).
   */
  private creerTransformerRotation(): void {
    this.trElement = new Konva.Transformer({
      resizeEnabled: false, rotateEnabled: true, ignoreStroke: true, padding: 6,
      rotateAnchorOffset: 26, borderStroke: '#38bdf8', borderDash: [4, 3], anchorStroke: '#38bdf8',
    });
    this.layer.add(this.trElement);
  }

  private attacherRotation(id: string): void {
    const g = this.nodesById.get(id);
    const el = this.elements.find(e => e.id === id);
    if (!g || !el || !this.trElement || this.modeMoteur()) return;
    // g reste à 0 : l'angle déjà acquis (el.rotation) est porté par le sous-groupe interne du
    // sprite (dessinerCorpsElement) — le Transformer ne pilote qu'un DELTA ajouté à la fin.
    // (Bug précédent : g.rotation(el.rotation) ici doublait l'angle à chaque re-sélection.)
    const base = el.rotation ?? 0;
    this.trElement.nodes([g]);
    this.trElement.moveToTop();
    this.trElement.off('transform.snap transformend.snap');
    this.trElement.on('transform.snap', (e: Konva.KonvaEventObject<any>) => {
      if ((e.evt as MouseEvent | undefined)?.shiftKey) {
        g.rotation(Math.round((base + g.rotation()) / 45) * 45 - base);
      }
    });
    this.trElement.on('transformend.snap', () => {
      const angle = (((base + Math.round(g.rotation())) % 360) + 360) % 360;
      el.rotation = angle || undefined;   // 0 → champ absent (schémas inchangés)
      g.rotation(0);
      g.destroy(); this.nodesById.delete(el.id);
      this.dessinerElement(el);
      this.definirSelection([el.id]);
      this.layer.draw();
    });
    this.layer.batchDraw();
  }

  private detacherRotation(): void {
    if (this.trElement && this.trElement.nodes().length) {
      this.trElement.nodes([]);
      this.layer.batchDraw();
    }
  }
  /** Ajoute/retire le liseré de sélection (enfant nommé) sur chaque jeton. */
  private majSurbrillance(): void {
    this.nodesById.forEach((g, id) => {
      const hi = g.findOne('.sel-hi');
      if (this.selection.has(id) && !hi) {
        const r = new Konva.Rect({ name: 'sel-hi', x: -22, y: -18, width: 44, height: 36, cornerRadius: 6, stroke: '#38bdf8', strokeWidth: 2, dash: [4, 3], listening: false });
        g.add(r); r.moveToBottom();
      } else if (!this.selection.has(id) && hi) {
        hi.destroy();
      }
    });
    this.layer.batchDraw();
  }

  // ══════════ Formes d'annotation ══════════
  // Géométrie et rendu : partagés avec le lecteur (schema-render.contourForme /
  // dessinerContenuForme) — le diaporama ne dessinait aucune zone avant ce partage.

  /** (Re)construit le contenu d'une forme : la géométrie + le texte centré éventuel. */
  private dessinerContenuForme(g: Konva.Group, f: SchemaForme): void {
    dessinerContenuForme(g, f, this.camera);
  }

  private dessinerForme(f: SchemaForme): Konva.Group {
    // Le déplacement d'une zone reste réservé à la vue de dessus : en plan incliné, un
    // vecteur d'écran ne correspond pas à un vecteur au sol constant sur toute la zone.
    const g = new Konva.Group({ draggable: !this.camera, name: 'forme' });
    this.dessinerContenuForme(g, f);
    g.on('dragstart', () => this.fermerPanneauZone());
    g.on('dragend', () => {
      f.x = g.x(); f.y = g.y();
      if (this.trForme?.nodes()[0] === g) this.afficherPanneauZone(f, g);
    });
    g.on('dblclick dbltap', (e) => { e.cancelBubble = true; this.editerTexteForme(f, g); });
    g.on('click tap', (e) => {
      const o = this.outil();
      if (o === 'supprimer') {
        e.cancelBubble = true;
        this.formes = this.formes.filter(x => x.id !== f.id);
        this.formeNodes.delete(f.id);
        this.detacherForme();
        g.destroy(); this.layer.draw();
      } else if (o === 'select' || o === 'forme') {
        e.cancelBubble = true;
        this.selectionnerForme(g, f);
      }
    });
    // Le Transformer agit par mise à l'échelle : on la « cuit » dans w/h au relâcher.
    g.on('transformend', () => {
      // Une ligne droite (horizontale ou verticale) a une dimension nulle : lui imposer le
      // minimum des zones la rendrait bancale au premier redimensionnement.
      const mini = f.type === 'ligne' ? 0 : 12;
      f.w = Math.max(mini, f.w * g.scaleX());
      f.h = Math.max(mini, f.h * g.scaleY());
      f.x = g.x(); f.y = g.y();
      g.scale({ x: 1, y: 1 });
      this.dessinerContenuForme(g, f);
      this.afficherPanneauZone(f, g);   // la barrette suit la nouvelle taille/position
      this.layer.batchDraw();
    });
    this.formeNodes.set(f.id, g);
    this.layer.add(g);
    return g;
  }

  private selectionnerForme(g: Konva.Group, f: SchemaForme): void {
    this.clearSelection();
    this.cibleVie.set({ id: f.id, genre: 'forme', nom: f.texte || LIBELLE_FORME[f.type] || 'Zone' });
    if (this.camera) {
      // Le Transformer redimensionne via un rectangle englobant : sur un polygone projeté,
      // ses poignées ne correspondraient à rien. Le panneau d'édition reste accessible.
      this.snack.open('Repasse en vue « Dessus » pour redimensionner une zone.', 'Fermer', { duration: 2600 });
      this.afficherPanneauZone(f, g);
      return;
    }
    this.trForme.nodes([g]);
    this.trForme.moveToTop();
    this.layer.draw();
    this.afficherPanneauZone(f, g);
  }
  private detacherForme(): void {
    if (this.cibleVie()?.genre === 'forme') this.cibleVie.set(null);
    this.fermerPanneauZone();
    if (this.trForme && this.trForme.nodes().length) { this.trForme.nodes([]); this.layer.batchDraw(); }
  }

  // ══════════ Matérialiser une zone (plots/coupelles/jalons le long de la forme) ══════════

  private panneauZone?: HTMLDivElement;

  private fermerPanneauZone(): void {
    this.panneauZone?.remove();
    this.panneauZone = undefined;
  }

  /** Barrette flottante au-dessus de la forme sélectionnée : matériel + coins/contour. */
  private afficherPanneauZone(f: SchemaForme, g: Konva.Group): void {
    this.fermerPanneauZone();
    const box = this.stage.container().getBoundingClientRect();
    // Ancré sur le coin de la ZONE, pas sur l'origine du groupe : en vue inclinée le groupe
    // est à (0,0) et porte un polygone en coordonnées absolues.
    const coin = this.versEcran(f.x, f.y), ech = this.stage.scaleX();
    const pos = { x: coin.x * ech, y: coin.y * ech };
    const d = document.createElement('div');
    Object.assign(d.style, {
      position: 'fixed',
      left: `${box.left + pos.x}px`,
      top: `${Math.max(box.top + 2, box.top + pos.y - 38)}px`,
      display: 'flex', gap: '5px', alignItems: 'center',
      padding: '5px 7px', borderRadius: '8px',
      background: 'rgba(15,23,42,0.94)', color: '#e2e8f0',
      font: '600 11px sans-serif', zIndex: '9999',
      boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    } as CSSStyleDeclaration);

    const select = document.createElement('select');
    Object.assign(select.style, { font: 'inherit', borderRadius: '5px', border: 'none', padding: '2px 4px' } as CSSStyleDeclaration);
    [['plot', 'Plots'], ['coupelle', 'Coupelles'], ['piquet', 'Jalons']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; select.appendChild(o);
    });
    d.append('Matérialiser :', select);

    ([['coins', 'Coins'], ['contour', 'Contour']] as const).forEach(([mode, libelle]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = libelle;
      Object.assign(b.style, {
        font: 'inherit', cursor: 'pointer', borderRadius: '5px', border: 'none',
        padding: '3px 7px', background: '#38bdf8', color: '#0f172a',
      } as CSSStyleDeclaration);
      b.addEventListener('click', () => this.materialiserZone(f, select.value, mode));
      d.appendChild(b);
    });

    document.body.appendChild(d);
    this.panneauZone = d;
  }

  /** Pose le matériel choisi sur les sommets (coins) ou tout le pourtour (contour) de la zone. */
  private materialiserZone(f: SchemaForme, type: string, mode: 'coins' | 'contour'): void {
    const couleur = type === 'plot' ? ROUGE : type === 'coupelle' ? '#f59e0b' : '#22c55e';
    const points = mode === 'coins' ? this.sommetsZone(f) : this.contourZone(f);
    points.forEach(p => this.ajouterElement({
      id: this.uid(), type, couleur, x: Math.round(p.x), y: Math.round(p.y),
    }));
    this.snack.open(`${points.length} élément(s) posé(s)`, 'Fermer', { duration: 1800 });
  }

  /** Sommets de la forme (points cardinaux pour l'ellipse, extrémités pour une ligne). */
  private sommetsZone(f: SchemaForme): { x: number; y: number }[] {
    const { x, y, w, h } = f;
    if (f.type === 'ligne') {
      return f.montante
        ? [{ x, y: y + h }, { x: x + w, y }]
        : [{ x, y }, { x: x + w, y: y + h }];
    }
    if (f.type === 'triangle') return [{ x: x + w / 2, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    if (f.type === 'losange' || f.type === 'ellipse') {
      return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }];
    }
    return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }

  /** Points régulièrement espacés sur le pourtour (~1 tous les 55 px, de 4 à 24). */
  private contourZone(f: SchemaForme): { x: number; y: number }[] {
    const ESPACEMENT = 55, MIN = 4, MAX = 24;
    const nombre = (perimetre: number) => Math.min(MAX, Math.max(MIN, Math.round(perimetre / ESPACEMENT)));

    // Une ligne n'a pas de pourtour à faire le tour : on jalonne le segment, extrémités
    // comprises (un couloir de plots le long du trait).
    if (f.type === 'ligne') {
      const [a, b] = this.sommetsZone(f);
      const n = nombre(Math.hypot(b.x - a.x, b.y - a.y));
      return Array.from({ length: n }, (_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      });
    }

    if (f.type === 'ellipse') {
      const rx = f.w / 2, ry = f.h / 2;
      // Périmètre d'ellipse : approximation de Ramanujan.
      const p = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
      const n = nombre(p);
      return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return { x: f.x + rx + rx * Math.cos(a), y: f.y + ry + ry * Math.sin(a) };
      });
    }

    const s = this.sommetsZone(f);
    const segments = s.map((a, i) => ({ a, b: s[(i + 1) % s.length] }));
    const cumul: number[] = [];
    let total = 0;
    segments.forEach(({ a, b }) => { total += Math.hypot(b.x - a.x, b.y - a.y); cumul.push(total); });
    if (total === 0) return s;

    const n = nombre(total);
    return Array.from({ length: n }, (_, i) => {
      const d = (total * i) / n;
      let k = cumul.findIndex(c => c >= d);
      if (k < 0) k = segments.length - 1;
      const debut = k === 0 ? 0 : cumul[k - 1];
      const { a, b } = segments[k];
      const t = (d - debut) / ((cumul[k] - debut) || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    });
  }

  /** Édite le texte d'une forme : textarea HTML superposé (Entrée = valider, Maj+Entrée = saut de ligne). */
  private editerTexteForme(f: SchemaForme, g: Konva.Group): void {
    const pos = g.getAbsolutePosition();
    const box = this.stage.container().getBoundingClientRect();
    const s = this.echelle();
    const ta = document.createElement('textarea');
    ta.value = f.texte ?? '';
    Object.assign(ta.style, {
      position: 'fixed',
      left: `${box.left + pos.x}px`, top: `${box.top + pos.y}px`,
      width: `${Math.max(60, f.w * s)}px`, height: `${Math.max(28, f.h * s)}px`,
      textAlign: 'center', font: `bold ${(f.texteTaille ?? this.texteTaille()) * s}px sans-serif`,
      color: f.couleur, background: 'rgba(255,255,255,0.92)',
      border: `2px solid ${f.couleur}`, borderRadius: '6px', outline: 'none',
      resize: 'none', zIndex: '9999', padding: '2px', boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let fini = false;
    const valider = () => {
      if (fini) return; fini = true;
      const v = ta.value.trim();
      f.texte = v || undefined;
      f.texteTaille = this.texteTaille();
      f.texteCouleur = this.couleurTexteAnnot();
      this.dessinerContenuForme(g, f);
      this.layer.draw();
      ta.remove();
    };
    ta.addEventListener('blur', valider);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
      else if (e.key === 'Escape') { fini = true; ta.remove(); }
    });
  }

  // ══════════ Dessin des tracés à la souris ══════════
  private estOutilTrace(o: Outil): o is TraceType {
    return o === 'deplacement' || o === 'conduite' || o === 'passe' || o === 'tir';
  }

  private readonly couleurTrace = '#fde047';

  /** Crée l'aperçu (flèche/ligne) lié à this.pointsEnCours pendant le tracé. */
  private creerApercu(o: TraceType): Konva.Line | Konva.Arrow {
    const base = { points: this.pointsEnCours, stroke: this.couleurTrace, strokeWidth: 3, tension: TENSION_TRACE, lineCap: 'round' as const, lineJoin: 'round' as const };
    return (o === 'deplacement' || o === 'passe')
      ? new Konva.Arrow({ ...base, fill: this.couleurTrace, dash: o === 'deplacement' ? [11, 7] : undefined, pointerLength: 11, pointerWidth: 11 })
      : new Konva.Line({ ...base });
  }

  /** Valide un tracé terminé : liaison + ajout, si assez long. */
  private finaliserTrace(pts: number[]): void {
    const longueurOk = pts.length >= 4 && Math.hypot(pts[pts.length - 2] - pts[0], pts[pts.length - 1] - pts[1]) > 12;
    if (longueurOk) {
      const t: SchemaTrace = { id: this.uid(), type: this.outil() as TraceType, points: pts };
      this.lierTrace(t);   // associe la flèche au jeton/ballon le plus proche de son départ
      this.traces.push(t);
      this.dessinerTrace(t);
    }
  }

  private surElement(e: Konva.KonvaEventObject<any>): boolean {
    return e.target !== this.stage && !!e.target.getParent()?.draggable();
  }

  private brancherDessin(): void {
    // ── Modes "à main libre" et "assisté" : on presse puis on relâche (drag) ──
    this.stage.on('mousedown touchstart', (e) => {
      const o = this.outil();

      // Outil Formes : dessiner une zone (rect/ellipse/losange) par glisser sur le vide.
      if (o === 'forme' && !this.surInteractif(e)) {
        const p = this.pointeurSol();
        if (!p) return;
        this.formeStart = { x: p.x, y: p.y };
        const ligne = this.formeType() === 'ligne';
        const f: SchemaForme = {
          id: this.uid(), type: this.formeType(), x: p.x, y: p.y, w: 1, h: 1,
          couleur: ligne ? this.couleurLigne() : this.couleurAnnot(),
          ...(ligne ? { trait: this.traitLigne(), epaisseur: this.epaisseurLigne(), montante: false } : {}),
        };
        this.formeEnCoursModel = f;
        this.formeEnCours = this.dessinerForme(f);
        this.remonterElements();
        return;
      }

      // Outil Sélection : tracer un cadre / lasso sur le vide pour sélectionner un groupe.
      if (o === 'select' && !this.surInteractif(e)) {
        const p = this.stage.getRelativePointerPosition();
        if (!p) return;
        this.clearSelection(); this.detacherForme();
        this.selStart = { x: p.x, y: p.y };
        if (this.modeSelection() === 'cadre') {
          this.selShape = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, stroke: '#38bdf8', strokeWidth: 1.5, dash: [6, 4], fill: '#38bdf822' });
        } else {
          this.selLassoPts = [p.x, p.y];
          this.selShape = new Konva.Line({ points: this.selLassoPts, stroke: '#38bdf8', strokeWidth: 1.5, dash: [6, 4], closed: false, fill: '#38bdf822' });
        }
        this.layer.add(this.selShape);
        return;
      }

      if (!this.estOutilTrace(o) || this.modeDessin() === 'semi') return; // semi = clics
      if (this.surElement(e)) return;
      const p = this.pointeurSol();
      if (!p) return;
      this.pointsEnCours = [p.x, p.y];
      this.dessinEnCours = this.creerApercu(o);
      this.layer.add(this.dessinEnCours);
      this.remonterElements();
    });

    this.stage.on('mousemove touchmove', () => {
      // Forme en cours de tracé
      if (this.formeEnCours && this.formeEnCoursModel && this.formeStart) {
        const p = this.pointeurSol();
        if (!p) return;
        const f = this.formeEnCoursModel, x0 = this.formeStart.x, y0 = this.formeStart.y;
        f.x = Math.min(x0, p.x); f.y = Math.min(y0, p.y);
        f.w = Math.max(1, Math.abs(p.x - x0)); f.h = Math.max(1, Math.abs(p.y - y0));
        // La boîte est normalisée : seul ce drapeau distingue une diagonale « ↗ » d'une « ↘ ».
        if (f.type === 'ligne') f.montante = (p.x - x0) * (p.y - y0) < 0;
        this.dessinerContenuForme(this.formeEnCours, f);
        this.layer.batchDraw();
        return;
      }
      // Zone de sélection en cours
      if (this.selShape && this.selStart) {
        const p = this.stage.getRelativePointerPosition();
        if (!p) return;
        if (this.modeSelection() === 'cadre') {
          const r = this.selShape as Konva.Rect;
          r.position({ x: Math.min(this.selStart.x, p.x), y: Math.min(this.selStart.y, p.y) });
          r.width(Math.abs(p.x - this.selStart.x)); r.height(Math.abs(p.y - this.selStart.y));
        } else {
          this.selLassoPts.push(p.x, p.y);
          (this.selShape as Konva.Line).points(this.selLassoPts);
        }
        this.layer.batchDraw();
        return;
      }

      if (!this.dessinEnCours) return;
      const p = this.pointeurSol();
      if (!p) return;
      if (this.modeDessin() === 'semi') {
        // aperçu élastique : points posés + segment vers le curseur
        if (this.pointsEnCours.length >= 2) { this.dessinEnCours.points(this.tracePoints([...this.pointsEnCours, p.x, p.y])); this.layer.batchDraw(); }
        return;
      }
      if (this.modeDessin() === 'assiste') {
        // ligne droite : départ -> position courante
        this.dessinEnCours.points(this.tracePoints([this.pointsEnCours[0], this.pointsEnCours[1], p.x, p.y]));
        this.layer.batchDraw();
        return;
      }
      // à main libre : on ajoute un point tous les ~20px
      const n = this.pointsEnCours.length;
      if (Math.hypot(p.x - this.pointsEnCours[n - 2], p.y - this.pointsEnCours[n - 1]) >= 20) {
        this.pointsEnCours.push(p.x, p.y);
        this.dessinEnCours.points(this.tracePoints(this.pointsEnCours));
        this.layer.batchDraw();
      }
    });

    this.stage.on('mouseup touchend', () => {
      // Fin de tracé d'une forme
      if (this.formeEnCours && this.formeEnCoursModel) {
        const f = this.formeEnCoursModel;
        // Une ligne horizontale a une hauteur nulle : c'est sa LONGUEUR qui dit si le geste
        // était un tracé ou un simple clic.
        const troppetit = f.type === 'ligne' ? Math.hypot(f.w, f.h) < 12 : (f.w < 12 || f.h < 12);
        if (troppetit) { this.formeEnCours.destroy(); this.formeNodes.delete(f.id); }
        else { this.formes.push(f); this.selectionnerForme(this.formeEnCours, f); }
        this.formeEnCours = null; this.formeEnCoursModel = null; this.formeStart = null;
        this.remonterElements();
        this.layer.draw();
        return;
      }
      // Fin de zone de sélection
      if (this.selShape && this.selStart) {
        const ids: string[] = [];
        if (this.modeSelection() === 'cadre') {
          const r = this.selShape as Konva.Rect;
          const x1 = r.x(), y1 = r.y(), x2 = x1 + r.width(), y2 = y1 + r.height();
          this.elements.forEach(el => { const n = this.nodesById.get(el.id); if (n) { const cx = n.x(), cy = n.y(); if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) ids.push(el.id); } });
        } else {
          const poly = this.selLassoPts;
          this.elements.forEach(el => { const n = this.nodesById.get(el.id); if (n && pointDansPolygone(n.x(), n.y(), poly)) ids.push(el.id); });
        }
        this.selShape.destroy(); this.selShape = null; this.selStart = null; this.selLassoPts = [];
        this.definirSelection(ids);
        return;
      }

      if (this.modeDessin() === 'semi' || !this.dessinEnCours) return;
      const p = this.pointeurSol();
      let pts: number[];
      if (this.modeDessin() === 'assiste') {
        pts = p ? [this.pointsEnCours[0], this.pointsEnCours[1], p.x, p.y] : this.pointsEnCours;
      } else {
        if (p) this.pointsEnCours.push(p.x, p.y);
        pts = this.pointsEnCours;
      }
      this.dessinEnCours.destroy(); this.dessinEnCours = null;
      this.finaliserTrace(pts);
      this.pointsEnCours = [];
      this.layer.draw();
    });

    // ── Mode "semi-assisté" : clic = poser un point, double-clic = terminer ──
    this.stage.on('click tap', (e) => {
      const o = this.outil();
      if (this.modeDessin() !== 'semi' || !this.estOutilTrace(o) || this.surElement(e)) return;
      const p = this.pointeurSol();
      if (!p) return;
      if (!this.dessinEnCours) {
        this.pointsEnCours = [p.x, p.y];
        this.dessinEnCours = this.creerApercu(o);
        this.layer.add(this.dessinEnCours);
        this.remonterElements();
      } else {
        this.pointsEnCours.push(p.x, p.y);
      }
      this.layer.batchDraw();
    });

    this.stage.on('dblclick dbltap', () => {
      if (this.modeDessin() !== 'semi' || !this.dessinEnCours) return;
      if (this.pointsEnCours.length >= 4) this.pointsEnCours.splice(-2, 2); // retire le point en doublon du double-clic
      const pts = this.pointsEnCours;
      this.dessinEnCours.destroy(); this.dessinEnCours = null;
      this.finaliserTrace(pts);
      this.pointsEnCours = [];
      this.layer.draw();
    });
  }

  // ══════════ Animation / keyframes (Phase B) ══════════
  private resetKeyframes(): void {
    this.keyframes.set([{ t: 0, positions: Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }])) }]);
    this.tempsCourant.set(0);
    this.majJoueursPlaces();   // formations / CPA / vider reconstruisent les éléments
  }

  private appliquerPositions(t: number): void {
    const kfs = this.keyframes();
    const m = this.minutage();          // positions des mobiles + minutage des flèches
    for (const el of this.elements) {
      // En mode Dynamique, les jetons pilotés par le moteur sont animés en direct
      // (tickMoteur) : ni les keyframes ni les tracés ne doivent les écraser.
      if (this.modeMoteur() && this.estPiloteMoteur(el)) continue;
      const legs = m.mobiles.get(el.id);
      const p = legs ? posTrajectoire(legs, t) : posKeyframes(el, t, kfs);
      el.x = p.x; el.y = p.y;
      this.placerNoeud(this.nodesById.get(el.id), p.x, p.y);
    }
    this.appliquerScene(t, m);
    // En 2.5D, l'ordre de superposition dépend de la profondeur : il change à chaque frame.
    if (this.camera) ordonnerParProfondeur(this.nodesById.values());
    this.layer.batchDraw();
  }

  /**
   * Qui est visible à l'instant t : flèches selon le mode d'affichage, zones et jetons selon
   * leur fenêtre d'apparition. Sans réglage, tout est visible — un schéma d'avant ce lot se
   * comporte donc exactement comme avant.
   */
  private appliquerScene(t: number, m: Minutage = this.minutage()): void {
    for (const tr of this.traces) {
      const grp = this.traceNodes.get(tr.id);
      if (grp) this.appliquerEtatTrace(tr, grp, m, t);
    }
    const poser = (n: Konva.Node | undefined, vie: Vie | undefined) => {
      if (!n) return;
      if (!aUneVie(vie)) { n.visible(true); n.opacity(1); return; }
      const o = opaciteVie(vie, m.fenetres, t);
      const op = o === 0 && !this.enLecture() ? OPACITE_FANTOME : o;
      n.visible(op > 0.01);
      n.opacity(op);
    };
    for (const f of this.formes) poser(this.formeNodes.get(f.id), f.vie);
    for (const el of this.elements) poser(this.nodesById.get(el.id), el.vie);
  }

  // ══════════ Brique 2 : flèche = route suivie ══════════
  /** Lie une flèche au jeton (déplacement/conduite) ou ballon (passe/tir) le plus proche du départ. */
  private lierTrace(t: SchemaTrace): void {
    const x0 = t.points[0], y0 = t.points[1];
    if (t.type === 'passe' || t.type === 'tir') {
      const b = this.elementLePlusProche('ballon', x0, y0);
      if (b) { t.elementId = b.id; t.points[0] = b.x; t.points[1] = b.y; }
    } else { // déplacement / conduite -> un joueur
      const j = this.elementLePlusProche('joueur', x0, y0);
      if (j) { t.elementId = j.id; t.points[0] = j.x; t.points[1] = j.y; }
      if (t.type === 'conduite') {
        const b = this.elementLePlusProche('ballon', x0, y0);
        if (b) t.ballId = b.id;   // le ballon est conduit le long du même chemin
      }
    }
  }

  private elementLePlusProche(type: string, x: number, y: number): SchemaElement | undefined {
    let best: SchemaElement | undefined; let dMin = RAYON_LIEN;
    for (const e of this.elements) {
      if (e.type !== type) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= dMin) { dMin = d; best = e; }
    }
    return best;
  }

  /**
   * Trajectoires des mobiles — calcul PARTAGÉ avec le lecteur (schema-animation).
   * Positions de repos = la keyframe 0 : l'animation mute `el.x/el.y` à chaque frame, s'en
   * servir ferait changer le propriétaire d'une flèche en cours de lecture.
   */
  private minutage(): Minutage {
    const kf0 = this.keyframes()[0];
    return minuter({
      elements: this.elements,
      traces: this.traces,
      modeAnim: this.modeAnim(),
      dureeSecondes: this.dureeSecondes(),
      repos: e => kf0?.positions[e.id] ?? { x: e.x, y: e.y },
      vitesseBallePxS: () => vitesseBallePxS(this.pxParMetre),
      vitesseJoueurPxS: j => vitesseJoueurPxS(j, this.vitesses, this.metriqueVitesse(), this.pxParMetre),
    });
  }

  private trajectoires(): Map<string, Segment[]> { return this.minutage().mobiles; }

  /** Durée minimale (s) pour que toutes les chaînes finissent en mode vitesse. */
  private dureeMinPourTraces(): number { return dureeMaxTrajectoires(this.trajectoires()); }

  // Géométrie et minutage : partagés (./schema-geometrie et ../schema-render/schema-animation).

  private aDesTracesAnimees(): boolean { return this.trajectoires().size > 0; }

  /** Keyframe au temps t (création = capture des positions actuelles). */
  private keyframeAt(t: number, create = false): Keyframe | undefined {
    let kf = this.keyframes().find(k => Math.abs(k.t - t) < 0.05);
    if (!kf && create) {
      kf = { t, positions: Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }])) };
      this.keyframes.update(ks => [...ks, kf!].sort((a, b) => a.t - b.t));
    }
    return kf;
  }

  ajouterKeyframe(): void {
    const t = this.tempsCourant();
    const positions = Object.fromEntries(this.elements.map(e => [e.id, { x: e.x, y: e.y }]));
    this.keyframes.update(ks => [...ks.filter(k => Math.abs(k.t - t) >= 0.05), { t, positions }].sort((a, b) => a.t - b.t));
    if (t > this.dureeSecondes()) this.dureeSecondes.set(Math.ceil(t));
  }

  supprimerKeyframeCourante(): void {
    const t = this.tempsCourant();
    if (t === 0) return; // on garde toujours la keyframe de départ
    this.keyframes.update(ks => ks.filter(k => Math.abs(k.t - t) >= 0.05));
  }

  estSurKeyframe(): boolean { return !!this.keyframes().find(k => Math.abs(k.t - this.tempsCourant()) < 0.05); }

  scrub(t: number): void {
    const tt = Math.max(0, Math.min(this.dureeSecondes(), t));
    this.tempsCourant.set(tt);
    this.appliquerPositions(tt);
  }
  scrubBarre(ev: MouseEvent): void {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.scrub(((ev.clientX - r.left) / r.width) * this.dureeSecondes());
  }
  allerKeyframe(kf: Keyframe, ev?: Event): void { ev?.stopPropagation(); this.scrub(kf.t); }
  keyframeSuivante(): void {
    const suiv = this.keyframes().find(k => k.t > this.tempsCourant() + 0.01);
    this.scrub(suiv ? suiv.t : this.dureeSecondes());
  }
  etendreDuree(d: number): void { this.dureeSecondes.set(Math.max(5, this.dureeSecondes() + d)); }
  pct(t: number): number { return this.dureeSecondes() ? (t / this.dureeSecondes()) * 100 : 0; }

  // ── Lecture ──
  basculerLecture(): void { this.enLecture() ? this.pause() : this.play(); }
  private play(): void {
    if (this.keyframes().length < 2 && !this.aDesTracesAnimees()) {
      this.snack.open('Trace une flèche depuis un joueur, ou ajoute 2 keyframes', 'Fermer', { duration: 2800 });
      return;
    }
    // En mode vitesse, étendre la durée pour que la plus longue chaîne se termine.
    if (this.modeAnim() === 'vitesse') {
      const min = this.dureeMinPourTraces();
      if (min > this.dureeSecondes()) this.dureeSecondes.set(Math.ceil(min));
    }
    if (this.tempsCourant() >= this.dureeSecondes()) this.tempsCourant.set(0);
    // Le drapeau passe AVANT la première image : c'est lui qui fait tomber les fantômes
    // d'édition et ne laisse que ce qui est réellement en scène.
    this.enLecture.set(true);
    this.appliquerScene(this.tempsCourant());
    let last = performance.now();
    this.anim = new Konva.Animation(() => {
      const now = performance.now();
      let t = this.tempsCourant() + (now - last) / 1000 * this.vitesse();
      last = now;
      if (t >= this.dureeSecondes()) {
        if (this.boucle()) { t = 0; }
        else { this.tempsCourant.set(this.dureeSecondes()); this.appliquerPositions(this.dureeSecondes()); this.pause(); return; }
      }
      this.tempsCourant.set(t);
      this.appliquerPositions(t);
    }, this.layer);
    this.anim.start();
  }
  private pause(): void {
    this.anim?.stop(); this.anim = undefined; this.enLecture.set(false);
    this.appliquerScene(this.tempsCourant());   // retour à l'édition : les absents redeviennent fantômes
    this.layer.batchDraw();
  }

  private uid(): string { return Math.random().toString(36).slice(2, 10); }

  // ══════════ Affichage des flèches ══════════

  /** Fait tourner le mode d'affichage des flèches : tout → au fil de l'action → aucune. */
  cyclerModeTraces(): void {
    const suite: Record<ModeTraces, ModeTraces> = { toujours: 'action', action: 'aucun', aucun: 'toujours' };
    this.modeTraces.update(m => suite[m]);
    this.appliquerScene(this.tempsCourant());
    this.layer.batchDraw();
  }

  /** Icônes prises dans Material Icons CLASSIQUE (cf. index.html) : `gesture` et `timeline`
   *  y figurent, un nom Material Symbols rendrait un bouton vide. */
  iconeModeTraces(): string {
    const m = this.modeTraces();
    return m === 'toujours' ? 'timeline' : m === 'action' ? 'gesture' : 'visibility_off';
  }

  libelleModeTraces(): string {
    const m = this.modeTraces();
    return m === 'toujours' ? 'Flèches : tout le tracé'
      : m === 'action' ? "Flèches : au fil de l'action (chacune se dessine puis s'efface)"
        : 'Flèches : aucune';
  }

  // ══════════ Fenêtre d'apparition (mise en scène) ══════════

  /**
   * Objet dont on règle l'apparition : la zone ou le jeton sélectionné, seul. Une barre de vie
   * n'a de sens que pour une cible unique — sur une sélection multiple, on ne saurait pas quoi
   * afficher sur la timeline.
   */
  cibleVie = signal<{ id: string; genre: 'forme' | 'element'; nom: string } | null>(null);

  private modeleVie(): SchemaForme | SchemaElement | undefined {
    const c = this.cibleVie();
    if (!c) return undefined;
    return c.genre === 'forme' ? this.formes.find(f => f.id === c.id) : this.elements.find(e => e.id === c.id);
  }

  /** Vrai si la cible porte une fenêtre (sinon elle est visible d'un bout à l'autre). */
  cibleAUneVie(): boolean { return aUneVie(this.modeleVie()?.vie); }

  /** Bornes de la cible RÉSOLUES en secondes (une ancre suit la flèche à laquelle elle est liée). */
  vieDebut(): number { return resoudreBorne(this.modeleVie()?.vie?.debut, this.minutage().fenetres, 0); }
  vieFin(): number {
    const f = resoudreBorne(this.modeleVie()?.vie?.fin, this.minutage().fenetres, this.dureeSecondes());
    return Math.min(f, this.dureeSecondes());
  }

  /** Vrai si la borne est ancrée à une flèche plutôt qu'à un instant fixe. */
  vieAncree(bord: 'debut' | 'fin'): boolean {
    const b = this.modeleVie()?.vie?.[bord];
    return !!b && typeof b === 'object';
  }

  private majVie(maj: (v: Vie) => Vie): void {
    const m = this.modeleVie();
    if (!m) return;
    const v = maj({ ...(m.vie ?? {}) });
    m.vie = v.debut === undefined && v.fin === undefined ? undefined : v;
    this.appliquerScene(this.tempsCourant());
    this.layer.batchDraw();
  }

  /** « Apparaît ici » / « Disparaît ici » : fige la borne au temps courant. */
  poserBorneVie(bord: 'debut' | 'fin'): void {
    const t = Math.round(this.tempsCourant() * 10) / 10;
    this.majVie(v => ({ ...v, [bord]: t }));
  }

  /** Ancre la borne au départ ou à la fin d'une flèche : elle suivra le minutage. */
  ancrerBorneVie(bord: 'debut' | 'fin', ancre: AncreTrace | null): void {
    this.majVie(v => ({ ...v, [bord]: ancre ?? undefined }));
  }

  /** Retire toute contrainte : la cible redevient visible du début à la fin. */
  effacerVie(): void { this.majVie(() => ({})); }

  /** Flèches proposables comme ancre, dans l'ordre où elles sont jouées. */
  ancresPossibles(): { id: string; libelle: string; t0: number; t1: number }[] {
    const fen = this.minutage().fenetres;
    return this.traces
      .filter(t => fen.has(t.id))
      .map((t, i) => ({ id: t.id, libelle: `${LIBELLE_TRACE[t.type] ?? t.type} ${i + 1}`, ...fen.get(t.id)! }))
      .sort((a, b) => a.t0 - b.t0);
  }

  /** Valeur du menu d'ancrage d'une borne : '' = instant fixe. */
  valeurAncre(bord: 'debut' | 'fin'): string {
    const b = this.modeleVie()?.vie?.[bord];
    return b && typeof b === 'object' ? `${b.trace}|${b.bord}` : '';
  }

  choisirAncre(bord: 'debut' | 'fin', valeur: string): void {
    if (!valeur) { this.poserBorneVie(bord); return; }   // retour à un instant fixe : le temps courant
    const [trace, cote] = valeur.split('|');
    this.ancrerBorneVie(bord, { trace, bord: cote === 'fin' ? 'fin' : 'debut' });
  }
}

const LIBELLE_TRACE: Record<string, string> = {
  deplacement: 'Course', conduite: 'Conduite', passe: 'Passe', tir: 'Tir',
};

const LIBELLE_FORME: Record<string, string> = {
  rect: 'Rectangle', ellipse: 'Ovale', losange: 'Losange', triangle: 'Triangle',
};

