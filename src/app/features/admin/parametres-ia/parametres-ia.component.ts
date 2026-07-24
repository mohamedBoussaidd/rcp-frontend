import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';

interface VersionDto { id: string; valeur: string; createdAt: string; }
interface ParametreDto { cle: string; valeur: string; defaut: string; historique: VersionDto[]; }
interface QuotaClubDto {
  clubId: string; clubNom: string;
  quotaSurcharge: number | null; quotaEffectif: number; consommeAujourdhui: number;
}

/** Éditeur d'un prompt IA (une clé) : état serveur + texte en cours + historique replié. */
class PromptEditor {
  readonly param = signal<ParametreDto | null>(null);
  edite = '';
  readonly histOuvert = signal(false);
  readonly saving = signal(false);
  constructor(readonly cle: string, readonly titre: string, readonly hint: string, readonly rows: number) {}
}

/**
 * Paramètres IA (super-admin) : édition des prompts IA (analyse photo + générateur de séance) avec
 * historique des versions + restauration, quota par défaut, et surcharges de quota par club.
 */
@Component({
  selector: 'app-parametres-ia',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './parametres-ia.component.html',
  styleUrl: './parametres-ia.component.scss',
})
export class ParametresIaComponent implements OnInit {

  private http = inject(HttpClient);
  private snack = inject(MatSnackBar);

  readonly photo = new PromptEditor('prompt_import_photo', "Prompt d'analyse des photos",
    "Ce texte est envoyé au modèle vision avec chaque photo. Il énumère la palette du schéma, les codes des référentiels et le contrat JSON strict — modifie-le prudemment : chaque enregistrement historise la version précédente (restauration possible).",
    18);
  readonly generateur = new PromptEditor('prompt_generateur_seance', 'Prompt du générateur de séance',
    "Ce texte guide la composition d'une séance à partir de la demande du coach. Le catalogue d'exercices — avec leurs tags (dominantes, thèmes, intensité, durée) — et la liste des types de séance sont ajoutés AUTOMATIQUEMENT après ce texte : n'y remets pas la bibliothèque à la main.",
    16);
  readonly prompts = [this.photo, this.generateur];

  quotaDefaut = signal<ParametreDto | null>(null);
  quotaDefautEdite = '';
  quotas = signal<QuotaClubDto[]>([]);

  ngOnInit(): void {
    this.prompts.forEach(ed => this.charger(ed));
    this.http.get<ParametreDto>('/api/admin/parametres-ia/quota_import_photo_defaut').subscribe({
      next: p => { this.quotaDefaut.set(p); this.quotaDefautEdite = p.valeur; },
      error: () => {},
    });
    this.chargerQuotas();
  }

  private charger(ed: PromptEditor): void {
    this.http.get<ParametreDto>(`/api/admin/parametres-ia/${ed.cle}`).subscribe({
      next: p => { ed.param.set(p); ed.edite = p.valeur; },
      error: () => this.snack.open('Chargement du prompt impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private chargerQuotas(): void {
    this.http.get<QuotaClubDto[]>('/api/admin/parametres-ia/import-photo/quotas').subscribe({
      next: q => this.quotas.set(q),
      error: () => {},
    });
  }

  enregistrerPrompt(ed: PromptEditor): void {
    if (!ed.edite.trim() || ed.saving()) return;
    ed.saving.set(true);
    this.http.put<ParametreDto>(`/api/admin/parametres-ia/${ed.cle}`, { valeur: ed.edite }).subscribe({
      next: p => {
        ed.saving.set(false); ed.param.set(p); ed.edite = p.valeur;
        this.snack.open('Prompt enregistré (version précédente historisée)', 'OK', { duration: 3000 });
      },
      error: () => { ed.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  restaurer(ed: PromptEditor, v: VersionDto): void {
    this.http.post<ParametreDto>(`/api/admin/parametres-ia/${ed.cle}/restaurer/${v.id}`, {}).subscribe({
      next: p => { ed.param.set(p); ed.edite = p.valeur; this.snack.open('Version restaurée', 'OK', { duration: 2500 }); },
      error: () => this.snack.open('Restauration impossible', 'Fermer', { duration: 3000 }),
    });
  }

  remettreDefaut(ed: PromptEditor): void {
    const p = ed.param();
    if (p) ed.edite = p.defaut;
  }

  enregistrerQuotaDefaut(): void {
    const v = parseInt(this.quotaDefautEdite, 10);
    if (isNaN(v) || v < 0) return;
    this.http.put<ParametreDto>('/api/admin/parametres-ia/quota_import_photo_defaut',
      { valeur: String(v) }).subscribe({
      next: p => {
        this.quotaDefaut.set(p); this.quotaDefautEdite = p.valeur; this.chargerQuotas();
        this.snack.open('Quota par défaut enregistré', 'OK', { duration: 2500 });
      },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  fixerQuota(club: QuotaClubDto, valeur: string): void {
    const v = valeur.trim() === '' ? null : Math.max(0, parseInt(valeur, 10) || 0);
    this.http.put<QuotaClubDto[]>(
      `/api/admin/parametres-ia/import-photo/quotas/${club.clubId}`, { valeur: v }).subscribe({
      next: q => { this.quotas.set(q); this.snack.open('Quota mis à jour', 'OK', { duration: 2000 }); },
      error: () => this.snack.open('Mise à jour impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
