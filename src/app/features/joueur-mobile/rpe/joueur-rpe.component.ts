import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BodyMapComponent } from '@shared/components/body-map/body-map.component';
import { JoueurStore, SeanceANoter, GeneForm } from '../joueur.store';

/**
 * Questionnaire post-séance. RPE 1..10 + durée RÉELLEMENT effectuée → charge = RPE × durée.
 * Depuis V91 le joueur peut aussi noter son plaisir, signaler une gêne sur le mannequin et
 * laisser un commentaire — tout est optionnel : une séance reste notable en deux gestes.
 *
 * La durée est pré-remplie avec celle de la séance mais reste corrigeable : un joueur sorti à
 * la 40e minute d'une séance de 90 min déclarait jusqu'ici une charge plus de deux fois trop
 * haute, ce qui polluait sa charge aiguë et son ACWR.
 */
@Component({
  selector: 'app-joueur-rpe',
  standalone: true,
  templateUrl: './joueur-rpe.component.html',
  styleUrl: './joueur-rpe.component.scss',
  imports: [DatePipe, BodyMapComponent],
})
export class JoueurRpeComponent {

  store = inject(JoueurStore);

  readonly NOTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  readonly MOMENTS: { val: string; label: string }[] = [
    { val: 'EFFORT', label: "À l'effort" },
    { val: 'APRES', label: 'Juste après' },
    { val: 'REPOS', label: 'Au repos' },
  ];

  readonly seanceSel = signal<SeanceANoter | null>(null);
  readonly intensite = signal(0);
  readonly duree = signal<number | null>(null);
  readonly plaisir = signal(0);
  readonly commentaire = signal('');
  readonly geneActive = signal(false);
  readonly gForm = signal<GeneForm>({ zone: '', intensite: 4, moment: 'EFFORT' });
  readonly envoi = signal(false);
  readonly toast = signal(false);

  readonly charge = computed(() => {
    const i = this.intensite();
    const d = this.duree();
    return i > 0 && d ? i * d : null;
  });

  /** Durée planifiée de la séance sélectionnée (repère pour la participation partielle). */
  readonly dureePrevue = computed(() => this.seanceSel()?.duree ?? null);

  /** Le joueur a raccourci sa séance : on l'affiche pour qu'il confirme que c'est voulu. */
  readonly participationPartielle = computed(() => {
    const prevue = this.dureePrevue();
    const reelle = this.duree();
    return prevue != null && reelle != null && reelle < prevue;
  });

  /** Une gêne n'est valide que si une zone a été touchée sur le mannequin. */
  readonly geneValide = computed(() => !this.geneActive() || !!this.gForm().zone);

  readonly peutEnvoyer = computed(() =>
    !!this.seanceSel() && this.intensite() > 0 && this.geneValide() && !this.envoi());

  choisirSeance(s: SeanceANoter): void {
    this.seanceSel.set(s);
    this.intensite.set(0);
    this.duree.set(s.duree ?? null);
    this.plaisir.set(0);
    this.commentaire.set('');
    this.geneActive.set(false);
    this.gForm.set({ zone: '', intensite: 4, moment: 'EFFORT' });
  }

  fermer(): void { this.seanceSel.set(null); }

  setIntensite(v: number): void { this.intensite.set(v); }
  setDuree(v: string): void { const n = parseInt(v, 10); this.duree.set(isNaN(n) ? null : n); }
  setPlaisir(v: number): void { this.plaisir.set(this.plaisir() === v ? 0 : v); }
  setCommentaire(v: string): void { this.commentaire.set(v); }

  /** Remet la durée planifiée (annule une correction de participation partielle). */
  restaurerDuree(): void { this.duree.set(this.dureePrevue()); }

  basculerGene(): void {
    const actif = !this.geneActive();
    this.geneActive.set(actif);
    if (!actif) this.gForm.set({ zone: '', intensite: 4, moment: 'EFFORT' });
  }

  setZone(zone: string): void { this.gForm.update(g => ({ ...g, zone })); }
  setGeneIntensite(v: number): void { this.gForm.update(g => ({ ...g, intensite: v })); }
  setMoment(m: string): void { this.gForm.update(g => ({ ...g, moment: m })); }

  /** Libellé qualitatif de l'intensité ressentie. */
  readonly intensiteLabel = computed(() => {
    const v = this.intensite();
    if (v === 0) return '';
    if (v <= 1) return 'Très léger';
    if (v <= 3) return 'Léger';
    if (v <= 5) return 'Modéré';
    if (v <= 7) return 'Intense';
    if (v <= 9) return 'Très intense';
    return 'Maximal';
  });

  /** Libellé qualitatif du plaisir ressenti (0 = non répondu). */
  readonly plaisirLabel = computed(() => {
    const v = this.plaisir();
    if (v === 0) return '';
    if (v <= 2) return 'Pas du tout';
    if (v <= 4) return 'Peu';
    if (v <= 6) return 'Moyen';
    if (v <= 8) return 'Bien aimé';
    return 'Adoré';
  });

  /** Couleur d'une note d'effort (vert → rouge) : plus haut = plus dur. */
  couleur(v: number): string {
    if (v <= 3) return '#15803D';
    if (v <= 5) return '#65A30D';
    if (v <= 7) return '#CA8A04';
    if (v <= 8) return '#EA580C';
    return '#B91C1C';
  }

  /** Couleur d'une note de plaisir : échelle INVERSE de l'effort (plus haut = mieux). */
  couleurPlaisir(v: number): string {
    return this.couleur(11 - v);
  }

  valider(): void {
    const s = this.seanceSel();
    if (!s || !this.peutEnvoyer()) return;
    this.envoi.set(true);
    const gene = this.geneActive() && this.gForm().zone ? this.gForm() : null;
    this.store.saisirRpe(s.id, this.intensite(), this.duree() ?? undefined, {
      plaisir: this.plaisir() || null,
      commentaire: this.commentaire().trim() || null,
      gene,
    }).subscribe({
      next: () => {
        this.envoi.set(false);
        this.seanceSel.set(null);
        this.toast.set(true);
        setTimeout(() => this.toast.set(false), 1600);
      },
      error: () => this.envoi.set(false),
    });
  }
}
