import { Routes } from '@angular/router';
import { JoueurLayoutComponent } from './joueur-layout.component';
import { CalendrierComponent } from './../calendrier/calendrier.component';

/** Routes de l'espace joueur mobile (PWA), montées sous /joueur via le layout. */
const routes: Routes = [
  {
    path: '',
    component: JoueurLayoutComponent,
    children: [
      {
        path: '', data: { home: true },
        loadComponent: () => import('./home/joueur-home.component').then(m => m.JoueurHomeComponent)
      },
      {
        path: 'wellness', data: { title: 'Ressenti du jour' },
        loadComponent: () => import('./wellness/joueur-wellness.component').then(m => m.JoueurWellnessComponent)
      },
      {
        path: 'rpe', data: { title: 'Effort des séances' },
        loadComponent: () => import('./rpe/joueur-rpe.component').then(m => m.JoueurRpeComponent)
      },
      {
        path: 'historique', data: { title: 'Mon historique' },
        loadComponent: () => import('./historique/joueur-historique.component').then(m => m.JoueurHistoriqueComponent)
      },
      {
        path: 'conseils', data: { title: 'Conseils du staff' },
        loadComponent: () => import('./conseils/joueur-conseils.component').then(m => m.JoueurConseilsComponent)
      },
      {
        path: 'blessures', data: { title: 'Mes blessures' },
        loadComponent: () => import('./blessures/joueur-blessures.component').then(m => m.JoueurBlessuresComponent)
      },
      {
        path: 'documents', data: { title: 'Documents médicaux' },
        loadComponent: () => import('./documents/joueur-documents.component').then(m => m.JoueurDocumentsComponent)
      },
      {
        path: 'poids', data: { title: 'Évolution du poids' },
        loadComponent: () => import('./poids/joueur-poids.component').then(m => m.JoueurPoidsComponent)
      },
      {
        path: 'seances', data: { title: 'Mes séances' },
        loadComponent: () => import('./seances/joueur-seances.component').then(m => m.JoueurSeancesComponent)
      },
      {
        path: 'axes', data: { title: 'Mes axes de travail' },
        loadComponent: () => import('./entretiens/joueur-axes.component').then(m => m.JoueurAxesComponent)
      },
      {
        // Chemin aligné sur le lien des notifications (NotificationProducer.entretienPartage).
        path: 'entretiens', data: { title: 'Mes entretiens' },
        loadComponent: () => import('./entretiens/joueur-entretiens.component').then(m => m.JoueurEntretiensComponent)
      },
      {
        path: 'sante', data: { title: 'Mon corps & santé', ownHeader: true },
        loadComponent: () => import('./sante/joueur-sante.component').then(m => m.JoueurSanteComponent)
      },
      { path: 'calendrier', component: CalendrierComponent, data: { title: 'Calendrier' } },
      {
        path: 'matchs', data: { title: 'Matchs', ownHeader: true },
        loadComponent: () => import('./matchs/joueur-matchs.component').then(m => m.JoueurMatchsComponent)
      },
      {
        path: 'notifications', data: { title: 'Mes notifications' },
        loadComponent: () => import('./notifications/joueur-notifications.component').then(m => m.JoueurNotificationsComponent)
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

export default routes;
