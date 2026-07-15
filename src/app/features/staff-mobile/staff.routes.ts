import { Routes } from '@angular/router';
import { StaffLayoutComponent } from './staff-layout.component';

/** Routes de l'espace staff mobile (PWA), montées sous /staff via le layout. */
const routes: Routes = [
  {
    path: '',
    component: StaffLayoutComponent,
    children: [
      {
        path: '', data: { home: true },
        loadComponent: () => import('./home/staff-home.component').then(m => m.StaffHomeComponent)
      },
      {
        path: 'agenda', data: { title: 'Agenda' },
        loadComponent: () => import('./agenda/staff-agenda.component').then(m => m.StaffAgendaComponent)
      },
      {
        path: 'appel', data: { title: 'Appel' },
        loadComponent: () => import('./appel/staff-appel.component').then(m => m.StaffAppelComponent)
      },
      {
        path: 'effectif', data: { title: 'Effectif' },
        loadComponent: () => import('./effectif/staff-effectif.component').then(m => m.StaffEffectifComponent)
      },
      {
        path: 'messages', data: { title: 'Messages' },
        loadComponent: () => import('./messages/staff-messages.component').then(m => m.StaffMessagesComponent)
      },
      {
        path: 'documents', data: { title: 'Mes documents' },
        loadComponent: () => import('./documents/staff-documents.component').then(m => m.StaffDocumentsComponent)
      },
      {
        path: 'notifications', data: { title: 'Notifications' },
        loadComponent: () => import('./notifications/staff-notifications.component').then(m => m.StaffNotificationsComponent)
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

export default routes;
