import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/** Types d'événement extrasportif (contraints en base par V92). */
export type TypeEvenement =
  | 'VIE_CLUB' | 'DEPLACEMENT' | 'SCOLAIRE' | 'CONVIVIALITE'
  | 'RENDEZ_VOUS' | 'INDISPONIBILITE' | 'AUTRE';

export interface PersonneConcernee {
  id: string;
  nom: string;
  prenom: string;
}

export interface Evenement {
  id: string;
  type: TypeEvenement;
  titre: string;
  date: string;
  /** Fin d'un événement sur plusieurs jours (stage, vacances). Absente = 1 jour. */
  dateFin?: string;
  heureDebut?: string;
  heureFin?: string;
  lieu?: string;
  description?: string;
  equipeId?: string;
  visibleJoueurs: boolean;
  /** Vide = toute l'équipe est concernée. */
  concernes: PersonneConcernee[];
}

export interface EvenementRequest {
  type: TypeEvenement;
  titre: string;
  date: string;
  dateFin?: string | null;
  heureDebut?: string | null;
  heureFin?: string | null;
  lieu?: string | null;
  description?: string | null;
  equipeId?: string | null;
  joueurIds?: string[];
  visibleJoueurs?: boolean;
}

/** Libellé + icône de chaque type. L'icône porte l'information, pas la couleur (tout est ardoise). */
export const TYPES_EVENEMENT: { val: TypeEvenement; label: string; icone: string }[] = [
  { val: 'VIE_CLUB',        label: 'Vie du club',      icone: '🏛' },
  { val: 'DEPLACEMENT',     label: 'Déplacement',      icone: '🚌' },
  { val: 'SCOLAIRE',        label: 'Scolaire / examens', icone: '🎓' },
  { val: 'CONVIVIALITE',    label: 'Convivialité',     icone: '🎉' },
  { val: 'RENDEZ_VOUS',     label: 'Rendez-vous',      icone: '🩺' },
  { val: 'INDISPONIBILITE', label: 'Indisponibilité',  icone: '🛑' },
  { val: 'AUTRE',           label: 'Autre',            icone: '📌' },
];

/**
 * Événements extrasportifs du calendrier. Module SOCLE « Planning » : jamais gaté par un
 * abonnement. La lecture est best-effort — le calendrier doit survivre à un 403.
 */
@Injectable({ providedIn: 'root' })
export class EvenementService {

  private http = inject(HttpClient);

  lister(debut: string, fin: string): Observable<Evenement[]> {
    return this.charger('/api/evenements', debut, fin);
  }

  /** Événements qui concernent le joueur connecté (PWA / calendrier en lecture seule). */
  mesEvenements(debut: string, fin: string): Observable<Evenement[]> {
    return this.charger('/api/moi/evenements', debut, fin);
  }

  creer(req: EvenementRequest): Observable<Evenement> {
    return this.http.post<Evenement>('/api/evenements', req);
  }

  modifier(id: string, req: EvenementRequest): Observable<Evenement> {
    return this.http.put<Evenement>(`/api/evenements/${id}`, req);
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`/api/evenements/${id}`);
  }

  private charger(url: string, debut: string, fin: string): Observable<Evenement[]> {
    const params = new HttpParams().set('debut', debut).set('fin', fin);
    return this.http.get<Evenement[]>(url, { params }).pipe(catchError(() => of([])));
  }

  /** Libellé lisible d'un type. */
  static labelDe(type: TypeEvenement): string {
    return TYPES_EVENEMENT.find(t => t.val === type)?.label ?? 'Événement';
  }

  /** Icône d'un type — c'est elle qui distingue les événements, pas la couleur. */
  static iconeDe(type: TypeEvenement): string {
    return TYPES_EVENEMENT.find(t => t.val === type)?.icone ?? '📌';
  }
}
