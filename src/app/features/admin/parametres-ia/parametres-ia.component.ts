import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { IaConfigComponent } from '../ia-config/ia-config.component';
import { FournisseurIa, IaAdminService, QuotaFeatureDto } from '@core/services/ia-admin.service';

interface VersionDto { id: string; valeur: string; createdAt: string; }
interface ParametreDto { cle: string; valeur: string; defaut: string; historique: VersionDto[]; }

/** Éditeur d'un prompt IA (une clé) : état serveur + texte en cours + historique replié. */
class PromptEditor {
  readonly param = signal<ParametreDto | null>(null);
  edite = '';
  readonly histOuvert = signal(false);
  readonly saving = signal(false);
  constructor(readonly cle: string, readonly titre: string, readonly hint: string, readonly rows: number) { }
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
  readonly fournisseurGlobal = signal<string>('ANTHROPIC');
  readonly modeleGlobal = signal<string>('claude-opus-4-8');

  // ── Catalogue des fournisseurs (onglet Clés & modèles) ──
  readonly fournisseurs = signal<FournisseurIa[]>([]);
  readonly dialectes = ['OPENAI', 'ANTHROPIC'];
  /** Saisies en cours, par code : une clé n'est jamais réaffichée, on ne fait que la remplacer. */
  readonly cleSaisie: Record<string, string> = {};
  readonly nouveau = { code: '', libelle: '', dialecte: 'OPENAI', baseUrl: '', modeleDefaut: '', cleApi: '' };
  readonly ajoutOuvert = signal(false);

  // ── Nom global de l'assistant (onglet Prompts) ──
  readonly nomAssistant = signal<string>('');

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
    // ✅ NOUVEL APPel : charge la config globale
    this.chargerConfigGlobale();
  }

  private chargerConfigGlobale(): void {
    // Fournisseur + modèle utilisés par défaut par tous les clubs sans clé propre.
    this.http.get<ParametreDto>('/api/admin/parametres-ia/ia_fournisseur_global').subscribe(p =>
      this.fournisseurGlobal.set(p.valeur)
    );
    this.http.get<ParametreDto>('/api/admin/parametres-ia/ia_modele_global').subscribe(p =>
      this.modeleGlobal.set(p.valeur)
    );
    this.http.get<ParametreDto>('/api/admin/parametres-ia/nom_assistant').subscribe(p =>
      this.nomAssistant.set(p.valeur || p.defaut)
    );
    this.chargerFournisseurs();
  }

  // ── Fournisseurs IA : catalogue, clés, ajout ──

  private chargerFournisseurs(fs?: FournisseurIa[]): void {
    if (fs) { this.appliquerFournisseurs(fs); return; }
    this.iaAdmin.fournisseurs().subscribe({ next: f => this.appliquerFournisseurs(f), error: () => { } });
  }

  private appliquerFournisseurs(fs: FournisseurIa[]): void {
    this.fournisseurs.set(fs);
    fs.forEach(f => this.cleSaisie[f.code] = '');
  }

  /** Le fournisseur choisi globalement a-t-il une clé exploitable ? (témoin en tête d'onglet) */
  fournisseurCourant(): FournisseurIa | undefined {
    return this.fournisseurs().find(f => f.code === this.fournisseurGlobal());
  }

  etatCle(f: FournisseurIa): string {
    if (f.origineCle === 'BASE') return `clé saisie ici (${f.cleMasquee})`;
    if (f.origineCle === 'ENVIRONNEMENT') return `clé du serveur (${f.cleMasquee})`;
    return 'aucune clé';
  }

  enregistrerFournisseur(f: FournisseurIa): void {
    this.iaAdmin.majFournisseur(f.code, {
      libelle: f.libelle, dialecte: f.dialecte, baseUrl: f.baseUrl, modeleDefaut: f.modeleDefaut,
      actif: f.actif, cleApi: (this.cleSaisie[f.code] || '').trim() || null,
    }).subscribe({
      next: fs => { this.chargerFournisseurs(fs); this.snack.open('Fournisseur enregistré', 'OK', { duration: 2500 }); },
      error: e => this.snack.open(e?.error?.message || 'Enregistrement impossible', 'Fermer', { duration: 4000 }),
    });
  }

  revoquerCle(f: FournisseurIa): void {
    if (!confirm(`Effacer la clé de ${f.libelle} ? Il retombera sur la variable d'environnement du serveur, s'il y en a une.`)) return;
    this.iaAdmin.revoquerCleFournisseur(f.code).subscribe({
      next: fs => { this.chargerFournisseurs(fs); this.snack.open('Clé effacée', 'OK', { duration: 2500 }); },
      error: () => this.snack.open('Révocation impossible', 'Fermer', { duration: 3500 }),
    });
  }

  supprimerFournisseur(f: FournisseurIa): void {
    if (!confirm(`Supprimer le fournisseur ${f.libelle} ?`)) return;
    this.iaAdmin.supprimerFournisseur(f.code).subscribe({
      next: fs => { this.chargerFournisseurs(fs); this.snack.open('Fournisseur supprimé', 'OK', { duration: 2500 }); },
      error: e => this.snack.open(e?.error?.message || 'Suppression impossible', 'Fermer', { duration: 4000 }),
    });
  }

  ajouterFournisseur(): void {
    const n = this.nouveau;
    if (!n.code.trim()) return;
    this.iaAdmin.majFournisseur(n.code.trim(), {
      libelle: n.libelle.trim() || n.code.trim(), dialecte: n.dialecte,
      baseUrl: n.baseUrl.trim() || null, modeleDefaut: n.modeleDefaut.trim() || null,
      actif: true, cleApi: n.cleApi.trim() || null,
    }).subscribe({
      next: fs => {
        this.chargerFournisseurs(fs);
        Object.assign(n, { code: '', libelle: '', dialecte: 'OPENAI', baseUrl: '', modeleDefaut: '', cleApi: '' });
        this.ajoutOuvert.set(false);
        this.snack.open('Fournisseur ajouté', 'OK', { duration: 2500 });
      },
      error: e => this.snack.open(e?.error?.message || 'Ajout impossible', 'Fermer', { duration: 4000 }),
    });
  }

  /** Nom global de l'assistant — un club peut le surcharger dans l'onglet Clés & modèles. */
  enregistrerNomAssistant(): void {
    const v = this.nomAssistant().trim();
    if (!v) return;
    this.http.put<ParametreDto>('/api/admin/parametres-ia/nom_assistant', { valeur: v }).subscribe({
      next: p => { this.nomAssistant.set(p.valeur); this.snack.open('Nom de l\'assistant enregistré', 'OK', { duration: 2500 }); },
      error: () => this.snack.open('Enregistrement impossible', 'Fermer', { duration: 3000 }),
    });
  }
  // Enregistrement
  enregistrerGlobal(): void {
    this.http.put('/api/admin/parametres-ia/ia_fournisseur_global', {
      valeur: this.fournisseurGlobal()
    }).subscribe({
      error: () => this.snack.open('Erreur fournisseur', 'Fermer', { duration: 3000 })
    });

    // Champ vide → on retombe sur le modèle par défaut du fournisseur choisi. Sans ce repli, un
    // changement de fournisseur laisserait en place le modèle de l'ancien (ex. un modèle OpenAI
    // envoyé à Anthropic) et l'appel échouerait sans que la cause saute aux yeux.
    const modele = this.modeleGlobal().trim() || this.fournisseurCourant()?.modeleDefaut || '';
    if (!modele) {
      this.snack.open('Renseigne un modèle : ce fournisseur n\'en déclare pas par défaut.', 'Fermer', { duration: 4000 });
      return;
    }
    this.modeleGlobal.set(modele);
    this.http.put('/api/admin/parametres-ia/ia_modele_global', {
      valeur: modele
    }).subscribe({
      next: () => this.snack.open('Configuration enregistrée', 'OK', { duration: 3000 }),
      error: () => this.snack.open('Erreur modèle', 'Fermer', { duration: 3000 })
    });
  }
  featureSel(): FeatureAdmin | undefined {
    return this.features().find(f => f.code === this.promptSel());
  }

  private chargerFeature(f: FeatureAdmin): void {
    if (f.prompt) {
      this.http.get<ParametreDto>(`/api/admin/parametres-ia/${f.prompt.cle}`).subscribe({
        next: p => { f.prompt!.param.set(p); f.prompt!.edite = p.valeur; }, error: () => { },
      });
    }
    if (f.cleToggle) {
      this.http.get<ParametreDto>(`/api/admin/parametres-ia/${f.cleToggle}`).subscribe({
        next: p => f.toggle.set(p), error: () => { },
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
    this.iaAdmin.quotas().subscribe({ next: q => this.appliquerQuotas(q), error: () => { } });
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
