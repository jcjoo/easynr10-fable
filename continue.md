# continue.md — Estado da sessão (atualizado em 04/07/2026)

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

**Dados de teste na stack**: em 03/07/2026 (noite) o usuário excluiu manualmente as empresas seed (Metalúrgica Aurora, Têxtil, Empresa Teste — soft delete, dados recuperáveis no banco) e criou **Empresa A / Unidade A**, onde estão os testes mais recentes (EPIs importados por planilha com CA vinculado). Em 04/07/2026 foram inseridos **via SQL direto** (para validar o F4): 130 diagnósticos em 3 ondas (75/40/10 dias atrás, aderência evoluindo 25%→54%), 53 ações (a maioria com prazo vencido) e 9 documentos no PIE com validades variadas — são dados simulados, não criados pela UI.

## Estado da implementação (roteiro do projeto.md)

### Feito e validado (Playwright na stack + screenshots)
- **F0 Fundação**: auth (better-auth, cookie), `unitProcedure` (isolamento de tenant), layout com sidebar contextual (fluxo do client-test: Empresas → [empresa] Painel/Unidades → [unidade] Painel/PIE/Avaliação(Diagnóstico, Plano)/Relatórios/Grupos de Registro), header com breadcrumb (empresa→/empresas, unidade→/unidades) + busca global Ctrl+K + **switch dark mode** (persistido, tokens `.dark`).
- **F1**: CRUD de empresas e unidades na UI (admin, incluindo excluir com confirmação no card ⋯). **Painel de usuários** (`/usuarios`, admin, `pages/usuarios.tsx` + router `users`): lista usuários e libera/revoga acesso por unidade (checkbox de empresa marca todas as unidades; estado indeterminado quando parcial; grant reativa membership soft-deletada via upsert na PK). Usuário de teste: `cliente@pso.dev` / `senha-cliente-123` (role client, acesso a Guarulhos+Sorocaba). Falta: criar usuário pela UI (sign-up só via API).
- **F2 PIE completo**: lista estilo drive (pastas em cima, mesma tabela), pasta atual na URL (`?pasta=`), upload via **presigned URL** com modal fiel ao legado (dropzone, **select de documento padrão** — 30 nomes seedados, complemento quando nome tem `- *` com preview, checkbox sem referência, vencimento/aviso), versionamento (nova versão só pelo histórico, restaurar reutiliza storage_key), editar/excluir doc, renomear/excluir pasta (cliente: só vazia; admin: cascata com subpastas+documentos, com dialog de confirmação), context menu (clique direito) nos documentos, ações rápidas no hover da linha (baixar/editar/renomear antes do ⋯), visão "apenas documentos" (`?ver=documentos`, toggle no breadcrumb; `documents.listBySubtree` lista tudo abaixo da pasta atual com coluna Local clicável), filtro de vencimento portado do legado (`?venc=&de=&ate=`, presets A vencer/Vencidos/Personalizado em `pie/expiry-filter.tsx` — usuário pediu para tirar os de 15/30/60 dias —, filtragem client-side, chip com ✕ para limpar), árvore de pastas na sidebar (`layout/folder-tree.tsx`, ancestrais da pasta ativa auto-expandem; recolhível pelo chevron no item PIE, persistido em `easynr10.pie-tree`), busca global inclui pastas e documentos da unidade ativa, **gerador de estruturas** (esquemas POR UNIDADE copiados dos modelos globais no 1º uso; CRUD com editor de árvore; "Gerar em [pasta atual]" = exec do legado).
- **F3 núcleo**: 90 normas NR-10 + 101 requisitos seedados do legado; itens de adequação por unidade (gerar; ordenação natural de códigos), diagnóstico com **escala de aderência de 5 níveis** definida pelo usuário em 03/07/2026: inexistente/inadequada/parcial/suficiente/plena (cores bad/alert/warn/suf/ok — token `alert` laranja criado; "sem avaliação" = ausência de registro; fora de escopo = is_active; migration 0004 mapeou insuficiente→inadequada e conforme→plena). **Aderência geral agregada** no topo do Diagnóstico: média dos scores (0/25/50/75/100%) ponderada pelo peso da norma, só itens ativos avaliados; faixas 0-20/21-40/41-70/71-90/91-100 dão rótulo+emoji+frase (`adherenceBands` em shared/enums). Filtro por chips persistido na URL **com contadores** + filtros Sem avaliação/Com avaliação, histórico, **plano de ação auto-gerado** (aderência < Plena com prazo) com status pendente/em andamento/concluída/cancelada + "prazo vencido".
- **F3 motor de evidências (§7.6, 03/07/2026)**: página de config do item (`/diagnosticos/$adequacyItemId`, `pages/diagnostico-item.tsx`, ícone ⚙ no hover da linha) com status ativo, **orientação da unidade** (coluna nova, migration 0003) e CRUD de requisitos (documento/parecer/grupo; grupo exige grupo de cadastro + doc padrão — FK `default_document_id` corrigido para o catálogo, como no legado). Requisitos copiados do catálogo `norm_requirement` no generate E lazy no 1º acesso (`ensureItemRequirements`, conta excluídos p/ não ressuscitar). Dialog de avaliação tem seção Evidências (doc do PIE via `listBySubtree`, parecer textual, grupo com `expandGroupRequirement` + sugestão por pasta do item/termo do doc padrão); `diagnose` grava `evidence`+`evidence_item` (snapshot); histórico expande evidências (`diagnosticEvidences`). `registers.listGroups` mínimo criado (o módulo completo de grupos continua pendente — sem grupos, o tipo group fica sem opções).

- **F4 Relatórios e dashboards (04/07/2026)**: router `reports` na API (`routers/reports.ts`) com builders compartilhados — `adequacySnapshot` (itens ativos + último diagnóstico), `nonConformityRows`, `documentSituationRows` (caminho da pasta + situação vencido/a_vencer/em_dia/sem_validade via `warn_days_before`, default 30), `actionPlanRows` (escopo pendencias|todas, flag `overdue`), `unitOverview` (aderência ponderada + distribuição + grupos documentais + contagens de ações/documentos), `timelineSeries` (evolução da aderência por varredura de diagnósticos — port do timeline do legado adaptado à escala v2: só itens já avaliados na data entram na média ponderada) e `companyOverview` (aderência por unidade visível). **Exportação (RF22)**: rota HTTP `GET /api/reports/export?unitId&type&format&scope` (`report-export.ts`, registrada no main.ts) com cookie de sessão + checagem de membership igual ao unitProcedure; CSV com BOM UTF-8 + `;` + CRLF (Excel pt-BR); **PDF via Gotenberg** (HTML A4 paisagem com cabeçalho da marca → `/forms/chromium/convert/html`; `GOTENBERG_URL` no env, default localhost:3010 = DEV_GOTENBERG_PORT). **Web**: `pages/relatorios.tsx` (3 relatórios em chips na URL `?tipo=&escopo=`, tabelas com pills, botões CSV/PDF como `<a download>`); **Painel da unidade** (`unit-home.tsx`) = dashboard RF19: hero de aderência geral (banda+frase), faixa de distribuição por status (gaps 2px + legenda clicável → diagnósticos filtrados), medidores por grupo documental (cor pela banda), **gráfico SVG próprio de evolução** (`components/charts/adherence-timeline.tsx`: linha 2px + wash 10%, crosshair + tooltip por pointer/teclado, período na URL `?periodo=30d|90d|12m` → daily/weekly/monthly), tiles de plano de ação e documentos; **Painel da empresa** (`company-panel.tsx`) = cards por unidade com % e medidor. Labels novos no shared: `actionStatusLabels`, `documentSituations/Labels`, `timelineIntervals`. Validado na stack com Playwright (screenshots + download real de CSV/PDF). Sem mudança de schema (nenhuma migration). **Ordenação + filtros (04/07/2026, pedido do usuário)**: todas as colunas das 3 tabelas são ordenáveis (clique no th, seta + aria-sort; nulos sempre no fim; norma com `compareNormCodes`, movido do adequacy.ts para o **shared** junto com `normalizeText`); filtros por relatório — busca textual sem acento, select de grupo documental e chips de status com contador (plano: Pendências default/Prazo vencido/Concluídas/Canceladas/Todas — substituíram o checkbox `escopo`); tudo na URL (`?status=&grupo=&q=&ord=&dir=`) e o **export aplica os mesmos filtros** (`applyFilters` em report-export.ts, mesmos params na query string). Depois o usuário pediu **todas as tabelas do sistema ordenáveis**: mecanismo extraído para `ui/sortable.tsx` (`SortableTh`/`PlainTh`/`sortRows`/`toggleSort`/`sortSearch` — este último é o validateSearch reutilizável; `unitSection` no router agora aplica `sortSearch` por padrão) e aplicado em Diagnóstico, Plano de Ação, PIE (pastas só reordenam pelo Nome, ficam no topo; navegação preserva ord/dir), Cadastros (colunas dinâmicas = `campo:<key>`; kind=document ordena pelo nome do doc vinculado) e Usuários.

### Próximos passos (ordem combinada com o usuário)
1. ~~Grupos de Registro~~ **feito em 03/07/2026, com mudança de modelo**: o usuário removeu o módulo genérico — `register_group`/`register_item` dropados (migration 0005). `employee`/`equipment` são standalone (unitId, name, folderId no PIE, metadata) + `custom_field` (campos personalizados por unidade/módulo; defaults do sistema em `defaultRegisterFields` no shared: Função/Matrícula e Fabricante/Identificação). Telas em `pages/registros.tsx` (RegisterPage genérico; Equipamentos com **abas por tipo** — cada grupo-alvo tem colunas default próprias em `defaultRegisterFields` e campos custom POR ALVO, migration 0006). **Estrutura de pastas FIXA** (migration 0007 dropou register_folder): `Colaboradores/Lista de Colaboradores/[nome]` e `Equipamentos/<Tipo>/Lista de <Tipo>/[nome]` (`registerBasePath` no shared); o **esqueleto completo é criado automaticamente** (`ensureRegisterSkeleton`: na criação da unidade e lazy nas listagens de cadastros); ao criar item a pasta nasce automática, opcionalmente com **estrutura de pastas** dentro (`ensureFolderStructure` exportado de folder-schemas). **Campos kind=document** (CA do EPI): vinculados a documentos do PIE via `register_document_link` (1 doc → N itens; chip na tabela com tom de vencimento + ✕; botão "Vincular CA" faz vínculo em massa com checkboxes) — base para automações de vencimento (diagnóstico/alertas, ainda não implementadas). **Importação por planilha** (.xlsx/.csv via SheetJS no cliente, `codepage: 65001` para CSV UTF-8): de-para de colunas com auto-match por nome, upsert por nome (`importEmployees`/`importEquipment`). Requisito tipo group usa **alvo fixo** `target_group` (colaboradores|eletrico|ferramenta|epi|epc); `expandGroupRequirement` expande employees ou equipment por tipo; `evidence_item` tem `employee_id`/`equipment_id`. Sidebar: seção "Cadastros".
2. ~~Motor de evidências~~ **feito em 03/07/2026** (ver F3 acima) — falta só a tabela `referenced_document` (RF11).
3. ~~Relatórios e dashboards (F4)~~ **feito em 04/07/2026** (ver acima). Fora do escopo entregue: filtros extras nos relatórios (por norma/grupo/período, o legado tinha DTOs ricos), relatório "documento" por pasta (pathPrefix) e o painel externo por iframe (módulo Painel do legado — avaliar se ainda é desejado).
4. Notificações (F5, pg-boss não instalado ainda): e-mails de vencimento de documento e prazo de ação; in-app.
5. `referenced_document` (RF11) + automações de vencimento dos campos kind=document (CA de EPI → alerta/diagnóstico).

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
- **Exclusão em cascata** (03/07/2026, pedido do usuário): `units.remove`/`companies.remove` fazem soft delete de TODA a árvore (`apps/api/src/cascade.ts`: pastas, documentos, itens de adequação, diagnósticos/evidências, ações, cadastros, vínculos, estruturas, memberships) e **purge no MinIO** (`purgeUnitObjects` em s3.ts — apaga todas as versões + delete markers do prefixo `units/<id>/`, via endpoint interno). Exclusão de documento individual segue soft delete sem tocar no storage (registro legal). Unidades órfãs das exclusões antigas do usuário foram limpas via API em 03/07.
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

- API routers: `apps/api/src/routers/` — companies, units, folders, folder-schemas, documents, default-documents, adequacy (itens+diagnóstico+plano), registers, reports (overview/timeline/relatórios). Export CSV/PDF: `apps/api/src/report-export.ts`.
- Tenant/auth: `apps/api/src/trpc.ts` (unitProcedure), `auth.ts` (better-auth).
- Web páginas: `apps/web/src/pages/` — pie.tsx (grande), diagnosticos.tsx, plano-de-acao.tsx, relatorios.tsx, unit-home.tsx (dashboard), company-panel.tsx, registros.tsx; section-placeholder.tsx ficou sem uso (mantido p/ fases futuras). Gráfico: `components/charts/adherence-timeline.tsx`.
- Componentes PIE: `apps/web/src/components/pie/` (upload-document-dialog, folder-schemas-dialog).
- UI primitivos: `apps/web/src/components/ui/` (button, field, select, card, dialog, row-menu/Menu, status-pill, status-filter, icons — inclui FileTypeIcon por MIME/extensão, crumbs, page — container padrão full-width de toda página).
- Schema DB: `packages/db/src/schema/` (4 migrations aplicadas; enum de aderência = insuficiente/parcial/suficiente/conforme).
