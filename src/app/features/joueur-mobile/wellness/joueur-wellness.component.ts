import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BodyMapComponent } from './body-map.component';
import { JoueurStore, HooperKey, GeneForm } from '../joueur.store';

interface HooperItem {
  key: HooperKey;
  label: string;
  emoji: string;
  bas: string;   // sens de la valeur 1
  haut: string;  // sens de la valeur 5
}

interface MomentGene { val: string; label: string; }

/**
 * Saisie du ressenti quotidien (Hooper 1..5, un écran) + étape gêne optionnelle
 * (mannequin). Upsert 1/jour : si le ressenti est déjà validé, le Hooper se
 * verrouille (valeurs renvoyées telles quelles) et seule la gêne reste éditable.
 */
@Component({
  selector: 'app-joueur-wellness',
  standalone: true,
  templateUrl: './joueur-wellness.component.html',
  styleUrl: './joueur-wellness.component.scss',
  imports: [BodyMapComponent],
})
export class JoueurWellnessComponent implements OnInit {

  store = inject(JoueurStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly NOTES = [1, 2, 3, 4, 5];
  readonly HOOPER: HooperItem[] = [
    { key: 'sommeil', label: 'Qualité du sommeil', emoji: '😴', bas: 'Excellente', haut: 'Très mauvaise' },
    { key: 'fatigue', label: 'Fatigue générale',   emoji: '🔋', bas: 'Très frais', haut: 'Épuisé' },
    { key: 'douleur', label: 'Douleurs musculaires', emoji: '💪', bas: 'Aucune',    haut: 'Très fortes' },
    { key: 'stress',  label: 'Stress',             emoji: '🧠', bas: 'Aucun',      haut: 'Important' },
    { key: 'humeur',  label: 'Humeur',             emoji: '🙂', bas: 'Excellente', haut: 'Très mauvaise' },
  ];
  readonly MOMENTS: MomentGene[] = [
    { val: 'EFFORT', label: "À l'effort" },
    { val: 'APRES',  label: 'Juste après' },
    { val: 'REPOS',  label: 'Au repos' },
  ];

  // Brouillons
  readonly wForm = signal<Record<HooperKey, number>>({ sommeil: 3, fatigue: 3, douleur: 3, stress: 3, humeur: 3 });
  readonly commentaire = signal('');
  readonly geneActive = signal(false);
  readonly gForm = signal<GeneForm>({ zone: '', intensite: 2, moment: 'EFFORT' });

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
        this.gForm.set({ zone: w.geneZone, intensite: w.geneIntensite ?? 2, moment: w.geneMoment ?? 'EFFORT' });
      }
    });
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('gene')) this.geneActive.set(true);
  }

  setNote(key: HooperKey, val: number): void {
    if (this.verrouille()) return;
    this.wForm.update(f => ({ ...f, [key]: val }));
  }
  noteOf(key: HooperKey): number { return this.wForm()[key]; }

  toggleGene(actif: boolean): void {
    this.geneActive.set(actif);
    if (actif && !this.gForm().zone) { /* l'utilisateur choisit la zone sur le mannequin */ }
  }
  setZone(zone: string): void { this.gForm.update(g => ({ ...g, zone })); }
  setIntensite(v: number): void { this.gForm.update(g => ({ ...g, intensite: v })); }
  setMoment(m: string): void { this.gForm.update(g => ({ ...g, moment: m })); }

  /** Couleur d'une note d'intensité (vert → rouge) pour le bouton actif. */
  couleurIntensite(v: number): string {
    const palette = ['', '#15803D', '#65A30D', '#CA8A04', '#EA580C', '#B91C1C'];
    return palette[v] ?? '#B91C1C';
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
