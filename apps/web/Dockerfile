# Build do SPA + nginx. Contexto de build = raiz do monorepo.
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN bun run --filter @easynr10/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
