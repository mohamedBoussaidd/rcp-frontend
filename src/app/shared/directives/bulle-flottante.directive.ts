import { Directive, ElementRef, HostBinding, HostListener, Input, OnInit, inject } from '@angular/core';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';

/** Position enregistrée, en pixels depuis le coin bas-droit (repère stable au redimensionnement). */
interface PositionBulle { droite: number; bas: number; }

const CLE_STORAGE = 'bulles-flottantes';
const MARGE = 12;          // marge minimale avec les bords de l'écran
const TAILLE_BULLE = 46;   // doit rester cohérent avec la taille du bouton en SCSS

/**
 * Bulle flottante déplaçable (cloche, messagerie, assistant). Applique le positionnement, le
 * déplacement par glisser (CDK), la mémorisation de la position et le sens d'ouverture du panneau.
 *
 * <p>Trois pièges traités ici, invisibles mais bloquants si on ne les gère pas :
 * <ul>
 *   <li><strong>clic vs glisser</strong> : sans seuil, déplacer la bulle l'ouvrirait au relâchement.
 *       Le CDK ne démarre un glisser qu'au-delà de 5 px ; on marque alors le geste pour que le
 *       composant ignore le clic qui suit ({@link aGlisse}) ;</li>
 *   <li><strong>sens d'ouverture</strong> : le panneau est ancré en bas à droite par défaut. Bulle
 *       déplacée en haut ou à gauche, il sortirait de l'écran → on expose {@code data-ouv-v} et
 *       {@code data-ouv-h}, dont le SCSS de chaque panneau se sert pour choisir son ancrage ;</li>
 *   <li><strong>viewport</strong> : une position enregistrée sur un grand écran peut être hors-champ
 *       sur mobile (deux PWA dans l'app) → la position est bornée au montage et au redimensionnement,
 *       et retombe sur le coin par défaut si elle ne tient plus.</li>
 * </ul>
 */
@Directive({
  selector: '[appBulleFlottante]',
  standalone: true,
  hostDirectives: [{ directive: CdkDrag, outputs: ['cdkDragEnded', 'cdkDragStarted'] }],
})
export class BulleFlottanteDirective implements OnInit {

  /** Identifiant de la bulle : sert de clé de mémorisation (ex. « assistant », « messagerie »). */
  @Input('appBulleFlottante') cle = '';

  /** Position par défaut (px depuis le coin bas-droit) si rien n'est mémorisé. */
  @Input() positionDefaut: PositionBulle = { droite: 18, bas: 18 };

  private host = inject(ElementRef<HTMLElement>);
  private drag = inject(CdkDrag);

  private position: PositionBulle = { droite: 18, bas: 18 };

  /**
   * Un glisser vient-il d'avoir lieu ? Le composant hôte doit consulter ce drapeau dans son
   * gestionnaire de clic pour ne pas ouvrir le panneau à la fin d'un déplacement.
   */
  aGlisse = false;

  @HostBinding('style.position') readonly styPosition = 'fixed';
  @HostBinding('style.zIndex') readonly styZIndex = '1200';
  @HostBinding('style.touchAction') readonly styTouch = 'none';
  @HostBinding('style.right.px') get styRight() { return this.position.droite; }
  @HostBinding('style.bottom.px') get styBottom() { return this.position.bas; }

  /** Ancrage vertical du panneau : au-dessus de la bulle (défaut) ou en dessous si elle est trop haut. */
  @HostBinding('attr.data-ouv-v') get ouvertureV(): 'haut' | 'bas' {
    return this.position.bas > window.innerHeight / 2 ? 'bas' : 'haut';
  }

  /** Ancrage horizontal : aligné à droite (défaut) ou à gauche si la bulle est près du bord gauche. */
  @HostBinding('attr.data-ouv-h') get ouvertureH(): 'droite' | 'gauche' {
    return this.position.droite > window.innerWidth / 2 ? 'gauche' : 'droite';
  }

  ngOnInit(): void {
    this.position = this.borner(this.lire() ?? this.positionDefaut);
    // Le CDK translate l'élément ; on repart toujours de zéro et on écrit la position en right/bottom,
    // sinon translation et offsets se cumuleraient à chaque déplacement.
    this.drag.setFreeDragPosition({ x: 0, y: 0 });
  }

  @HostListener('cdkDragStarted')
  onDragStart(): void {
    this.aGlisse = true;
  }

  @HostListener('cdkDragEnded', ['$event'])
  onDragEnd(e: CdkDragEnd): void {
    const d = e.distance;   // déplacement en px depuis le début du geste
    this.position = this.borner({ droite: this.position.droite - d.x, bas: this.position.bas - d.y });
    this.drag.setFreeDragPosition({ x: 0, y: 0 });
    this.ecrire();
    // Laisse passer le clic de fin de geste avant de réarmer (sinon le panneau s'ouvrirait).
    setTimeout(() => this.aGlisse = false, 0);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.position = this.borner(this.position);
  }

  /** Garde la bulle entièrement visible ; hors champ → retour au coin par défaut. */
  private borner(p: PositionBulle): PositionBulle {
    const maxD = Math.max(MARGE, window.innerWidth - TAILLE_BULLE - MARGE);
    const maxB = Math.max(MARGE, window.innerHeight - TAILLE_BULLE - MARGE);
    const droite = Math.min(Math.max(MARGE, Math.round(p.droite)), maxD);
    const bas = Math.min(Math.max(MARGE, Math.round(p.bas)), maxB);
    return { droite, bas };
  }

  private toutes(): Record<string, PositionBulle> {
    try {
      return JSON.parse(localStorage.getItem(CLE_STORAGE) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  private lire(): PositionBulle | null {
    const p = this.toutes()[this.cle];
    return p && typeof p.droite === 'number' && typeof p.bas === 'number' ? p : null;
  }

  private ecrire(): void {
    try {
      localStorage.setItem(CLE_STORAGE, JSON.stringify({ ...this.toutes(), [this.cle]: this.position }));
    } catch {
      // Stockage indisponible (navigation privée) : la position reste valable pour la session.
    }
  }
}
