import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '@core/services/auth.service';
import { InstallPwaComponent } from '@shared/components/install-pwa/install-pwa.component';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  imports: [FormsModule, MatIcon, InstallPwaComponent],
})
export class LoginComponent {

  email = '';
  motDePasse = '';
  loading = signal(false);
  erreur = signal<string | null>(null);
  showPwd = signal(false);

  private auth = inject(AuthService);
  private router = inject(Router);

  constructor() {
    // Déjà connecté : on saute directement à l'accueil du rôle
    if (this.auth.isAuthenticated()) {
      this.router.navigateByUrl(this.auth.homeRoute());
    }
  }

  soumettre(): void {
    if (!this.email || !this.motDePasse || this.loading()) return;
    this.loading.set(true);
    this.erreur.set(null);

    this.auth.login(this.email.trim(), this.motDePasse).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl(this.auth.homeRoute());
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 401) {
          this.erreur.set('Email ou mot de passe incorrect.');
        } else if (err.status === 403) {
          // Compte désactivé (ex. joueur écarté de l'effectif de la saison).
          this.erreur.set(typeof err.error === 'string' ? err.error : 'Compte désactivé — contactez votre club.');
        } else {
          this.erreur.set('Connexion impossible. Réessayez.');
        }
      },
    });
  }
}
