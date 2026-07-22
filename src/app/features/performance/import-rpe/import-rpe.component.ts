import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeanceService, Seance, AvertissementImport, ResolutionImport } from '@core/services/seance.service';
import { JoueurService, Joueur } from '@core/services/joueur.service';
import {
  ImportRpeService, AnalyseImportRpeResponse, LigneRpeImport
} from '@core/services/import-rpe.service';

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
  identiteFichier: string;
  action: 'CREATE' | 'MERGE' | 'IGNORE' | null;
  nom: string;
  prenom: string;
  poste: string;
  joueurExistantId: string;
}

type Etape = 'selection' | 'analyse' | 'verification' | 'resolution' | 'import' | 'resultat';

/**
 * Import du RPE/ressenti post-séance depuis un fichier questionnaire. Backfill de jours passés :
 * on rattache le RPE à une séance EXISTANTE (durée/date/équipe héritées) — toutes les séances
 * récentes sont proposées, pas seulement les planifiées. Sans étape de mapping (format fixe).
 */
@Component({
  selector: 'app-import-rpe',
  standalone: true,
  templateUrl: './import-rpe.component.html',
  styleUrls: ['../import/import.component.scss', './import-rpe.component.scss'],
  imports: [CommonModule, DatePipe, FormsModule]
})
export class ImportRpeComponent implements OnInit {

  etape: Etape = 'selection';

  // Étape sélection
  seances: Seance[] = [];
  seanceSelectionnee: Seance | null = null;
  ongletSource: 'fichier' | 'coller' = 'fichier';
  fichierSelectionne: File | null = null;
  texteColle = '';
  chargement = true;

  // Étape vérification
  analyse: AnalyseImportRpeResponse | null = null;
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

  private seanceService = inject(SeanceService);
  private joueurService = inject(JoueurService);
  private importRpe = inject(ImportRpeService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  ngOnInit(): void {
    const debut = this.dateStr(-365);
    const fin   = this.dateStr(30);
    this.seanceService.getSemaine(debut, fin).subscribe(seances => {
      // Backfill : toutes les séances (passées comprises), les plus récentes d'abord.
      this.seances = [...seances].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
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
    const source = this.ongletSource === 'fichier' ? !!this.fichierSelectionne : this.texteColle.trim().length > 0;
    return source && !!this.seanceSelectionnee && this.etape === 'selection';
  }

  analyser(): void {
    if (!this.peutAnalyser || !this.seanceSelectionnee) return;
    this.etape = 'analyse';
    this.importRpe.analyser({
      seanceId: this.seanceSelectionnee.id,
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

  private preparerVerification(res: AnalyseImportRpeResponse): void {
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

  warnsDe(l: LigneRpeImport): string[] {
    return l.numeroLigne != null ? (this.warnParLigne.get(l.numeroLigne) ?? []) : [];
  }

  toggleExclusion(l: LigneRpeImport): void {
    if (l.numeroLigne == null || !l.repondu) return;
    if (this.exclusions.has(l.numeroLigne)) this.exclusions.delete(l.numeroLigne);
    else this.exclusions.add(l.numeroLigne);
  }

  estExclue(l: LigneRpeImport): boolean {
    return l.numeroLigne != null && this.exclusions.has(l.numeroLigne);
  }

  /** Lignes réellement importées : répondants non exclus. */
  get lignesRetenues(): LigneRpeImport[] {
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
    this.importRpe.confirmer({
      seanceId: this.analyse.seanceId,
      resolutions,
      lignes: this.lignesRetenues,
    }).subscribe({
      next: (res) => {
        this.resultat = res;
        this.etape = 'resultat';
        this.seanceSelectionnee = null;
        this.fichierSelectionne = null;
        this.texteColle = '';
        this.snackBar.open(`${res.inseres} RPE importé(s) avec succès`, 'OK', { duration: 5000 });
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

  private dateStr(offsetJours: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetJours);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${j}`;
  }
}
