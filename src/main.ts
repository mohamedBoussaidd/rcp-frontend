import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { importProvidersFrom, LOCALE_ID, isDevMode, inject, provideAppInitializer } from '@angular/core';
import { jwtInterceptor } from './app/core/interceptors/jwt.interceptor';
import { contexteInterceptor } from './app/core/interceptors/contexte.interceptor';
import { dateSimuleeInterceptor } from './app/core/interceptors/date-simulee.interceptor';
import { lectureSeuleInterceptor } from './app/core/interceptors/lecture-seule.interceptor';

import { NgApexchartsModule } from 'ng-apexcharts';
import { registerLocaleData, ViewportScroller } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideServiceWorker } from '@angular/service-worker';

registerLocaleData(localeFr);

bootstrapApplication(AppComponent, {
  providers: [
    // Par défaut, le routeur met bien `#ancre` dans l'URL mais ne scrolle PAS : les liens
    // « Voir la méthodologie » des bulles d'aide arrivaient donc tous en haut de /methodologie,
    // c'est-à-dire sur la première carte (ACWR), quelle que soit l'ancre demandée.
    // `scrollPositionRestoration` reste sur son défaut (`disabled`) : la navigation normale entre
    // écrans n'est pas touchée, seul le cas « URL avec fragment » change.
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    // La navbar (60px) et le sous-menu (44px) sont en `position: sticky` : sans décalage, le
    // scroll viserait juste mais la carte se retrouverait cachée dessous. Cet offset ne
    // s'applique qu'au scroll d'ancre, pas à la restauration de position.
    provideAppInitializer(() => { inject(ViewportScroller).setOffset([0, 112]); }),
    provideHttpClient(withInterceptors([jwtInterceptor, contexteInterceptor, dateSimuleeInterceptor, lectureSeuleInterceptor])),
    provideAnimations(),
    importProvidersFrom(NgApexchartsModule),
    { provide: LOCALE_ID, useValue: 'fr' }, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }),
  ]
}).catch(err => console.error(err));
