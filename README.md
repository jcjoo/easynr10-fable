# EasyNR10 v2

Reescrita do EasyNR10 — gestão de conformidade NR-10. Documentos do projeto:

- [`projeto.md`](./projeto.md) — requisitos, modelo de domínio, dicionário de dados e diagramas
- [`PERMISSOES.md`](./PERMISSOES.md) — matriz de permissões da API (gerada por `bun run permissions`)

## Estrutura

```
apps/web         → React 19 + Vite + TanStack Router/Query (responsivo, mobile incluso)
apps/api         → Hono + tRPC v11 + better-auth
packages/shared  → enums, schemas Zod e regras puras compartilhadas (expiry, grupos NR-10)
packages/db      → schema Drizzle + migrations + seed
```

## Stack completa com Docker

Sobe tudo containerizado (web via nginx, api com migrations automáticas, postgres, minio, gotenberg, mailpit):

```bash
docker compose up -d --build
# Aplicação: http://localhost:8081  (nginx serve o SPA e faz proxy de /api para a API)
```

O primeiro usuário é criado via `/api/auth/sign-up/email` e promovido a admin no banco (ver seção abaixo, trocando a porta para 8081 e o container para `easynr10-database-1`).

Para expor via túnel (ngrok etc.), adicione a URL pública em `EXTRA_TRUSTED_ORIGINS` no `.env` e recrie os containers — sem isso o better-auth rejeita o login vindo dessa origem.

## Desenvolvimento

Pré-requisitos: [Bun](https://bun.sh), Docker.

```bash
cp .env.example .env          # ajuste se necessário
bun install
docker compose -f docker-compose.dev.yml up -d   # postgres(5433), minio, gotenberg, mailpit
bun run db:migrate
bun run db:seed               # empresa/unidade de exemplo + catálogos (documentos, pastas, normas)

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
| `bun test` | Testes (api, web, shared) — recria o banco `easynr10_test` na infra de dev (5433) |
| `bun run typecheck` | Typecheck de todos os pacotes |
| `bun run lint` | oxlint |
| `bun run db:generate` | Gera migration a partir do schema Drizzle |
| `bun run db:migrate` | Aplica migrations |
| `bun run permissions` | Regenera `PERMISSOES.md` a partir dos metadados dos procedures |
| `bun run build` | Build de produção |

## Estado atual

- [x] Monorepo Bun + TypeScript estrito, tRPC tipado ponta a ponta
- [x] Auth: e-mail/senha via better-auth (Google OAuth por env), sessão por cookie
- [x] Isolamento de tenant no servidor (`unitProcedure` verifica membership) + papéis por empresa com permissões por módulo
- [x] Navegação: login → empresas → unidades → home da unidade (clientes com empresa/unidade única entram direto)
- [x] PIE: árvore de pastas (esquema padrão do legado), upload/versões de documentos no MinIO, vencimentos com filtro
- [x] Avaliação da Conformidade: diagnóstico por item, visão geral por grupos A–O, plano de ação
- [x] Cadastros: colaboradores e equipamentos (elétricos, ferramentas, EPI, EPC)
- [x] Relatórios (não conformidades, situação documental, plano de ação) com exportação CSV e PDF (Gotenberg)
- [x] Painéis de empresa e unidade (aderência ponderada, evolução, distribuição)
- [x] Busca global (Ctrl K), tema claro/escuro, layout responsivo com drawer no mobile
- [ ] Notificações de vencimento por e-mail (F5)
