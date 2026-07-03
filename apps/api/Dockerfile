# Build/runtime da API. Contexto de build = raiz do monorepo.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
# O lockfile do workspace referencia todos os pacotes — copie todos os manifests.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine
WORKDIR /app
# Inclui node_modules da raiz E dos workspaces (bun não hoisteia tudo).
COPY --from=deps /app /app
COPY packages packages
COPY apps/api apps/api
EXPOSE 3000
# Aplica migrations e sobe a API.
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun apps/api/src/main.ts"]
