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

/**
 * Paramètres IA (super-admin) : édition du prompt vision de l'import photo avec
 * historique des versions + restauration, quota par défaut, et surcharges de
 * quota par club (consommation du jour affichée).
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

  prompt = signal<ParametreDto | null>(null);
  promptEdite = '';
  quotaDefaut = signal<ParametreDto | null>(null);
  quotaDefautEdite = '';
  quotas = signal<QuotaClubDto[]>([]);
  saving = signal(false);
  histOuvert = signal(false);

  ngOnInit(): void {
    this.http.get<ParametreDto>('/api/admin/parametres-ia/prompt_import_photo').subscribe({
      next: p => { this.prompt.set(p); this.promptEdite = p.valeur; },
      error: () => this.snack.open('Chargement du prompt impossible', 'Fermer', { duration: 3000 }),
    });
    this.http.get<ParametreDto>('/api/admin/parametres-ia/quota_import_photo_defaut').subscribe({
      next: p => { this.quotaDefaut.set(p); this.quotaDefautEdite = p.valeur; },
      error: () => {},
    });
    this.chargerQuotas();
  }

  private chargerQuotas(): void {
    this.http.get<QuotaClubDto[]>('/api/admin/parametres-ia/import-photo/quotas').subscribe({
      next: q => this.quotas.set(q),
      error: () => {},
    });
  }

  enregistrerPrompt(): void {
    if (!this.promptEdite.trim() || this.saving()) return;
    this.saving.set(true);
    this.http.put<ParametreDto>('/api/admin/parametres-ia/prompt_import_photo',
      { valeur: this.promptEdite }).subscribe({
      next: p => {
        this.saving.set(false);
        this.prompt.set(p);
        this.promptEdite = p.valeur;
        this.snack.open('Prompt enregistré (version précédente historisée)', 'OK', { duration: 3000 });
      },
      error: () => { this.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  restaurer(v: VersionDto): void {
    this.http.post<ParametreDto>(
      `/api/admin/parametres-ia/prompt_import_photo/restaurer/${v.id}`, {}).subscribe({
      next: p => {
        this.prompt.set(p);
        this.promptEdite = p.valeur;
        this.snack.open('Version restaurée', 'OK', { duration: 2500 });
      },
      error: () => this.snack.open('Restauration impossible', 'Fermer', { duration: 3000 }),
    });
  }

  remettreDefaut(): void {
    const p = this.prompt();
    if (p) this.promptEdite = p.defaut;
  }

  enregistrerQuotaDefaut(): void {
    const v = parseInt(this.quotaDefautEdite, 10);
    if (isNaN(v) || v < 0) return;
    this.http.put<ParametreDto>('/api/admin/parametres-ia/quota_import_photo_defaut',
      { valeur: String(v) }).subscribe({
      next: p => {
        this.quotaDefaut.set(p);
        this.quotaDefautEdite = p.valeur;
        this.chargerQuotas();
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
