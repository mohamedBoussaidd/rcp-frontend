import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@core/services/auth.service';
import { SeanceBrouillon, SeanceService } from '@core/services/seance.service';

/**
 * Générateur de séance par IA (C4) : le coach décrit sa séance (texte ou dictée vocale C5), l'IA
 * renvoie un brouillon ancré sur la bibliothèque du club, qu'il valide → création de la séance
 * (cadre + blocs + exercices) puis ouverture de sa fiche pour ajustement.
 */
@Component({
  selector: 'app-generateur-seance',
  standalone: true,
  templateUrl: './generateur-seance.component.html',
  styleUrl: './generateur-seance.component.scss',
  imports: [FormsModule],
})
export class GenerateurSeanceComponent {

  private seanceService = inject(SeanceService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  demande = '';
  date = new Date().toISOString().slice(0, 10);

  readonly generation = signal(false);
  readonly creation = signal(false);
  readonly brouillon = signal<SeanceBrouillon | null>(null);

  // ── C5 : dictée vocale (Web Speech API) ──
  readonly ecoute = signal(false);
  private recognition: any = null;
  readonly vocalDispo = typeof window !== 'undefined'
    && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  generer(): void {
    if (!this.demande.trim() || this.generation()) return;
    this.generation.set(true);
    this.brouillon.set(null);
    this.seanceService.generer(this.demande.trim()).subscribe({
      next: b => { this.brouillon.set(b); this.generation.set(false); },
      error: err => {
        this.generation.set(false);
        const msg = err?.status === 429 ? (err.error?.message || 'Limite IA atteinte pour aujourd\'hui.')
          : err?.status === 503 ? 'IA non configurée pour ce club — vois avec l\'administrateur.'
          : 'Génération impossible — reformule ta demande.';
        this.snack.open(msg, 'Fermer', { duration: 5000 });
      },
    });
  }

  /** Crée la séance à partir du brouillon puis ouvre sa fiche. */
  creer(): void {
    const b = this.brouillon();
    if (!b || this.creation()) return;
    if (!b.typeSeanceId) { this.snack.open('Type de séance non reconnu — réessaie.', 'Fermer', { duration: 4000 }); return; }
    this.creation.set(true);
    const payload: any = {
      date: this.date,
      statut: 'PLANIFIEE',
      typeSeance: { id: b.typeSeanceId },
      titre: b.titre ?? undefined,
      dureeMinutes: b.dureeMinutes ?? 60,
      objectif: b.objectif ?? undefined,
      dominanteTactiqueOrgIntensite: b.dominantes?.tactiqueOrg ?? null,
      dominanteTactiqueFoncIntensite: b.dominantes?.tactiqueFonc ?? null,
      dominanteTechniqueIntensite: b.dominantes?.technique ?? null,
      dominanteMentalIntensite: b.dominantes?.mental ?? null,
      dominanteAthletiqueIntensite: b.dominantes?.athletique ?? null,
    };
    this.seanceService.create(payload).subscribe({
      next: seance => this.appliquerContenu(seance.id, b),
      error: () => { this.creation.set(false); this.snack.open('Création impossible.', 'Fermer', { duration: 4000 }); },
    });
  }

  private appliquerContenu(seanceId: string, b: SeanceBrouillon): void {
    const exercices: any[] = [];
    const avance = this.auth.has('seance_avancee:access') && b.blocs.length > 0;
    if (avance) {
      const blocs = b.blocs.map(bl => ({
        libelle: bl.libelle || 'Bloc', type: null, sequencage: bl.sequencage ?? null,
        dureeMinutes: bl.dureeMinutes ?? null, zones: [], staffIds: [], staffRoles: [],
      }));
      b.blocs.forEach((bl, i) => bl.exerciceIds.forEach(id => exercices.push({ exerciceId: id, blocIndex: i })));
      this.seanceService.remplacerContenuAvance(seanceId, { blocs, exercices, groupes: [], dominanteIds: [], sousPrincipeIds: [] })
        .subscribe({ next: () => this.termine(seanceId), error: () => this.termine(seanceId) });
    } else {
      b.blocs.forEach(bl => bl.exerciceIds.forEach(id => exercices.push({ exerciceId: id })));
      if (exercices.length) {
        this.seanceService.remplacerExercices(seanceId, exercices)
          .subscribe({ next: () => this.termine(seanceId), error: () => this.termine(seanceId) });
      } else {
        this.termine(seanceId);
      }
    }
  }

  private termine(seanceId: string): void {
    this.creation.set(false);
    this.snack.open('Séance créée — ajuste-la si besoin.', 'OK', { duration: 3000 });
    this.router.navigate(['/seances', seanceId, 'fiche'], { queryParams: { verif: 1 } });
  }

  // ── Dictée vocale ──
  basculerMicro(): void {
    if (!this.vocalDispo) return;
    if (this.ecoute()) { this.recognition?.stop(); return; }
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new Rec();
    this.recognition.lang = 'fr-FR';
    this.recognition.interimResults = false;
    this.recognition.continuous = false;
    this.recognition.onresult = (e: any) => {
      const texte = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
      this.demande = (this.demande ? this.demande + ' ' : '') + texte;
    };
    this.recognition.onend = () => this.ecoute.set(false);
    this.recognition.onerror = () => this.ecoute.set(false);
    this.ecoute.set(true);
    this.recognition.start();
  }

  reinitialiser(): void { this.brouillon.set(null); this.demande = ''; }
}
