import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { importProvidersFrom, LOCALE_ID } from '@angular/core';

import { NgApexchartsModule } from 'ng-apexcharts';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

registerLocaleData(localeFr);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    importProvidersFrom(NgApexchartsModule),
    { provide: LOCALE_ID, useValue: 'fr' },
  ]
}).catch(err => console.error(err));
