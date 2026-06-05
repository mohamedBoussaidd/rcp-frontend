import { Injectable, computed, signal } from '@angular/core';

/** Club actif minimal (id + nom) pour l'affichage et les en-têtes de contexte. */
export interface ClubActif {
  id: string;
  nom: string;
}

/** Équipe minimale pour le sélecteur de contexte (compatible avec Equipe de mon-club). */
export interface EquipeContexte {
  id: string;
  nom: string;
}

interface ContextePersiste {
  club: ClubActif | null;
  equipesDispo: EquipeContexte[];
  equipesActives: string[];
}

/**
 * Contexte de navigation actif (multi-tenant) : club courant + équipes ciblées.
 * Restreint, côté client, les données visibles dans le périmètre autorisé par le
 * rôle. Les en-têtes correspondants sont ajoutés par le contexte.interceptor.
 * Persisté en localStorage → survit au rechargement (revalidé serveur à chaque appel).
 */
@Injectable({ providedIn: 'root' })
export class ContexteService {

  private static readonly KEY = 'rcp_contexte';

  /** Club actuellement actif (null = aucun, ex. super-admin sur l'espace admin). */
  readonly clubActif = signal<ClubActif | null>(null);
  /** Équipes du club actif, proposées dans le sélecteur. */
  readonly equipesDispo = signal<EquipeContexte[]>([]);
  /** Équipes ciblées (ids) ; vide = toutes les équipes du club actif. */
  readonly equipesActives = signal<string[]>([]);

  /** Libellé de l'équipe active pour la barre de contexte (« Toutes » si vide/multiple). */
  readonly libelleEquipe = computed<string>(() => {
    const ids = this.equipesActives();
    if (ids.length === 0) return 'Toutes les équipes';
    if (ids.length > 1) return `${ids.length} équipes`;
    return this.equipesDispo().find(e => e.id === ids[0])?.nom ?? '1 équipe';
  });

  constructor() {
    this.restaurer();
  }

  /** Entre dans le contexte d'un club (remplace entièrement le contexte précédent). */
  entrerClub(club: ClubActif, equipes: EquipeContexte[] = []): void {
    this.clubActif.set(club);
    this.equipesDispo.set(equipes);
    this.equipesActives.set([]);
    this.persister();
  }

  /** Met à jour la liste des équipes disponibles (sans changer la sélection). */
  definirEquipesDispo(equipes: EquipeContexte[]): void {
    this.equipesDispo.set(equipes);
    // On purge toute équipe active qui ne ferait plus partie du club.
    const valides = new Set(equipes.map(e => e.id));
    this.equipesActives.update(ids => ids.filter(id => valides.has(id)));
    this.persister();
  }

  /** Cible une seule équipe (ou toutes si id null). */
  choisirEquipe(equipeId: string | null): void {
    this.equipesActives.set(equipeId ? [equipeId] : []);
    this.persister();
  }

  /** Cible un ensemble d'équipes (vide = toutes). */
  choisirEquipes(ids: string[]): void {
    this.equipesActives.set([...ids]);
    this.persister();
  }

  /** Revient à une vue sans contexte (espace administration). */
  reinitialiser(): void {
    this.clubActif.set(null);
    this.equipesDispo.set([]);
    this.equipesActives.set([]);
    localStorage.removeItem(ContexteService.KEY);
  }

  private persister(): void {
    const data: ContextePersiste = {
      club: this.clubActif(),
      equipesDispo: this.equipesDispo(),
      equipesActives: this.equipesActives(),
    };
    localStorage.setItem(ContexteService.KEY, JSON.stringify(data));
  }

  private restaurer(): void {
    const raw = localStorage.getItem(ContexteService.KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as ContextePersiste;
      this.clubActif.set(data.club ?? null);
      this.equipesDispo.set(data.equipesDispo ?? []);
      this.equipesActives.set(data.equipesActives ?? []);
    } catch {
      localStorage.removeItem(ContexteService.KEY);
    }
  }
}
