# EasyNR10 v2

Reescrita do EasyNR10 — gestão de conformidade NR-10. Documentos do projeto:

- [`ANALISE-EASYNR10.md`](./ANALISE-EASYNR10.md) — diagnóstico do sistema legado e justificativa da stack
- [`projeto.md`](./projeto.md) — requisitos, modelo de domínio, dicionário de dados e diagramas

## Estrutura

```
apps/web         → React 19 + Vite + TanStack Router/Query
apps/api         → Fastify + tRPC v11 + better-auth
packages/shared  → enums e schemas Zod compartilhados
packages/db      → schema Drizzle + migrations + seed
```

## Stack completa com Docker

Sobe tudo containerizado (web via nginx, api com migrations automáticas, postgres, minio, gotenberg, mailpit):

```bash
docker compose up -d --build
# Aplicação: http://localhost:8081  (nginx serve o SPA e faz proxy de /api para a API)
```

O primeiro usuário é criado via `/api/auth/sign-up/email` e promovido a admin no banco (ver seção abaixo, trocando a porta para 8081 e o container para `easynr10-database-1`).

## Desenvolvimento

Pré-requisitos: [Bun](https://bun.sh), Docker.

```bash
cp .env.example .env          # ajuste se necessário
bun install
docker compose -f docker-compose.dev.yml up -d   # postgres(5433), minio, gotenberg, mailpit
bun run db:migrate
bun run db:seed               # empresa/unidade de exemplo

bun run dev:api               # http://localhost:3000
bun run dev:web               # http://localhost:5173 (proxy /api → 3000)
```

Ainda não há tela de cadastro — em dev, crie o primeiro usuário via API e promova a admin:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' \
  -d '{"name":"Admin","email":"admin@pso.dev","password":"sua-senha-dev"}'

docker exec easynr10-dev-database-1 \
  psql -U easynr10 -d easynr10 -c "UPDATE \"user\" SET role='admin' WHERE email='admin@pso.dev';"
```

## Comandos

| Comando | Descrição |
|---|---|
| `bun run typecheck` | Typecheck de todos os pacotes |
| `bun run lint` | oxlint |
| `bun run db:generate` | Gera migration a partir do schema Drizzle |
| `bun run db:migrate` | Aplica migrations |
| `bun run build` | Build de produção |

## Estado atual (Fase F0/F1 parcial)

- [x] Monorepo Bun + TypeScript estrito
- [x] Schema Drizzle completo (21 tabelas do dicionário de dados) + migration inicial
- [x] Auth: e-mail/senha via better-auth (Google OAuth por env), sessão por cookie
- [x] Isolamento de tenant no servidor (`unitProcedure` verifica membership)
- [x] tRPC tipado ponta a ponta (web importa `AppRouter` da api)
- [x] Fluxo de navegação: login → empresas → unidades → home da unidade
- [ ] PIE (F2), diagnósticos/plano de ação (F3), dashboards/relatórios (F4), notificações (F5)


