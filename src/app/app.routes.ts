import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { roleGuard } from '@core/guards/role.guard';
import { contexteGuard } from '@core/guards/contexte.guard';
import { Role } from '@core/services/auth.service';

// Groupes de rôles alignés sur la sidebar (nav-sidebar.component.ts) et la
// matrice serveur (SecurityConfig.java). Le staff exclut JOUEUR et ADMINISTRATIF.
const STAFF: Role[]        = ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'];
const STAFF_PHYSIQUE: Role[] = ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'];

// Lazy loading : chaque écran est chargé à la demande (un chunk par feature)
// plutôt que dans le bundle initial. Gain de perf au démarrage.
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },

  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  { path: 'admin/clubs', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/admin-clubs/admin-clubs.component').then(m => m.AdminClubsComponent) },
  { path: 'mon-club', canActivate: [authGuard, roleGuard], data: { roles: ['PRESIDENT'] },
    loadComponent: () => import('./features/admin/mon-club/mon-club.component').then(m => m.MonClubComponent) },
  { path: 'medical', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'PRESIDENT', 'SUPER_ADMIN'] },
    loadComponent: () => import('./features/medical/medical.component').then(m => m.MedicalComponent) },
  { path: 'mon-espace', canActivate: [authGuard, roleGuard], data: { roles: ['JOUEUR'] },
    loadComponent: () => import('./features/espace-joueur/espace-joueur.component').then(m => m.EspaceJoueurComponent) },
  { path: 'rechargement', canActivate: [authGuard],
    loadComponent: () => import('@shared/components/rechargement/rechargement.component').then(m => m.RechargementComponent) },
  { path: 'planning-technique', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['ENTRAINEUR', 'SUPER_ADMIN'] },
    loadComponent: () => import('./features/tactical/planning-technique.component').then(m => m.PlanningTechniqueComponent) },
  { path: 'dashboard', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'joueurs/:id', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/joueur/joueur-detail/joueur-detail.component').then(m => m.JoueurDetailComponent) },
  { path: 'import', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['SUPER_ADMIN', 'PREPARATEUR'] },
    loadComponent: () => import('./features/performance/import/import.component').then(m => m.ImportComponent) },
  { path: 'seances', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/performance/seances/seances.component').then(m => m.SeancesComponent) },
  { path: 'seances/:id', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/performance/seance-detail/seance-detail.component').then(m => m.SeanceDetailComponent) },
  { path: 'calendrier', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: [...STAFF, 'JOUEUR'] },
    loadComponent: () => import('./features/calendrier/calendrier.component').then(m => m.CalendrierComponent) },
  { path: 'pesees', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF_PHYSIQUE },
    loadComponent: () => import('./features/performance/pesees/pesees.component').then(m => m.PeseesComponent) },
  { path: 'parametres', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['SUPER_ADMIN', 'PRESIDENT'] },
    loadComponent: () => import('./features/admin/parametres/parametres.component').then(m => m.ParametresComponent) },
  { path: 'methodologie', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/admin/methodologie/methodologie.component').then(m => m.MethodologieComponent) },

  { path: '**', redirectTo: 'dashboard' },
];
