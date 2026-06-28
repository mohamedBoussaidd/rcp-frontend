import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Diaporama de séance : support de présentation réutilisable, niveau club/équipe. */

export type Visibilite = 'CLUB' | 'EQUIPE';
export type Statut = 'BROUILLON' | 'PUBLIE';
export type SlideType = 'SCHEMA' | 'IMAGE' | 'VIDEO_LIEN' | 'TEXTE';

export type AlignH = 'left' | 'center' | 'right';
export type BlocType = 'TITRE' | 'PARAGRAPHE' | 'LISTE';

/** Un bloc de contenu d'un slide TEXTE. Les champs de style sont des overrides optionnels
 *  (vide = hérite des défauts globaux du StyleTexte). */
export interface BlocTexte {
  type: BlocType;
  texte?: string;          // TITRE / PARAGRAPHE
  items?: string[];        // LISTE
  ordonnee?: boolean;      // LISTE : numérotée (true) vs puces (false)
  taille?: number;         // override px
  couleurTexte?: string;   // override
  gras?: boolean;          // override
  alignH?: AlignH;         // override
}

/** Mise en forme d'un slide TEXTE (sérialisée dans Slide.styleJson).
 *  Les champs taille/couleurTexte/alignH/gras servent de DÉFAUTS hérités par les blocs. */
export interface StyleTexte {
  couleurTexte: string;
  couleurFond: string;
  taille: number;            // px (défaut global)
  alignH: AlignH;            // défaut global
  alignV: 'flex-start' | 'center' | 'flex-end';
  gras: boolean;             // défaut global
  blocs?: BlocTexte[];       // contenu structuré (absent = ancien slide monobloc)
}

/** Retourne les blocs d'un slide TEXTE, en reconstituant un bloc PARAGRAPHE unique
 *  pour les anciens slides (compat ascendante : pas de `blocs` mais un `texte`). */
export function normaliserBlocs(style: Partial<StyleTexte> | null | undefined, texte?: string | null): BlocTexte[] {
  if (style?.blocs && style.blocs.length) return style.blocs;
  return [{ type: 'PARAGRAPHE', texte: texte ?? '' }];
}

/** Concatène les blocs en texte lisible (pour la colonne `slide.texte`, miniature/titre). */
export function blocsVersTexte(blocs: BlocTexte[]): string {
  return blocs
    .map(b => b.type === 'LISTE' ? (b.items ?? []).map(i => '• ' + i).join('\n') : (b.texte ?? ''))
    .filter(t => t.length)
    .join('\n');
}

/** Style effectif d'un bloc : override du bloc, sinon défaut global du StyleTexte.
 *  Le TITRE force le gras et une taille majorée si non surchargés. */
export function styleBloc(bloc: BlocTexte, defauts: StyleTexte): { taille: number; couleur: string; gras: boolean; alignH: AlignH } {
  const estTitre = bloc.type === 'TITRE';
  return {
    taille: bloc.taille ?? (estTitre ? Math.round(defauts.taille * 1.25) : defauts.taille),
    couleur: bloc.couleurTexte ?? defauts.couleurTexte,
    gras: bloc.gras ?? (estTitre ? true : defauts.gras),
    alignH: bloc.alignH ?? defauts.alignH,
  };
}

/** Carte de bibliothèque (sans le détail des slides). */
export interface DiaporamaResume {
  id: string;
  titre: string;
  visibilite: Visibilite;
  statut: Statut;
  createurNom?: string;
  nbSlides: number;
  apercu?: string;        // miniature du 1er slide exploitable, pour la grille
  modifiable: boolean;    // l'utilisateur est le créateur
  supprimable: boolean;   // créateur, ou détenteur de diaporama:manage
  updatedAt: string;
}

export interface Slide {
  id: string;
  type: SlideType;
  titre?: string;
  schemaJson?: string;
  apercu?: string;
  imageSrc?: string;
  videoUrl?: string;
  texte?: string;
  styleJson?: string;
  ordre: number;
}

export interface DiaporamaDetail {
  id: string;
  titre: string;
  visibilite: Visibilite;
  statut: Statut;
  createurNom?: string;
  modifiable: boolean;
  supprimable: boolean;
  slides: Slide[];
}

export interface DiaporamaUpdateRequest {
  titre: string;
  visibilite: Visibilite;
  statut: Statut;
}

export interface SlideRequest {
  type: SlideType;
  titre?: string | null;
  schemaJson?: string | null;
  apercu?: string | null;
  imageSrc?: string | null;
  videoUrl?: string | null;
  texte?: string | null;
  styleJson?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DiaporamaService {

  private http = inject(HttpClient);
  private base = '/api/diaporamas';

  lister(): Observable<DiaporamaResume[]> {
    return this.http.get<DiaporamaResume[]>(this.base);
  }
  detail(id: string): Observable<DiaporamaDetail> {
    return this.http.get<DiaporamaDetail>(`${this.base}/${id}`);
  }
  creer(titre: string): Observable<DiaporamaDetail> {
    return this.http.post<DiaporamaDetail>(this.base, { titre });
  }
  modifier(id: string, req: DiaporamaUpdateRequest): Observable<DiaporamaDetail> {
    return this.http.put<DiaporamaDetail>(`${this.base}/${id}`, req);
  }
  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
  dupliquer(id: string): Observable<DiaporamaDetail> {
    return this.http.post<DiaporamaDetail>(`${this.base}/${id}/dupliquer`, {});
  }
  ajouterSlide(id: string, req: SlideRequest): Observable<Slide> {
    return this.http.post<Slide>(`${this.base}/${id}/slides`, req);
  }
  modifierSlide(id: string, slideId: string, req: SlideRequest): Observable<Slide> {
    return this.http.put<Slide>(`${this.base}/${id}/slides/${slideId}`, req);
  }
  supprimerSlide(id: string, slideId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/slides/${slideId}`);
  }
  reordonner(id: string, ordreIds: string[]): Observable<DiaporamaDetail> {
    return this.http.put<DiaporamaDetail>(`${this.base}/${id}/reordonner`, { ordreIds });
  }
}
