import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { EntretienService, EquipeLigne } from '@core/services/entretien.service';

type Tri = 'dernier' | 'nom' | 'nb90';

/**
 * Vue équipe « Suivi des entretiens » : une ligne par joueur de l'effectif, avec la date du dernier
 * entretien, les cadences 30 j / 90 j et la répartition par type. Trié pour faire remonter les
 * joueurs oubliés (dernier entretien le plus ancien / jamais en premier).
 */
@Component({
  selector: 'app-suivi-entretiens',
  standalone: true,
  templateUrl: './suivi-entretiens.component.html',
  styleUrl: './suivi-entretiens.component.scss',
  imports: [DatePipe],
})
export class SuiviEntretiensComponent implements OnInit {

  private service = inject(EntretienService);
  private router = inject(Router);

  lignes: EquipeLigne[] = [];
  chargement = true;
  tri: Tri = 'dernier';

  // Seuils d'alerte (jours) — alignés sur le défaut club (6 semaines).
  private readonly SEUIL_ORANGE = 28;
  private readonly SEUIL_ROUGE = 42;

  ngOnInit(): void {
    this.service.vueEquipe().subscribe({
      next: l => { this.lignes = l; this.trier(); this.chargement = false; },
      error: () => this.chargement = false,
    });
  }

  changerTri(t: Tri): void { this.tri = t; this.trier(); }

  private trier(): void {
    const c = [...this.lignes];
    if (this.tri === 'nom') {
      c.sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom));
    } else if (this.tri === 'nb90') {
      c.sort((a, b) => b.nb90j - a.nb90j);
    } else {
      // Dernier entretien ascendant : jamais (null) d'abord, puis du plus ancien au plus récent.
      c.sort((a, b) => {
        if (!a.dernierEntretien && !b.dernierEntretien) return 0;
        if (!a.dernierEntretien) return -1;
        if (!b.dernierEntretien) return 1;
        return a.dernierEntretien.localeCompare(b.dernierEntretien);
      });
    }
    this.lignes = c;
  }

  joursDepuis(date?: string | null): number | null {
    if (!date) return null;
    return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  }

  tone(date?: string | null): 'ok' | 'warn' | 'bad' {
    const j = this.joursDepuis(date);
    if (j == null || j > this.SEUIL_ROUGE) return 'bad';
    if (j > this.SEUIL_ORANGE) return 'warn';
    return 'ok';
  }

  ouvrirFiche(l: EquipeLigne): void {
    // Ouvre directement sur l'onglet « Suivi individuel » de la fiche (cf. joueur-detail).
    this.router.navigate(['/joueurs', l.joueurId], { queryParams: { tab: 'suivi' } });
  }
}
