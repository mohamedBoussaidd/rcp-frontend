import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PredictionService } from '@core/services/prediction.service';
import { SuiviSubjectifService } from '@core/services/suivi-subjectif.service';
import {
  SurveillanceService, JoueurSurveille, acwrClasse, readinessClasse,
} from '@core/services/surveillance.service';

/**
 * Page PWA staff « À surveiller » : la même liste que le bloc du dashboard web (mêmes règles via
 * SurveillanceService), rendue nativement dans la PWA — plus de redirection vers la version web.
 * Le staff consulte sur son téléphone les joueurs à risque du jour, avec leurs signaux.
 */
@Component({
  selector: 'app-staff-surveillance',
  standalone: true,
  templateUrl: './staff-surveillance.component.html',
  styleUrl: './staff-surveillance.component.scss',
  imports: [DecimalPipe],
})
export class StaffSurveillanceComponent implements OnInit {

  private prediction = inject(PredictionService);
  private suivi = inject(SuiviSubjectifService);
  private surveillance = inject(SurveillanceService);

  readonly liste = signal<JoueurSurveille[]>([]);
  readonly chargement = signal(true);

  readonly acwrClasse = acwrClasse;
  readonly readinessClasse = readinessClasse;

  ngOnInit(): void {
    forkJoin({
      joueurs: this.prediction.getResumeEquipe(),
      wellness: this.suivi.getWellness(),
    }).subscribe({
      next: ({ joueurs, wellness }) => {
        this.liste.set(this.surveillance.calculer(joueurs, wellness));
        this.chargement.set(false);
      },
      error: () => this.chargement.set(false),
    });
  }
}
