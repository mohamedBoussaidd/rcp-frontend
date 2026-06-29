import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { roleGuard } from '@core/guards/role.guard';
import { contexteGuard } from '@core/guards/contexte.guard';
import { saisonGuard } from '@core/guards/saison.guard';
import { Role } from '@core/services/auth.service';

// Groupes de rôles alignés sur la sidebar (nav-sidebar.component.ts) et la
// matrice serveur (SecurityConfig.java). Le staff exclut JOUEUR et ADMINISTRATIF.
const STAFF: Role[] = ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'];
const STAFF_PHYSIQUE: Role[] = ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR', 'MEDICAL'];
// Permissions d'ÉCRITURE qui ouvrent l'accès AUSSI aux multi-rôles (les lectures sont
// partagées par tout le staff, elles sur-ouvriraient). Miroir de la nav-sidebar.
const PERMS_GPS = ['pesees:write', 'gps:import'];
const PERMS_TACTIQUE = ['schemas:write', 'exercices:write', 'plandejeu:write', 'matchs:write', 'diaporama:write'];

// Lazy loading : chaque écran est chargé à la demande (un chunk par feature)
// plutôt que dans le bundle initial. Gain de perf au démarrage.
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },

  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  {
    path: 'admin/clubs', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/admin-clubs/admin-clubs.component').then(m => m.AdminClubsComponent)
  },
  {
    path: 'mon-club', canActivate: [authGuard, roleGuard], data: { roles: ['PRESIDENT', 'ENTRAINEUR', 'SUPER_ADMIN'], perms: ['club:manage', 'membres:manage'] },
    loadComponent: () => import('./features/admin/mon-club/mon-club.component').then(m => m.MonClubComponent)
  },
  {
    path: 'medical', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: ['ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'PRESIDENT', 'SUPER_ADMIN'] },
    loadComponent: () => import('./features/medical/medical.component').then(m => m.MedicalComponent)
  },
  {
    path: 'mon-espace', canActivate: [authGuard, roleGuard], data: { roles: ['JOUEUR'] },
    loadComponent: () => import('./features/espace-joueur/espace-joueur.component').then(m => m.EspaceJoueurComponent)
  },
  // Espace joueur mobile (PWA) : coquille plein écran, lazy-loadée par chunk.
  {
    path: 'joueur', canActivate: [authGuard, roleGuard], data: { roles: ['JOUEUR'] },
    loadChildren: () => import('./features/joueur-mobile/joueur.routes').then(m => m.default)
  },
  {
    path: 'suivi-subjectif', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: [...STAFF_PHYSIQUE, 'JOUEUR'], perms: PERMS_GPS },
    loadComponent: () => import('./features/suivi-subjectif/suivi-subjectif.component').then(m => m.SuiviSubjectifComponent)
  },
  {
    path: 'mes-blessures', canActivate: [authGuard, roleGuard], data: { roles: ['JOUEUR'] },
    loadComponent: () => import('./features/mes-blessures/mes-blessures.component').then(m => m.MesBlessuresComponent)
  },
  {
    path: 'rechargement', canActivate: [authGuard],
    loadComponent: () => import('@shared/components/rechargement/rechargement.component').then(m => m.RechargementComponent)
  },
  {
    path: 'planning-technique', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: ['ENTRAINEUR', 'SUPER_ADMIN'], perms: PERMS_TACTIQUE },
    loadComponent: () => import('./features/tactical/planning-technique.component').then(m => m.PlanningTechniqueComponent)
  },
  {
    path: 'dashboard', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'joueurs/:id', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/joueur/joueur-detail/joueur-detail.component').then(m => m.JoueurDetailComponent)
  },
  {
    path: 'import', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['gps:import'] },
    loadComponent: () => import('./features/performance/import/import.component').then(m => m.ImportComponent)
  },
  {
    path: 'vue-seance', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/performance/vue-seance/vue-seance.component').then(m => m.VueSeanceComponent)
  },
  {
    path: 'etat-effectif', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/performance/etat-effectif/etat-effectif.component').then(m => m.EtatEffectifComponent)
  },
  {
    path: 'charge-equipe', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/performance/charge-equipe/charge-equipe.component').then(m => m.ChargeEquipeComponent)
  },
  {
    path: 'presence', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['presence:write'] },
    loadComponent: () => import('./features/performance/historique-presence/historique-presence.component').then(m => m.HistoriquePresenceComponent)
  },
  {
    path: 'vue-seance/:id', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/performance/vue-seance/vue-seance.component').then(m => m.VueSeanceComponent)
  },
  {
    path: 'calendrier', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: [...STAFF, 'JOUEUR'] },
    loadComponent: () => import('./features/calendrier/calendrier.component').then(m => m.CalendrierComponent)
  },
  {
    path: 'pesees', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/performance/pesees/pesees.component').then(m => m.PeseesComponent)
  },
  {
    path: 'modeles-semaine', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['seances:write'] },
    loadComponent: () => import('./features/seances/modeles-semaine/modeles-semaine.component').then(m => m.ModelesSemaineComponent)
  },
  {
    path: 'saisons', canActivate: [authGuard, roleGuard, contexteGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['saison:manage'] },
    loadComponent: () => import('./features/saison/saisons.component').then(m => m.SaisonsComponent)
  },
  // Écrans du GATE de saison (sans saisonGuard, sinon redirection en boucle).
  {
    path: 'creer-saison', canActivate: [authGuard, roleGuard, contexteGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['saison:manage'] },
    loadComponent: () => import('./features/saison/creer-saison.component').then(m => m.CreerSaisonComponent)
  },
  {
    path: 'choix-saison', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/saison/choix-saison.component').then(m => m.ChoixSaisonComponent)
  },
  {
    path: 'comparaison-saisons', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/saison/comparaison-saisons.component').then(m => m.ComparaisonSaisonsComponent)
  },
  {
    path: 'parametres', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'PREPARATEUR'], perms: ['configuration:write'] },
    loadComponent: () => import('./features/admin/parametres/parametres.component').then(m => m.ParametresComponent)
  },
  {
    path: 'methodologie', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/admin/methodologie/methodologie.component').then(m => m.MethodologieComponent)
  },
  {
    path: 'parametres-notifications', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/admin/parametres-notifications/parametres-notifications.component').then(m => m.ParametresNotificationsComponent)
  },

  { path: '**', redirectTo: 'dashboard' },
];
