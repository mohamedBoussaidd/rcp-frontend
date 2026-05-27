import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { JoueurDetailComponent } from './features/joueur-detail/joueur-detail.component';
import { ImportComponent } from './features/import/import.component';
import { SeancesComponent } from './features/seances/seances.component';
import { SeanceDetailComponent } from './features/seance-detail/seance-detail.component';
import { CalendrierComponent } from './features/calendrier/calendrier.component';

export const routes: Routes = [
  { path: '',            redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard',   component: DashboardComponent },
  { path: 'joueurs/:id', component: JoueurDetailComponent },
  { path: 'import',      component: ImportComponent },
  { path: 'seances',     component: SeancesComponent },
  { path: 'seances/:id', component: SeanceDetailComponent },
  { path: 'calendrier',  component: CalendrierComponent },
];
