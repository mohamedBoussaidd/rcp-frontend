import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PredictionService, Briefing, Derives, DeriveAxe, DeriveJoueur } from '@core/services/prediction.service';
import { AuthService } from '@core/services/auth.service';
import { IaBadgeComponent } from '@shared/components/ia-badge/ia-badge.component';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';
import { DomSanitizer } from '@angular/platform-browser';


/**
 * Carte « Dérives & surveillance » : sur ~4 semaines, 3 axes SÉPARÉS (volume, intensité, ressenti)
 * avec, par axe, les joueurs en hausse / en baisse. Les axes structurés se chargent sans coût IA
 * (GET) ; la synthèse textuelle est générée à la demande (LLM ou gabarit). S'auto-masque sans la
 * permission {@code prepa_ia:derives} (qui tombe si le module add-on est off).
 *
 * La carte ne dit PAS la même chose que l'ACWR et c'est la confusion la plus fréquente : l'ACWR
 * compare un joueur à son passé proche pour dire « trop / pas assez », la dérive dit dans quel SENS
 * l'effectif se déplace depuis un mois. D'où la bulle d'aide sur le titre.
 */
@Component({
  selector: 'app-derives-card',
  standalone: true,
  imports: [IaBadgeComponent, DecimalPipe, InfoHintComponent],
  templateUrl: './derives-card.component.html',
  styleUrl: './derives-card.component.scss',
})
export class DerivesCardComponent implements OnInit {

  private predictions = inject(PredictionService);
  private auth = inject(AuthService);

  readonly derives = signal<Derives | null>(null);
  readonly note = signal<Briefing | null>(null);
  readonly chargementNote = signal(false);
  readonly erreur = signal<string | null>(null);

  get visible(): boolean {
    return this.auth.has('prepa_ia:derives');
  }

  ngOnInit(): void {
    if (!this.visible) return;
    this.predictions.getDerives().subscribe({
      next: d => this.derives.set(d),
      error: () => this.erreur.set('Dérives indisponibles pour le moment.'),
    });
  }

  get aucuneDerive(): boolean {
    const d = this.derives();
    return !!d && d.axes.every(a => a.nb_hausse === 0 && a.nb_baisse === 0);
  }

  /**
   * Le lien vers /methodologie n'est proposé que si l'utilisateur peut réellement y entrer :
   * la page est gardée par le module prépa physique et les permissions d'écriture GPS/pesées.
   * Un lien mort vaut moins que pas de lien.
   */
  get peutVoirMethodologie(): boolean {
    return this.auth.has('pesees:write') || this.auth.has('gps:import');
  }

  /** Texte de la bulle d'aide : à quelle question le bloc répond, et ce qu'il n'est pas. */
  get aideTexte(): string {
    const d = this.derives();
    const min = d?.min_seances ?? 3;
    return 'Répond à « où va l\'effectif depuis un mois ? ». On compare les 14 derniers jours '
      + 'aux 14 précédents sur trois axes indépendants : le volume couru, la part de ce volume '
      + 'passée au-dessus de 19 km/h, et le ressenti déclaré. '
      + 'À ne pas confondre avec l\'ACWR, qui répond à « ce joueur en fait-il trop cette semaine ? » '
      + 'avec des seuils de risque : l\'ACWR ne voit pas une montée lente, la dérive ne voit pas un pic isolé. '
      + `Un joueur n'est comparé que s'il a au moins ${min} séances dans chacune des deux fenêtres.`;
  }

  /** Nombre de joueurs écartés faute d'historique comparable, tous axes confondus (max). */
  ecartes(a: DeriveAxe): number { return a.nb_ecartes ?? 0; }

  /**
   * « 6,1 → 7,9 % » : la composition derrière le pourcentage de dérive. Sans ça, un « +30 % »
   * ne dit pas s'il part de presque rien ou d'une base solide.
   */
  composition(a: DeriveAxe, j: DeriveJoueur): string | null {
    if (j.valeur_reference == null || j.valeur_recente == null) return null;
    const u = a.unite === '/100' ? '' : (a.unite ?? '');
    const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return `${fmt(j.valeur_reference)} → ${fmt(j.valeur_recente)} ${u}`.trim();
  }

  genererNote(): void {
    if (this.chargementNote()) return;
    this.chargementNote.set(true);
    this.predictions.genererDeriveNote().subscribe({
      next: n => { this.note.set(n); this.chargementNote.set(false); },
      error: () => { this.chargementNote.set(false); this.erreur.set('Synthèse indisponible pour le moment.'); },
    });
  }
  private sanitizer = inject(DomSanitizer);
  readonly safeHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.note()?.texte || '')
  );
}
