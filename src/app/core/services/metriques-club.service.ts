import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Réponse de GET /api/gps/metriques-actives (dérivée des profils d'import GPS du club). */
export interface MetriquesActives {
  profil: boolean;                 // false = club sans profil d'import → tout actif, seuils par défaut
  metriquesActives: string[];      // noms de MetriqueImport réellement alimentés
  seuils: { z15: number; z19: number; z24: number; z28: number };
}

export interface ZoneVitesse {
  key: string;
  label: string;
  court: string;
  couleur: string;
}

const SEUILS_DEFAUT = { z15: 15, z19: 19, z24: 24, z28: 28 };

/**
 * Métriques GPS actives du club + libellés de zones aux seuils RÉELS de son fournisseur
 * (affichage « niveau 1 ») : les écrans masquent les colonnes jamais importées et affichent
 * « Z3 · 19,8–25,2 km/h » plutôt que les seuils internes. Chargé une fois par session.
 */
@Injectable({ providedIn: 'root' })
export class MetriquesClubService {

  private http = inject(HttpClient);
  private etat = signal<MetriquesActives | null>(null);
  private chargeEnCours = false;

  /** À appeler depuis les écrans GPS (idempotent). */
  charger(): void {
    if (this.etat() || this.chargeEnCours) return;
    this.chargeEnCours = true;
    this.http.get<MetriquesActives>('/api/gps/metriques-actives').subscribe({
      next: r => this.etat.set(r),
      error: () => { this.chargeEnCours = false; }, // silencieux : les défauts s'appliquent
    });
  }

  /** Une métrique est-elle alimentée par ce club ? (toujours vrai sans profil d'import) */
  estActive(metrique: string): boolean {
    const e = this.etat();
    if (!e || !e.profil) return true;
    return e.metriquesActives.includes(metrique);
  }

  readonly seuils = computed(() => this.etat()?.seuils ?? SEUILS_DEFAUT);

  /** Bandes Z1..Z5 avec libellés construits sur les seuils réels du club. */
  readonly zones = computed<ZoneVitesse[]>(() => {
    const s = this.seuils();
    const f = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return [
      { key: 'z1', label: `Z1 · 0–${f(s.z15)} km/h`,          court: 'Z1', couleur: '#94a3b8' },
      { key: 'z2', label: `Z2 · ${f(s.z15)}–${f(s.z19)} km/h`, court: 'Z2', couleur: '#22c55e' },
      { key: 'z3', label: `Z3 · ${f(s.z19)}–${f(s.z24)} km/h`, court: 'Z3', couleur: '#eab308' },
      { key: 'z4', label: `Z4 · ${f(s.z24)}–${f(s.z28)} km/h`, court: 'Z4', couleur: '#f97316' },
      { key: 'z5', label: `Z5 · > ${f(s.z28)} km/h`,           court: 'Z5', couleur: '#ef4444' },
    ];
  });

  /** Libellé « > seuil » d'une zone cumulative (ex. colonnes >19 / >28 de la charge équipe). */
  labelSeuil(zone: 'z15' | 'z19' | 'z24' | 'z28'): string {
    const v = this.seuils()[zone];
    return `>${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km/h`;
  }
}
