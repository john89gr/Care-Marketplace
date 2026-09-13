# syntax=docker/dockerfile:1

# ---- Stage 1: build the Angular SPA -----------------------------------------
# Angular CLI 22 needs Node ^22.22.3 / ^24.15.0 / >=26.0.0 — node:24 tracks
# the current 24.x patch line. `npm ci` mirrors package-lock.json exactly.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Defaults to the production configuration (optimisation, hashed output,
# budget checks) and emits dist/care-marketplace/browser, including the
# ngsw service worker + manifest from ngsw-config.json (PWA).
RUN npm run build

# ---- Stage 2: serve the static bundle with nginx ----------------------------
# The image only ships the compiled assets plus the reverse-proxy config, so
# the runtime layer has no Node toolchain, sources or dev dependencies.
FROM nginx:1.27-alpine AS runtime

# Replaces the stock default site (listens on 8080, SPA fallback, /api proxy).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/care-marketplace/browser /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
