import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  NotificationConfigService, NotifConfig, Routage, DroitEnvoi, Preference,
  EquipeMatrice, LigneJoueur,
} from '@core/services/notification-config.service';
import { NiveauEnvoi } from '@core/services/notification-chat.service';
import { InfoHintComponent } from '@shared/components/info-hint/info-hint.component';

const LIBELLES: Record<string, string> = {
  RAPPEL_WELLNESS: 'Rappel wellness', RAPPEL_RPE: 'Rappel RPE', RAPPEL_POIDS: 'Rappel pesée',
  RAPPEL_SEANCE: 'Rappel séance', SEANCE_MODIFIEE: 'Séance modifiée', DOC_MEDICAL: 'Document médical',
  GENE_SUIVI: 'Suivi de gêne', MESSAGE_STAFF: 'Message du staff', MESSAGE_JOUEUR: 'Message joueur',
  ALERTE_CHARGE: 'Alerte charge (ACWR)', ALERTE_READINESS: 'Alerte readiness', ALERTE_WELLNESS: 'Alerte wellness',
  ALERTE_POIDS: 'Alerte poids', ALERTE_COMPLETION: 'Alerte complétion', ALERTE_STATUT: 'Changement de statut',
  ALERTE_GENE: 'Gêne signalée (urgent)', DIGEST: 'Digest « à surveiller »', COMPTE: 'Comptes', ECHEANCE: 'Échéances',
};

/** Paramètres des notifications (staff) : seuils, digests, rappels, routage par rôle, droits d'envoi, préférences perso. */
@Component({
  selector: 'app-parametres-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, InfoHintComponent],
  templateUrl: './parametres-notifications.component.html',
  styleUrl: './parametres-notifications.component.scss',
})
export class ParametresNotificationsComponent implements OnInit {

  private api = inject(NotificationConfigService);

  readonly onglet = signal<'config' | 'routage' | 'joueur' | 'droits' | 'perso'>('config');
  readonly config = signal<NotifConfig | null>(null);
  readonly routages = signal<Routage[]>([]);
  readonly droits = signal<DroitEnvoi[]>([]);
  readonly preferences = signal<Preference[]>([]);
  readonly message = signal<string | null>(null);

  /** Matrice des préférences par joueur (staff). */
  readonly matrice = signal<EquipeMatrice | null>(null);

  readonly roles = ['ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'PRESIDENT'];
  readonly niveaux: NiveauEnvoi[] = ['AUCUN', 'EQUIPE', 'CIBLE'];

  ngOnInit(): void {
    this.api.getConfig().subscribe(c => this.config.set(c));
    this.api.getRoutage().subscribe(r => this.routages.set(r));
    this.api.getDroits().subscribe(d => this.droits.set(d));
    this.api.mesPreferences().subscribe(p => this.preferences.set(p));
    this.api.getMatrice().subscribe(m => this.matrice.set(m));
  }

  libelle(type: string): string { return LIBELLES[type] ?? type; }

  enregistrerConfig(): void {
    const c = this.config();
    if (!c) return;
    this.api.updateConfig(c).subscribe({
      next: () => this.flash('Configuration enregistrée.'),
      error: () => this.flash('Erreur lors de l\'enregistrement.'),
    });
  }

  aRole(r: Routage, role: string): boolean {
    return r.roles.split(',').map(s => s.trim()).includes(role);
  }
  basculerRole(r: Routage, role: string): void {
    const set = new Set(r.roles.split(',').map(s => s.trim()).filter(Boolean));
    set.has(role) ? set.delete(role) : set.add(role);
    r.roles = Array.from(set).join(',');
  }
  enregistrerRoutage(): void {
    this.api.updateRoutage(this.routages()).subscribe({
      next: r => { this.routages.set(r); this.flash('Routage enregistré.'); },
      error: () => this.flash('Erreur routage.'),
    });
  }

  changerDroit(d: DroitEnvoi, niveau: NiveauEnvoi): void {
    this.api.setDroit(d.joueurId, niveau).subscribe({
      next: maj => { d.niveau = maj.niveau; this.flash('Droit mis à jour.'); },
      error: () => this.flash('Erreur droit.'),
    });
  }

  basculerPref(p: Preference): void {
    if (!p.modifiable) return;
    const actif = !p.actif;
    this.api.majMaPreference(p.type, actif).subscribe({
      next: () => { p.actif = actif; },
      error: () => this.flash('Erreur préférence.'),
    });
  }

  // ── Matrice par joueur (staff) ──

  /** Une case joueur × type. */
  basculerCellule(ligne: LigneJoueur, type: string): void {
    const actif = !ligne.actifs[type];
    this.api.majPreferenceJoueur(ligne.joueurId, type, actif, true).subscribe({
      next: () => { ligne.actifs[type] = actif; },
      error: () => this.flash('Erreur préférence joueur.'),
    });
  }

  /** Tous les joueurs ont-ils ce type activé ? (pour la case d'en-tête de colonne). */
  colonneToute(type: string): boolean {
    const m = this.matrice();
    return !!m && m.joueurs.length > 0 && m.joueurs.every(l => l.actifs[type]);
  }

  /** Active/coupe un type pour tout le monde. */
  basculerColonne(type: string): void {
    const actif = !this.colonneToute(type);
    this.api.setTypeEquipe(type, actif).subscribe({
      next: () => {
        this.matrice()?.joueurs.forEach(l => l.actifs[type] = actif);
        this.matrice.set({ ...this.matrice()! });
        this.flash(actif ? 'Activé pour toute l\'équipe.' : 'Coupé pour toute l\'équipe.');
      },
      error: () => this.flash('Erreur mise à jour groupée.'),
    });
  }

  private flash(m: string): void {
    this.message.set(m);
    setTimeout(() => this.message.set(null), 2500);
  }
}
