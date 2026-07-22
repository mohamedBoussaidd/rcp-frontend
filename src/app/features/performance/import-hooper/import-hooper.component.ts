import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AvertissementImport, ResolutionImport } from '@core/services/seance.service';
import { JoueurService, Joueur } from '@core/services/joueur.service';
import { ContexteService, EquipeContexte } from '@core/services/contexte.service';
import {
  ImportHooperService, AnalyseImportHooperResponse, LigneHooperImport
} from '@core/services/import-hooper.service';

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
  identiteFichier: string;
  action: 'CREATE' | 'MERGE' | 'IGNORE' | null;
  nom: string;
  prenom: string;
  poste: string;
  joueurExistantId: string;
}

type Etape = 'selection' | 'analyse' | 'verification' | 'resolution' | 'import' | 'resultat';

/**
 * Import du ressenti quotidien (indice de Hooper) depuis un export « playermonitoring ». Clé =
 * équipe (choisie ici) + date lue dans le fichier — pas de séance. L'export est converti à la
 * convention de l'app (l'aperçu montre déjà les valeurs converties). Écran d'IMPORT uniquement :
 * la consultation reste dans l'onglet RPE/sRPE (fiche joueur), inchangée.
 */
@Component({
  selector: 'app-import-hooper',
  standalone: true,
  templateUrl: './import-hooper.component.html',
  styleUrls: ['../import/import.component.scss', '../import-rpe/import-rpe.component.scss'],
  imports: [CommonModule, FormsModule]
})
export class ImportHooperComponent implements OnInit {

  etape: Etape = 'selection';

  // Étape sélection
  equipes: EquipeContexte[] = [];
  equipeSelectionneeId = '';
  ongletSource: 'fichier' | 'coller' = 'fichier';
  fichierSelectionne: File | null = null;
  texteColle = '';
  chargement = true;

  // Étape vérification
  analyse: AnalyseImportHooperResponse | null = null;
  avertissementsGlobaux: AvertissementImport[] = [];
  warnParLigne = new Map<number, string[]>();
  exclusions = new Set<number>();

  // Étape résolution
  resolutions: ResolutionUI[] = [];
  joueurs: Joueur[] = [];
  readonly postes = POSTES;
  /** Passe à true au 1er clic « Confirmer » s'il reste des joueurs non liés → demande une confirmation. */
  confirmationNonLies = false;

  // Résultat
  resultat: any = null;

  private joueurService = inject(JoueurService);
  private contexte = inject(ContexteService);
  private importHooper = inject(ImportHooperService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  ngOnInit(): void {
    this.contexte.chargerEquipesAutorisees().subscribe({
      next: (equipes) => {
        this.equipes = equipes;
        // Pré-sélection : l'équipe active du contexte si une seule est ciblée.
        const actives = this.contexte.equipesActives();
        if (actives.length === 1) this.equipeSelectionneeId = actives[0];
        else if (equipes.length === 1) this.equipeSelectionneeId = equipes[0].id;
        this.chargement = false;
      },
      error: () => { this.chargement = false; }
    });
  }

  get equipeSelectionnee(): EquipeContexte | null {
    return this.equipes.find(e => e.id === this.equipeSelectionneeId) ?? null;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.fichierSelectionne = input.files[0];
      this.resultat = null;
    }
  }

  get peutAnalyser(): boolean {
    const source = this.ongletSource === 'fichier' ? !!this.fichierSelectionne : this.texteColle.trim().length > 0;
    return source && !!this.equipeSelectionneeId && this.etape === 'selection';
  }

  analyser(): void {
    if (!this.peutAnalyser) return;
    this.etape = 'analyse';
    this.importHooper.analyser({
      equipeId: this.equipeSelectionneeId,
      file: this.ongletSource === 'fichier' ? this.fichierSelectionne! : undefined,
      texte: this.ongletSource === 'coller' ? this.texteColle : undefined,
    }).subscribe({
      next: (res) => { this.analyse = res; this.preparerVerification(res); },
      error: (err) => {
        this.etape = 'selection';
        this.snackBar.open(err.error?.error || 'Erreur d\'analyse', 'Fermer', { duration: 6000 });
      }
    });
  }

  /* ── Étape vérification ── */

  private preparerVerification(res: AnalyseImportHooperResponse): void {
    this.exclusions.clear();
    this.avertissementsGlobaux = res.avertissements.filter(a => a.niveau !== 'LIGNE');
    this.warnParLigne = new Map();
    for (const a of res.avertissements) {
      if (a.niveau === 'LIGNE' && a.numeroLigne != null) {
        const liste = this.warnParLigne.get(a.numeroLigne) ?? [];
        liste.push(a.message);
        this.warnParLigne.set(a.numeroLigne, liste);
      }
    }
    this.etape = 'verification';
  }

  warnsDe(l: LigneHooperImport): string[] {
    return l.numeroLigne != null ? (this.warnParLigne.get(l.numeroLigne) ?? []) : [];
  }

  toggleExclusion(l: LigneHooperImport): void {
    if (l.numeroLigne == null || !l.repondu) return;
    if (this.exclusions.has(l.numeroLigne)) this.exclusions.delete(l.numeroLigne);
    else this.exclusions.add(l.numeroLigne);
  }

  estExclue(l: LigneHooperImport): boolean {
    return l.numeroLigne != null && this.exclusions.has(l.numeroLigne);
  }

  /** Lignes réellement importées : répondants non exclus. */
  get lignesRetenues(): LigneHooperImport[] {
    return (this.analyse?.lignes ?? []).filter(l => l.repondu && !this.estExclue(l));
  }

  continuerVerification(): void {
    if (!this.analyse) return;
    const retenues = this.lignesRetenues;
    if (retenues.length === 0) {
      this.snackBar.open('Aucune ligne à importer (toutes exclues ou sans réponse)', 'Fermer', { duration: 4000 });
      return;
    }
    const identitesRetenues = new Set(retenues.map(l => l.identiteFichier));
    const inconnus = this.analyse.joueursInconnus.filter(j => identitesRetenues.has(j.identiteFichier));
    if (inconnus.length === 0) {
      this.confirmer([]);
      return;
    }
    this.resolutions = inconnus.map(j => ({
      identiteFichier: j.identiteFichier,
      action: null,
      prenom: j.prenomSuggere || j.identiteFichier,
      nom: j.nomSuggere || '',
      poste: '',
      joueurExistantId: '',
    }));
    this.joueurService.getAll().subscribe(j => this.joueurs = j);
    this.etape = 'resolution';
  }

  /* ── Étape résolution ── */

  get toutResolu(): boolean {
    return this.resolutions.every(r => r.action !== null);
  }

  get nbJoueursImportes(): number {
    const ignores = new Set(this.resolutions.filter(r => r.action === 'IGNORE').map(r => r.identiteFichier));
    return this.lignesRetenues.filter(l => l.joueurId || !ignores.has(l.identiteFichier)).length;
  }

  /** Joueurs du fichier volontairement écartés (action « Ignorer ») → non importés. */
  get nbNonLies(): number {
    return this.resolutions.filter(r => r.action === 'IGNORE').length;
  }

  setAction(res: ResolutionUI, action: 'CREATE' | 'MERGE' | 'IGNORE'): void {
    res.action = action;
    if (action !== 'MERGE') { res.joueurExistantId = ''; }
    this.confirmationNonLies = false; // toute modif d'action ré-arme la confirmation
  }

  soumettreResolutions(): void {
    if (!this.toutResolu) return;
    // Garde-fou : s'il reste des joueurs non liés (ignorés), on avertit et on exige un 2ᵉ clic.
    if (this.nbNonLies > 0 && !this.confirmationNonLies) {
      this.confirmationNonLies = true;
      return;
    }
    const resList: ResolutionImport[] = this.resolutions.map(r => ({
      identiteFichier: r.identiteFichier,
      action: r.action!,
      joueurExistantId: r.joueurExistantId || undefined,
      prenom: r.prenom || r.identiteFichier,
      nom: r.nom || undefined,
      poste: r.poste || undefined,
    }));
    this.confirmer(resList);
  }

  private confirmer(resolutions: ResolutionImport[]): void {
    if (!this.analyse) return;
    this.etape = 'import';
    this.importHooper.confirmer({
      equipeId: this.analyse.equipeId,
      resolutions,
      lignes: this.lignesRetenues,
    }).subscribe({
      next: (res) => {
        this.resultat = res;
        this.etape = 'resultat';
        this.fichierSelectionne = null;
        this.texteColle = '';
        this.snackBar.open(`${res.inseres} ressenti(s) importé(s) avec succès`, 'OK', { duration: 5000 });
      },
      error: (err) => {
        this.etape = this.resolutions.length > 0 ? 'resolution' : 'verification';
        this.snackBar.open(err.error?.error || 'Erreur lors de l\'import', 'Fermer', { duration: 6000 });
      }
    });
  }

  nouvelImport(): void {
    this.etape = 'selection';
    this.analyse = null;
    this.resolutions = [];
    this.confirmationNonLies = false;
    this.resultat = null;
    this.fichierSelectionne = null;
    this.texteColle = '';
    this.exclusions.clear();
    this.avertissementsGlobaux = [];
    this.warnParLigne = new Map();
  }

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
