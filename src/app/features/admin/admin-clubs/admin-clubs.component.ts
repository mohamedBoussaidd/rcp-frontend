import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Club, ClubCreateRequest, ClubService } from '@core/services/club.service';
import { ContexteService } from '@core/services/contexte.service';

@Component({
  selector: 'app-admin-clubs',
  standalone: true,
  templateUrl: './admin-clubs.component.html',
  styleUrl: './admin-clubs.component.scss',
  imports: [FormsModule, DatePipe],
})
export class AdminClubsComponent implements OnInit {

  clubs   = signal<Club[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving  = signal(false);

  form: ClubCreateRequest = this.formVide();

  editingId = signal<string | null>(null);
  editForm  = { nom: '', logo: '' };

  private clubService = inject(ClubService);
  private contexte = inject(ContexteService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  entrer(c: Club): void {
    this.clubService.getEquipes(c.id).subscribe({
      next: equipes => { this.contexte.entrerClub({ id: c.id, nom: c.nom }, equipes); this.router.navigate(['/dashboard']); },
      error: ()     => { this.contexte.entrerClub({ id: c.id, nom: c.nom }); this.router.navigate(['/dashboard']); },
    });
  }

  basculerActif(c: Club): void {
    this.clubService.definirActif(c.id, !c.actif).subscribe({
      next: maj => this.clubs.update(list => list.map(x => x.id === c.id ? maj : x)),
      error: ()  => this.snack.open('Action impossible', 'Fermer', { duration: 3000 }),
    });
  }

  editer(c: Club): void { this.editingId.set(c.id); this.editForm = { nom: c.nom, logo: c.logo ?? '' }; }
  annulerEdit(): void   { this.editingId.set(null); }

  enregistrerEdit(c: Club): void {
    if (!this.editForm.nom) return;
    this.clubService.modifier(c.id, { nom: this.editForm.nom, logo: this.editForm.logo || null }).subscribe({
      next: () => { this.editingId.set(null); this.snack.open('Club modifié', 'Fermer', { duration: 2500 }); this.charger(); },
      error: ()  => this.snack.open('Modification impossible', 'Fermer', { duration: 3000 }),
    });
  }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.loading.set(true);
    this.clubService.lister().subscribe({
      next: data => { this.clubs.set(data); this.loading.set(false); },
      error: ()   => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  toggleForm(): void {
    this.showForm.update(v => !v);
    if (!this.showForm()) this.form = this.formVide();
  }

  creer(): void {
    const f = this.form;
    if (!f.nom || !f.president.email || !f.president.nom || !f.president.prenom || !f.president.motDePasse) return;
    this.saving.set(true);
    this.clubService.creer(f).subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.form = this.formVide(); this.snack.open('Club créé', 'Fermer', { duration: 2500 }); this.charger(); },
      error: (err) => { this.saving.set(false); this.snack.open(err.status === 409 ? 'Cet email est déjà utilisé' : 'Erreur lors de la création', 'Fermer', { duration: 3500 }); },
    });
  }

  supprimer(club: Club): void {
    if (!confirm(`Supprimer le club « ${club.nom} » ?\nCela supprime aussi ses équipes, membres et données.`)) return;
    this.clubService.supprimer(club.id).subscribe({
      next: () => { this.snack.open('Club supprimé', 'Fermer', { duration: 2500 }); this.charger(); },
      error: ()  => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  private formVide(): ClubCreateRequest {
    return { nom: '', logo: '', president: { email: '', nom: '', prenom: '', motDePasse: '' } };
  }
}
