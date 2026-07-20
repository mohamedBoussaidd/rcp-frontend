import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import {
  CATEGORIES_EXERCICE, EchelleEffectif, Exercice, ExerciceAvance, ExerciceRequest,
  NiveauObjectif, TechniqueService,
} from '@core/services/technique.service';
import { AuthService } from '@core/services/auth.service';
import { PreferencesService } from '@core/services/preferences.service';
import { ImportPhotoResultat } from '@core/services/import-photo.service';
import { ImportPhotoDialogComponent } from './import-photo-dialog/import-photo-dialog.component';
import { InfoBulleComponent, INFOBULLES } from '@shared/components/info-bulle/info-bulle.component';
import { SchemaEditorComponent } from './schema-editor/schema-editor.component';
import { SchemaViewerDialogComponent } from './schema-viewer-dialog/schema-viewer-dialog.component';
import { SchemaTactiqueComponent } from './schema-tactique/schema-tactique.component';
import { PlanDeJeuComponent } from './plan-de-jeu/plan-de-jeu.component';
import { MatchComponent } from './match/match.component';
import { DiaporamaComponent } from './diaporama/diaporama.component';

@Component({
  selector: 'app-planning-technique',
  standalone: true,
  templateUrl: './planning-technique.component.html',
  styleUrl: './planning-technique.component.scss',
  imports: [FormsModule, MatIcon, SchemaTactiqueComponent, PlanDeJeuComponent, MatchComponent,
            DiaporamaComponent, InfoBulleComponent],
  // ImportPhotoDialogComponent est ouvert via MatDialog (pas dans le template).
})
export class PlanningTechniqueComponent implements OnInit {

  readonly categories = CATEGORIES_EXERCICE;
  readonly aide = INFOBULLES;

  readonly niveauxObjectif: { code: NiveauObjectif; libelle: string }[] = [
    { code: 'TEMPS_DE_JEU', libelle: 'Temps de jeu' },
    { code: 'PRINCIPE_ACTION', libelle: `Principe d'action` },
    { code: 'REGLE_ACTION_COLLECTIVE', libelle: `Règle d'action collective` },
    { code: 'REGLE_ACTION_INDIVIDUELLE', libelle: `Règle d'action individuelle` },
    { code: 'MOYEN', libelle: 'Moyen' },
  ];
  readonly echellesEffectif: { code: EchelleEffectif; libelle: string }[] = [
    { code: 'COLLECTIF', libelle: 'Collectif' },
    { code: 'INTERSECTORIEL', libelle: 'Intersectoriel' },
    { code: 'SECTORIEL', libelle: 'Sectoriel' },
    { code: 'GROUPAL', libelle: 'Groupal' },
    { code: 'INDIVIDUEL', libelle: 'Individuel' },
  ];

  /** Section active pilotée par ?section= (exercices | creer | schemas). */
  private route = inject(ActivatedRoute);
  readonly section = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('section') ?? 'exercices')),
    { initialValue: 'exercices' },
  );

  exercices = signal<Exercice[]>([]);
  loading   = signal(true);

  filtreCreateur  = signal('');
  filtreEquipe    = signal('');
  filtreCategorie = signal('');

  readonly createurs = computed(() => {
    const map = new Map<string, string>();
    this.exercices().forEach(e => { if (e.creeParId) map.set(e.creeParId, e.creeParNom ?? '—'); });
    return Array.from(map, ([id, nom]) => ({ id, nom }));
  });
  readonly equipesOrigine = computed(() => {
    const map = new Map<string, string>();
    this.exercices().forEach(e => { if (e.equipeOrigineId) map.set(e.equipeOrigineId, e.equipeOrigineNom ?? '—'); });
    return Array.from(map, ([id, nom]) => ({ id, nom }));
  });
  readonly exercicesFiltres = computed(() => this.exercices().filter(e =>
    (!this.filtreCreateur()  || e.creeParId       === this.filtreCreateur()) &&
    (!this.filtreEquipe()    || e.equipeOrigineId  === this.filtreEquipe()) &&
    (!this.filtreCategorie() || e.categorie        === this.filtreCategorie())));

  showExoForm   = signal(false);
  editingExoId  = signal<string | null>(null);
  exoForm: ExerciceRequest = this.exoVide();
  exoAvance: ExerciceAvance = {};
  savingExo     = signal(false);
  /** Import photo : schéma + pièce jointe à rattacher à l'exercice au moment de la création. */
  private schemaImporte: string | null = null;
  private photoImportId: string | null = null;

  /** Onglet actif du formulaire exercice (mode avancé). */
  ongletExo = signal<'essentiel' | 'pedagogie' | 'organisation'>('essentiel');

  private service = inject(TechniqueService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private prefs = inject(PreferencesService);

  /** Peut créer/dupliquer un exercice (permission d'écriture). */
  canEcrire(): boolean { return this.auth.has('exercices:write'); }

  /** Le mode avancé est-il disponible (module seance_avancee actif + rôle) ? */
  peutAvance(): boolean { return this.auth.has('seance_avancee:access'); }

  /** Mode avancé effectif : disponible ET activé par l'entraîneur (préférence serveur). */
  modeAvance(): boolean { return this.peutAvance() && this.prefs.modeAvanceSeance(); }

  basculerModeAvance(): void {
    const actif = !this.prefs.modeAvanceSeance();
    this.prefs.basculerModeAvanceSeance(actif);
    if (!actif) this.ongletExo.set('essentiel');
  }

  /** Densité m²/joueur calculée (jamais saisie) : dimensions ÷ nombre de joueurs. */
  densite(): number | null {
    const a = this.exoAvance;
    if (!a.terrainLongueurM || !a.terrainLargeurM || !a.nbJoueursTotal) return null;
    return Math.round((a.terrainLongueurM * a.terrainLargeurM / a.nbJoueursTotal) * 10) / 10;
  }

  choisirNiveau(code: NiveauObjectif): void {
    this.exoAvance.niveauObjectif = this.exoAvance.niveauObjectif === code ? null : code;
  }
  choisirEchelle(code: EchelleEffectif): void {
    this.exoAvance.echelleEffectif = this.exoAvance.echelleEffectif === code ? null : code;
  }

  /** Visualise le schéma d'un exercice en LECTURE SEULE (accessible à tout le staff). */
  voirSchema(e: Exercice): void {
    this.dialog.open(SchemaViewerDialogComponent, {
      panelClass: 'dark-dialog', maxWidth: '95vw',
      data: { titre: e.nom, schemaJson: e.schemaJson },
    });
  }

  /** Duplique un exercice (copie éditable à son nom) sans toucher l'original. */
  dupliquerExo(e: Exercice): void {
    this.service.dupliquerExercice(e.id).subscribe({
      next: () => { this.charger(); this.snack.open('Exercice dupliqué', 'Fermer', { duration: 2500 }); },
      error: () => this.snack.open('Duplication impossible', 'Fermer', { duration: 3000 }),
    });
  }

  ouvrirSchema(e: Exercice): void {
    const ref = this.dialog.open(SchemaEditorComponent, {
      width: '95vw', maxWidth: '95vw', panelClass: 'dark-dialog',
      data: {
        titre: e.nom,
        schemaJson: e.schemaJson,
        // Sauvegarde dans la COPIE de l'exercice : ne touche pas un éventuel schéma de base.
        enregistrer: (json: string) => this.service.sauverSchema(e.id, json),
      },
    });
    ref.afterClosed().subscribe(saved => { if (saved) this.charger(); });
  }

  ngOnInit(): void { this.charger(); this.prefs.charger(); }

  charger(): void {
    this.loading.set(true);
    this.service.listerExercices().subscribe({
      next: ex => { this.exercices.set(ex); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  label(v?: string): string { return v ? v.replace(/_/g, ' ') : '—'; }

  nouvelExo(): void {
    this.editingExoId.set(null);
    this.exoForm = this.exoVide();
    this.exoAvance = {};
    this.schemaImporte = null;
    this.photoImportId = null;
    this.ongletExo.set('essentiel');
    this.showExoForm.set(true);
  }

  /** Peut importer depuis une photo (module import_photo_ia + rôle). */
  peutImportPhoto(): boolean { return this.auth.has('import_photo:use'); }

  /** « Importer depuis une photo » : l'IA pré-remplit le formulaire + le schéma, on ajuste. */
  importerDepuisPhoto(): void {
    const ref = this.dialog.open(ImportPhotoDialogComponent, {
      width: '720px', maxWidth: '96vw', panelClass: 'app-dialog',
    });
    ref.afterClosed().subscribe((r: ImportPhotoResultat | null) => {
      if (!r) return;
      const t = r.texte;
      this.nouvelExo();
      this.exoForm = {
        ...this.exoForm,
        nom: t.titre ?? '',
        dureeMinutes: t.dureeMinutes ?? null,
        objectif: t.objectif ?? '',
        description: [t.description, t.materiel ? `Matériel : ${t.materiel}` : null,
          ...t.blocs.map(b => `${b.libelle}${b.dureeMinutes ? ` (${b.dureeMinutes}')` : ''}${b.consignes ? ` — ${b.consignes}` : ''}`)]
          .filter(x => !!x).join('\n'),
      };
      const a = t.avance;
      if (a && this.peutAvance()) {
        this.exoAvance = {
          formatJoueurs: a.formatJoueurs ?? null,
          terrainLongueurM: a.terrainLongueurM ?? null,
          terrainLargeurM: a.terrainLargeurM ?? null,
          sequencage: a.sequencage ?? null,
          butSystemeMarque: a.butSystemeMarque ?? null,
          reglesJeu: a.reglesJeu ?? null,
          variablesPedagogiques: a.variablesPedagogiques ?? null,
        };
      }
      this.schemaImporte = r.schemaJson ?? null;
      this.photoImportId = r.journalId;
      this.snack.open('Formulaire pré-rempli depuis la photo — vérifie et ajuste avant d\'enregistrer',
        'OK', { duration: 4000 });
    });
  }
  annulerExo(): void  { this.showExoForm.set(false); this.editingExoId.set(null); }
  editerExo(e: Exercice): void {
    this.editingExoId.set(e.id);
    this.exoForm = {
      nom: e.nom, categorie: e.categorie, type: e.type ?? 'TECHNIQUE',
      dureeMinutes: e.dureeMinutes, objectif: e.objectif, intensite: e.intensite, description: e.description,
      distanceAttendueM: e.distanceAttendueM, distanceHauteIntensiteM: e.distanceHauteIntensiteM, nbSprints: e.nbSprints,
    };
    this.exoAvance = { ...(e.avance ?? {}) };
    this.ongletExo.set('essentiel');
    this.showExoForm.set(true);
  }
  enregistrerExo(): void {
    if (!this.exoForm.nom) return;
    this.savingExo.set(true);
    // Le bloc avancé est toujours renvoyé quand l'utilisateur y a droit : même en mode
    // simplifié, les valeurs existantes (rechargées à l'édition) sont ainsi préservées.
    const req: ExerciceRequest = {
      ...this.exoForm,
      avance: this.peutAvance() ? this.exoAvance : null,
      photoImportId: this.photoImportId ?? undefined,
    };
    const id  = this.editingExoId();
    const obs = id ? this.service.modifierExercice(id, req) : this.service.creerExercice(req);
    obs.subscribe({
      next: cree => {
        // Schéma détecté sur la photo : rattaché à l'exercice juste après la création.
        const schema = this.schemaImporte;
        this.schemaImporte = null;
        this.photoImportId = null;
        const fini = () => { this.savingExo.set(false); this.showExoForm.set(false); this.charger(); };
        if (schema && !id) {
          this.service.sauverSchema(cree.id, schema).subscribe({ next: fini, error: fini });
        } else {
          fini();
        }
      },
      error: () => { this.savingExo.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }
  supprimerExo(e: Exercice): void {
    if (!confirm(`Supprimer l'exercice « ${e.nom} » ?`)) return;
    this.service.supprimerExercice(e.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private exoVide(): ExerciceRequest {
    return {
      nom: '', categorie: '', type: 'TECHNIQUE', dureeMinutes: null, objectif: '', intensite: null, description: '',
      distanceAttendueM: null, distanceHauteIntensiteM: null, nbSprints: null,
    };
  }
}
