import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JoueurStore } from '../joueur.store';
import { AuthService } from '@core/services/auth.service';

/**
 * Hub « Mon corps & santé » (PWA) — écran racine de l'onglet Santé.
 * Regroupe les accès Blessures / Poids / Documents médicaux / Séances avec un
 * résumé contextuel par ligne (refonte « Claude Design »).
 */
@Component({
  selector: 'app-joueur-sante',
  standalone: true,
  templateUrl: './joueur-sante.component.html',
  styleUrl: './joueur-sante.component.scss',
  imports: [RouterLink],
})
export class JoueurSanteComponent {

  store = inject(JoueurStore);
  private auth = inject(AuthService);

  /** Initiales pour l'avatar (prénom + nom). */
  readonly initiales = computed(() => {
    const p = this.store.profil();
    const a = (p?.prenom ?? '').trim()[0] ?? '';
    const b = (p?.nom ?? '').trim()[0] ?? '';
    return (a + b).toUpperCase() || '⚽';
  });

  deconnexion(): void {
    if (confirm('Se déconnecter ?')) this.auth.logout();
  }

  private joli(v?: string): string { return v ? v.replace(/_/g, ' ') : ''; }

  readonly STATUTS: Record<string, string> = {
    INDISPONIBLE: 'indisponible', EN_REPRISE: 'en reprise', RETABLI: 'rétabli',
  };

  /** Sous-titre de la ligne blessures (blessure active ou état sain). */
  readonly blessureResume = computed(() => {
    const b = this.store.blessureActive();
    if (!b) return 'Aucune blessure active';
    const type = this.joli(b.typeBlessure) || this.joli(b.zoneCorporelle) || 'Blessure';
    const statut = b.statut ? (this.STATUTS[b.statut] ?? this.joli(b.statut)) : '';
    return statut ? `${type} · ${statut}` : type;
  });

  /** Sous-titre de la ligne poids (dernier poids + cible). */
  readonly poidsResume = computed(() => {
    const p = this.store.dernierPoids();
    if (p == null) return 'Pas encore de pesée';
    const txt = `${p.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
    const cible = this.store.profil()?.poidsFormeCible;
    return cible != null
      ? `${txt} · cible ${cible.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
      : txt;
  });

  readonly nbDocuments = computed(() => this.store.documents().length);
}
