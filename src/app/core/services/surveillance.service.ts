import { Injectable } from '@angular/core';
import { ResumeJoueur } from './prediction.service';
import { Wellness } from './suivi-subjectif.service';

/** Un joueur à surveiller, avec ses signaux calculés (mêmes règles que le dashboard préparateur). */
export interface JoueurSurveille {
  joueur: ResumeJoueur;
  priorite: number;
  gene: { zone: string; jours: number } | null;
  chipsDegrade: string[];
  message: string | null;
}

/** Classe CSS d'un ACWR (neutre / ok / attention / mauvais). */
export function acwrClasse(acwr: number | null | undefined): string {
  if (acwr == null) return 'neutral';
  if (acwr > 1.5) return 'bad';
  if (acwr > 1.3 || acwr < 0.8) return 'warn';
  return 'ok';
}

/** Classe CSS d'une readiness. */
export function readinessClasse(r: number | null | undefined): string {
  if (r == null) return 'neutral';
  if (r < 40) return 'bad';
  if (r < 55) return 'warn';
  return 'ok';
}

/**
 * Calcule la liste « à surveiller » d'une équipe à partir des résumés joueur (analytics) et du
 * wellness du jour. Logique unique partagée par le dashboard web (bloc paginé) et la page PWA
 * staff, pour que les deux affichent exactement les mêmes joueurs dans le même ordre.
 */
@Injectable({ providedIn: 'root' })
export class SurveillanceService {

  private readonly ZONES_LABEL: Record<string, string> = {
    ischio_jambiers: 'ischio-jambiers', quadriceps: 'quadriceps', mollet: 'mollet',
    cheville: 'cheville', genou: 'genou', hanche: 'hanche', dos: 'dos',
    epaule: 'épaule', adducteurs: 'adducteurs', autre: 'zone signalée',
  };

  private aujourdhui(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** États « hors charge » : jamais dans « à surveiller ». */
  private estSilence(j: ResumeJoueur): boolean {
    return j.etat === 'INACTIF' || j.etat === 'HORS_CHARGE'
        || j.etat === 'HORS_SAISON' || j.etat === 'BLESSE';
  }

  /** Gêne déclarée non traitée dans les 7 derniers jours (la plus récente). */
  geneRecente(joueurId: string, wellness: Wellness[]): { zone: string; jours: number } | null {
    const limite = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const w = wellness
      .filter(x => x.joueurId === joueurId && x.geneZone && !x.geneTraitee && x.date >= limite)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!w?.geneZone) return null;
    const jours = Math.round((Date.now() - new Date(w.date).getTime()) / 86400000);
    return { zone: this.ZONES_LABEL[w.geneZone] ?? w.geneZone.replace(/_/g, ' '), jours };
  }

  /** Items dégradés de la saisie du jour (sommeil/courbatures/fatigue ≥ 8/10). */
  private wellnessJourDegrade(joueurId: string, wellness: Wellness[]): string[] {
    const today = this.aujourdhui();
    const w = wellness.find(x => x.joueurId === joueurId && x.date === today);
    if (!w) return [];
    const out: string[] = [];
    if (w.sommeil >= 8) out.push('sommeil dégradé');
    if (w.douleur >= 8) out.push('courbatures');
    if (w.fatigue >= 8) out.push('fatigue déclarée');
    return out;
  }

  private priorite(j: ResumeJoueur, wellness: Wellness[]): number {
    if (this.estSilence(j)) return 0;
    let p = 0;
    if (j.niveau_risque === 'ELEVE') p += 100;
    else if (j.niveau_risque === 'MODERE') p += 40;
    if (j.acwr != null && j.acwr > 1.5) p += 60;
    else if (j.acwr != null && j.acwr > 1.3) p += 30;
    if (j.niveau_fatigue === 'ALERTE') p += 50;
    else if (j.niveau_fatigue === 'VIGILANCE') p += 20;
    if (j.readiness != null && j.readiness < 40) p += 40;
    else if (j.readiness != null && j.readiness < 55) p += 15;
    if (j.sprint_niveau === 'PROBABLE') p += 60;
    else if (j.sprint_niveau === 'POSSIBLE') p += 35;
    const g = this.geneRecente(j.joueur_id, wellness);
    if (g) p += g.jours <= 2 ? 55 : 30;
    p += this.wellnessJourDegrade(j.joueur_id, wellness).length * 12;
    return p;
  }

  private messageSurveillance(j: ResumeJoueur, gene: { zone: string; jours: number } | null): string | null {
    const parts: string[] = [];
    if (j.sprint_message) parts.push(j.sprint_message);
    if (gene) {
      const ilya = gene.jours <= 0 ? "aujourd'hui" : gene.jours === 1 ? 'il y a 1 jour' : `il y a ${gene.jours} jours`;
      parts.push(parts.length ? `en plus d'une gêne aux ${gene.zone} ${ilya}` : `gêne aux ${gene.zone} signalée ${ilya}`);
    }
    if (!parts.length) return null;
    const s = parts.join(' — ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Liste triée par priorité décroissante des joueurs à surveiller (priorité > 0). */
  calculer(joueurs: ResumeJoueur[], wellness: Wellness[]): JoueurSurveille[] {
    return joueurs
      .map(j => {
        const priorite = this.priorite(j, wellness);
        const gene = this.geneRecente(j.joueur_id, wellness);
        return {
          joueur: j,
          priorite,
          gene,
          chipsDegrade: this.wellnessJourDegrade(j.joueur_id, wellness),
          message: this.messageSurveillance(j, gene),
        } as JoueurSurveille;
      })
      .filter(x => x.priorite > 0)
      .sort((a, b) => b.priorite - a.priorite);
  }
}
