# Ordo als fertiges Docker-Image: Caddy liefert die App aus (HTTPS, CalDAV-Weiterleitung).
# Die CI veröffentlicht es als ghcr.io/bischofone/ordo:latest – siehe docker/README.md.
# Selbst bauen:  docker build -t ordo .

# 1. App bauen (auf der Plattform des Bau-Rechners – das Ergebnis sind nur statische Dateien)
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
RUN npm install -g --no-fund --no-audit pnpm@10
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG ORDO_COMMIT=""
ENV ORDO_COMMIT=$ORDO_COMMIT CI=true
RUN pnpm build

# 2. Nur Caddy und die fertigen Dateien
FROM caddy:2-alpine
LABEL org.opencontainers.image.title="Ordo" \
	org.opencontainers.image.description="Ordo – Aufgaben in Ordnung (App + Caddy)" \
	org.opencontainers.image.source="https://github.com/bischofone/ordo" \
	org.opencontainers.image.licenses="MIT"
COPY --from=build /src/build /srv/app
COPY docker/Caddyfile /etc/caddy/Caddyfile
