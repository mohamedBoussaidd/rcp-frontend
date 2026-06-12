import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConfigurationService {
  private http = inject(HttpClient);
  private base = '/api/configuration';

  getAll(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(this.base);
  }

  update(cle: string, valeur: number): Observable<void> {
    return this.http.patch<void>(`${this.base}/${cle}`, { valeur });
  }

  resetAll(): Observable<void> {
    return this.http.post<void>(`${this.base}/reset-all`, {});
  }

  resetOne(cle: string): Observable<void> {
    return this.http.post<void>(`${this.base}/reset/${cle}`, {});
  }
}
