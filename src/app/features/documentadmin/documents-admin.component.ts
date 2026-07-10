import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import {
  CibleDocument, ConformiteResponse, DocumentAdminService, JoueurConformite, StatutDocument,
  StatutDocumentLigne, TypeDocumentRequis, TypeDocumentRequisRequest,
} from '@core/services/documentadmin.service';
import { CategorieAge, CategorieAgeRequest, CategorieAgeService } from '@core/services/categorie-age.service';
import { DocumentCelluleDialogComponent, DocumentCelluleDialogData } from './document-cellule-dialog.component';

type Vue = 'conformite' | 'referentiel' | 'categories';
type Perimetre = 'joueurs' | 'staff';
type FiltreStatut = 'TOUS' | StatutDocument;

interface Colonne { typeId: string; libelle: string; obligatoire: boolean; }

/**
 * Licences & documents administratifs (staff) : matrice de conformité de l'effectif + gestion
 * du référentiel des types requis. Le périmètre équipe/club est déjà résolu côté backend
 * (contexte actif) — pas de sélecteur d'équipe local, cohérent avec les autres écrans.
 */
@Component({
  selector: 'app-documents-admin',
  standalone: true,
  templateUrl: './documents-admin.component.html',
  styleUrl: './documents-admin.component.scss',
  imports: [FormsModule],
})
export class DocumentsAdminComponent implements OnInit {

  private service = inject(DocumentAdminService);
  private categorieAgeService = inject(CategorieAgeService);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);
  contexte = inject(ContexteService);

  vue = signal<Vue>('conformite');
  perimetre = signal<Perimetre>('joueurs');
  chargement = signal(true);
  conformite = signal<ConformiteResponse | null>(null);
  filtreStatut = signal<FiltreStatut>('TOUS');

  types = signal<TypeDocumentRequis[]>([]);
  categories = signal<CategorieAge[]>([]);

  // Nouveau type (référentiel)
  nouveauOuvert = signal(false);
  nvCode = ''; nvLibelle = ''; nvDescription = '';
  nvObligatoire = true; nvValidationManuelle = true; nvDureeValiditeMois: number | null = null;
  nvCategories: string[] = [];
  nvCible: CibleDocument = 'JOUEUR';
  readonly CIBLES: { val: CibleDocument; label: string }[] = [
    { val: 'JOUEUR', label: 'Joueurs' }, { val: 'STAFF', label: 'Staff' }, { val: 'TOUS', label: 'Tous' },
  ];
  sauvegardeId = signal<string | null>(null);

  // Catégories d'âge
  categorieSaving = signal<string | null>(null);
  nouvelleCategorieOuverte = signal(false);
  nvCatCode = ''; nvCatLibelle = ''; nvCatAgeMin: number | null = null; nvCatAgeMax: number | null = null;
  categorieErreur = signal<string | null>(null);

  get peutConfigurer(): boolean { return this.auth.has('docadmin:configure'); }
  get peutValider(): boolean { return this.auth.has('docadmin:validate'); }
  get peutDeposer(): boolean { return this.auth.has('docadmin:upload'); }

  readonly colonnes = computed<Colonne[]>(() => {
    const vu = new Map<string, Colonne>();
    for (const j of this.conformite()?.joueurs ?? []) {
      for (const d of j.documents) {
        if (!vu.has(d.typeId)) vu.set(d.typeId, { typeId: d.typeId, libelle: d.typeLibelle, obligatoire: d.obligatoire });
      }
    }
    return [...vu.values()];
  });

  readonly joueursFiltres = computed<JoueurConformite[]>(() => {
    const f = this.filtreStatut();
    const joueurs = this.conformite()?.joueurs ?? [];
    if (f === 'TOUS') return joueurs;
    return joueurs.filter(j => j.documents.some(d => d.statut === f));
  });

  ngOnInit(): void {
    this.charger();
    this.categorieAgeService.lister().subscribe({ next: c => this.categories.set(c), error: () => {} });
  }

  charger(): void {
    this.chargement.set(true);
    const source = this.perimetre() === 'staff' ? this.service.conformiteStaff() : this.service.conformite();
    source.subscribe({
      next: c => { this.conformite.set(c); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
    if (this.peutConfigurer) {
      this.service.listerTypes().subscribe({ next: t => this.types.set(t), error: () => {} });
    }
  }

  setVue(v: Vue): void { this.vue.set(v); }
  setFiltre(f: FiltreStatut): void { this.filtreStatut.set(f); }
  /** Bascule la matrice de conformité entre les joueurs (par âge) et le staff (encadrants). */
  setPerimetre(p: Perimetre): void {
    if (this.perimetre() === p) return;
    this.perimetre.set(p);
    this.filtreStatut.set('TOUS');
    this.charger();
  }

  statutLabel(s: StatutDocument): string {
    return ({ MANQUANT: 'Manquant', SOUMIS: 'À valider', VALIDE: 'Validé', REFUSE: 'Refusé', EXPIRE: 'Expiré' } as Record<StatutDocument, string>)[s];
  }

  documentPour(j: JoueurConformite, typeId: string): StatutDocumentLigne | null {
    return j.documents.find(d => d.typeId === typeId) ?? null;
  }

  /** Expire sous 30 jours (validé) — pour le hachurage visuel de la pastille. */
  expireBientot(d: StatutDocumentLigne): boolean {
    if (d.statut !== 'VALIDE' || !d.dateExpiration) return false;
    const jours = (new Date(d.dateExpiration).getTime() - Date.now()) / 86_400_000;
    return jours <= 30;
  }

  ouvrirCellule(j: JoueurConformite, col: Colonne): void {
    const d = this.documentPour(j, col.typeId);
    if (!d) return; // non applicable pour ce joueur (catégorie d'âge)
    if (d.statut === 'MANQUANT' && !this.peutDeposer) return;
    if (d.statut !== 'MANQUANT' && !this.peutValider && !this.peutDeposer) return;

    const data: DocumentCelluleDialogData = {
      joueurId: j.joueurId, joueurNom: `${j.prenom} ${j.nom}`,
      typeId: col.typeId, typeLibelle: col.libelle,
      documentId: d.documentId, statut: d.statut,
      dateExpiration: d.dateExpiration, motifRefus: d.motifRefus,
    };
    this.dialog.open(DocumentCelluleDialogComponent, { data, autoFocus: false, panelClass: 'rcp-dialog' })
      .afterClosed().subscribe(ok => { if (ok) this.charger(); });
  }

  // ── Référentiel ──

  ouvrirNouveau(): void { this.nouveauOuvert.set(true); }
  annulerNouveau(): void {
    this.nouveauOuvert.set(false);
    this.nvCode = ''; this.nvLibelle = ''; this.nvDescription = '';
    this.nvObligatoire = true; this.nvValidationManuelle = true; this.nvDureeValiditeMois = null; this.nvCategories = [];
    this.nvCible = 'JOUEUR';
  }

  toggleNvCategorie(code: string): void {
    this.nvCategories = this.nvCategories.includes(code)
      ? this.nvCategories.filter(c => c !== code) : [...this.nvCategories, code];
  }

  creerType(): void {
    if (!this.nvCode.trim() || !this.nvLibelle.trim()) return;
    const req: TypeDocumentRequisRequest = {
      code: this.nvCode.trim(), libelle: this.nvLibelle.trim(), description: this.nvDescription.trim() || null,
      obligatoire: this.nvObligatoire, validationManuelle: this.nvValidationManuelle,
      dureeValiditeMois: this.nvDureeValiditeMois, categoriesAge: this.nvCategories, cible: this.nvCible, actif: true,
    };
    this.service.creerType(req).subscribe({
      next: t => { this.types.update(ts => [...ts, t]); this.annulerNouveau(); this.charger(); },
      error: () => {},
    });
  }

  toggleCategorieType(t: TypeDocumentRequis, code: string): void {
    const cats = t.categoriesAge.includes(code) ? t.categoriesAge.filter(c => c !== code) : [...t.categoriesAge, code];
    this.sauvegarderType({ ...t, categoriesAge: cats });
  }

  sauvegarderType(t: TypeDocumentRequis): void {
    this.sauvegardeId.set(t.id);
    const req: TypeDocumentRequisRequest = {
      code: t.code, libelle: t.libelle, description: t.description, obligatoire: t.obligatoire,
      validationManuelle: t.validationManuelle, dureeValiditeMois: t.dureeValiditeMois,
      categoriesAge: t.categoriesAge, cible: t.cible, ordre: t.ordre, actif: t.actif,
    };
    this.service.modifierType(t.id, req).subscribe({
      next: maj => { this.sauvegardeId.set(null); this.types.update(ts => ts.map(x => x.id === maj.id ? maj : x)); this.charger(); },
      error: () => this.sauvegardeId.set(null),
    });
  }

  toggleActifType(t: TypeDocumentRequis): void {
    this.sauvegarderType({ ...t, actif: !t.actif });
  }

  // ── Catégories d'âge ──

  sauvegarderCategorie(cat: CategorieAge): void {
    this.categorieSaving.set(cat.id);
    this.categorieErreur.set(null);
    const req: CategorieAgeRequest = {
      code: cat.code, libelle: cat.libelle, ageMin: cat.ageMin, ageMax: cat.ageMax, ordre: cat.ordre, actif: cat.actif,
    };
    this.categorieAgeService.modifier(cat.id, req).subscribe({
      next: maj => {
        this.categorieSaving.set(null);
        this.categories.update(cs => cs.map(c => c.id === maj.id ? maj : c));
      },
      error: err => {
        this.categorieSaving.set(null);
        this.categorieErreur.set(err.status === 409 ? 'Cette tranche d\'âge chevauche une autre catégorie' : 'Enregistrement impossible');
      },
    });
  }

  ouvrirNouvelleCategorie(): void { this.nouvelleCategorieOuverte.set(true); }
  annulerNouvelleCategorie(): void {
    this.nouvelleCategorieOuverte.set(false);
    this.nvCatCode = ''; this.nvCatLibelle = ''; this.nvCatAgeMin = null; this.nvCatAgeMax = null;
    this.categorieErreur.set(null);
  }

  creerCategorie(): void {
    if (!this.nvCatCode.trim() || !this.nvCatLibelle.trim()) return;
    const req: CategorieAgeRequest = {
      code: this.nvCatCode.trim(), libelle: this.nvCatLibelle.trim(),
      ageMin: this.nvCatAgeMin, ageMax: this.nvCatAgeMax, ordre: this.categories().length,
    };
    this.categorieAgeService.creer(req).subscribe({
      next: cat => { this.categories.update(cs => [...cs, cat]); this.annulerNouvelleCategorie(); },
      error: err => this.categorieErreur.set(err.status === 409 ? 'Cette tranche d\'âge chevauche une autre catégorie' : 'Création impossible'),
    });
  }
}
