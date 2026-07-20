import { Component, Input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Icône ⓘ + infobulle de vulgarisation : accompagne chaque concept du mode avancé
 * (niveau d'objectif, densité, séquençage, J±X…) pour qu'un éducateur amateur
 * comprenne le jargon en une ou deux phrases. Textes centralisés dans INFOBULLES.
 */
@Component({
  selector: 'app-info-bulle',
  standalone: true,
  imports: [MatTooltipModule],
  template: `<span class="info-bulle" [matTooltip]="texte" matTooltipClass="info-bulle-tip"
                   matTooltipPosition="above" tabindex="0" aria-label="Aide">ⓘ</span>`,
  styles: [`
    .info-bulle {
      display: inline-flex; align-items: center; justify-content: center;
      margin-left: 5px; cursor: help; font-size: 12px; line-height: 1;
      color: var(--slate-400, #64748B); user-select: none;
    }
    .info-bulle:hover, .info-bulle:focus { color: var(--green-600, #16A34A); outline: none; }
  `],
})
export class InfoBulleComponent {
  @Input({ required: true }) texte = '';
}

/** Textes de vulgarisation des concepts du mode avancé (validés dans le plan du chantier). */
export const INFOBULLES = {
  niveauObjectif: `À quelle hauteur se situe ce que tu veux faire apprendre : le temps de jeu (vision globale), un principe d'action (idée directrice), une règle d'action collective (consigne pour un groupe), une règle individuelle (consigne pour un joueur) ou un moyen (le geste).`,
  echelleEffectif: `La taille du groupe concerné par l'objectif : tout le collectif, plusieurs lignes (intersectoriel), une ligne (sectoriel), un petit groupe (groupal) ou un joueur (individuel).`,
  dominantesInteraction: `Ce que l'exercice sollicite en même temps : organisation tactique, fonctionnement collectif, mental, technique, athlétique. Remplis seulement les lignes utiles.`,
  contextePedagogique: `Le point de départ de l'exercice : ce que tu as observé en match ou la contrainte du moment (ex. séance à J+2, difficulté à ressortir le ballon).`,
  butSystemeMarque: `Comment on gagne dans l'exercice : ce qui rapporte des points et combien (ex. 1 but = 1 pt, but après passe en zone = 2 pts).`,
  variablesPedagogiques: `Les leviers pour rendre l'exercice plus facile ou plus dur sans le changer : taille du terrain, nombre de touches, jokers, gardiens…`,
  reperesPerceptifs: `Ce que le joueur doit apprendre à regarder pendant l'exercice : espaces libres, position des partenaires, lignes de passe.`,
  comportementsAttendus: `Ce que tu veux voir concrètement : les attitudes et les choix qui montrent que l'objectif est compris.`,
  densite: `Surface disponible par joueur (m²/joueur), calculée automatiquement. Plus elle est faible, plus il y a de duels et d'intensité.`,
  sequencage: `Le découpage du temps : séries, durée de travail et de récupération. Ex. 2 × (4 × 1' + 1') = 2 séries de 4 répétitions d'1 minute, avec 1 minute de récup.`,
  perimatch: `Position de la séance par rapport aux matchs : J+2 = 2 jours après le dernier match, J-1 = veille du prochain. Calculée depuis ton calendrier.`,
  dureeEffective: `Temps réellement travaillé par les joueurs, hors mise en place, transitions et pauses — souvent 20 à 30 % de moins que la durée globale.`,
  dominantesSeance: `Les grands registres travaillés dans la séance : elles permettent d'équilibrer ta semaine d'entraînement d'un coup d'œil.`,
  phasesProjetJeu: `Relie la séance aux moments du jeu de ton plan de jeu : avec le ballon (animation offensive), sans (animation défensive), aux transitions et sur coups de pied arrêtés.`,
  blocs: `Un bloc = un temps de la séance (ex. activation, jeu réduit) avec sa durée, son responsable et sa zone de terrain. Les exercices se rangent dedans.`,
  effectifsJour: `Répartis tes joueurs pour la séance : blessés et réathlétisation se remplissent tout seuls depuis le médical et les protocoles, à toi les équipes de couleur et groupes de travail.`,
} as const;
