import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CategorieAge, CategorieAgeRequest, CategorieAgeService } from '@core/services/categorie-age.service';

/**
 * Gestion des catégories d'âge (référentiel administratif : bornes en âge atteint dans la saison).
 * Déplacé hors des « Paramètres de performance » vers l'Administration — c'est de l'administratif,
 * pas de la préparation physique (accès docadmin:* / configuration:*).
 */
@Component({
  selector: 'app-categories-age',
  standalone: true,
  templateUrl: './categories-age.component.html',
  styleUrl: './categories-age.component.scss',
  imports: [FormsModule, RouterLink],
})
export class CategoriesAgeComponent implements OnInit {

  private service = inject(CategorieAgeService);
  private snackBar = inject(MatSnackBar);

  categoriesAge: CategorieAge[] = [];
  categorieSaving: string | null = null;
  nouvelleCategorieOuverte = false;
  nvCatCode = ''; nvCatLibelle = ''; nvCatAgeMin: number | null = null; nvCatAgeMax: number | null = null;

  ngOnInit(): void {
    this.service.lister().subscribe({
      next: cats => this.categoriesAge = cats,
      error: () => {},
    });
  }

  sauvegarderCategorie(cat: CategorieAge): void {
    this.categorieSaving = cat.id;
    const req: CategorieAgeRequest = {
      code: cat.code, libelle: cat.libelle, ageMin: cat.ageMin, ageMax: cat.ageMax, ordre: cat.ordre, actif: cat.actif,
    };
    this.service.modifier(cat.id, req).subscribe({
      next: maj => {
        this.categorieSaving = null;
        this.categoriesAge = this.categoriesAge.map(c => c.id === maj.id ? maj : c);
        this.snackBar.open(`Catégorie « ${maj.libelle} » enregistrée`, 'OK', { duration: 2500 });
      },
      error: err => {
        this.categorieSaving = null;
        this.snackBar.open(err.status === 409 ? 'Cette tranche d\'âge chevauche une autre catégorie' : 'Enregistrement impossible',
          'Fermer', { duration: 3500 });
      },
    });
  }

  ouvrirNouvelleCategorie(): void { this.nouvelleCategorieOuverte = true; }
  annulerNouvelleCategorie(): void {
    this.nouvelleCategorieOuverte = false;
    this.nvCatCode = ''; this.nvCatLibelle = ''; this.nvCatAgeMin = null; this.nvCatAgeMax = null;
  }

  creerCategorie(): void {
    if (!this.nvCatCode.trim() || !this.nvCatLibelle.trim()) return;
    const req: CategorieAgeRequest = {
      code: this.nvCatCode.trim(), libelle: this.nvCatLibelle.trim(),
      ageMin: this.nvCatAgeMin, ageMax: this.nvCatAgeMax, ordre: this.categoriesAge.length,
    };
    this.service.creer(req).subscribe({
      next: cat => { this.categoriesAge = [...this.categoriesAge, cat]; this.annulerNouvelleCategorie(); },
      error: err => this.snackBar.open(
        err.status === 409 ? 'Cette tranche d\'âge chevauche une autre catégorie' : 'Création impossible',
        'Fermer', { duration: 3500 }),
    });
  }
}
