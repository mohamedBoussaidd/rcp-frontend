import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BodyMapComponent } from './body-map.component';
import { JoueurStore, HooperKey, GeneForm } from '../joueur.store';

interface ScaleItem {
  key: HooperKey;
  label: string;
  emoji: string;
  bas: string;   // sens de la valeur 1
  haut: string;  // sens de la valeur 10
}

interface MoodItem { val: number; label: string; mouth: string; }
interface MomentGene { val: string; label: string; }

/**
 * Saisie du ressenti quotidien — refonte « Claude Design ».
 * Onglet « Ressenti » : humeur (visages) + 4 échelles Hooper (1..10) + commentaire.
 * Onglet « Mode gêne » : mannequin + intensité + moment.
 * Upsert 1/jour : si le ressenti est déjà validé, le Hooper se verrouille et
 * seule la gêne reste éditable.
 */
@Component({
  selector: 'app-joueur-wellness',
  standalone: true,
  templateUrl: './joueur-wellness.component.html',
  styleUrl: './joueur-wellness.component.scss',
  imports: [BodyMapComponent, FormsModule],
})
export class JoueurWellnessComponent implements OnInit {

  store = inject(JoueurStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly NOTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /** Humeur : 5 visages répartis sur l'échelle 1..10 (2 = excellente → 10 = très mauvaise). */
  readonly MOODS: MoodItem[] = [
    { val: 2,  label: 'Top',     mouth: 'M34 58 Q50 72 66 58' },
    { val: 4,  label: 'Bien',    mouth: 'M36 60 Q50 68 64 60' },
    { val: 6,  label: 'Moyen',   mouth: 'M36 61 L64 61' },
    { val: 8,  label: 'Bof',     mouth: 'M36 64 Q50 58 64 64' },
    { val: 10, label: 'Mauvais', mouth: 'M34 66 Q50 52 66 66' },
  ];

  /** Les 4 échelles Hooper hors humeur. */
  readonly SCALES: ScaleItem[] = [
    { key: 'sommeil', label: 'Qualité du sommeil',  emoji: '😴', bas: 'Excellente', haut: 'Très mauvaise' },
    { key: 'fatigue', label: 'Fatigue générale',    emoji: '🔋', bas: 'Très frais',  haut: 'Épuisé' },
    { key: 'douleur', label: 'Douleurs musculaires', emoji: '💪', bas: 'Aucune',     haut: 'Très fortes' },
    { key: 'stress',  label: 'Stress',              emoji: '🧠', bas: 'Aucun',       haut: 'Important' },
  ];

  readonly MOMENTS: MomentGene[] = [
    { val: 'EFFORT', label: "À l'effort" },
    { val: 'APRES',  label: 'Juste après' },
    { val: 'REPOS',  label: 'Au repos' },
  ];

  /** Onglet actif. */
  readonly tab = signal<'ressenti' | 'gene'>('ressenti');

  // Brouillons
  readonly wForm = signal<Record<HooperKey, number>>({ sommeil: 5, fatigue: 5, douleur: 5, stress: 5, humeur: 6 });
  readonly commentaire = signal('');
  readonly geneActive = signal(false);
  readonly gForm = signal<GeneForm>({ zone: '', intensite: 4, moment: 'EFFORT' });

  readonly envoi = signal(false);
  readonly toast = signal(false);

  private prefilled = false;

  /** Le ressenti du jour est déjà validé → Hooper en lecture seule. */
  readonly verrouille = computed(() => this.store.wellnessFait());

  constructor() {
    // Pré-remplit dès que la saisie du jour arrive du serveur (une seule fois).
    effect(() => {
      const w = this.store.wellnessDuJour();
      if (!w || this.prefilled) return;
      this.prefilled = true;
      this.wForm.set({ sommeil: w.sommeil, fatigue: w.fatigue, douleur: w.douleur, stress: w.stress, humeur: w.humeur });
      this.commentaire.set(w.commentaire ?? '');
      if (w.geneZone) {
        this.geneActive.set(true);
        this.gForm.set({ zone: w.geneZone, intensite: w.geneIntensite ?? 4, moment: w.geneMoment ?? 'EFFORT' });
      }
    });
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('gene')) { this.geneActive.set(true); this.tab.set('gene'); }
  }

  setTab(t: 'ressenti' | 'gene'): void {
    this.tab.set(t);
    if (t === 'gene') this.geneActive.set(true);
  }

  setNote(key: HooperKey, val: number): void {
    if (this.verrouille()) return;
    this.wForm.update(f => ({ ...f, [key]: val }));
  }
  noteOf(key: HooperKey): number { return this.wForm()[key]; }

  setHumeur(val: number): void {
    if (this.verrouille()) return;
    this.wForm.update(f => ({ ...f, humeur: val }));
  }

  setZone(zone: string): void { this.gForm.update(g => ({ ...g, zone })); }
  setIntensite(v: number): void { this.gForm.update(g => ({ ...g, intensite: v })); }
  setMoment(m: string): void { this.gForm.update(g => ({ ...g, moment: m })); }

  onComment(v: string): void { this.commentaire.set(v); }

  /** Couleur d'une note 1..10 (vert → rouge) : plus haut = plus mauvais. */
  couleurNote(v: number): string {
    const palette = ['', '#15803D', '#65A30D', '#CA8A04', '#EA580C', '#B91C1C'];
    return palette[Math.ceil(v / 2)] ?? '#B91C1C';
  }

  readonly geneValide = computed(() => !this.geneActive() || !!this.gForm().zone);
  readonly peutEnvoyer = computed(() => this.geneValide() && !this.envoi());

  valider(): void {
    if (!this.peutEnvoyer()) return;
    this.envoi.set(true);
    const gene = this.geneActive() && this.gForm().zone ? this.gForm() : null;
    this.store.saisirWellness(this.wForm(), this.commentaire(), gene).subscribe({
      next: () => { this.envoi.set(false); this.confirmer(); },
      error: () => this.envoi.set(false),
    });
  }

  private confirmer(): void {
    this.toast.set(true);
    setTimeout(() => this.router.navigate(['/joueur']), 1100);
  }
}
