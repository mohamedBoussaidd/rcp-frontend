import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubIaConfig, IaAdminService } from '@core/services/ia-admin.service';

interface Ligne extends ClubIaConfig { nouvelleCle: string; providerEdit: string; modeleEdit: string; }

/** Config IA par club (SUPER_ADMIN) : provider + clé (chiffrée) + modèle, et quotas par feature. */
@Component({
  selector: 'app-ia-config',
  standalone: true,
  templateUrl: './ia-config.component.html',
  styleUrl: './ia-config.component.scss',
  imports: [FormsModule, RouterLink],
})
export class IaConfigComponent implements OnInit {

  private api = inject(IaAdminService);
  private snack = inject(MatSnackBar);

  readonly lignes = signal<Ligne[]>([]);
  readonly quotas = signal<{ feature: string; valeur: number }[]>([]);
  readonly saving = signal<string | null>(null);
  readonly providers = ['ANTHROPIC', 'OPENAI'];

  ngOnInit(): void {
    this.api.clubs().subscribe(cs => this.lignes.set(cs.map(c => ({
      ...c, nouvelleCle: '', providerEdit: c.provider ?? 'ANTHROPIC', modeleEdit: c.modele ?? 'claude-opus-4-8',
    }))));
    this.api.quotas().subscribe(q => this.quotas.set(Object.entries(q).map(([feature, valeur]) => ({ feature, valeur }))));
  }

  enregistrer(l: Ligne): void {
    this.saving.set(l.clubId);
    this.api.configurer(l.clubId, {
      provider: l.providerEdit,
      modele: l.modeleEdit,
      actif: l.actif,
      cleApi: l.nouvelleCle.trim() || null,
    }).subscribe({
      next: maj => {
        this.saving.set(null);
        this.lignes.update(list => list.map(x => x.clubId === maj.clubId
          ? { ...x, ...maj, nouvelleCle: '', providerEdit: maj.provider ?? 'ANTHROPIC', modeleEdit: maj.modele ?? '' } : x));
        this.snack.open('Config IA enregistrée', 'OK', { duration: 2500 });
      },
      error: () => { this.saving.set(null); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3500 }); },
    });
  }

  revoquer(l: Ligne): void {
    if (!confirm(`Révoquer la config IA de ${l.clubNom} ? Le club retombera sur la clé globale (plafonnée).`)) return;
    this.api.revoquer(l.clubId).subscribe({
      next: () => {
        this.lignes.update(list => list.map(x => x.clubId === l.clubId
          ? { ...x, provider: null, modele: null, aCle: false, cleMasquee: null, nouvelleCle: '', providerEdit: 'ANTHROPIC', modeleEdit: 'claude-opus-4-8' } : x));
        this.snack.open('Config révoquée', 'OK', { duration: 2500 });
      },
      error: () => this.snack.open('Révocation impossible', 'Fermer', { duration: 3500 }),
    });
  }

  enregistrerQuotas(): void {
    const map: Record<string, number> = {};
    this.quotas().forEach(q => map[q.feature] = q.valeur);
    this.api.majQuotas(map).subscribe({
      next: () => this.snack.open('Quotas enregistrés', 'OK', { duration: 2500 }),
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3500 }),
    });
  }

  libelleFeature(f: string): string {
    return f === 'import_photo' ? 'Import photo (par jour)'
      : f === 'generateur_seance' ? 'Générateur de séance (par jour)' : f;
  }
}
