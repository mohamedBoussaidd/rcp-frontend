import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Equipe, Membre, MembreCreateRequest, MonClub, MonClubService,
} from '@core/services/mon-club.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';

const MAX_EQUIPES = 3;

const ROLES_MEMBRES = [
  { value: 'ENTRAINEUR',    label: 'Entraîneur' },
  { value: 'PREPARATEUR',   label: 'Préparateur physique' },
  { value: 'MEDICAL',       label: 'Staff médical' },
  { value: 'ADMINISTRATIF', label: 'Administratif' },
  { value: 'JOUEUR',        label: 'Joueur' },
];

@Component({
  selector: 'app-mon-club',
  standalone: true,
  templateUrl: './mon-club.component.html',
  styleUrl: './mon-club.component.scss',
  imports: [FormsModule, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class MonClubComponent implements OnInit {

  readonly rolesMembres = ROLES_MEMBRES;
  readonly maxEquipes = MAX_EQUIPES;

  data = signal<MonClub | null>(null);
  loading = signal(true);

  showEquipeForm = signal(false);
  equipeForm = { nom: '', categorie: '' };
  savingEquipe = signal(false);

  showMembreForm = signal(false);
  membreForm: MembreCreateRequest = this.membreVide();
  savingMembre = signal(false);

  joueurs = signal<Joueur[]>([]);

  readonly equipes = computed(() => this.data()?.equipes ?? []);
  readonly membres = computed(() => this.data()?.membres ?? []);
  readonly equipesPleines = computed(() => this.equipes().length >= MAX_EQUIPES);

  constructor(
    private service: MonClubService,
    private snack: MatSnackBar,
    private joueurService: JoueurService,
  ) {}

  ngOnInit(): void {
    this.charger();
    this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
  }

  charger(): void {
    this.loading.set(true);
    this.service.getMonClub().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  // ── Equipes ──
  creerEquipe(): void {
    if (!this.equipeForm.nom || this.equipesPleines()) return;
    this.savingEquipe.set(true);
    this.service.creerEquipe({ nom: this.equipeForm.nom, categorie: this.equipeForm.categorie || undefined }).subscribe({
      next: () => {
        this.savingEquipe.set(false);
        this.equipeForm = { nom: '', categorie: '' };
        this.showEquipeForm.set(false);
        this.charger();
      },
      error: (err) => {
        this.savingEquipe.set(false);
        this.snack.open(err.status === 400 ? 'Maximum 3 équipes par club' : 'Erreur', 'Fermer', { duration: 3000 });
      },
    });
  }

  supprimerEquipe(e: Equipe): void {
    if (!confirm(`Supprimer l'équipe « ${e.nom} » ?`)) return;
    this.service.supprimerEquipe(e.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  editingEquipeId = signal<string | null>(null);
  editEquipeForm = { nom: '', categorie: '' };

  editerEquipe(e: Equipe): void {
    this.editingEquipeId.set(e.id);
    this.editEquipeForm = { nom: e.nom, categorie: e.categorie ?? '' };
  }
  annulerEditEquipe(): void { this.editingEquipeId.set(null); }
  enregistrerEquipe(e: Equipe): void {
    if (!this.editEquipeForm.nom) return;
    this.service.modifierEquipe(e.id, { nom: this.editEquipeForm.nom, categorie: this.editEquipeForm.categorie || undefined }).subscribe({
      next: () => { this.editingEquipeId.set(null); this.charger(); },
      error: () => this.snack.open('Modification impossible', 'Fermer', { duration: 3000 }),
    });
  }

  editingMembreId = signal<string | null>(null);
  editMembreForm: { role: string; specialite: string; equipeId: string; actif: boolean } =
    { role: '', specialite: '', equipeId: '', actif: true };

  editerMembre(m: Membre): void {
    this.editingMembreId.set(m.id);
    this.editMembreForm = { role: m.role, specialite: m.specialite ?? '', equipeId: m.equipeId ?? '', actif: m.actif };
  }
  annulerEditMembre(): void { this.editingMembreId.set(null); }
  enregistrerMembre(m: Membre): void {
    this.service.modifierMembre(m.id, {
      role: this.editMembreForm.role,
      specialite: this.editMembreForm.specialite || undefined,
      equipeId: this.editMembreForm.equipeId || undefined,
      actif: this.editMembreForm.actif,
    }).subscribe({
      next: () => { this.editingMembreId.set(null); this.charger(); },
      error: () => this.snack.open('Modification impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── Membres ──
  creerMembre(): void {
    const f = this.membreForm;
    if (!f.email || !f.nom || !f.prenom || !f.motDePasse || !f.role) return;
    this.savingMembre.set(true);
    this.service.creerMembre({ ...f, equipeId: f.equipeId || undefined, specialite: f.specialite || undefined, joueurId: f.joueurId || undefined }).subscribe({
      next: () => {
        this.savingMembre.set(false);
        this.membreForm = this.membreVide();
        this.showMembreForm.set(false);
        this.charger();
      },
      error: (err) => {
        this.savingMembre.set(false);
        this.snack.open(err.status === 409 ? 'Cet email est déjà utilisé' : 'Erreur lors de la création', 'Fermer', { duration: 3500 });
      },
    });
  }

  supprimerMembre(m: Membre): void {
    if (!confirm(`Retirer ${m.prenom} ${m.nom} du club ?`)) return;
    this.service.supprimerMembre(m.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  nomEquipe(id?: string): string {
    if (!id) return '—';
    return this.equipes().find(e => e.id === id)?.nom ?? '—';
  }

  labelRole(role: string): string {
    return ROLES_MEMBRES.find(r => r.value === role)?.label ?? role;
  }

  private membreVide(): MembreCreateRequest {
    return { email: '', nom: '', prenom: '', motDePasse: '', role: '', specialite: '', equipeId: '' };
  }
}
