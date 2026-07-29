import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubIaConfig, FournisseurIa, IaAdminService } from '@core/services/ia-admin.service';

interface Ligne extends ClubIaConfig {
  nouvelleCle: string; providerEdit: string; modeleEdit: string; nomEdit: string;
}

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
  /** Alimenté par le catalogue : un fournisseur ajouté par l'admin est aussitôt attribuable à un club. */
  readonly providers = signal<FournisseurIa[]>([]);

  ngOnInit(): void {
    this.api.fournisseurs().subscribe({ next: f => this.providers.set(f), error: () => { } });
    this.api.clubs().subscribe(cs => this.lignes.set(cs.map(c => this.ligne(c))));
  }

  private ligne(c: ClubIaConfig): Ligne {
    return {
      ...c, nouvelleCle: '', providerEdit: c.provider ?? 'ANTHROPIC',
      modeleEdit: c.modele ?? '', nomEdit: c.nomAssistant ?? '',
    };
  }

  /**
   * Nomme l'assistant pour ce club. Champ vide = on retire la surcharge, le club retombe sur le nom
   * global (onglet Prompts) — le back renvoie alors ce nom global, que l'on réaffiche.
   */
  nommer(l: Ligne): void {
    this.api.nommerAssistant(l.clubId, l.nomEdit.trim()).subscribe({
      next: cs => {
        this.lignes.set(cs.map(c => this.ligne(c)));
        this.snack.open(`Assistant nommé « ${cs.find(c => c.clubId === l.clubId)?.nomAssistant} »`, 'OK', { duration: 2500 });
      },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3500 }),
    });
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
        this.lignes.update(list => list.map(x => x.clubId === maj.clubId ? this.ligne(maj) : x));
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
          ? this.ligne({ ...x, provider: null, modele: null, aCle: false, cleMasquee: null }) : x));
        this.snack.open('Config révoquée', 'OK', { duration: 2500 });
      },
      error: () => this.snack.open('Révocation impossible', 'Fermer', { duration: 3500 }),
    });
  }

}
