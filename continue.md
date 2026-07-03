# continue.md — Estado da sessão (atualizado em 03/07/2026)

Handoff para a próxima sessão do **EasyNR10 v2** — reescrita completa do sistema legado em `../easyNR10`.

## O que é este repositório

Monorepo Bun da reescrita (v2) do EasyNR10, plataforma de conformidade NR-10 da PSO Engenharia.
O legado (NestJS + React, em `../easyNR10`) é a **referência de funcionalidade** — leia-o antes de
reimplementar qualquer módulo (instrução explícita do usuário: *"não podemos perder funcionalidades"*).

## Documentos-chave

| Documento | Conteúdo |
|---|---|
| `ANALISE-EASYNR10.md` | Diagnóstico do legado + justificativa da stack |
| `projeto.md` | Requisitos (RF/RNF), modelo de domínio, **dicionário de dados**, diagramas Mermaid, roteiro F0–F6 |
| Guia de design (artifact) | https://claude.ai/code/artifact/a8681cde-e957-4975-89c3-88f3aa12ff0f — tokens, tipografia, componentes, dark mode (v0.3) |
| `README.md` | Comandos de dev e docker |

## Stack (decidida e implementada)

- **Monorepo Bun** (workspaces): `apps/web`, `apps/api`, `packages/shared` (Zod/enums), `packages/db` (Drizzle+migrations+seeds).
- **API**: Fastify + tRPC v11 + better-auth (email/senha; Google por env) + Drizzle + Postgres 17. Roda com **bun** (dev e container).
- **Web**: React 19 + Vite + TanStack Router (URL = fonte da verdade) + TanStack Query + Tailwind 4 + zustand mínimo (contexto ativo, tema). Fontes self-hosted (Fontsource): Archivo Variable, IBM Plex Sans/Mono.
- **Infra**: MinIO (presigned URLs), Gotenberg (PDF, ainda não usado), Mailpit; nginx serve o SPA e proxya `/api`.
- Tipos ponta a ponta: web importa `AppRouter` da api; schemas Zod compartilhados.

## Como rodar

```bash
# Stack completa (testada): http://localhost:8081 (WEB_PORT no .env)
docker compose up -d --build

# Dev local: postgres na porta 5433 (5432 é do legado!)
docker compose -f docker-compose.dev.yml up -d
bun install && bun run db:migrate && bun run db:seed
bun run dev:api   # :3000
bun run dev:web   # :5173 (proxy /api)
```

**Config central no `.env`** (03/07/2026): portas do host (WEB_PORT=8081, MINIO_PORT=9100,
MINIO_CONSOLE_PORT=9101, DEV_*) e credenciais são variáveis `${VAR:-default}` nos dois
compose; endpoints internos (minio:9000, database:5432) ficam no compose. Stack e infra de
dev compartilham MINIO_PORT — não subir as duas juntas.

**Login de teste** (ambos ambientes): `admin@pso.dev` / `senha-forte-dev-123` (role admin via UPDATE no banco — não há tela de cadastro/gestão de usuários ainda; ver README).

**Dados de teste na stack**: Metalúrgica Aurora S.A. (Planta Guarulhos com PIE populado, Sorocaba com 90 itens de adequação e 1 diagnóstico, Campinas), Têxtil Horizonte Ltda.

## Estado da implementação (roteiro do projeto.md)

### Feito e validado (Playwright na stack + screenshots)
- **F0 Fundação**: auth (better-auth, cookie), `unitProcedure` (isolamento de tenant), layout com sidebar contextual (fluxo do client-test: Empresas → [empresa] Painel/Unidades → [unidade] Painel/PIE/Avaliação(Diagnóstico, Plano)/Relatórios/Grupos de Registro), header com breadcrumb (empresa→/empresas, unidade→/unidades) + busca global Ctrl+K + **switch dark mode** (persistido, tokens `.dark`).
- **F1**: CRUD de empresas e unidades na UI (admin, incluindo excluir com confirmação no card ⋯). **Painel de usuários** (`/usuarios`, admin, `pages/usuarios.tsx` + router `users`): lista usuários e libera/revoga acesso por unidade (checkbox de empresa marca todas as unidades; estado indeterminado quando parcial; grant reativa membership soft-deletada via upsert na PK). Usuário de teste: `cliente@pso.dev` / `senha-cliente-123` (role client, acesso a Guarulhos+Sorocaba). Falta: criar usuário pela UI (sign-up só via API).
- **F2 PIE completo**: lista estilo drive (pastas em cima, mesma tabela), pasta atual na URL (`?pasta=`), upload via **presigned URL** com modal fiel ao legado (dropzone, **select de documento padrão** — 30 nomes seedados, complemento quando nome tem `- *` com preview, checkbox sem referência, vencimento/aviso), versionamento (nova versão só pelo histórico, restaurar reutiliza storage_key), editar/excluir doc, renomear/excluir pasta (cliente: só vazia; admin: cascata com subpastas+documentos, com dialog de confirmação), context menu (clique direito) nos documentos, ações rápidas no hover da linha (baixar/editar/renomear antes do ⋯), visão "apenas documentos" (`?ver=documentos`, toggle no breadcrumb; `documents.listBySubtree` lista tudo abaixo da pasta atual com coluna Local clicável), filtro de vencimento portado do legado (`?venc=&de=&ate=`, presets A vencer/Vencidos/Personalizado em `pie/expiry-filter.tsx` — usuário pediu para tirar os de 15/30/60 dias —, filtragem client-side, chip com ✕ para limpar), árvore de pastas na sidebar (`layout/folder-tree.tsx`, ancestrais da pasta ativa auto-expandem; recolhível pelo chevron no item PIE, persistido em `easynr10.pie-tree`), busca global inclui pastas e documentos da unidade ativa, **gerador de estruturas** (esquemas POR UNIDADE copiados dos modelos globais no 1º uso; CRUD com editor de árvore; "Gerar em [pasta atual]" = exec do legado).
- **F3 núcleo**: 90 normas NR-10 + 101 requisitos seedados do legado; itens de adequação por unidade (gerar; ordenação natural de códigos), diagnóstico com **escala de aderência insuficiente/parcial/suficiente/conforme** (nomes/cores confirmados pelo usuário; "sem avaliação" = ausência de registro; fora de escopo = is_active), filtro por chips persistido na URL, histórico, **plano de ação auto-gerado** (aderência < conforme com prazo) com status pendente/em andamento/concluída/cancelada + "prazo vencido".

### Próximos passos (ordem combinada com o usuário)
1. **Grupos de Registro** (F3): módulo genérico + Equipamentos/Colaboradores (entidades `employee`/`equipment` já no schema, ponte 1:1 com `register_item`; pasta do item configurada NA TELA do módulo — RF18.3). Ver legado: `group-register`, `item-register`.
2. **Motor de evidências** (projeto.md §7.6): requisitos por item (`adequacy_item_requirement` — copiar do catálogo `norm_requirement` ao gerar itens), evidências snapshot por requisito, expansão de grupo com sugestão automática de documento pela pasta do item (legado: `EvidencyGroupStrategy`). Tabela `referenced_document` (RF11) entra aqui.
3. Relatórios (F4, análises + export PDF/CSV via Gotenberg), dashboards, notificações (F5, pg-boss não instalado ainda).

## Pegadinhas descobertas (não repetir)

- **`apply` é nome reservado** em router tRPC (usar `applyToUnit`).
- **Bun não hoisteia tudo**: Dockerfile da api copia `/app` inteiro do estágio deps (node_modules dos workspaces).
- **drizzle-kit tem shebang node** → não roda na imagem bun; migrations via script programático `packages/db/src/migrate.ts` (o CMD do container roda migrate no boot).
- Install com `--frozen-lockfile` exige os package.json de TODOS os workspaces na imagem.
- **nginx**: upstream com resolver dinâmico (`resolver 127.0.0.11` + variável), senão morre se a api não subiu.
- **S3**: assinar presigned com `S3_PUBLIC_ENDPOINT` (browser) ≠ `S3_ENDPOINT` (rede interna); MinIO publica :9100 (console :9101) — 9000/9001 do host são de outro projeto (site-minio).
- Porta **5432 ocupada pelo legado** → dev usa 5433.
- Menus dropdown em tabelas com overflow: renderizar em **portal** com posição fixa (`ui/row-menu.tsx` tem `Menu` reutilizável para ⋯ e context menu).
- Layout: shell `h-screen overflow-hidden`, só o `<main>` rola (senão a sidebar some com o scroll do body). Estilo "Drive" (pedido do usuário): sidebar/header no fundo `paper`, `<main>` é um painel `surface` arredondado; tabelas ficam direto no painel (sem `Card` — o componente Card só sobrou no login).
- Ordenar códigos de norma **naturalmente** (10.2 < 10.11) — `compareNormCodes` em `adequacy.ts`.
- Enum `document_group` real do legado: `instalacoes | instrucoes_e_procedimentos | colaboradores | equipamentos` (já corrigido em código+docs).
- **ensureUnitSchemas** (folder-schemas): o "já copiou os modelos?" tem que contar estruturas EXCLUÍDAS também — senão excluir a última estrutura ressuscita os modelos globais no próximo list (bug corrigido em 03/07/2026).
- Seeds portados do legado em `packages/db/src/seeds/`: `default-documents.json` (30), `norms.json` (90), `default-folder-schema.json` (sem a raiz duplicada "Colaboradores(2)").

## Preferências do usuário (importante)

- **Sempre olhar o sistema legado antes de reimplementar** — fidelidade de funcionalidade primeiro, melhorias depois. Não inventar colunas/valores ("a necessidade vai aparecer depois, deixa apenas o essencial").
- Validar visualmente: rodar na stack Docker + **screenshots via Playwright** (`playwright-core` instalado no scratchpad, chromium do sistema em `/usr/bin/chromium`) e enviar com SendUserFile.
- UI em pt-BR seguindo o guia de design (tokens em `apps/web/src/styles.css`); status de aderência com as cores confirmadas; âmbar só como marca.
- Assets da marca vieram do legado: logo `fullLogo(.Dark).png`, favicon = ícone das 3 barras, ícones de arquivo/pasta em `ui/icons.tsx`.
- Manter `projeto.md` (dicionário/diagramas) atualizado quando o modelo mudar.
- Repositório tem git init mas **nenhum commit ainda** (usuário não pediu).

## Mapa rápido de arquivos

- API routers: `apps/api/src/routers/` — companies, units, folders, folder-schemas, documents, default-documents, adequacy (itens+diagnóstico+plano).
- Tenant/auth: `apps/api/src/trpc.ts` (unitProcedure), `auth.ts` (better-auth).
- Web páginas: `apps/web/src/pages/` — pie.tsx (grande), diagnosticos.tsx, plano-de-acao.tsx, section-placeholder.tsx (Relatórios/Equipamentos/Colaboradores ainda placeholder).
- Componentes PIE: `apps/web/src/components/pie/` (upload-document-dialog, folder-schemas-dialog).
- UI primitivos: `apps/web/src/components/ui/` (button, field, select, card, dialog, row-menu/Menu, status-pill, status-filter, icons — inclui FileTypeIcon por MIME/extensão, crumbs, page — container padrão full-width de toda página).
- Schema DB: `packages/db/src/schema/` (3 migrations aplicadas; enum de aderência = insuficiente/parcial/suficiente/conforme).
