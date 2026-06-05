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
import { EspaceJoueurComponent } from './features/espace-joueur/espace-joueur.component';
import { PlanningTechniqueComponent } from './features/planning-technique/planning-technique.component';
import { RechargementComponent } from './shared/components/rechargement/rechargement.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { contexteGuard } from './core/guards/contexte.guard';
import { Role } from './core/services/auth.service';

// Groupes de rôles alignés sur la sidebar (nav-sidebar.component.ts) et la
// matrice serveur (SecurityConfig.java). Le staff exclut JOUEUR et ADMINISTRATIF.
const STAFF: Role[]        = ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'];
const STAFF_PHYSIQUE: Role[] = ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'];

export const routes: Routes = [
  { path: 'login',        component: LoginComponent },

  { path: '',             redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'admin/clubs',  component: AdminClubsComponent,   canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] } },
  { path: 'mon-club',     component: MonClubComponent,      canActivate: [authGuard, roleGuard], data: { roles: ['PRESIDENT'] } },
  { path: 'medical',      component: MedicalComponent,      canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'PRESIDENT', 'SUPER_ADMIN'] } },
  { path: 'mon-espace',   component: EspaceJoueurComponent, canActivate: [authGuard, roleGuard], data: { roles: ['JOUEUR'] } },
  { path: 'rechargement', component: RechargementComponent, canActivate: [authGuard] },
  { path: 'planning-technique', component: PlanningTechniqueComponent, canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['ENTRAINEUR', 'SUPER_ADMIN'] } },
  { path: 'dashboard',    component: DashboardComponent,    canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF } },
  { path: 'joueurs/:id',  component: JoueurDetailComponent, canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF } },
  { path: 'import',       component: ImportComponent,       canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['SUPER_ADMIN', 'PREPARATEUR'] } },
  { path: 'seances',      component: SeancesComponent,      canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF } },
  { path: 'seances/:id',  component: SeanceDetailComponent, canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF } },
  { path: 'calendrier',   component: CalendrierComponent,   canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: [...STAFF, 'JOUEUR'] } },
  { path: 'pesees',       component: PeseesComponent,       canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF_PHYSIQUE } },
  { path: 'parametres',   component: ParametresComponent,   canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['SUPER_ADMIN', 'PRESIDENT'] } },
  { path: 'methodologie', component: MethodologieComponent, canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF } },

  { path: '**', redirectTo: 'dashboard' },
];
