import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Blessure, BlessureRequest, BlessureService } from '../../core/services/blessure.service';
import { Joueur, JoueurService } from '../../core/services/joueur.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-medical',
  standalone: true,
  templateUrl: './medical.component.html',
  styleUrl: './medical.component.scss',
  imports: [FormsModule, DatePipe, MatToolbar, MatCard, MatCardContent, MatCardHeader, MatCardTitle],
})
export class MedicalComponent implements OnInit {

  readonly types    = ['musculaire', 'articulaire', 'osseux', 'tendineux', 'ligamentaire', 'autre'];
  readonly zones    = ['ischio_jambiers', 'quadriceps', 'mollet', 'cheville', 'genou', 'hanche', 'dos', 'epaule', 'adducteurs', 'autre'];
  readonly cotes    = ['gauche', 'droit', 'les_deux'];
  readonly gravites = ['leger', 'modere', 'grave'];
  readonly causes   = ['surcharge', 'contact', 'terrain', 'fatigue_accumulee', 'recidive', 'autre'];

  blessures = signal<Blessure[]>([]);
  joueurs = signal<Joueur[]>([]);
  loading = signal(true);

  showForm = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  form: BlessureRequest = this.formVide();

  constructor(
    private blessureService: BlessureService,
    private joueurService: JoueurService,
    private snack: MatSnackBar,
    public auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.joueurService.getAll().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
    this.charger();
  }

  charger(): void {
    this.loading.set(true);
    this.blessureService.lister().subscribe({
      next: b => { this.blessures.set(b); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snack.open('Erreur de chargement', 'Fermer', { duration: 3000 }); },
    });
  }

  nouveau(): void {
    this.editingId.set(null);
    this.form = this.formVide();
    this.showForm.set(true);
  }

  editer(b: Blessure): void {
    this.editingId.set(b.id);
    this.form = {
      joueurId: b.joueurId, dateBlessure: b.dateBlessure, dateRetourEffectif: b.dateRetourEffectif ?? '',
      typeBlessure: b.typeBlessure, zoneCorporelle: b.zoneCorporelle, cote: b.cote,
      gravite: b.gravite, causeProbable: b.causeProbable, recidive: b.recidive, commentaire: b.commentaire,
    };
    this.showForm.set(true);
  }

  annuler(): void { this.showForm.set(false); this.editingId.set(null); }

  enregistrer(): void {
    if (!this.form.joueurId || !this.form.dateBlessure) return;
    this.saving.set(true);
    const payload: BlessureRequest = { ...this.form, dateRetourEffectif: this.form.dateRetourEffectif || null };
    const id = this.editingId();
    const obs = id ? this.blessureService.modifier(id, payload) : this.blessureService.creer(payload);
    obs.subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.editingId.set(null); this.charger(); },
      error: () => { this.saving.set(false); this.snack.open('Erreur lors de l\'enregistrement', 'Fermer', { duration: 3000 }); },
    });
  }

  supprimer(b: Blessure): void {
    if (!confirm('Supprimer cette blessure ?')) return;
    this.blessureService.supprimer(b.id).subscribe({
      next: () => this.charger(),
      error: () => this.snack.open('Suppression impossible', 'Fermer', { duration: 3000 }),
    });
  }

  joliLabel(v?: string): string {
    return v ? v.replace(/_/g, ' ') : '—';
  }

  graviteClass(g?: string): string {
    return g === 'grave' ? 'g-grave' : g === 'modere' ? 'g-modere' : g === 'leger' ? 'g-leger' : '';
  }

  private formVide(): BlessureRequest {
    return {
      joueurId: '', dateBlessure: new Date().toISOString().slice(0, 10), dateRetourEffectif: '',
      typeBlessure: '', zoneCorporelle: '', cote: '', gravite: '', causeProbable: '', recidive: false, commentaire: '',
    };
  }
}
