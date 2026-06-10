import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeanceService, Seance, AnalyseImportResponse, ResolutionImport } from '../../core/services/seance.service';
import { JoueurService, Joueur } from '../../core/services/joueur.service';

const COULEURS_TYPE: Record<string, string> = {
  MATCH: '#ef4444', MATCH_AMICAL: '#f97316', INTENSIF: '#6366f1',
  TECHNIQUE: '#0ea5a0', REPRISE: '#22c55e', PRE_MATCH: '#eab308', FORCE: '#8b5cf6',
};

const POSTES = [
  { value: 'GK',  label: 'Gardien' },
  { value: 'DC',  label: 'Défenseur central' },
  { value: 'LB',  label: 'Latéral gauche' },
  { value: 'RB',  label: 'Latéral droit' },
  { value: 'MDC', label: 'Milieu défensif' },
  { value: 'MC',  label: 'Milieu central' },
  { value: 'MG',  label: 'Milieu gauche' },
  { value: 'MD',  label: 'Milieu droit' },
  { value: 'AG',  label: 'Ailier gauche' },
  { value: 'AD',  label: 'Ailier droit' },
  { value: 'ATT', label: 'Attaquant' },
];

export interface ResolutionUI {
  prenomFichier: string;
  action: 'CREATE' | 'MERGE' | 'IGNORE' | null;
  nom: string;
  prenom: string;
  poste: string;
  joueurExistantId: string;
}

type Etape = 'selection' | 'analyse' | 'resolution' | 'import' | 'resultat';

@Component({
  selector: 'app-import',
  standalone: true,
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
  imports: [CommonModule, DatePipe, FormsModule]
})
export class ImportComponent implements OnInit {

  etape: Etape = 'selection';

  // Étape sélection
  seancesPlanifiees: Seance[] = [];
  seanceSelectionnee: Seance | null = null;
  fichierSelectionne: File | null = null;
  chargement = true;

  // Étape résolution
  analyse: AnalyseImportResponse | null = null;
  resolutions: ResolutionUI[] = [];
  joueurs: Joueur[] = [];
  readonly postes = POSTES;

  // Résultat
  resultat: any = null;

  constructor(
    private seanceService: SeanceService,
    private joueurService: JoueurService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    const debut = this.dateStr(-365);
    const fin   = this.dateStr(30);
    this.seanceService.getSemaine(debut, fin).subscribe(seances => {
      this.seancesPlanifiees = seances.filter(s => s.statut === 'PLANIFIEE');
      this.chargement = false;
    });
  }

  couleur(code: string): string {
    return COULEURS_TYPE[code] ?? '#6366f1';
  }

  selectionner(seance: Seance): void {
    this.seanceSelectionnee = seance;
    this.resultat = null;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.fichierSelectionne = input.files[0];
      this.resultat = null;
    }
  }

  get peutAnalyser(): boolean {
    return !!this.fichierSelectionne && !!this.seanceSelectionnee && this.etape === 'selection';
  }

  get toutResolu(): boolean {
    return this.resolutions.every(r => r.action !== null);
  }

  get nbJoueursImportes(): number {
    return this.resolutions.filter(r => r.action !== 'IGNORE').length;
  }

  /* ── Étape 1 : Analyser ── */
  analyser(): void {
    if (!this.fichierSelectionne || !this.seanceSelectionnee) return;
    this.etape = 'analyse';

    this.seanceService.analyserExcel(this.fichierSelectionne, this.seanceSelectionnee.id).subscribe({
      next: (res) => {
        this.analyse = res;
        if (res.joueursInconnus.length === 0) {
          this.confirmer([]);
        } else {
          this.resolutions = res.joueursInconnus.map(p => ({
            prenomFichier: p,
            action: null,
            nom: '',
            prenom: p,
            poste: '',
            joueurExistantId: '',
          }));
          this.joueurService.getAll().subscribe(j => this.joueurs = j);
          this.etape = 'resolution';
        }
      },
      error: (err) => {
        this.etape = 'selection';
        this.snackBar.open(err.error?.error || "Erreur d'analyse", 'Fermer', { duration: 5000 });
      }
    });
  }

  setAction(res: ResolutionUI, action: 'CREATE' | 'MERGE' | 'IGNORE'): void {
    res.action = action;
    if (action !== 'CREATE') { res.nom = ''; res.poste = ''; }
    if (action !== 'MERGE')  { res.joueurExistantId = ''; }
  }

  /* ── Étape 2 : Confirmer ── */
  soumettreResolutions(): void {
    if (!this.toutResolu) return;
    const resList: ResolutionImport[] = this.resolutions.map(r => ({
      prenomFichier: r.prenomFichier,
      action: r.action!,
      joueurExistantId: r.joueurExistantId || undefined,
      prenom: r.prenom || r.prenomFichier,
      nom: r.nom || undefined,
      poste: r.poste || undefined,
    }));
    this.confirmer(resList);
  }

  private confirmer(resolutions: ResolutionImport[]): void {
    if (!this.analyse) return;
    this.etape = 'import';

    this.seanceService.confirmerImport({
      seanceId: this.analyse.seanceId,
      resolutions,
      lignes: this.analyse.lignes,
    }).subscribe({
      next: (res) => {
        this.resultat = res;
        this.etape = 'resultat';
        this.seancesPlanifiees = this.seancesPlanifiees.filter(s => s.id !== this.seanceSelectionnee?.id);
        this.seanceSelectionnee = null;
        this.fichierSelectionne = null;
        this.snackBar.open(`${res.inseres} joueur(s) importés avec succès`, 'OK', { duration: 5000 });
      },
      error: (err) => {
        this.etape = this.resolutions.length > 0 ? 'resolution' : 'selection';
        this.snackBar.open(err.error?.error || "Erreur lors de l'import", 'Fermer', { duration: 5000 });
      }
    });
  }

  nouvelImport(): void {
    this.etape = 'selection';
    this.analyse = null;
    this.resolutions = [];
    this.resultat = null;
    this.fichierSelectionne = null;
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  private dateStr(offsetJours: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetJours);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${j}`;
  }
}
