import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubIaConfig, IaAdminService } from '@core/services/ia-admin.service';

interface Ligne extends ClubIaConfig { nouvelleCle: string; providerEdit: string; modeleEdit: string; }

/**
 * Config IA par club (SUPER_ADMIN) : provider + clé (chiffrée) + modèle. Embarqué comme onglet
 * « Clés & modèles » de l'écran Paramètres IA. Les quotas sont gérés dans l'onglet Quotas (source unique).
 */
@Component({
  selector: 'app-ia-config',
  standalone: true,
  templateUrl: './ia-config.component.html',
  styleUrl: './ia-config.component.scss',
  imports: [FormsModule],
})
export class IaConfigComponent implements OnInit {

  private api = inject(IaAdminService);
  private snack = inject(MatSnackBar);

  readonly lignes = signal<Ligne[]>([]);
  readonly saving = signal<string | null>(null);
  readonly providers = ['ANTHROPIC', 'OPENAI'];

  ngOnInit(): void {
    this.api.clubs().subscribe(cs => this.lignes.set(cs.map(c => ({
      ...c, nouvelleCle: '', providerEdit: c.provider ?? 'ANTHROPIC', modeleEdit: c.modele ?? 'claude-opus-4-8',
    }))));
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

}
