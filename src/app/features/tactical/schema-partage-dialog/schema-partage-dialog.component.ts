import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Joueur, JoueurService } from '@core/services/joueur.service';
import { SchemaPartage, SchemaPartageService } from '@core/services/schema-partage.service';

/** Données d'ouverture : le schéma à diffuser. */
export interface SchemaPartageData { schemaId: string; nom: string; }

/**
 * Partage d'un schéma aux joueurs : toute l'équipe et/ou des joueurs choisis, avec une consigne.
 * Chaque destinataire reçoit une notification (in-app + push) — sans elle, personne ne va voir
 * le schéma.
 *
 * L'écran montre aussi les partages DÉJÀ faits sur ce schéma, avec leur retrait : c'est la seule
 * façon de savoir qui l'a reçu, et de le reprendre si on s'est trompé de destinataire.
 */
@Component({
  selector: 'app-schema-partage-dialog',
  standalone: true,
  imports: [FormsModule, MatIcon, DatePipe],
  template: `
  <div class="sp">
    <h2 class="sp__titre"><mat-icon>share</mat-icon> Partager « {{ data.nom }} »</h2>

    <div class="sp__cible">
      <label class="sp__check">
        <input type="checkbox" [(ngModel)]="versEquipe" name="eq">
        <b>Toute l'équipe</b>
      </label>
      <span class="sp__aide">Tous les joueurs de l'équipe active le verront dans leur application.</span>
    </div>

    <div class="sp__cible">
      <div class="sp__cible-titre">…ou seulement certains joueurs</div>
      @if (chargement()) {
        <div class="sp__vide">Chargement de l'effectif…</div>
      } @else if (!effectif().length) {
        <div class="sp__vide">Aucun joueur dans l'effectif.</div>
      } @else {
        <div class="sp__joueurs">
          @for (j of effectif(); track j.id) {
            <label class="sp__jeton" [class.on]="choisis().has(j.id)">
              <input type="checkbox" [checked]="choisis().has(j.id)" (change)="basculer(j.id)">
              {{ j.prenom }} {{ j.nom }}
            </label>
          }
        </div>
      }
    </div>

    <label class="sp__champ">
      <span>Titre (facultatif)</span>
      <input class="input" [(ngModel)]="titre" name="t" [placeholder]="data.nom" maxlength="160">
    </label>

    <label class="sp__champ">
      <span>Consigne au joueur (facultatif)</span>
      <textarea class="input" rows="3" [(ngModel)]="message" name="m"
                placeholder="Ex. : regarde le placement du bloc quand le ballon part côté droit."></textarea>
    </label>

    @if (partages().length) {
      <div class="sp__deja">
        <div class="sp__cible-titre">Déjà partagé à</div>
        @for (p of partages(); track p.id) {
          <div class="sp__ligne">
            <mat-icon>{{ p.joueurId ? 'person' : 'groups' }}</mat-icon>
            <b>{{ p.destinataire }}</b>
            <span class="sp__date">{{ p.createdAt | date:'dd/MM/yy' }}</span>
            <button class="btn btn--ghost btn--icon btn--sm" title="Retirer ce partage"
                    (click)="retirer(p)"><mat-icon>close</mat-icon></button>
          </div>
        }
      </div>
    }

    <div class="sp__actions">
      <button class="btn btn--ghost" (click)="ref.close(false)">Annuler</button>
      <button class="btn btn--primary" [disabled]="!peutPartager() || envoi()" (click)="partager()">
        <mat-icon>send</mat-icon> {{ envoi() ? 'Envoi…' : 'Partager' }}
      </button>
    </div>
  </div>
  `,
  styles: [`
    .sp { display:flex; flex-direction:column; gap:14px; padding:18px 20px; min-width:min(520px, 86vw); }
    .sp__titre { display:flex; align-items:center; gap:8px; margin:0; font-size:1.05rem; }
    .sp__cible { display:flex; flex-direction:column; gap:6px; }
    .sp__cible-titre { font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.4px; opacity:.6; }
    .sp__check { display:flex; align-items:center; gap:8px; font-size:.92rem; }
    .sp__aide { font-size:.76rem; opacity:.6; }
    .sp__joueurs { display:flex; flex-wrap:wrap; gap:6px; max-height:180px; overflow:auto; }
    .sp__jeton { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:999px;
                 border:1px solid var(--border); font-size:.8rem; cursor:pointer; }
    .sp__jeton.on { border-color:var(--green-600); background:var(--green-50); color:var(--green-700); }
    .sp__champ { display:flex; flex-direction:column; gap:4px; font-size:.8rem; }
    .sp__champ span { opacity:.7; }
    .sp__deja { display:flex; flex-direction:column; gap:4px; border-top:1px solid var(--border); padding-top:10px; }
    .sp__ligne { display:flex; align-items:center; gap:8px; font-size:.82rem; }
    .sp__ligne mat-icon { font-size:17px; width:17px; height:17px; opacity:.6; }
    .sp__date { margin-left:auto; opacity:.55; font-size:.74rem; }
    .sp__vide { font-size:.8rem; opacity:.6; }
    .sp__actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
  `],
})
export class SchemaPartageDialogComponent implements OnInit {

  private service = inject(SchemaPartageService);
  private joueurService = inject(JoueurService);
  private snack = inject(MatSnackBar);
  ref = inject(MatDialogRef<SchemaPartageDialogComponent>);

  readonly effectif = signal<Joueur[]>([]);
  readonly partages = signal<SchemaPartage[]>([]);
  readonly choisis = signal<Set<string>>(new Set());
  readonly chargement = signal(true);
  readonly envoi = signal(false);

  versEquipe = true;
  titre = '';
  message = '';

  constructor(@Inject(MAT_DIALOG_DATA) public data: SchemaPartageData) {}

  ngOnInit(): void {
    this.joueurService.getEffectifEquipe().subscribe({
      next: js => { this.effectif.set(js); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
    this.service.lister(this.data.schemaId).subscribe({
      next: p => this.partages.set(p),
      error: () => this.partages.set([]),
    });
  }

  basculer(id: string): void {
    // Le Set vit dans un signal : muter l'objet ne notifierait pas, on le remplace.
    const s = new Set(this.choisis());
    s.has(id) ? s.delete(id) : s.add(id);
    this.choisis.set(s);
  }

  peutPartager(): boolean { return this.versEquipe || this.choisis().size > 0; }

  partager(): void {
    if (!this.peutPartager()) return;
    this.envoi.set(true);
    this.service.partager({
      schemaId: this.data.schemaId,
      equipe: this.versEquipe,
      joueurIds: [...this.choisis()],
      titre: this.titre.trim() || undefined,
      message: this.message.trim() || undefined,
    }).subscribe({
      next: ps => {
        this.snack.open(`Schéma partagé (${ps.length} envoi${ps.length > 1 ? 's' : ''})`, 'Fermer', { duration: 2800 });
        this.ref.close(true);
      },
      error: err => {
        this.envoi.set(false);
        this.snack.open(err?.error?.message ?? 'Partage impossible', 'Fermer', { duration: 3800 });
      },
    });
  }

  retirer(p: SchemaPartage): void {
    if (!confirm(`Retirer le partage à ${p.destinataire} ? Le schéma disparaîtra de son espace.`)) return;
    this.service.retirer(p.id).subscribe({
      next: () => this.partages.set(this.partages().filter(x => x.id !== p.id)),
      error: () => this.snack.open('Retrait impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
