import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  imports: [FormsModule, MatIcon],
})
export class LoginComponent {

  email = '';
  motDePasse = '';
  loading = signal(false);
  erreur = signal<string | null>(null);

  constructor(private auth: AuthService, private router: Router) {
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
        this.erreur.set(err.status === 401
          ? 'Email ou mot de passe incorrect.'
          : 'Connexion impossible. Réessayez.');
      },
    });
  }
}
