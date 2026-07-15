import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// ── Contrats (gestion, contrats:manage) ──

export interface Contrat {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  equipeId?: string | null;
  typeContrat: string;
  dateDebut: string;
  dateFin?: string | null;
  actif: boolean;
  joursRestants?: number | null;
  nomOriginal?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface ContratRequest {
  joueurId: string;
  typeContrat: string;
  dateDebut: string;
  dateFin?: string | null;
  notes?: string | null;
}

export interface ContratStats {
  total: number;
  actifs: number;
  expirent90j: number;
  echeances: Contrat[];
}

// ── Fiches de paye (gestion) ──

export interface BulletinLigne {
  id: string;
  joueurId: string;
  joueurNom?: string;
  joueurPrenom?: string;
  periode: string;
  nomOriginal: string;
  deposeLe: string;
  notifieLe?: string | null;
  premierTelechargementLe?: string | null;
}

// ── Espace personnel (/api/membre) ──

export interface MonContrat {
  id: string;
  typeContrat: string;
  dateDebut: string;
  dateFin?: string | null;
  actif: boolean;
  nomOriginal?: string | null;
}

export interface MonBulletin {
  id: string;
  periode: string;
  nomOriginal: string;
  notifieLe?: string | null;
  premierTelechargementLe?: string | null;
}

/**
 * Contrats & fiches de paye (V59). Gestion réservée à contrats:manage
 * (Président/Administratif) ; la personne consulte les SIENS via /api/membre.
 */
@Injectable({ providedIn: 'root' })
export class ContratService {
  private http = inject(HttpClient);

  // ── Contrats ──
  lister(): Observable<Contrat[]> { return this.http.get<Contrat[]>('/api/contrats'); }
  stats(): Observable<ContratStats> { return this.http.get<ContratStats>('/api/contrats/stats'); }
  creer(req: ContratRequest): Observable<Contrat> { return this.http.post<Contrat>('/api/contrats', req); }
  modifier(id: string, req: ContratRequest): Observable<Contrat> { return this.http.put<Contrat>(`/api/contrats/${id}`, req); }
  supprimer(id: string): Observable<void> { return this.http.delete<void>(`/api/contrats/${id}`); }
  deposerFichier(id: string, fichier: File): Observable<Contrat> {
    const fd = new FormData();
    fd.append('fichier', fichier);
    return this.http.post<Contrat>(`/api/contrats/${id}/fichier`, fd);
  }
  telechargerFichier(id: string): Observable<Blob> {
    return this.http.get(`/api/contrats/${id}/fichier`, { responseType: 'blob' });
  }

  // ── Fiches de paye ──
  periodes(): Observable<string[]> { return this.http.get<string[]>('/api/bulletins-paie/periodes'); }
  lignes(periode: string): Observable<BulletinLigne[]> {
    return this.http.get<BulletinLigne[]>('/api/bulletins-paie', { params: new HttpParams().set('periode', periode) });
  }
  deposerBulletin(joueurId: string, periode: string, fichier: File): Observable<BulletinLigne> {
    const fd = new FormData();
    fd.append('fichier', fichier);
    return this.http.post<BulletinLigne>(`/api/bulletins-paie?joueurId=${joueurId}&periode=${periode}`, fd);
  }
  distribuer(periode: string): Observable<{ distribues: number; notifies: number }> {
    return this.http.post<{ distribues: number; notifies: number }>(`/api/bulletins-paie/distribuer?periode=${periode}`, {});
  }
  telechargerBulletin(id: string): Observable<Blob> {
    return this.http.get(`/api/bulletins-paie/${id}/fichier`, { responseType: 'blob' });
  }
  supprimerBulletin(id: string): Observable<void> { return this.http.delete<void>(`/api/bulletins-paie/${id}`); }

  // ── Espace personnel (self-scope, joueur & staff) ──
  mesContrats(): Observable<MonContrat[]> { return this.http.get<MonContrat[]>('/api/membre/contrats'); }
  telechargerMonContrat(id: string): Observable<Blob> {
    return this.http.get(`/api/membre/contrats/${id}/fichier`, { responseType: 'blob' });
  }
  mesBulletins(): Observable<MonBulletin[]> { return this.http.get<MonBulletin[]>('/api/membre/bulletins'); }
  telechargerMonBulletin(id: string): Observable<Blob> {
    return this.http.get(`/api/membre/bulletins/${id}/fichier`, { responseType: 'blob' });
  }
}
