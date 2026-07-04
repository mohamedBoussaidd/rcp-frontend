import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Equipe, Membre, MembreCreateRequest, MonClub, MonClubService,
} from '@core/services/mon-club.service';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { AuthService } from '@core/services/auth.service';
import { RolesAccesComponent } from '../roles-acces/roles-acces.component';
import { ApparenceClubComponent } from '../apparence-club/apparence-club.component';

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
  imports: [FormsModule, RolesAccesComponent, ApparenceClubComponent],
})
export class MonClubComponent implements OnInit {

  readonly rolesMembres = ROLES_MEMBRES;
  readonly maxEquipes = MAX_EQUIPES;

  /** Onglet actif : gestion des comptes/équipes, administration des rôles & accès, ou apparence. */
  readonly onglet = signal<'membres' | 'roles' | 'apparence'>('membres');

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

  // ── Habillage (compteurs, avatar, contexte modale liaison) ──
  readonly staffCount = computed(() => this.membres().filter(m => m.role !== 'JOUEUR').length);
  readonly joueursCount = computed(() => this.membres().filter(m => m.role === 'JOUEUR').length);
  initiales(m: { prenom?: string; nom?: string }): string {
    return ((m.prenom?.[0] ?? '') + (m.nom?.[0] ?? '')).toUpperCase() || '?';
  }

  private service = inject(MonClubService);
  private snack = inject(MatSnackBar);
  private joueurService = inject(JoueurService);
  private auth = inject(AuthService);

  /** Gestion des équipes/club : permission club:manage (président + super-admin via bypass).
   *  Getter car les permissions sont chargées en async après le boot. */
  get peutGererEquipes(): boolean { return this.auth.canGererClub(); }

  /** Gestion des comptes (membres:manage) : président, entraîneur en chef, entraîneur. */
  get peutGererMembres(): boolean { return this.auth.canGererMembres(); }

  /** Rôles attribuables : un gestionnaire d'équipe (sans club:manage) ne crée pas d'entraîneur
   *  (rang égal au sien) — le backend le refuse aussi. */
  get rolesCreables() {
    return this.peutGererEquipes ? this.rolesMembres : this.rolesMembres.filter(r => r.value !== 'ENTRAINEUR');
  }

  // ── Liaison compte JOUEUR ↔ fiche ──
  linkMembreId = signal<string | null>(null);
  ficheChoisie = signal<string>('');

  /** Membre dont la modale de liaison de fiche est ouverte. */
  readonly membreEnLien = computed(() => this.membres().find(m => m.id === this.linkMembreId()) ?? null);

  /** Fiches déjà reliées à un compte (pour ne proposer que les libres). */
  private readonly fichesLiees = computed(() =>
    new Set(this.membres().map(m => m.joueurId).filter((id): id is string => !!id)));
  /** Fiches non encore reliées, proposées dans le sélecteur de liaison. */
  readonly fichesLibres = computed(() => this.joueurs().filter(j => !this.fichesLiees().has(j.id)));

  nomFiche(id?: string): string {
    if (!id) return '';
    const j = this.joueurs().find(x => x.id === id);
    return j ? `${j.prenom} ${j.nom}` : 'fiche inconnue';
  }

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

  /** Membre dont la modale d'édition est ouverte. */
  readonly membreEnEdition = computed(() => this.membres().find(m => m.id === this.editingMembreId()) ?? null);

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

  // ── Identifiants (email / mot de passe) ──
  identifiantsMembreId = signal<string | null>(null);
  identifiantsForm = { email: '', nouveauMotDePasse: '', confirmation: '' };
  savingIdentifiants = signal(false);

  /** Membre dont la modale identifiants est ouverte. */
  readonly membreEnIdentifiants = computed(() => this.membres().find(m => m.id === this.identifiantsMembreId()) ?? null);

  ouvrirIdentifiants(m: Membre): void {
    this.identifiantsForm = { email: m.email, nouveauMotDePasse: '', confirmation: '' };
    this.identifiantsMembreId.set(m.id);
  }
  fermerIdentifiants(): void { this.identifiantsMembreId.set(null); }

  get identifiantsValides(): boolean {
    const f = this.identifiantsForm;
    const m = this.membreEnIdentifiants();
    if (!m) return false;
    const emailChange = !!f.email && f.email.trim().toLowerCase() !== m.email.toLowerCase();
    const mdpRempli = !!f.nouveauMotDePasse;
    if (!emailChange && !mdpRempli) return false;                       // rien à enregistrer
    if (mdpRempli && f.nouveauMotDePasse.length < 8) return false;
    if (mdpRempli && f.nouveauMotDePasse !== f.confirmation) return false;
    return true;
  }

  enregistrerIdentifiants(m: Membre): void {
    if (!this.identifiantsValides) return;
    const f = this.identifiantsForm;
    const req: { email?: string; nouveauMotDePasse?: string } = {};
    if (f.email && f.email.trim().toLowerCase() !== m.email.toLowerCase()) req.email = f.email.trim();
    if (f.nouveauMotDePasse) req.nouveauMotDePasse = f.nouveauMotDePasse;
    this.savingIdentifiants.set(true);
    this.service.modifierIdentifiants(m.id, req).subscribe({
      next: () => {
        this.savingIdentifiants.set(false);
        this.fermerIdentifiants();
        this.charger();
        this.snack.open('Identifiants mis à jour', 'Fermer', { duration: 2500 });
      },
      error: (err) => {
        this.savingIdentifiants.set(false);
        this.snack.open(
          err.status === 409 ? 'Cet email est déjà utilisé'
            : err.status === 400 ? 'Mot de passe : 8 caractères minimum'
            : 'Modification impossible', 'Fermer', { duration: 3500 });
      },
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

  // ── Liaison fiche ──
  ouvrirLien(m: Membre): void {
    this.linkMembreId.set(this.linkMembreId() === m.id ? null : m.id);
    this.ficheChoisie.set('');
  }

  lier(m: Membre): void {
    const joueurId = this.ficheChoisie();
    if (!joueurId) return;
    this.service.lierFiche(m.id, joueurId).subscribe({
      next: () => { this.linkMembreId.set(null); this.charger(); this.snack.open('Fiche reliée', 'Fermer', { duration: 2500 }); },
      error: err => this.snack.open(
        err.status === 409 ? 'Cette fiche est déjà reliée à un autre compte' : 'Liaison impossible', 'Fermer', { duration: 3500 }),
    });
  }

  delier(m: Membre): void {
    if (!confirm(`Détacher la fiche de ${m.prenom} ${m.nom} ?`)) return;
    this.service.delierFiche(m.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Opération impossible', 'Fermer', { duration: 3000 }),
    });
  }

  /** Crée une fiche joueur minimale (nom/prénom du compte) puis la relie. */
  creerEtLier(m: Membre): void {
    this.joueurService.create({ nom: m.nom, prenom: m.prenom, statut: 'actif' }).subscribe({
      next: fiche => this.service.lierFiche(m.id, fiche.id).subscribe({
        next: () => { this.linkMembreId.set(null); this.charger(); this.snack.open('Fiche créée et reliée', 'Fermer', { duration: 2500 }); },
        error: () => this.snack.open('Fiche créée mais liaison impossible', 'Fermer', { duration: 3500 }),
      }),
      error: () => this.snack.open('Création de la fiche impossible', 'Fermer', { duration: 3000 }),
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
