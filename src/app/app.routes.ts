import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { JoueurDetailComponent } from './features/joueur-detail/joueur-detail.component';
import { ImportComponent } from './features/import/import.component';
import { SeancesComponent } from './features/seances/seances.component';
import { SeanceDetailComponent } from './features/seance-detail/seance-detail.component';
import { CalendrierComponent } from './features/calendrier/calendrier.component';
import { PeseesComponent } from './features/pesees/pesees.component';
import { ParametresComponent } from './features/parametres/parametres.component';
import { MethodologieComponent } from './features/methodologie/methodologie.component';
import { LoginComponent } from './features/login/login.component';
import { AdminClubsComponent } from './features/admin-clubs/admin-clubs.component';
import { MonClubComponent } from './features/mon-club/mon-club.component';
import { MedicalComponent } from './features/medical/medical.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: 'login',        component: LoginComponent },

  { path: '',             redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'admin/clubs',  component: AdminClubsComponent,   canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] } },
  { path: 'mon-club',     component: MonClubComponent,      canActivate: [authGuard, roleGuard], data: { roles: ['PRESIDENT'] } },
  { path: 'medical',      component: MedicalComponent,      canActivate: [authGuard, roleGuard], data: { roles: ['ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'PRESIDENT', 'SUPER_ADMIN'] } },
  { path: 'dashboard',    component: DashboardComponent,    canActivate: [authGuard] },
  { path: 'joueurs/:id',  component: JoueurDetailComponent, canActivate: [authGuard] },
  { path: 'import',       component: ImportComponent,       canActivate: [authGuard] },
  { path: 'seances',      component: SeancesComponent,      canActivate: [authGuard] },
  { path: 'seances/:id',  component: SeanceDetailComponent, canActivate: [authGuard] },
  { path: 'calendrier',   component: CalendrierComponent,   canActivate: [authGuard] },
  { path: 'pesees',       component: PeseesComponent,       canActivate: [authGuard] },
  { path: 'parametres',   component: ParametresComponent,   canActivate: [authGuard] },
  { path: 'methodologie', component: MethodologieComponent, canActivate: [authGuard] },

  { path: '**', redirectTo: 'dashboard' },
];
