import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GroupeSeanceDto, ResumeSeance, SeanceService } from '@core/services/seance.service';
import { AuthService } from '@core/services/auth.service';
import { ContexteService } from '@core/services/contexte.service';
import { SchemaViewerComponent } from '../../tactical/schema-viewer/schema-viewer.component';
import { OccupationZone, TerrainZonesComponent } from '@shared/components/terrain-zones/terrain-zones.component';

/**
 * Fiche séance (résumé) — triple usage : vérification après création (?verif=1),
 * consultation d'une séance existante, et fiche imprimable (CSS @media print +
 * window.print()). Lisible par tout le staff : les sections avancées (dominantes,
 * projet de jeu, blocs, effectifs) n'apparaissent que si elles sont remplies.
 */
@Component({
  selector: 'app-fiche-seance',
  standalone: true,
  templateUrl: './fiche-seance.component.html',
  styleUrl: './fiche-seance.component.scss',
  imports: [DatePipe, FormsModule, SchemaViewerComponent, TerrainZonesComponent],
})
export class FicheSeanceComponent implements OnInit {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private seanceService = inject(SeanceService);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);
  private contexte = inject(ContexteService);

  resume = signal<ResumeSeance | null>(null);
  loading = signal(true);
  partageEnCours = signal(false);
  /** Arrivée depuis la création (mode avancé) : bandeau de vérification. */
  verif = signal(false);

  readonly clubNom = computed(() => this.contexte.clubActif()?.nom ?? '');
  readonly clubInitiales = computed(() => {
    const nom = this.clubNom();
    if (!nom) return '·';
    return nom.split(/\s+/).map(m => m[0]).join('').slice(0, 2).toUpperCase();
  });

  peutEcrire(): boolean { return this.auth.has('seances:write'); }

  /**
   * Occupation du terrain : une entrée par (bloc, zone), avec le staff et son pictogramme de
   * rôle. C'est ce qui rend la fiche lisible en 2 secondes au bord du terrain — « qui est où,
   * avec qui » — au lieu d'être écrit dans une phrase.
   */
  readonly occupationTerrain = computed<OccupationZone[]>(() => {
    const r = this.resume();
    if (!r) return [];
    // Une zone tenue par deux blocs est signalée : c'est le conflit d'occupation du terrain.
    const compte = new Map<number, number>();
    for (const b of r.blocs) {
      for (const z of new Set(b.bloc.zones ?? [])) compte.set(z, (compte.get(z) ?? 0) + 1);
    }
    const occupations: OccupationZone[] = [];
    r.blocs.forEach((b, i) => {
      const staff = (b.bloc.staff ?? []).map(s => {
        const icones = (s.roleBloc ?? []).map(code => this.iconeRole(code)).filter(x => !!x);
        return `${icones.join('')} ${s.nom}`.trim();
      });
      for (const zone of b.bloc.zones ?? []) {
        occupations.push({
          zone,
          bloc: `${i + 1} · ${b.bloc.libelle}`,
          staff,
          conflit: (compte.get(zone) ?? 0) > 1,
        });
      }
    });
    return occupations;
  });

  readonly aZones = computed(() => this.occupationTerrain().length > 0);

  /**
   * Groupes propres à UN bloc. Ils étaient jusqu'ici noyés avec les autres en bas de fiche, sans
   * qu'on sache lequel travaillait où — c'est précisément l'information dont le staff a besoin.
   */
  groupesDuBloc(blocId: string): GroupeSeanceDto[] {
    return (this.resume()?.groupes ?? []).filter(g => g.blocId === blocId);
  }

  /**
   * Groupes valables pour TOUTE la séance ({@code blocId} null). Un bloc sans groupes propres
   * retombe sur eux — c'est la règle de résolution du serveur, rappelée sur la fiche.
   */
  readonly groupesSeance = computed<GroupeSeanceDto[]>(() =>
    (this.resume()?.groupes ?? []).filter(g => !g.blocId));

  /** Y a-t-il au moins un groupe rattaché à un bloc précis ? (pilote la mention d'explication) */
  readonly aGroupesParBloc = computed(() =>
    (this.resume()?.groupes ?? []).some(g => !!g.blocId));

  /** « ▶⚖ Rémi » — le pictogramme d'abord, il porte l'information la plus utile sur le terrain. */
  libelleStaffRole(s: { nom: string; roleBloc?: string[] }): string {
    const icones = (s.roleBloc ?? []).map(c => this.iconeRole(c)).filter(x => !!x).join('');
    return icones ? `${icones} ${s.nom}` : `👤 ${s.nom}`;
  }

  /** Pictogrammes des rôles — repris du référentiel figé (V66), en dur ici pour l'impression. */
  private iconeRole(code: string): string {
    return ({
      MENEUR: '▶', ARBITRE: '⚖', BALLONS: '⚽',
      CHRONO: '⏱', OBSERVATION: '👁', SOINS: '🩺',
    } as Record<string, string>)[code] ?? '';
  }

  ngOnInit(): void {
    this.verif.set(this.route.snapshot.queryParamMap.get('verif') === '1');
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/calendrier']); return; }
    this.seanceService.getResume(id).subscribe({
      next: r => { this.resume.set(r); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.snack.open('Fiche introuvable', 'Fermer', { duration: 3000 });
        this.router.navigate(['/calendrier']);
      },
    });
  }

  imprimer(): void { window.print(); }

  retour(): void { this.router.navigate(['/calendrier']); }

  partager(): void {
    const r = this.resume();
    if (!r || this.partageEnCours()) return;
    this.partageEnCours.set(true);
    this.seanceService.partagerAuStaff(r.seanceId).subscribe({
      next: res => {
        this.partageEnCours.set(false);
        this.snack.open(`Fiche partagée à ${res.notifies} membre${res.notifies > 1 ? 's' : ''} du staff`, 'OK', { duration: 3000 });
      },
      error: () => {
        this.partageEnCours.set(false);
        this.snack.open('Partage impossible', 'Fermer', { duration: 3000 });
      },
    });
  }

  /** Retourne au calendrier en rouvrant l'édition de la séance. */
  modifier(): void {
    const r = this.resume();
    if (!r) return;
    this.router.navigate(['/calendrier'], { queryParams: { editer: r.seanceId } });
  }

  // ── C1 : Reprogrammer (Séance → nouvelle séance) ──
  readonly reprogOuvert = signal(false);
  reprogDate = '';
  reprogHeure = '';
  readonly reprogEnCours = signal(false);

  ouvrirReprog(): void { this.reprogHeure = this.resume()?.heureDebut ?? ''; this.reprogOuvert.set(true); }
  fermerReprog(): void { this.reprogOuvert.set(false); }

  confirmerReprog(): void {
    const r = this.resume();
    if (!r || !this.reprogDate || this.reprogEnCours()) return;
    this.reprogEnCours.set(true);
    this.seanceService.dupliquer(r.seanceId, this.reprogDate, this.reprogHeure || null).subscribe({
      next: s => {
        this.reprogEnCours.set(false);
        this.reprogOuvert.set(false);
        this.snack.open('Séance reprogrammée', 'OK', { duration: 2500 });
        this.router.navigate(['/calendrier'], { queryParams: { editer: s.id } });
      },
      error: () => { this.reprogEnCours.set(false); this.snack.open('Reprogrammation impossible', 'Fermer', { duration: 3500 }); },
    });
  }

  // ── C2 : Enregistrer comme modèle (Séance → modèle de bibliothèque) ──
  readonly modeleOuvert = signal(false);
  modeleNom = '';
  readonly modeleEnCours = signal(false);

  peutModele(): boolean { return this.auth.has('seances_modeles:access'); }
  ouvrirModele(): void { this.modeleNom = this.resume()?.titre ?? ''; this.modeleOuvert.set(true); }
  fermerModele(): void { this.modeleOuvert.set(false); }

  confirmerModele(): void {
    const r = this.resume();
    if (!r || this.modeleEnCours()) return;
    this.modeleEnCours.set(true);
    this.seanceService.enregistrerCommeModele(r.seanceId, this.modeleNom).subscribe({
      next: () => {
        this.modeleEnCours.set(false);
        this.modeleOuvert.set(false);
        this.snack.open('Modèle créé dans la bibliothèque', 'Voir', { duration: 5000 })
          .onAction().subscribe(() => this.router.navigate(['/seances-modeles']));
      },
      error: () => { this.modeleEnCours.set(false); this.snack.open('Création du modèle impossible', 'Fermer', { duration: 3500 }); },
    });
  }

  /** Nb de joueurs répartis + auto (bandeau « effectif prévu »). */
  effectifPrevu(): number {
    const r = this.resume();
    if (!r) return 0;
    return r.groupesAuto.disponibles.length;
  }

  chipsDominantes(famille: 'SEANCE' | 'ATHLETIQUE'): string[] {
    return (this.resume()?.dominantes ?? []).filter(d => d.groupe === famille).map(d => d.libelle);
  }

  /** Sous-principes préfixés par leur phase (ex. « OFF · Conservation »). */
  chipsProjet(): string[] {
    const libelles: Record<string, string> = {
      OFF: 'OFF', DEF: 'DEF', T_OD: 'Transition OFF', T_DO: 'Transition DEF',
      CPA_OFF: 'CPA OFF', CPA_DEF: 'CPA DEF',
    };
    return (this.resume()?.sousPrincipes ?? [])
      .map(p => `${libelles[p.groupe] ?? p.groupe} · ${p.libelle}`);
  }

  /**
   * Les cinq axes tels qu'ils s'impriment : dosage d'abord, détail ensuite. Un axe n'apparaît
   * que s'il porte quelque chose — une fiche terrain n'a pas de place pour cinq lignes vides.
   *
   * Le dosage est rendu en pastilles pleines/creuses et non en couleur : cette fiche se lit
   * imprimée en noir et blanc, au bord du terrain.
   */
  axesFiche(): { libelle: string; dose: number; puces: boolean[]; note: string }[] {
    const o = this.resume()?.objectifs;
    if (!o) return [];
    const lignes = [
      { libelle: 'Tactique org.',   dose: o.tactiqueOrgIntensite  ?? 0, note: o.tactiqueOrg  ?? '' },
      { libelle: 'Tactique fonct.', dose: o.tactiqueFoncIntensite ?? 0, note: o.tactiqueFonc ?? '' },
      { libelle: 'Technique',       dose: o.techniqueIntensite    ?? 0, note: o.technique    ?? '' },
      { libelle: 'Mental',          dose: o.mentalIntensite       ?? 0, note: o.mental       ?? '' },
      { libelle: 'Athlétique',      dose: o.athletiqueIntensite   ?? 0, note: o.athletique   ?? '' },
    ];
    return lignes
      .filter(l => l.dose > 0 || !!l.note)
      .map(l => ({ ...l, puces: [1, 2, 3, 4, 5].map(n => n <= l.dose) }));
  }

  aObjectifs(): boolean {
    return this.axesFiche().length > 0;
  }

  aChargeCible(): boolean {
    const r = this.resume();
    return !!(r && (r.objectifDistanceM || r.objectifDistanceHauteIntensiteM || r.objectifIntensite));
  }
}
