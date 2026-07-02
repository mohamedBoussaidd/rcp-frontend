import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { importProvidersFrom, LOCALE_ID, isDevMode } from '@angular/core';
import { jwtInterceptor } from './app/core/interceptors/jwt.interceptor';
import { contexteInterceptor } from './app/core/interceptors/contexte.interceptor';
import { dateSimuleeInterceptor } from './app/core/interceptors/date-simulee.interceptor';
import { lectureSeuleInterceptor } from './app/core/interceptors/lecture-seule.interceptor';

import { NgApexchartsModule } from 'ng-apexcharts';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideServiceWorker } from '@angular/service-worker';

registerLocaleData(localeFr);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([jwtInterceptor, contexteInterceptor, dateSimuleeInterceptor, lectureSeuleInterceptor])),
    provideAnimations(),
    importProvidersFrom(NgApexchartsModule),
    { provide: LOCALE_ID, useValue: 'fr' }, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }),
  ]
}).catch(err => console.error(err));
