# EasyNR10 v2

Reescrita do EasyNR10 — gestão de conformidade NR-10. Documentos do projeto:

- [`ANALISE-EASYNR10.md`](./ANALISE-EASYNR10.md) — diagnóstico do sistema legado e justificativa da stack
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

Na primeira subida (banco vazio), o container da API roda o seed (catálogos + empresa exemplo) e cria o usuário admin automaticamente — login `admin@pso.dev` / `admin12345` (configurável via `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`; troque a senha em ambiente exposto). Bancos já populados não são alterados.

Para expor via túnel (ngrok etc.), adicione a URL pública em `EXTRA_TRUSTED_ORIGINS` no `.env` e recrie os containers — sem isso o better-auth rejeita o login vindo dessa origem.

## Fluxo de branches e deploy

```
feature/*  ──PR (1 aprovação)──▶  homolog  ──PR (1 aprovação)──▶  main
                                     │                              │
                                     ▼                              ▼
                    homolog.psoengenharia.com.br        sistema.psoengenharia.com.br
```

`main` e `homolog` bloqueiam push direto e exigem 1 aprovação (inclusive de
admins). O CI (`.forgejo/workflows/docker-images.yml`) builda e publica as
imagens no registry do Forgejo a cada push nessas branches: `main` gera a tag
`latest`; `homolog` gera a tag `homolog` (ambas também recebem uma tag `sha`
para auditoria). Imagens: `${REGISTRY_HOST}/pso/easynr10-{api,web}`.

Os composes de deploy sobem **só `web` + `api`** (as imagens buildadas).
Postgres, MinIO, Gotenberg e mail são serviços **compartilhados** do servidor
(comuns a vários sistemas): não sobem aqui — a api os alcança pela rede Docker
externa `shared` e pelos endpoints do `.env`.

```bash
# Pré-requisito no servidor: docker network create pso-shared

# produção (imagem da main → latest)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# homologação (imagem da branch homolog → homolog)
docker compose -f docker-compose.homolog.yml pull
docker compose -f docker-compose.homolog.yml up -d
```

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

Se o banco não tiver nenhum usuário, a API cria o admin no boot (`admin@pso.dev` / `admin12345`, configurável via `ADMIN_EMAIL`/`ADMIN_PASSWORD`). Usuários adicionais são criados pela própria aplicação (telas de Usuários).

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
