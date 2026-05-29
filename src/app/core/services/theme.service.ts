import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _isDark = signal<boolean>(true);
  readonly isDark = this._isDark.asReadonly();

  init(): void {
    const saved = localStorage.getItem('rcp-theme') ?? 'dark';
    this.apply(saved === 'dark');
  }

  toggle(): void {
    this.apply(!this._isDark());
  }

  private apply(dark: boolean): void {
    this._isDark.set(dark);
    localStorage.setItem('rcp-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}
