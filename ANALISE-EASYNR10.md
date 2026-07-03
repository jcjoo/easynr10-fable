# EasyNR10 — Análise do Projeto

> Documento gerado a partir da leitura do código em `../easyNR10` (branch atual), em 02/07/2026.
> Escopo analisado: `server/` (NestJS), `client/` (front atual), `client-test/` (protótipo do novo fluxo) e `docker-compose.yml`.

---

## 1. Descrição Geral

O **EasyNR10** é uma aplicação web full-stack para **gestão de conformidade com a NR-10** (segurança em instalações e serviços em eletricidade). Ela é usada por uma consultoria (PSO Engenharia) para administrar múltiplas **empresas clientes**, cada uma com suas **unidades**, e para cada unidade controlar:

- **PIE — Prontuário de Instalações Elétricas (gestão de documentos)** — o prontuário exigido pela NR-10, materializado como uma árvore de pastas com esquemas padrão, upload de arquivos para S3/MinIO, versionamento, controle de validade/vencimento e notificação prévia de expiração.
- **Avaliação de conformidade** — catálogo de **normas/requisitos da NR-10** com peso de importância; cada unidade recebe **itens de adequação** (norma × unidade) sobre os quais são feitos **diagnósticos** (status, prazo, responsável, ação recomendada, parecer técnico) com **evidências** anexadas.
- **Plano de ação** — acompanhamento das ações derivadas dos diagnósticos.
- **Dashboards** — visão geral de conformidade, painéis internos (colaboradores, equipamentos, instalações, procedimentos) e painel externo.
- **Relatórios** — análises consolidadas dos dados (ex.: não conformidades, situação documental), visualizadas na aplicação e exportáveis (hoje apenas PDF via pdfmake).
- **Notificações** — in-app e por e-mail (SMTP configurável por unidade), com agendamento via cron.

### Arquitetura atual

| Camada | Tecnologia |
|---|---|
| Frontend (`client/`) | React 19 + TypeScript + Vite, Tailwind, shadcn/Radix, Zustand (~25 stores), Axios, CASL, Recharts |
| Backend (`server/`) | NestJS 11 + TypeORM + PostgreSQL 17, JWT + Google OAuth (Passport), Multer, Nodemailer/Handlebars, pdfmake |
| Storage | MinIO (S3-compatible) |
| Observabilidade | Winston → Loki → Grafana, prom-client, OpenTelemetry |
| Orquestração | Docker Compose (dev) |

O backend é um monólito modular razoavelmente bem organizado (módulos por domínio: `empresas`, `unidade`, `documents`, `folders`, `norm`, `adequacy-item`, `diagnostic`, `reports`, `notification`, etc.), com Swagger em dev, `ValidationPipe` global (whitelist + forbid), Helmet, throttler e soft-delete em praticamente todas as entidades.

### O `client-test`

O `client-test/` é um **protótipo do novo fluxo de usuário** e representa a direção desejada para o produto: navegação orientada a URL (`/empresas → /:empresaId → /:empresaId/unidades → /:empresaId/:unidadeId → .../pie`), **um único store** Zustand (contexto ativo empresa/unidade, com a URL como fonte da verdade), **TanStack Query** para estado de servidor, React Router 7, Tailwind 4, React 19 e **oxlint**. Hoje cobre login, listagem de empresas/unidades, home da unidade e o início da página do PIE (a gestão de documentos do prontuário) — **faltam as funcionalidades de negócio** (documentos do PIE, diagnósticos, plano de ação, relatórios, dashboards).

---

## 2. Crítica

### Frontend atual (`client/`) — principal ponto de dor

1. **Explosão de estado global**: ~25 stores Zustand, muitos fazendo papel de cache de servidor (dados de API guardados em store), o que gera sincronização manual, dados obsoletos e re-fetch espalhado. É exatamente o problema que TanStack Query resolve — e que o `client-test` já adota.
2. **Stores duplicados por grafia**: `useDiagnosticoStore` **e** `useDiagnosticStore`; `useAdequacaoItensStore` **e** `useAdequacyItemsStore`. Sintoma de falta de convenção e de refatorações incompletas.
3. **Arquivos gigantes**: sidebar com **1.406 linhas**, `unidades/index.tsx` com 899, tabela do plano de ação com 1.008. Manutenção e revisão de código ficam caras.
4. **Assets como código**: SVGs embutidos em `.tsx` de 2.755 e 1.353 linhas (`assets/login.tsx`, `startClient.tsx`) — deveriam ser arquivos `.svg` estáticos.
5. **Mock em produção**: `mockData.tsx` de 2.137 linhas dentro de `app/private/.../visao-geral/utils/` — dado falso convivendo com a árvore de produção.
6. **Mistura PT/EN sem critério**: `empresas`/`companies`, `unidades`/`units`, `avaliacaoConformidade`/`adequacy`, `diagnostico`/`diagnostic` — em rotas, pastas, stores e entidades.

### Backend (`server/`)

7. **Zero testes unitários** (`0` arquivos `.spec.ts`) e apenas o e2e boilerplate do Nest. Para um sistema de conformidade legal, ausência de testes é risco direto de regressão silenciosa em cálculo de conformidade/relatórios.
8. **Segredos reais commitados** no `docker-compose.yml`: senha de app do Gmail (`MAIL_PASSWORD`), `CRYPTO_KEY` e `JWT_SECRET=secret`. Mesmo sendo ambiente dev, a senha do Gmail é uma credencial real exposta no repositório — **deve ser revogada e movida para `.env`/secret manager**.
9. **Typo institucionalizado**: módulo `adequancy-item-requirement` (sic) — o erro de grafia está em nome de pasta, classe e provavelmente em tabela, o que torna a correção cada vez mais cara.
10. **Criptografia de paths via interceptor global** (`EncryptPathInterceptor`/`DecryptPathPipe`): complexidade transversal alta para um ganho de segurança questionável (segurança por obscuridade); IDs opacos (UUID) + autorização por recurso resolvem o mesmo problema de forma padrão.
11. **`express.json({ limit: '50mb' })` global**: limite de payload enorme para toda a API quando só upload precisa disso (e upload deveria ir direto ao S3 via presigned URL, que o projeto já tem dependência para gerar).
12. **Autorização fragmentada**: roles no JWT + CASL no front, mas não há uma camada clara de autorização por recurso (tenant) no backend visível — em multi-tenant, o isolamento empresa/unidade precisa ser garantido no servidor, não na UI.

### Infra / processo

13. **Observabilidade sobredimensionada para o estágio**: Loki + Grafana + Prometheus + OpenTelemetry no compose de dev, enquanto não há um teste sequer — a prioridade de qualidade está invertida.
14. **Containers de dev rodam `npm install` no boot** com imagens genéricas `node:24-alpine`/`node:22-alpine` — lento e não reprodutível; os Dockerfiles existentes não são usados no compose.
15. **Gerenciadores de pacote misturados**: `package-lock.json` **e** `pnpm-lock.yaml` convivendo no `client/`.
16. **README desatualizado**: descreve criação manual de bucket que o serviço `mc` já automatiza, e cita "não conformidades e planos de ação" com estrutura de pastas que não bate 100% com o código.

### O que está bom

- Separação por módulos de domínio no NestJS é limpa e facilita a migração incremental.
- Soft-delete, migrations TypeORM, seeds, `ValidationPipe` estrito, Helmet e throttler são boas práticas já presentes.
- O `client-test` acerta nas decisões estruturais: URL como fonte da verdade, um único store de contexto, TanStack Query, superfície de dependências pequena.

---

## 3. Requisitos Funcionais

Levantados a partir dos módulos existentes (o "o quê" que qualquer reescrita precisa preservar):

**Autenticação e acesso**
- RF01 — Login com e-mail/senha e com Google (OAuth2); sessão via JWT.
- RF02 — Recuperação de senha por e-mail (token de reset).
- RF03 — Perfis de acesso (ex.: ADMIN, CLIENT) com permissões distintas por funcionalidade.
- RF04 — Vínculo de usuários a unidades; usuário só enxerga empresas/unidades às quais pertence.

**Estrutura organizacional**
- RF05 — CRUD de empresas.
- RF06 — CRUD de unidades por empresa, com logo e configuração própria de e-mail (SMTP).
- RF07 — Contexto de navegação por empresa/unidade ativa (fluxo do `client-test`).

**PIE — Prontuário de Instalações Elétricas (gestão de documentos)**
- RF08 — Árvore de pastas por unidade, com esquemas de pastas padrão reaproveitáveis (folder schema / default schema), formando o prontuário da unidade.
- RF09 — Upload/download de documentos (S3/MinIO), com tipo MIME e versionamento.
- RF10 — Validade de documentos: data de expiração e antecedência de aviso configurável.
- RF11 — Documentos referenciados/padrão vinculados a grupos de documentos exigidos pela norma.

**Normas e conformidade**
- RF12 — Catálogo de normas/requisitos (código, descrição, orientação, peso de importância, grupo documental).
- RF13 — Itens de adequação por unidade × norma (ativáveis/desativáveis), com requisitos associados.
- RF14 — Diagnósticos por item de adequação: status, prazo, responsável, ação recomendada, parecer técnico e autor.
- RF15 — Evidências estruturadas por requisito configurado no item (tipos: documento, parecer, **grupo**): requisito tipo grupo expande os itens do grupo de cadastro (ex.: um por colaborador), cada um exigindo um documento como prova, com busca automática na pasta do item no PIE e vínculo manual como alternativa.
- RF16 — Plano de ação consolidado a partir dos diagnósticos, com acompanhamento de prazos.
- RF17 — Importação de dados por planilha (Excel/CSV) para cadastros em massa.

**Cadastros auxiliares**
- RF19 — Cadastro genérico de grupos e itens (group/item register) por unidade — colaboradores, equipamentos, instalações, procedimentos — com metadados configuráveis e pasta correspondente no PIE por item; é a base do mecanismo de evidências tipo grupo (RF15) e deve ser preservado mesmo que surjam módulos especializados de colaboradores/equipamentos.

**Visualização e relatórios**
- RF20 — Dashboard geral de conformidade (visão consolidada por empresa/unidade).
- RF21 — Painéis internos por categoria (colaboradores, equipamentos, instalações, procedimentos) e painel externo.
- RF22 — Seção de relatórios analíticos *(ainda não implementada no novo fluxo)*: resultados de análise de dados consultáveis na própria aplicação — ex.: Relatório de Não Conformidades, situação documental do PIE, pendências do plano de ação.
- RF23 — Exportação de qualquer relatório em **PDF** (apresentação) e **CSV** (dados para análise externa).

**Notificações**
- RF24 — Notificações in-app por usuário (marcar como lida, ativar/desativar).
- RF25 — Notificações por e-mail (templates Handlebars), incluindo aviso de vencimento de documento, disparadas por agendador (cron).

---

## 4. Requisitos Não Funcionais

- RNF01 — **Segurança**: senhas com hash forte (bcrypt); JWT com segredo forte rotacionável; Helmet; rate limiting; validação estrita de entrada (whitelist); **nenhum segredo em repositório** (usar `.env`/secret manager).
- RNF02 — **Isolamento multi-tenant no servidor**: toda query filtrada por empresa/unidade do usuário autenticado; autorização por recurso, não apenas por role na UI.
- RNF03 — **LGPD/auditoria**: soft-delete e trilha de criação/alteração (`created_at`/`updated_at`) em todas as entidades; rastreabilidade de quem alterou diagnósticos e pareceres técnicos.
- RNF04 — **Upload eficiente**: arquivos vão direto ao S3 via presigned URL; API sem limites de payload globais desnecessários.
- RNF05 — **Desempenho**: listagens paginadas no servidor; dashboards responsivos com agregações no banco (não no cliente); virtualização em tabelas grandes.
- RNF06 — **Testabilidade**: cobertura mínima de testes unitários nas regras de conformidade/cálculo de indicadores e testes e2e nos fluxos críticos (login, upload, diagnóstico, relatório) rodando em CI.
- RNF07 — **Observabilidade proporcional**: logs estruturados e métricas básicas primeiro; Loki/Grafana/OTel quando houver produção que os justifique.
- RNF08 — **Reprodutibilidade de ambiente**: um único gerenciador de pacotes; builds Docker determinísticos (Dockerfile usado no compose); seed de dev automática.
- RNF09 — **Disponibilidade e backup**: backup automatizado do PostgreSQL e do bucket S3; migrations versionadas como único mecanismo de mudança de schema.
- RNF10 — **Usabilidade**: interface pt-BR, responsiva, com URL navegável/compartilhável como fonte da verdade (padrão do `client-test`).
- RNF11 — **Manutenibilidade**: convenção única de idioma no código (recomendado: domínio em PT nos rótulos/UI, identificadores em EN), arquivos de componente pequenos, lint em CI.

---

## 5. Possível Nova Stack Recomendada (refatoração completa)

Premissa: **reescrita completa** do sistema, preservando o domínio (seção 3) e usando o fluxo de usuário do `client-test` como referência de UX. O que se aproveita do projeto atual é o **modelo de dados/domínio e o aprendizado**, não o código. O perfil da aplicação orienta as escolhas: SPA autenticado B2B multi-tenant, uso de dados intenso (dashboards, tabelas, documentos do PIE), sem necessidade de SEO/SSR, equipe pequena e 100% TypeScript.

### Visão geral

```
monorepo bun workspaces (+ turborepo para cache de tasks)
├── apps/web        → React 19 + Vite + TanStack Router/Query
├── apps/api        → Fastify + tRPC + Drizzle + better-auth
├── packages/shared → schemas Zod do domínio, enums, tipos
└── packages/db     → schema Drizzle + migrations + seeds
```

**Bun** como gerenciador de pacotes e executor de scripts (workspaces nativos, install muito mais rápido, um único `bun.lock`). O **runtime da API continua Node LTS** — é a escolha conservadora para drivers de Postgres, OpenTelemetry e S3 em produção; migrar o runtime para Bun depois é um passo pequeno e opcional, já que o código é o mesmo.

**Princípio central:** um único grafo de tipos do banco à tela. O schema Drizzle gera tipos, os schemas Zod validam entrada/saída, o tRPC expõe procedures tipadas e o TanStack Query as consome — **sem codegen de OpenAPI, sem DTOs duplicados, sem os ~25 stores**.

### Frontend (`apps/web`)

| Camada | Escolha | Por quê |
|---|---|---|
| Base | **React 19 + Vite + TypeScript estrito** | Validado no `client-test`; ecossistema shadcn |
| Roteamento | **TanStack Router** | Rotas e search params 100% tipados — ideal para o padrão "URL como fonte da verdade" do `client-test` (filtros de dashboard/tabela na URL). React Router 7 é o fallback se quiserem reaproveitar o código do protótipo |
| Estado de servidor | **TanStack Query** (integrado ao tRPC) | Cache/invalidação automáticos; elimina a classe inteira de bugs do `client/` atual |
| Estado de UI | **Zustand mínimo** (contexto ativo, tema, sidebar) | Padrão já provado no `active-context-store` |
| UI | **Tailwind 4 + shadcn/ui (Radix)** | Continuidade visual; componentes copiáveis, sem lock-in |
| Tabelas | **TanStack Table** com virtualização | Plano de ação e visão geral já sofrem com tabelas grandes |
| Formulários | **React Hook Form + Zod** | Mesmo schema Zod do backend valida o form |
| Gráficos | **Recharts** | Suficiente para os dashboards atuais |
| Lint/format | **oxlint + prettier** | Já adotado no `client-test` |

### Backend (`apps/api`)

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime/HTTP | **Node 24 LTS + Fastify** | Rápido, maduro, ecossistema de plugins; sem a cerimônia de decorators/DI do Nest, que a equipe não estava explorando (zero testes, módulos anêmicos) |
| API | **tRPC v11** | Contrato tipado ponta a ponta sem codegen; procedures espelham casos de uso (ex.: `diagnostic.create`). Se for necessário expor API pública a terceiros no futuro, adicionar um adapter REST/OpenAPI apenas para esses endpoints |
| ORM | **Drizzle** | SQL explícito (essencial para as agregações de conformidade dos dashboards), migrations leves, tipos inferidos do schema |
| Banco | **PostgreSQL 17** (manter) | Modelo relacional já validado; RLS opcional como segunda linha de defesa multi-tenant |
| Auth | **better-auth** | Email/senha, Google OAuth, reset de senha e **plugin de organizations** (mapeia empresas/unidades/membros/roles) prontos — substitui Passport + JWT manual + CASL |
| Autorização | **Middleware de tenant no tRPC** | Toda procedure recebe o contexto empresa/unidade já autorizado; isolamento garantido no servidor, UI só espelha permissões |
| Jobs/cron | **pg-boss** | Fila e agendamento sobre o próprio Postgres (avisos de vencimento, e-mails) — sem Redis/broker extra |
| E-mail | **Nodemailer + react-email** | Templates em React tipados no lugar de Handlebars |
| Storage | **MinIO/S3 com presigned URLs** | Upload/download direto do browser; API nunca trafega arquivo; some o limite global de 50 MB |
| Relatórios/exportação | **Queries de agregação no Postgres (Drizzle) + exportadores**: CSV gerado direto dos dados; PDF via **HTML → Gotenberg** (container) ou react-pdf | Relatório é resultado de análise de dados, consultável na app — PDF e CSV são só formatos de saída. HTML→PDF reaproveita o visual do front; pdfmake (layout em JSON) é difícil de manter |
| Validação | **Zod** (compartilhado em `packages/shared`) | Uma fonte de verdade para form, API e domínio |
| Logs/métricas | **pino + OpenTelemetry** | Estruturado e barato; Loki/Grafana só quando houver produção que justifique |

### Qualidade e infra

- **Testes desde o dia 1**: Vitest (regras de conformidade, cálculo de indicadores, autorização de tenant) + Playwright (login, upload, diagnóstico, relatório) em GitHub Actions; regra: funcionalidade nova = teste junto.
  - *Por que Vitest e não `bun test`?* A API roda em produção sobre Node — o Vitest testa no mesmo runtime, enquanto o `bun test` executaria sob o runtime do Bun; e no front o Vitest reusa o pipeline do Vite (plugins, aliases) com o ecossistema de teste de componente mais maduro. Se o runtime da API migrar para Bun no futuro, `bun test` vira a escolha natural.
- **Segredos**: `.env` gitignored em dev + secret manager em produção; **revogar imediatamente a senha de app do Gmail exposta** no repo atual.
- **Docker**: Dockerfiles multi-stage reais usados pelo compose (base `oven/bun` no estágio de install/build); um único lockfile (`bun.lock`); seed automática de dev.
- **Convenção de idioma única**: identificadores em inglês, UI/rótulos em pt-BR — elimina os pares `empresas/companies`, `diagnostico/diagnostic` e o typo `adequancy` na nova base.

### Alternativas consideradas (e por que não)

- **NestJS de novo (reescrita limpa)** — só faz sentido se a equipe valoriza a estrutura imposta pelo framework; o histórico mostra que os recursos do Nest (DI, testing utilities, guards elaborados) não estavam sendo usados. Opção válida se a familiaridade pesar mais que a simplicidade.
- **TanStack Start ("TanStack completo") em vez de Vite puro** — o Start **é construído sobre Vite**; a troca não substitui o Vite, adiciona uma camada de framework (SSR, server functions, roteamento file-based). O que ele oferece a mais só paga o custo quando se quer SSR/SEO ou colapsar a API em server functions — e aqui a API é um serviço dedicado (tRPC, jobs, PDF) e o app é um SPA autenticado. Além disso, o Start é bem mais novo que o resto da stack. Como o front já usa TanStack Router, migrar para Start no futuro é um passo curto se a necessidade surgir.
- **Next.js full-stack** — mesma lógica: colapsa front e back em um deploy, mas acopla a API ao ciclo de vida do front, e a aplicação não precisa de SSR/SEO. Jobs agendados e geração de PDF ficam mais naturais num serviço de API dedicado.
- **Manter REST + OpenAPI codegen** — funciona, mas adiciona uma etapa de geração e um contrato a sincronizar; com front e back no mesmo monorepo e mesma equipe, tRPC entrega o mesmo resultado com menos atrito.

### Roteiro da reescrita

1. **Imediato:** revogar/rotacionar os segredos expostos no repositório atual.
2. Montar o monorepo com auth (better-auth + organizations), contexto de tenant e o esqueleto de navegação do `client-test` (empresas → unidades → unidade).
3. Modelar o schema Drizzle a partir das entidades atuais, corrigindo nomes (`adequancy` → `adequacy`) e normalizando o que a prática revelou errado.
4. Reescrever por ordem de valor: PIE (gestão de documentos) → diagnósticos + plano de ação → dashboards → relatórios → notificações.
5. **Migração de dados**: script único Postgres → Postgres (estruturas são próximas) + cópia dos objetos no bucket; rodar em staging antes do cutover.
6. Operar o sistema antigo em somente-leitura durante a validação e desligá-lo após o aceite.
