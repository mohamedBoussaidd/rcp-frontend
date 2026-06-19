import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type NiveauEnvoi = 'AUCUN' | 'EQUIPE' | 'CIBLE';

export interface CapaciteEnvoi {
  peutEnvoyer: boolean;
  staff: boolean;
  niveauJoueur?: NiveauEnvoi | null;
  peutCibler: boolean;
}

export interface MessageEnvoye {
  threadId?: string;
  titre: string;
  corps: string;
  nbDestinataires: number;
  createdAt: string;
}

export interface DestinataireChat {
  joueurId: string;
  nom: string;
}

export interface MessageRequest {
  /** vide = toute l'équipe ; sinon fiches joueur ciblées. */
  destinataires?: string[];
  titre?: string;
  corps: string;
}

/** Chat 1-sens : envoi de messages (staff→joueur, joueur autorisé→équipe/cibles) + capacité. */
@Injectable({ providedIn: 'root' })
export class NotificationChatService {

  private http = inject(HttpClient);
  private readonly base = '/api/notifications/messages';

  capacite(): Observable<CapaciteEnvoi> {
    return this.http.get<CapaciteEnvoi>(`${this.base}/capacite`);
  }

  destinataires(): Observable<DestinataireChat[]> {
    return this.http.get<DestinataireChat[]>(`${this.base}/destinataires`);
  }

  envoyer(req: MessageRequest): Observable<{ envoyes: number }> {
    return this.http.post<{ envoyes: number }>(this.base, req);
  }

  envoyes(): Observable<MessageEnvoye[]> {
    return this.http.get<MessageEnvoye[]>(`${this.base}/envoyes`);
  }
}
