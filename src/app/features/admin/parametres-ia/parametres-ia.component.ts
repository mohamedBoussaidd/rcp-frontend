import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { IaConfigComponent } from '../ia-config/ia-config.component';
import { IaAdminService, QuotaFeatureDto } from '@core/services/ia-admin.service';

interface VersionDto { id: string; valeur: string; createdAt: string; }
interface ParametreDto { cle: string; valeur: string; defaut: string; historique: VersionDto[]; }

/** Éditeur d'un prompt IA (une clé) : état serveur + texte en cours + historique replié. */
class PromptEditor {
  readonly param = signal<ParametreDto | null>(null);
  edite = '';
  readonly histOuvert = signal(false);
  readonly saving = signal(false);
  constructor(readonly cle: string, readonly titre: string, readonly hint: string, readonly rows: number) {}
}

/** Une feature IA côté admin : son prompt éditable (si elle en a un) + son toggle LLM (si c'est une carte). */
class FeatureAdmin {
  readonly prompt: PromptEditor | null;
  readonly toggle = signal<ParametreDto | null>(null);
  constructor(readonly code: string, readonly libelle: string,
              readonly clePrompt: string | null, readonly cleToggle: string | null, hint: string) {
    this.prompt = clePrompt ? new PromptEditor(clePrompt, `Prompt — ${libelle}`, hint, 14) : null;
  }
  get llmActif(): boolean { return (this.toggle()?.valeur ?? 'true').trim().toLowerCase() !== 'false'; }
}

/** Aides contextuelles par feature (fallback générique pour toute future carte). */
const HINTS: Record<string, string> = {
  import_photo: "Envoyé au modèle vision avec chaque photo (palette du schéma, référentiels, contrat JSON strict). Modifie prudemment : chaque enregistrement historise la version précédente.",
  generateur_seance: "Guide la composition d'une séance. Le catalogue d'exercices (avec leurs tags) et les types de séance sont ajoutés AUTOMATIQUEMENT après ce texte : n'y remets pas la bibliothèque.",
  briefing_prepa: "Guide la « note du prépa ». Les indicateurs déjà calculés (readiness, objectif hebdo, charge) sont ajoutés APRÈS, en message utilisateur : n'y remets pas de chiffres à la main.",
};
const HINT_DEFAUT = "Prompt système de cette feature. Les données spécifiques (indicateurs, catalogue…) sont ajoutées automatiquement à l'exécution : n'y remets pas de données à la main.";

/**
 * Paramètres IA (super-admin) — UNE page, 3 onglets :
 *  · Prompts : sélecteur de feature (chips) + éditeur du prompt + toggle LLM (cartes) ;
 *  · Quotas : par feature, défaut global + surcharge par club (source unique) ;
 *  · Clés & modèles : la config par club (composant réembarqué).
 * Data-driven par le catalogue {@link IaAdminService.features} : une nouvelle carte apparaît seule.
 */
@Component({
  selector: 'app-parametres-ia',
  standalone: true,
  imports: [FormsModule, DatePipe, IaConfigComponent],
  templateUrl: './parametres-ia.component.html',
  styleUrl: './parametres-ia.component.scss',
})
export class ParametresIaComponent implements OnInit {

  private http = inject(HttpClient);
  private snack = inject(MatSnackBar);
  private iaAdmin = inject(IaAdminService);

  readonly onglet = signal<'prompts' | 'quotas' | 'cles'>('prompts');

  // ── Onglet Prompts ──
  readonly features = signal<FeatureAdmin[]>([]);
  readonly promptSel = signal<string | null>(null);

  // ── Onglet Quotas ──
  readonly quotas = signal<QuotaFeatureDto[]>([]);
  readonly quotaDefautEdit: Record<string, number> = {};
  readonly clubOuvert = signal<string | null>(null);   // feature dont le détail par club est déplié

  ngOnInit(): void {
    this.iaAdmin.features().subscribe(fs => {
      const list = fs.map(f => new FeatureAdmin(f.code, f.libelle, f.clePrompt, f.cleToggle, HINTS[f.code] ?? HINT_DEFAUT));
      this.features.set(list);
      const premier = list.find(f => f.prompt);
      if (premier) this.promptSel.set(premier.code);
      list.forEach(f => this.chargerFeature(f));
    });
    this.chargerQuotas();
  }

  featureSel(): FeatureAdmin | undefined {
    return this.features().find(f => f.code === this.promptSel());
  }

  private chargerFeature(f: FeatureAdmin): void {
    if (f.prompt) {
      this.http.get<ParametreDto>(`/api/admin/parametres-ia/${f.prompt.cle}`).subscribe({
        next: p => { f.prompt!.param.set(p); f.prompt!.edite = p.valeur; }, error: () => {},
      });
    }
    if (f.cleToggle) {
      this.http.get<ParametreDto>(`/api/admin/parametres-ia/${f.cleToggle}`).subscribe({
        next: p => f.toggle.set(p), error: () => {},
      });
    }
  }

  // ── Prompts : actions ──
  enregistrerPrompt(ed: PromptEditor): void {
    if (!ed.edite.trim() || ed.saving()) return;
    ed.saving.set(true);
    this.http.put<ParametreDto>(`/api/admin/parametres-ia/${ed.cle}`, { valeur: ed.edite }).subscribe({
      next: p => {
        ed.saving.set(false); ed.param.set(p); ed.edite = p.valeur;
        this.snack.open('Prompt enregistré (version précédente historisée)', 'OK', { duration: 3000 });
      },
      error: () => { ed.saving.set(false); this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }); },
    });
  }

  restaurer(ed: PromptEditor, v: VersionDto): void {
    this.http.post<ParametreDto>(`/api/admin/parametres-ia/${ed.cle}/restaurer/${v.id}`, {}).subscribe({
      next: p => { ed.param.set(p); ed.edite = p.valeur; this.snack.open('Version restaurée', 'OK', { duration: 2500 }); },
      error: () => this.snack.open('Restauration impossible', 'Fermer', { duration: 3000 }),
    });
  }

  remettreDefaut(ed: PromptEditor): void {
    const p = ed.param();
    if (p) ed.edite = p.defaut;
  }

  basculerLlm(f: FeatureAdmin, actif: boolean): void {
    if (!f.cleToggle) return;
    this.http.put<ParametreDto>(`/api/admin/parametres-ia/${f.cleToggle}`, { valeur: actif ? 'true' : 'false' }).subscribe({
      next: p => { f.toggle.set(p); this.snack.open(actif ? 'LLM activé pour cette carte' : 'Carte en mode gabarit seul', 'OK', { duration: 2500 }); },
      error: () => this.snack.open('Modification impossible', 'Fermer', { duration: 3000 }),
    });
  }

  // ── Quotas : chargement + actions ──
  private chargerQuotas(): void {
    this.iaAdmin.quotas().subscribe({ next: q => this.appliquerQuotas(q), error: () => {} });
  }

  private appliquerQuotas(q: QuotaFeatureDto[], msg?: string): void {
    this.quotas.set(q);
    q.forEach(x => this.quotaDefautEdit[x.feature] = x.defautGlobal);
    if (msg) this.snack.open(msg, 'OK', { duration: 2000 });
  }

  enregistrerDefaut(feature: string): void {
    const v = this.quotaDefautEdit[feature];
    if (v == null || v < 0) return;
    this.iaAdmin.majQuotaDefaut(feature, v).subscribe({
      next: q => this.appliquerQuotas(q, 'Quota par défaut enregistré'),
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }

  fixerClub(feature: string, clubId: string, valeur: string): void {
    const v = valeur.trim() === '' ? null : Math.max(0, parseInt(valeur, 10) || 0);
    this.iaAdmin.majQuotaClub(clubId, feature, v).subscribe({
      next: q => this.appliquerQuotas(q, 'Quota mis à jour'),
      error: () => this.snack.open('Mise à jour impossible', 'Fermer', { duration: 3000 }),
    });
  }
}
