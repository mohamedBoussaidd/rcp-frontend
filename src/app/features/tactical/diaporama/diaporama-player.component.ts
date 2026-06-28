import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy,
  Output, ViewChild, computed, inject, signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIcon } from '@angular/material/icon';
import Konva from 'konva';
import { SchemaViewerComponent } from '../schema-viewer/schema-viewer.component';
import { BlocTexte, DiaporamaDetail, Slide, StyleTexte, normaliserBlocs, styleBloc } from './diaporama.service';

type Mode = 'nav' | 'draw';
type Outil = 'trait' | 'fleche';

const COULEURS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6'];
const SEUIL_SWIPE = 50;
const STYLE_TEXTE_DEFAUT: StyleTexte = {
  couleurTexte: '#FFFFFF', couleurFond: '#0B0E16', taille: 52, alignH: 'center', alignV: 'center', gras: true,
};

/**
 * Lecteur présentateur plein écran d'un diaporama, navigation MANUELLE (clavier / clic / swipe).
 * Rendus : SCHEMA (via SchemaViewer, animation incluse), IMAGE (plein cadre), VIDEO_LIEN (iframe
 * sans autoplay), TEXTE (message mis en forme). Couche d'annotation Konva éphémère sur SCHEMA et
 * IMAGE (trait / flèche, effacer ou annuler le dernier tracé, effacée au changement de slide).
 * Barre d'outils : pilule flottante (variante A).
 */
@Component({
  selector: 'app-diaporama-player',
  standalone: true,
  imports: [SchemaViewerComponent, MatIcon],
  template: `
    <div class="pl" #host
         (click)="onTap($event)"
         (touchstart)="onTouchStart($event)"
         (touchend)="onTouchEnd($event)">

      <div class="pl__stage" #stage>
        @if (slide(); as s) {
          @switch (s.type) {
            @case ('SCHEMA') { <app-schema-viewer [schemaJson]="s.schemaJson" [largeur]="largeurSchema()" /> }
            @case ('IMAGE')  { <img class="pl__img" [src]="s.imageSrc" alt=""> }
            @case ('VIDEO_LIEN') {
              @if (videoUrl(); as v) { <iframe class="pl__video" [src]="v" allow="fullscreen; encrypted-media" allowfullscreen></iframe> }
              @else { <div class="pl__msg">Lien vidéo non reconnu</div> }
            }
            @case ('TEXTE') {
              <div class="pl__texte" [style.background]="styleTexte().couleurFond" [style.justifyContent]="styleTexte().alignV">
                @for (b of blocsTexte(); track $index) {
                  @if (b.type === 'LISTE') {
                    @if (b.ordonnee) {
                      <ol class="pl__liste" [style.color]="sb(b).couleur" [style.fontSize.px]="sb(b).taille" [style.fontWeight]="sb(b).gras ? 800 : 500" [style.textAlign]="sb(b).alignH">
                        @for (it of itemsNonVides(b); track $index) { <li>{{ it }}</li> }
                      </ol>
                    } @else {
                      <ul class="pl__liste" [style.color]="sb(b).couleur" [style.fontSize.px]="sb(b).taille" [style.fontWeight]="sb(b).gras ? 800 : 500" [style.textAlign]="sb(b).alignH">
                        @for (it of itemsNonVides(b); track $index) { <li>{{ it }}</li> }
                      </ul>
                    }
                  } @else {
                    <div class="pl__para" [style.color]="sb(b).couleur" [style.fontSize.px]="sb(b).taille" [style.fontWeight]="sb(b).gras ? 800 : 500" [style.textAlign]="sb(b).alignH">{{ b.texte }}</div>
                  }
                }
              </div>
            }
          }
          <div #annot class="pl__annot" [style.pointerEvents]="(mode() === 'draw' && annotable()) ? 'auto' : 'none'"></div>
        }
      </div>

      @if (imageSuivante(); as next) { <img [src]="next" alt="" style="display:none"> }

      @if (posVisible()) { <div class="pl__pos">{{ index() + 1 }} / {{ total() }}</div> }

      <!-- Barre d'outils — variante A : pilule flottante -->
      <div class="pl__bar" (click)="$event.stopPropagation()">
        <button class="pl__btn" (click)="precedent()" [disabled]="index() === 0" title="Précédent"><mat-icon>chevron_left</mat-icon></button>
        <button class="pl__btn" (click)="suivant()" [disabled]="index() === total() - 1" title="Suivant"><mat-icon>chevron_right</mat-icon></button>

        @if (annotable()) {
          <span class="pl__sep"></span>
          <button class="pl__btn pl__btn--wide" [class.pl__btn--on]="mode() === 'draw'" (click)="basculerMode()">
            <mat-icon>edit</mat-icon>{{ mode() === 'draw' ? 'Navigation' : 'Annoter' }}
          </button>
          @if (mode() === 'draw') {
            <span class="pl__sep"></span>
            <button class="pl__btn" [class.pl__btn--on]="outil() === 'trait'" (click)="outil.set('trait')" title="Trait"><mat-icon>show_chart</mat-icon></button>
            <button class="pl__btn" [class.pl__btn--on]="outil() === 'fleche'" (click)="outil.set('fleche')" title="Flèche"><mat-icon>north_east</mat-icon></button>
            @for (c of couleurs; track c) {
              <button class="pl__couleur" [class.pl__couleur--on]="couleur() === c" [style.background]="c" (click)="couleur.set(c)"></button>
            }
            <button class="pl__btn" (click)="annulerDernier()" [disabled]="nbAnnot() === 0" title="Annuler le dernier tracé"><mat-icon>undo</mat-icon></button>
            <button class="pl__btn pl__btn--danger" (click)="effacer()" [disabled]="nbAnnot() === 0" title="Tout effacer"><mat-icon>delete_sweep</mat-icon></button>
          }
        }

        <span class="pl__sep"></span>
        <button class="pl__btn" (click)="posVisible.set(!posVisible())" title="Afficher/masquer le repère"><mat-icon>tag</mat-icon></button>
        <button class="pl__btn" (click)="fermerLecteur()" title="Quitter le plein écran"><mat-icon>close</mat-icon></button>
      </div>
    </div>
  `,
  styles: [`
    .pl { position: fixed; inset: 0; z-index: 1000; background: #0B0E16; display: flex; align-items: center; justify-content: center; }
    .pl__stage { position: relative; max-width: 100vw; max-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .pl__img { max-width: 96vw; max-height: 94vh; object-fit: contain; display: block; }
    .pl__video { width: 90vw; height: 50.6vw; max-height: 88vh; max-width: 156vh; border: 0; background: #000; }
    .pl__texte { width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; gap: .55em; padding: 7vh 6vw; }
    .pl__para { white-space: pre-wrap; line-height: 1.2; max-width: 90%; }
    .pl__liste { max-width: 90%; margin: 0; padding-left: 1.3em; line-height: 1.25; }
    .pl__liste li { margin: .12em 0; }
    .pl__msg { color: #fff; opacity: .7; padding: 40px; }
    .pl__annot { position: absolute; inset: 0; }
    .pl__pos { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); color: #fff; background: rgba(18,22,32,.72); backdrop-filter: blur(8px); padding: 5px 13px; border-radius: 999px; font-size: .9rem; font-weight: 600; }
    .pl__bar { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; background: rgba(18,22,32,.82); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 9px 11px; box-shadow: 0 18px 48px rgba(0,0,0,.5); }
    .pl__btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 42px; height: 42px; border-radius: 11px; border: none; background: rgba(255,255,255,.08); color: #fff; cursor: pointer; transition: background .12s, color .12s; }
    .pl__btn mat-icon { font-size: 21px; width: 21px; height: 21px; }
    .pl__btn--wide { width: auto; padding: 0 15px; font-weight: 600; font-size: 14px; }
    .pl__btn:hover:not(:disabled) { background: rgba(255,255,255,.16); }
    .pl__btn:disabled { opacity: .3; cursor: default; }
    .pl__btn--on { background: #3b82f6; }
    .pl__btn--on:hover { background: #2563eb; }
    .pl__btn--danger:hover:not(:disabled) { background: rgba(244,63,94,.22); color: #FCA5A5; }
    .pl__sep { width: 1px; height: 26px; background: rgba(255,255,255,.12); margin: 0 2px; }
    .pl__couleur { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); cursor: pointer; }
    .pl__couleur--on { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
  `],
})
export class DiaporamaPlayerComponent implements AfterViewInit, OnDestroy {

  @Input({ required: true }) diaporama!: DiaporamaDetail;
  @Output() fermer = new EventEmitter<void>();

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('annot', { static: false }) annotRef?: ElementRef<HTMLDivElement>;

  private sanitizer = inject(DomSanitizer);

  readonly couleurs = COULEURS;
  index = signal(0);
  posVisible = signal(true);
  mode = signal<Mode>('nav');
  outil = signal<Outil>('trait');
  couleur = signal(COULEURS[0]);
  nbAnnot = signal(0);   // nombre de tracés sur le slide courant (pour activer annuler/effacer)

  private largeurEcran = signal(window.innerWidth);
  readonly total = computed(() => this.diaporama.slides.length);
  readonly slide = computed<Slide | undefined>(() => this.diaporama.slides[this.index()]);
  readonly annotable = computed(() => { const t = this.slide()?.type; return t === 'SCHEMA' || t === 'IMAGE'; });
  readonly largeurSchema = computed(() => Math.min(this.largeurEcran() * 0.92, window.innerHeight * 1.45));
  readonly styleTexte = computed<StyleTexte>(() => {
    const s = this.slide();
    if (s?.type !== 'TEXTE' || !s.styleJson) return STYLE_TEXTE_DEFAUT;
    try { return { ...STYLE_TEXTE_DEFAUT, ...JSON.parse(s.styleJson) }; } catch { return STYLE_TEXTE_DEFAUT; }
  });
  readonly blocsTexte = computed<BlocTexte[]>(() => {
    const s = this.slide();
    return s?.type === 'TEXTE' ? normaliserBlocs(this.styleTexte(), s.texte) : [];
  });
  sb(b: BlocTexte) { return styleBloc(b, this.styleTexte()); }
  itemsNonVides(b: BlocTexte): string[] { return (b.items ?? []).filter(i => i.trim().length); }
  readonly videoUrl = computed<SafeResourceUrl | null>(() => {
    const s = this.slide();
    if (s?.type !== 'VIDEO_LIEN' || !s.videoUrl) return null;
    const embed = this.toEmbed(s.videoUrl);
    return embed ? this.sanitizer.bypassSecurityTrustResourceUrl(embed) : null;
  });
  readonly imageSuivante = computed(() => {
    const next = this.diaporama.slides[this.index() + 1];
    return next?.type === 'IMAGE' ? next.imageSrc : undefined;
  });

  private stage?: Konva.Stage;
  private layer?: Konva.Layer;
  private dessin?: Konva.Line | Konva.Arrow;
  private touchX = 0;
  private plulein = false;
  private fermeture = false;

  ngAfterViewInit(): void {
    this.hostRef.nativeElement.requestFullscreen?.()
      .then(() => { this.plulein = true; })
      .catch(() => { /* fallback : overlay plein viewport */ });
    queueMicrotask(() => this.initAnnotation());
  }

  ngOnDestroy(): void {
    this.stage?.destroy();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (this.plulein && !document.fullscreenElement && !this.fermeture) {
      this.plulein = false;
      this.fermerLecteur();
    }
  }

  // ── Navigation ──
  suivant(): void { if (this.index() < this.total() - 1) { this.index.update(i => i + 1); this.auChangement(); } }
  precedent(): void { if (this.index() > 0) { this.index.update(i => i - 1); this.auChangement(); } }

  onTap(ev: MouseEvent): void {
    if (this.mode() === 'draw') return;
    const t = ev.target as HTMLElement;
    if (t.closest('iframe') || t.closest('app-schema-viewer')) return;
    this.suivant();
  }

  onTouchStart(ev: TouchEvent): void { this.touchX = ev.changedTouches[0].clientX; }
  onTouchEnd(ev: TouchEvent): void {
    if (this.mode() === 'draw') return;
    const dx = ev.changedTouches[0].clientX - this.touchX;
    if (Math.abs(dx) < SEUIL_SWIPE) return;
    dx < 0 ? this.suivant() : this.precedent();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    switch (ev.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': ev.preventDefault(); this.suivant(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': ev.preventDefault(); this.precedent(); break;
      case 'Escape': this.fermerLecteur(); break;
    }
  }

  @HostListener('window:resize')
  onResize(): void { this.largeurEcran.set(window.innerWidth); this.dimensionnerStage(); }

  fermerLecteur(): void {
    if (this.fermeture) return;
    this.fermeture = true;
    this.fermer.emit();
  }

  // ── Annotation ──
  basculerMode(): void { this.mode.update(m => m === 'draw' ? 'nav' : 'draw'); }

  private auChangement(): void {
    this.effacer();
    queueMicrotask(() => this.dimensionnerStage());
  }

  private initAnnotation(): void {
    const el = this.annotRef?.nativeElement;
    if (!el) return;
    this.stage = new Konva.Stage({ container: el, width: el.clientWidth || 1, height: el.clientHeight || 1 });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.on('mousedown touchstart', () => this.debutTrace());
    this.stage.on('mousemove touchmove', () => this.continuerTrace());
    this.stage.on('mouseup touchend', () => this.finTrace());
  }

  private dimensionnerStage(): void {
    const el = this.annotRef?.nativeElement;
    if (!el || !this.stage) return;
    this.stage.size({ width: el.clientWidth || 1, height: el.clientHeight || 1 });
    this.stage.draw();
  }

  private debutTrace(): void {
    if (this.mode() !== 'draw' || !this.annotable() || !this.stage || !this.layer) return;
    const p = this.stage.getPointerPosition();
    if (!p) return;
    if (this.outil() === 'trait') {
      this.dessin = new Konva.Line({ points: [p.x, p.y], stroke: this.couleur(), strokeWidth: 4, lineCap: 'round', lineJoin: 'round', tension: 0.4 });
    } else {
      this.dessin = new Konva.Arrow({ points: [p.x, p.y, p.x, p.y], stroke: this.couleur(), fill: this.couleur(), strokeWidth: 4, pointerLength: 12, pointerWidth: 12 });
    }
    this.layer.add(this.dessin);
    this.nbAnnot.set(this.layer.children.length);
  }

  private continuerTrace(): void {
    if (!this.dessin || !this.stage) return;
    const p = this.stage.getPointerPosition();
    if (!p) return;
    if (this.outil() === 'trait') {
      this.dessin.points(this.dessin.points().concat([p.x, p.y]));
    } else {
      const pts = this.dessin.points();
      this.dessin.points([pts[0], pts[1], p.x, p.y]);
    }
    this.layer?.batchDraw();
  }

  private finTrace(): void { this.dessin = undefined; }

  /** Annule le dernier tracé seulement (pas tout). */
  annulerDernier(): void {
    const enfants = this.layer?.children;
    if (!enfants || enfants.length === 0) return;
    enfants[enfants.length - 1].destroy();
    this.layer?.draw();
    this.nbAnnot.set(this.layer?.children.length ?? 0);
  }

  effacer(): void { this.layer?.destroyChildren(); this.layer?.draw(); this.nbAnnot.set(0); }

  // ── Vidéo ──
  private toEmbed(url: string): string | null {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    if (/\/embed\/|player\./.test(url)) return url;
    return null;
  }
}
