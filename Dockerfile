# ── Étape build : compilation Angular ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
# ng-apexcharts déclare un peer Angular 18 alors que le projet est en Angular 19
# → on relâche la résolution des peer-deps (comme en local)
RUN npm ci --legacy-peer-deps

COPY . .
# defaultConfiguration = production (cf. angular.json)
RUN npm run build

# ── Étape runtime : nginx statique (SPA) ──
FROM nginx:1.27-alpine
# Sortie du builder "application" d'Angular 19 → dist/<projet>/browser
COPY --from=build /app/dist/remi-preparateur/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
