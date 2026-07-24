import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { roleGuard } from '@core/guards/role.guard';
import { contexteGuard } from '@core/guards/contexte.guard';
import { saisonGuard } from '@core/guards/saison.guard';
import { moduleGuard } from '@core/guards/module.guard';
import { aiguillageMobileGuard } from '@core/guards/aiguillage-mobile.guard';
import { Role } from '@core/services/auth.service';
// Import de type uniquement (effacé à la compilation → ne casse pas le lazy loading).
import type { JoueurDetailComponent } from './features/joueur/joueur-detail/joueur-detail.component';

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

  // Cible du start_url PWA (manifest) : l'icône installée s'ouvre ici, puis chaque public est
  // aiguillé vers son espace (joueur → /joueur, staff sur téléphone → /staff, sinon desktop).
  { path: 'm', canActivate: [aiguillageMobileGuard], children: [] },

  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  {
    path: 'admin/clubs', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/admin-clubs/admin-clubs.component').then(m => m.AdminClubsComponent)
  },
  {
    path: 'admin/roles-globaux', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/roles-globaux/roles-globaux.component').then(m => m.RolesGlobauxComponent)
  },
  {
    path: 'admin/abonnements', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/abonnements/abonnements.component').then(m => m.AbonnementsComponent)
  },
  {
    path: 'admin/parametres-ia', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/parametres-ia/parametres-ia.component').then(m => m.ParametresIaComponent)
  },
  {
    path: 'admin/maintenance', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/maintenance/maintenance.component').then(m => m.MaintenanceComponent)
  },
  {
    path: 'admin/badges', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/badges/badges-admin.component').then(m => m.BadgesAdminComponent)
  },
  {
    path: 'admin/ia', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/ia-config/ia-config.component').then(m => m.IaConfigComponent)
  },
  {
    path: 'admin/exercices-globaux', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/exercices-globaux/exercices-globaux.component').then(m => m.ExercicesGlobauxComponent)
  },
  {
    path: 'admin/schemas-globaux', canActivate: [authGuard, roleGuard], data: { roles: ['SUPER_ADMIN'] },
    loadComponent: () => import('./features/admin/schemas-globaux/schemas-globaux.component').then(m => m.SchemasGlobauxComponent)
  },
  // Fiche d'exercice GLOBAL (super-admin) : même formulaire que les clubs, en mode `global`
  // (création via /api/exercices/globaux, retour vers l'écran des exercices globaux).
  {
    path: 'admin/exercices-globaux/nouveau', canActivate: [authGuard, roleGuard],
    data: { roles: ['SUPER_ADMIN'], global: true },
    loadComponent: () => import('./features/tactical/exercice-form/exercice-form.component').then(m => m.ExerciceFormComponent)
  },
  {
    path: 'admin/exercices-globaux/:id/editer', canActivate: [authGuard, roleGuard],
    data: { roles: ['SUPER_ADMIN'], global: true },
    loadComponent: () => import('./features/tactical/exercice-form/exercice-form.component').then(m => m.ExerciceFormComponent)
  },
  {
    path: 'mon-club', canActivate: [authGuard, roleGuard, contexteGuard], data: { roles: ['PRESIDENT', 'ENTRAINEUR', 'SUPER_ADMIN'], perms: ['club:manage', 'membres:manage'] },
    loadComponent: () => import('./features/admin/mon-club/mon-club.component').then(m => m.MonClubComponent)
  },
  {
    path: 'medical', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: ['ENTRAINEUR', 'PREPARATEUR', 'MEDICAL', 'PRESIDENT', 'ADMINISTRATIF', 'SUPER_ADMIN'], module: 'medical' },
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
    // Espace staff mobile (V58) : double verrou module (pack/add-on club) + permission
    // espace_staff:access (matrice Rôles & accès). Pas de contexteGuard : la portée
    // vient de l'identité (union des affectations staff) côté ScopeResolver.
    path: 'staff', canActivate: [authGuard, roleGuard, saisonGuard, moduleGuard],
    data: { roles: [...STAFF, 'ADMINISTRATIF'], perms: ['espace_staff:access'], module: 'espace_staff' },
    loadChildren: () => import('./features/staff-mobile/staff.routes').then(m => m.default)
  },
  // Suivi subjectif (wellness / sRPE) : rangé côté PRÉPA (module wellness), plus derrière une
  // permission GPS. Accès staff physique + joueur ; gaté par le module « Ressenti & RPE ».
  {
    path: 'suivi-subjectif', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: [...STAFF_PHYSIQUE, 'JOUEUR'], module: 'wellness' },
    loadComponent: () => import('./features/suivi-subjectif/suivi-subjectif.component').then(m => m.SuiviSubjectifComponent)
  },
  {
    path: 'mes-blessures', canActivate: [authGuard, roleGuard, moduleGuard], data: { roles: ['JOUEUR'], module: 'medical' },
    loadComponent: () => import('./features/mes-blessures/mes-blessures.component').then(m => m.MesBlessuresComponent)
  },
  {
    path: 'rechargement', canActivate: [authGuard],
    loadComponent: () => import('@shared/components/rechargement/rechargement.component').then(m => m.RechargementComponent)
  },
  {
    path: 'planning-technique', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: ['ENTRAINEUR', 'SUPER_ADMIN'], perms: PERMS_TACTIQUE, modulesAny: ['tactique', 'match', 'diaporama'] },
    loadComponent: () => import('./features/tactical/planning-technique.component').then(m => m.PlanningTechniqueComponent)
  },
  // Fiche d'exercice sur sa propre page (sortie de la bibliothèque) : l'URL est partageable
  // et le retour du navigateur ramène au catalogue.
  {
    path: 'exercices/nouveau', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard],
    data: { roles: ['ENTRAINEUR', 'SUPER_ADMIN'], perms: ['exercices:write'], module: 'tactique' },
    loadComponent: () => import('./features/tactical/exercice-form/exercice-form.component').then(m => m.ExerciceFormComponent)
  },
  {
    path: 'exercices/:id/editer', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard],
    data: { roles: ['ENTRAINEUR', 'SUPER_ADMIN'], perms: ['exercices:write'], module: 'tactique' },
    loadComponent: () => import('./features/tactical/exercice-form/exercice-form.component').then(m => m.ExerciceFormComponent)
  },
  // Redirecteur d'accueil : renvoie chaque rôle vers sa vue d'ensemble (cf. auth.homeRoute()).
  {
    path: 'dashboard', canActivate: [authGuard],
    loadComponent: () => import('./features/home/home-redirect.component').then(m => m.HomeRedirectComponent)
  },
  // Vue d'ensemble « Coaching » (= dashboard entraîneur, vue équipe forcée + toggle masqué).
  {
    path: 'coaching', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], variante: 'coaching' },
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  // Vue d'ensemble « Performance » (= dashboard préparateur, autonome).
  {
    path: 'performance', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS },
    loadComponent: () => import('./features/dashboard/dashboard-preparateur/dashboard-preparateur.component').then(m => m.DashboardPreparateurComponent)
  },
  // Vue d'ensemble « Administration » (accueil de l'Administratif) — club-wide, sans gate saison.
  {
    path: 'administration/categories-age', canActivate: [authGuard, roleGuard, contexteGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF'], perms: ['docadmin:read'] },
    loadComponent: () => import('./features/admin/categories-age/categories-age.component').then(m => m.CategoriesAgeComponent)
  },
  {
    path: 'administration', canActivate: [authGuard, roleGuard, contexteGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF'], perms: ['docadmin:read'] },
    loadComponent: () => import('./features/dashboard/dashboard-admin/dashboard-admin.component').then(m => m.DashboardAdminComponent)
  },
  // Vue d'ensemble « Gestion du club » (accueil EXCLUSIF du président) — placeholder.
  {
    path: 'tableau-president', canActivate: [authGuard, roleGuard, contexteGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT'] },
    loadComponent: () => import('./features/dashboard/dashboard-president/dashboard-president.component').then(m => m.DashboardPresidentComponent)
  },
  {
    path: 'joueurs/:id', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF },
    canDeactivate: [(c: JoueurDetailComponent) => c.prepareLeave()],
    loadComponent: () => import('./features/joueur/joueur-detail/joueur-detail.component').then(m => m.JoueurDetailComponent)
  },
  {
    path: 'import', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['gps:import'], module: 'gps' },
    loadComponent: () => import('./features/performance/import/import.component').then(m => m.ImportComponent)
  },
  {
    path: 'import-rpe', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['rpe:import'], module: 'wellness' },
    loadComponent: () => import('./features/performance/import-rpe/import-rpe.component').then(m => m.ImportRpeComponent)
  },
  {
    path: 'import-hooper', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: ['SUPER_ADMIN', 'PREPARATEUR'], perms: ['hooper:import'], module: 'wellness' },
    loadComponent: () => import('./features/performance/import-hooper/import-hooper.component').then(m => m.ImportHooperComponent)
  },
  {
    path: 'vue-seance', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS, module: 'gps' },
    loadComponent: () => import('./features/performance/vue-seance/vue-seance.component').then(m => m.VueSeanceComponent)
  },
  {
    path: 'etat-effectif', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS, module: 'prepa_physique' },
    loadComponent: () => import('./features/performance/etat-effectif/etat-effectif.component').then(m => m.EtatEffectifComponent)
  },
  {
    path: 'charge-equipe', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS, module: 'gps' },
    loadComponent: () => import('./features/performance/charge-equipe/charge-equipe.component').then(m => m.ChargeEquipeComponent)
  },
  {
    path: 'presence', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['presence:write'], module: 'presence' },
    loadComponent: () => import('./features/performance/historique-presence/historique-presence.component').then(m => m.HistoriquePresenceComponent)
  },
  {
    path: 'suivi-entretiens', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard],
    data: { roles: STAFF, perms: ['entretien:read'], module: 'suivi_individuel' },
    loadComponent: () => import('./features/entretien/suivi-entretiens/suivi-entretiens.component').then(m => m.SuiviEntretiensComponent)
  },
  {
    // Contrats & fiches de paye (V59) : confidentiel — Président/Administratif via contrats:manage.
    path: 'contrats', canActivate: [authGuard, roleGuard, contexteGuard, moduleGuard],
    data: { roles: ['SUPER_ADMIN'], perms: ['contrats:manage'], module: 'contrats' },
    loadComponent: () => import('./features/contrats/contrats.component').then(m => m.ContratsComponent)
  },
  {
    path: 'documents-admin', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR', 'PREPARATEUR', 'MEDICAL'], perms: ['docadmin:read'], module: 'documents_admin' },
    loadComponent: () => import('./features/documentadmin/documents-admin.component').then(m => m.DocumentsAdminComponent)
  },
  {
    path: 'annuaire', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ADMINISTRATIF', 'ENTRAINEUR'], perms: ['joueurs:write'] },
    loadComponent: () => import('./features/joueur/annuaire/annuaire.component').then(m => m.AnnuaireComponent)
  },
  {
    path: 'vue-seance/:id', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS, module: 'gps' },
    loadComponent: () => import('./features/performance/vue-seance/vue-seance.component').then(m => m.VueSeanceComponent)
  },
  {
    path: 'calendrier', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: [...STAFF, 'JOUEUR'] },
    loadComponent: () => import('./features/calendrier/calendrier.component').then(m => m.CalendrierComponent)
  },
  // Fiche séance (résumé imprimable) : lisible par tout le staff — les sections avancées
  // n'apparaissent que si remplies (le module seance_avancee ne gate que l'ÉCRITURE).
  {
    path: 'seances/:id/fiche', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard], data: { roles: STAFF },
    loadComponent: () => import('./features/seances/fiche-seance/fiche-seance.component').then(m => m.FicheSeanceComponent)
  },
  {
    path: 'generer-seance', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: ['SUPER_ADMIN', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['seance_ia:generate'] },
    loadComponent: () => import('./features/seances/generateur/generateur-seance.component').then(m => m.GenerateurSeanceComponent)
  },
  {
    path: 'pesees', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS, module: 'pesees' },
    loadComponent: () => import('./features/performance/pesees/pesees.component').then(m => m.PeseesComponent)
  },
  {
    path: 'modeles-semaine', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard],
    data: { roles: ['SUPER_ADMIN', 'PRESIDENT', 'ENTRAINEUR', 'PREPARATEUR'], perms: ['seances:write'] },
    loadComponent: () => import('./features/seances/modeles-semaine/modeles-semaine.component').then(m => m.ModelesSemaineComponent)
  },
  // Bibliothèque de séances-modèles (espace Coaching) : module dédié `seances_modeles` (pack Prépa+)
  // + permission dédiée seances_modeles:access. moduleGuard ferme l'accès hors abonnement.
  {
    path: 'seances-modeles', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard],
    data: { roles: ['SUPER_ADMIN'], perms: ['seances_modeles:access'], module: 'seances_modeles' },
    loadComponent: () => import('./features/seances/seances-modeles/seances-modeles.component').then(m => m.SeancesModelesComponent)
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
    path: 'methodologie', canActivate: [authGuard, roleGuard, contexteGuard, saisonGuard, moduleGuard], data: { roles: STAFF_PHYSIQUE, perms: PERMS_GPS, module: 'prepa_physique' },
    loadComponent: () => import('./features/admin/methodologie/methodologie.component').then(m => m.MethodologieComponent)
  },
  {
    path: 'parametres-notifications', canActivate: [authGuard, roleGuard, contexteGuard, moduleGuard], data: { roles: STAFF, module: 'notifications' },
    loadComponent: () => import('./features/admin/parametres-notifications/parametres-notifications.component').then(m => m.ParametresNotificationsComponent)
  },

  { path: '**', redirectTo: 'dashboard' },
];
