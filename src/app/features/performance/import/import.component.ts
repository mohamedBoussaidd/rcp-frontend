import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  SeanceService, Seance, AnalyseImportResponse, AvertissementImport, ColonneDetectee,
  LigneGpsImport, MappingColonne, MetriqueImport, ProfilImport, ResolutionImport
} from '@core/services/seance.service';
import { JoueurService, Joueur } from '@core/services/joueur.service';

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

/** Métriques proposées dans l'écran de mapping (l'ordre est celui du menu). */
const METRIQUES: { value: MetriqueImport | ''; label: string }[] = [
  { value: '',                  label: '— Ignorer cette colonne' },
  { value: 'IDENTITE',          label: 'Nom du joueur' },
  { value: 'DUREE',             label: 'Durée' },
  { value: 'DISTANCE_TOTALE',   label: 'Distance totale' },
  { value: 'DISTANCE_Z15',      label: 'Distance zone ~15 km/h' },
  { value: 'DISTANCE_Z19',      label: 'Distance zone ~19 km/h' },
  { value: 'DISTANCE_Z24',      label: 'Distance zone ~24 km/h' },
  { value: 'DISTANCE_Z28',      label: 'Distance zone ~28 km/h' },
  { value: 'NB_SPRINTS',        label: 'Nombre de sprints' },
  { value: 'VITESSE_MAX',       label: 'Vitesse max' },
  { value: 'NB_ACCELERATIONS',  label: 'Nombre d\'accélérations' },
  { value: 'NB_FREINAGES',      label: 'Nombre de freinages' },
  { value: 'RATIO_DISTANCE_MIN',label: 'Ratio m/min' },
  { value: 'DATE_SEANCE',       label: 'Date de la séance (contrôle)' },
];

const ZONES: MetriqueImport[] = ['DISTANCE_Z15', 'DISTANCE_Z19', 'DISTANCE_Z24', 'DISTANCE_Z28'];
const DISTANCES: MetriqueImport[] = ['DISTANCE_TOTALE', ...ZONES];

export interface ResolutionUI {
  identiteFichier: string;
  action: 'CREATE' | 'MERGE' | 'IGNORE' | null;
  nom: string;
  prenom: string;
  poste: string;
  joueurExistantId: string;
}

/** Ligne éditable de l'écran de mapping (une par colonne du fichier). */
interface LigneMapping {
  entete: string;
  enteteNormalise: string;
  apercu: string[];
  metrique: MetriqueImport | '';
  facteur: number;
  seuilReel: number | null;
  semantique: 'CUMUL' | 'BANDE';
  formatDuree: 'HMS' | 'MINUTES' | 'SECONDES';
}

type Etape = 'selection' | 'analyse' | 'mapping' | 'verification' | 'resolution' | 'import' | 'resultat';

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
  ongletSource: 'fichier' | 'coller' = 'fichier';
  fichierSelectionne: File | null = null;
  texteColle = '';
  chargement = true;

  // Étape mapping
  analyse: AnalyseImportResponse | null = null;
  mappingLignes: LigneMapping[] = [];
  formatIdentite = 'PRENOM_NOM';
  profilsDisponibles: ProfilImport[] = [];
  enregistrerProfil = true;
  nomProfil = '';
  readonly metriques = METRIQUES;

  // Étape vérification (aperçu + avertissements + exclusions)
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
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

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
    const source = this.ongletSource === 'fichier' ? !!this.fichierSelectionne : this.texteColle.trim().length > 0;
    return source && !!this.seanceSelectionnee && this.etape === 'selection';
  }

  /* ── Étape 1 : Analyser (sans mapping : profil auto ou écran de mapping) ── */
  analyser(): void {
    if (!this.peutAnalyser || !this.seanceSelectionnee) return;
    this.etape = 'analyse';
    this.seanceService.analyserImport({
      seanceId: this.seanceSelectionnee.id,
      file: this.ongletSource === 'fichier' ? this.fichierSelectionne! : undefined,
      texte: this.ongletSource === 'coller' ? this.texteColle : undefined,
    }).subscribe({
      next: (res) => {
        this.analyse = res;
        if (res.statut === 'MAPPING_REQUIS') {
          this.preparerMapping(res);
        } else {
          this.preparerVerification(res);
        }
      },
      error: (err) => {
        this.etape = 'selection';
        this.snackBar.open(err.error?.error || 'Erreur d\'analyse', 'Fermer', { duration: 5000 });
      }
    });
  }

  /* ── Étape mapping ── */

  private preparerMapping(res: AnalyseImportResponse): void {
    this.formatIdentite = res.formatIdentiteSuggere || 'PRENOM_NOM';
    this.profilsDisponibles = res.profilsDisponibles || [];
    this.nomProfil = '';
    this.mappingLignes = res.colonnes.map(c => this.versLigneMapping(c, c.suggestion));
    this.etape = 'mapping';
  }

  /** Ré-ouvre le mapping depuis la vérification (profil auto appliqué mais douteux). */
  retourMapping(): void {
    if (!this.analyse) return;
    const mappings = this.analyse.profilUtilise?.mappings;
    this.profilsDisponibles = this.profilsDisponibles.length
      ? this.profilsDisponibles : (this.analyse.profilUtilise ? [this.analyse.profilUtilise] : []);
    this.mappingLignes = this.analyse.colonnes.map(c =>
      this.versLigneMapping(c, mappings?.find(m => m.entete === c.enteteNormalise) ?? c.suggestion));
    if (this.analyse.profilUtilise) this.formatIdentite = this.analyse.profilUtilise.formatIdentite;
    this.etape = 'mapping';
  }

  private versLigneMapping(c: ColonneDetectee, m?: MappingColonne | null): LigneMapping {
    return {
      entete: c.entete,
      enteteNormalise: c.enteteNormalise,
      apercu: c.apercu,
      metrique: m?.metrique ?? '',
      facteur: m?.facteur ?? 1,
      seuilReel: m?.seuilReel ?? null,
      semantique: m?.semantique ?? 'CUMUL',
      formatDuree: m?.formatDuree ?? (c.apercu.some(v => v.includes(':')) ? 'HMS' : 'MINUTES'),
    };
  }

  appliquerProfil(profil: ProfilImport): void {
    this.formatIdentite = profil.formatIdentite;
    this.mappingLignes = this.mappingLignes.map(l => {
      const m = profil.mappings.find(pm => pm.entete === l.enteteNormalise);
      return this.versLigneMapping({ entete: l.entete, enteteNormalise: l.enteteNormalise, apercu: l.apercu }, m ?? null);
    });
    if (!profil.global) this.nomProfil = profil.nom;
  }

  estZone(m: MetriqueImport | ''): boolean { return ZONES.includes(m as MetriqueImport); }
  estDistance(m: MetriqueImport | ''): boolean { return DISTANCES.includes(m as MetriqueImport); }

  get metriquesEnDouble(): string[] {
    const vues = new Map<string, number>();
    for (const l of this.mappingLignes) {
      if (l.metrique) vues.set(l.metrique, (vues.get(l.metrique) ?? 0) + 1);
    }
    return [...vues.entries()].filter(([, n]) => n > 1)
      .map(([m]) => METRIQUES.find(x => x.value === m)?.label ?? m);
  }

  get mappingValide(): boolean {
    return this.mappingLignes.some(l => l.metrique === 'IDENTITE') && this.metriquesEnDouble.length === 0;
  }

  validerMapping(): void {
    if (!this.mappingValide || !this.seanceSelectionnee) return;
    const mappings: MappingColonne[] = this.mappingLignes
      .filter(l => l.metrique)
      .map(l => ({
        entete: l.enteteNormalise,
        metrique: l.metrique as MetriqueImport,
        facteur: l.facteur !== 1 ? l.facteur : undefined,
        seuilReel: this.estZone(l.metrique) && l.seuilReel != null ? l.seuilReel : undefined,
        semantique: this.estZone(l.metrique) ? l.semantique : undefined,
        formatDuree: l.metrique === 'DUREE' ? l.formatDuree : undefined,
      }));
    this.etape = 'analyse';
    this.seanceService.analyserImport({
      seanceId: this.seanceSelectionnee.id,
      file: this.ongletSource === 'fichier' ? this.fichierSelectionne! : undefined,
      texte: this.ongletSource === 'coller' ? this.texteColle : undefined,
      mappings,
      formatIdentite: this.formatIdentite,
      enregistrerProfil: this.enregistrerProfil,
      nomProfil: this.nomProfil || undefined,
    }).subscribe({
      next: (res) => {
        this.analyse = res;
        this.preparerVerification(res);
      },
      error: (err) => {
        this.etape = 'mapping';
        this.snackBar.open(err.error?.error || 'Erreur de conversion', 'Fermer', { duration: 5000 });
      }
    });
  }

  /* ── Étape vérification : aperçu, avertissements, exclusions ── */

  private preparerVerification(res: AnalyseImportResponse): void {
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

  warnsDe(l: LigneGpsImport): string[] {
    return l.numeroLigne != null ? (this.warnParLigne.get(l.numeroLigne) ?? []) : [];
  }

  toggleExclusion(l: LigneGpsImport): void {
    if (l.numeroLigne == null) return;
    if (this.exclusions.has(l.numeroLigne)) this.exclusions.delete(l.numeroLigne);
    else this.exclusions.add(l.numeroLigne);
  }

  estExclue(l: LigneGpsImport): boolean {
    return l.numeroLigne != null && this.exclusions.has(l.numeroLigne);
  }

  get lignesRetenues(): LigneGpsImport[] {
    return (this.analyse?.lignes ?? []).filter(l => !this.estExclue(l));
  }

  get nbLignesAvecAlerte(): number {
    return (this.analyse?.lignes ?? []).filter(l => this.warnsDe(l).length > 0).length;
  }

  continuerVerification(): void {
    if (!this.analyse) return;
    const retenues = this.lignesRetenues;
    if (retenues.length === 0) {
      this.snackBar.open('Toutes les lignes sont exclues', 'Fermer', { duration: 4000 });
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
    this.seanceService.confirmerImport({
      seanceId: this.analyse.seanceId,
      resolutions,
      lignes: this.lignesRetenues,
    }).subscribe({
      next: (res) => {
        this.resultat = res;
        this.etape = 'resultat';
        this.seancesPlanifiees = this.seancesPlanifiees.filter(s => s.id !== this.seanceSelectionnee?.id);
        this.seanceSelectionnee = null;
        this.fichierSelectionne = null;
        this.texteColle = '';
        this.snackBar.open(`${res.inseres} joueur(s) importés avec succès`, 'OK', { duration: 5000 });
      },
      error: (err) => {
        this.etape = this.resolutions.length > 0 ? 'resolution' : 'verification';
        this.snackBar.open(err.error?.error || 'Erreur lors de l\'import', 'Fermer', { duration: 5000 });
      }
    });
  }

  nouvelImport(): void {
    this.etape = 'selection';
    this.analyse = null;
    this.mappingLignes = [];
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
