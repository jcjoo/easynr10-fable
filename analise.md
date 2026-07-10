# Análise do projeto — EasyNR10 v2

**Data:** 09/07/2026 · **Escopo:** revisão completa do monorepo (`apps/api`, `apps/web`, `packages/db`, `packages/shared`, Docker/infra).

**Verificações executadas:** `bun run typecheck` (limpo nos 4 workspaces), `bun run lint` (1 warning trivial), `bun test` (119 testes, 0 falhas).

---

## 1. Visão geral

O projeto está em bom estado. Pontos fortes que valem registrar:

- **Autorização bem desenhada**: os "decorators" de permissão (`publicProcedure` → `protectedProcedure` → `adminProcedure` / `unitProcedure` / `unitAction`) tornam a permissão de cada endpoint explícita e enumerável (`PERMISSOES.md` gerado da mesma fonte). Isolamento multi-tenant checado no servidor em toda procedure de unidade.
- **Soft-delete consistente**: `notDeleted()` como ponto único, índices únicos parciais (`WHERE deleted_at IS NULL`) que liberam nomes para reuso, e cascata declarativa (`cascade.ts`) com filhos antes dos pais.
- **Storage correto**: presigned URLs (o binário nunca passa pela API, exceto o PDF gerado no servidor), bucket versionado com purge que remove versões e delete markers, endpoint público vs. interno separados.
- **Contrato ponta a ponta**: schemas Zod compartilhados entre formulário e procedure; tipo `AppRouter` consumido direto pelo web sem codegen.
- **Testes de API com banco real** (119 passando) cobrindo permissões, visibilidade, cascata e regras de negócio.
- **Comentários de código explicam o "porquê"** (decisões, RFs, trade-offs) — raro e valioso.

Os problemas abaixo estão ordenados por gravidade dentro de cada seção.

---

## 2. Problemas de segurança

### 2.1 Auto-registro público habilitado (ALTO)
`apps/api/src/auth.ts` habilita `emailAndPassword: { enabled: true }` sem `disableSignUp`. O better-auth expõe `POST /api/auth/sign-up/email` publicamente: **qualquer pessoa pode criar uma conta** no sistema. O usuário criado nasce com role `client` e sem memberships (não vê nada), mas é uma superfície aberta: enumeração de e-mails, poluição da base, contas aguardando um grant equivocado.

**Correção:** `emailAndPassword: { enabled: true, disableSignUp: true }`. A criação server-side (`auth.api.signUpEmail` em `users.create`/`createForCompany`/`bootstrap-admin`) precisa então passar a flag interna de bypass (ou usar o plugin admin do better-auth).

### 2.2 Vínculo campo→documento sem validação de tenant dos itens (ALTO)
Em `apps/api/src/routers/registers.ts`:

- `linkDocument` valida que o **documento** pertence à unidade, mas não valida que os `employeeIds`/`equipmentIds` pertencem a ela. Um usuário com `cadastros.vinculos` na unidade A pode criar vínculos apontando para colaboradores/equipamentos da unidade B.
- `unlinkDocument` não valida **nada** contra a unidade: aceita qualquer `employeeId`/`equipmentId` do banco e soft-deleta o vínculo ativo daquele campo — permite remover evidências de outra unidade/empresa.

**Correção:** em ambos, resolver os IDs recebidos com `WHERE unit_id = input.unitId` e rejeitar os que não pertencem (mesmo padrão do `findUnitDocument`).

### 2.3 Sem rate limiting efetivo (MÉDIO)
O rate limit do better-auth só liga com `NODE_ENV=production`, e o `docker-compose.yml` **não define NODE_ENV** — login por senha fica sem proteção contra força bruta. As rotas públicas fora do better-auth (`publicByToken`/`publicSign`, `/api/reports/export`) não têm nenhum limite próprio.

**Correção:** definir `NODE_ENV=production` no compose de produção e/ou configurar `rateLimit` explicitamente no better-auth; considerar um limitador simples (por IP) nas procedures públicas de assinatura.

### 2.4 Token público de assinatura vai parar nos logs (BAIXO)
Queries tRPC viajam por GET com o input na query string, e `main.ts` usa `hono/logger` para toda requisição — o token opaco de `publicByToken` aparece em claro nos logs da API. O token é a credencial do link de assinatura.

**Correção:** filtrar `/api/trpc/authorizations.publicByToken` do logger, ou trocar a consulta pública para mutation/POST.

### 2.5 Injeção de fórmula no CSV exportado (BAIXO)
`toCsv` em `report-export.ts` escapa aspas, mas não neutraliza células iniciadas por `=`, `+`, `-`, `@`. Nome de documento/responsável é texto livre do usuário; ao abrir no Excel, `=HYPERLINK(...)` etc. executa. Clássico CSV injection.

**Correção:** prefixar `'` (apóstrofo) em valores que começam com esses caracteres.

### 2.6 Credenciais default no compose (BAIXO — dev, mas registrar)
`BETTER_AUTH_SECRET: dev-only-troque-em-producao`, `ADMIN_PASSWORD: admin12345` e `minioadmin/minioadmin` têm defaults no `docker-compose.yml`. Está comentado como "troque em produção", mas nada **força** a troca.

**Correção:** no compose de produção, usar `${VAR:?erro}` (sem default) para secret/senhas, falhando o boot se não configurado.

### 2.7 Revogação de sessão demora até 5 min (informativo)
O `cookieCache` de 5 min (documentado em `auth.ts`) significa que revogar acesso/sessão só tem efeito pleno após expirar a cópia assinada. Trade-off consciente; apenas manter em mente quando implementar "desativar usuário".

---

## 3. Problemas de corretude

### 3.1 Import de equipamento colide com nome de outro tipo → 500
`uq_equipment_unit_name` é único por **unidade+nome** (todos os tipos juntos), mas `equipmentStore(type).listByNames` filtra por tipo. Importar uma planilha de EPI com um nome que já existe como "ferramenta" não encontra o existente, tenta `INSERT` e estoura a unique constraint → erro 500 não tratado (e import parcial, ver 3.2). O mesmo vale para `upsertEquipment` criando com nome de outro tipo.

**Correção:** checar o nome contra a unidade inteira (sem filtro de tipo) e devolver `BAD_REQUEST` amigável, ou tratar o conflito no insert.

### 3.2 `importRegisterItems` não é transacional
Cada item do import (até 2000) faz seus próprios INSERTs/UPDATEs + criação de pasta, sem transação. Uma falha no meio (ex.: 3.1) deixa o import **pela metade**, sem relatório do que entrou.

**Correção:** envolver em `db.transaction` (ou por lotes), e/ou acumular erros por linha e devolver um resumo.

### 3.3 Renomear item não renomeia a pasta do item
`upsertRegisterItem` (update) muda o `name` do colaborador/equipamento, mas a pasta em `Lista de <Grupo>/<nome antigo>` permanece com o nome antigo — a convenção pasta↔item quebra silenciosamente (e o auto-vínculo por subárvore continua funcionando por ID, mas a UI mostra pasta com nome divergente). Análogo: trocar o **tipo** do equipamento não move a pasta para a lista do novo tipo.

**Correção:** no update com mudança de nome, renomear a pasta do item (respeitando a unicidade por nível); na troca de tipo, mover a pasta — ou impedir troca de tipo na edição.

### 3.4 Validações de entrada frouxas geram 500 em vez de 400
- `/api/reports/export` não valida `unitId` como UUID; valor malformado chega ao Postgres e vira erro 500 (`invalid input syntax for type uuid`).
- `documentUnlinkSchema` aceita `employeeId` e `equipmentId` ambos nulos; o router então faz `eq(equipmentId, '')` — string vazia em coluna uuid → erro do Postgres.

**Correção:** validar `unitId` com regex/Zod na rota de export; `refine` no schema de unlink exigindo exatamente um dos dois IDs.

### 3.5 Purge de documento fora da transação da autorização
`authorizations.remove` deleta autorização+eventos numa transação e só depois chama `purgeDocuments` (que tem transação própria). Se o purge falhar, o documento PDF fica órfão (sem autorização apontando para ele), visível no PIE. Baixo impacto, mas é uma janela de inconsistência sem retry.

**Correção:** unificar na mesma transação (o purge de objetos S3 continua fora, como já documentado).

---

## 4. Performance

### 4.1 FKs sem índice (o Postgres não indexa FK automaticamente)
As migrations só criam os índices **únicos**. Colunas usadas em praticamente todo JOIN/WHERE não têm índice:

- `folder.unit_id`, `folder.parent_id`
- `document.folder_id`
- `document_version.document_id`
- `membership.user_id` (a PK cobre `unit_id`, não o inverso)
- `diagnostic.adequacy_item_id`, `adequacy_item.unit_id`
- `authorization.unit_id`, `authorization_event.authorization_id`
- `employee.unit_id`, `equipment.unit_id`, `register_document_link.document_id`

Com volume pequeno não dói; com dezenas de unidades e milhares de documentos, cada listagem vira seq scan.

**Correção:** uma migration com `CREATE INDEX` nas FKs quentes (parciais `WHERE deleted_at IS NULL` onde fizer sentido).

### 4.2 `ensureRegisterSkeleton` roda em toda listagem de cadastros
`listEmployees`/`listEquipment` chamam `ensureRegisterSkeleton`, que faz ~2 queries **por pasta do caminho** de cada um dos 5 grupos (≈15–20 queries) a cada listagem, sempre — para cobrir unidades antigas. É custo fixo em toda navegação nos cadastros.

**Correção:** já que a criação de unidade cria o esqueleto, mover o "lazy ensure" para um ponto único (ex.: primeira visita à unidade) ou fazer uma checagem barata (1 query count) antes de reconstruir.

### 4.3 `documentLinks` recarrega a unidade inteira a cada chamada
Para calcular os auto-vínculos, a query carrega **todos** os colaboradores, equipamentos, pastas e documentos da unidade. Correto e claro, mas cresce linearmente; é chamado junto de toda listagem de cadastros.

**Melhoria (quando doer):** materializar o vínculo automático ao subir o documento/criar o item, ou cachear por unidade com invalidação nas mutations.

### 4.4 Sem paginação em nenhuma listagem
Todas as queries de lista (documentos, colaboradores, autorizações, usuários…) trazem tudo. O front também renderiza tudo. Para o porte atual (planilhas de ≤2000 itens) funciona; é o limite de escala mais claro do design.

### 4.5 Loops de query item a item
`ensureFolderStructure` (1–2 queries por nó da estrutura) e o import (INSERT por item) são N+1 controlados. Aceitável hoje; se estruturas/planilhas crescerem, converter para inserts em lote.

---

## 5. Manutenibilidade e código

### 5.1 Páginas monolíticas no front
`pie.tsx` (1.121 linhas), `registros.tsx` (1.075), `autorizacoes.tsx` (718), `relatorios.tsx` (561). O padrão do projeto de extrair componentes (`components/pie/*`, `components/registros/*`) existe, mas essas páginas concentram tabela + diálogos + estado de URL + mutations. Custo crescente para evoluir.

**Melhoria:** extrair os diálogos e a tabela de cada página para `components/<área>/` como já foi feito em partes.

### 5.2 Duplicações pequenas na API
- `htmlToPdf`/`toPdf` (Gotenberg) duplicado em `report-export.ts` e `services/authorizations.ts` (mesma função, nomes diferentes).
- `escapeHtml` duplicado nos mesmos dois arquivos (com sets de caracteres ligeiramente diferentes).
- A checagem de permissão manual em `report-export.ts` reimplementa o `unitAction` (membership + permissions) — inevitável fora do tRPC, mas poderia consumir um helper compartilhado com `trpc.ts`.

**Melhoria:** um `services/pdf.ts` (Gotenberg + escapeHtml) e um helper `checkUnitAction(db, user, unitId, action)` usado pelo middleware e pela rota HTTP.

### 5.3 Import de tipo por caminho relativo profundo
`apps/web/src/lib/trpc.ts` importa `AppRouter` de `'../../../api/src/routers/index'` apesar de `@easynr10/api` ser dependência de workspace. Funciona, mas quebra se a estrutura de pastas mudar.

**Melhoria:** exportar o tipo no `package.json` da API (`exports`) e importar `@easynr10/api`.

### 5.4 Auto-vínculo por nome é frágil por design
`docMatchesField` casa documento↔campo por nome normalizado ("Nome" ou "Nome - item"). Renomear o documento (permitido em `documents.update`) desfaz silenciosamente o auto-vínculo. É decisão herdada do legado (referência por nome) — vale ao menos avisar na UI ao renomear um documento que está servindo de evidência automática.

### 5.5 Lint
1 warning: escape desnecessário em `s3.ts:123` (`[^\w.\-]` → `[^\w.-]`). Trivial.

---

## 6. Funcional / pendências conhecidas

- **E-mail não implementado**: mailpit está no compose e `MAIL_*` são passadas à API, mas `env.ts` nem as lê — notificações de vencimento (RNF) e verificação de e-mail (o `changeEmail` troca sem confirmar, comentado em `auth.ts`) estão pendentes.
- **`unit.emailConfig`** existe no schema mas nada consome.
- **Testes do front**: só 2 arquivos utilitários (`sortable`, `expiry-filter`) — coerente com a decisão de validar UI manualmente, registrado apenas para completude.
- **Tabelas legadas** (`register_group`, `register_item`, `register_folder` das migrations 0000/0006) parecem substituídas pelo design atual — se não têm dados em produção, uma migration de limpeza evita confusão futura.

---

## 7. Priorização sugerida

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 1 | `disableSignUp` no better-auth (2.1) | Baixo | Alto |
| 2 | Validar tenant em `linkDocument`/`unlinkDocument` (2.2) | Baixo | Alto |
| 3 | Índices nas FKs quentes (4.1) | Baixo | Médio/Alto |
| 4 | `NODE_ENV=production` + rate limit (2.3) | Baixo | Médio |
| 5 | Conflito de nome entre tipos no import/upsert de equipamento (3.1) + transação no import (3.2) | Médio | Médio |
| 6 | Validações 400-em-vez-de-500 (3.4) e CSV injection (2.5) | Baixo | Baixo/Médio |
| 7 | Renomear pasta junto com o item (3.3) | Médio | Médio |
| 8 | Unificar Gotenberg/escapeHtml + helper de permissão HTTP (5.2) | Baixo | Baixo |
| 9 | Quebrar `pie.tsx`/`registros.tsx` em componentes (5.1) | Médio | Médio (longo prazo) |
| 10 | Paginação nas listagens (4.4) | Alto | Quando o volume exigir |

---

## 8. Status da aplicação (09/07/2026)

Aplicado nesta rodada (typecheck + lint limpos, 124 testes passando, +5 novos, stack rebuildada e migration 0019 aplicada):

- **2.1** Auto-registro público bloqueado no nível do Hono (`/api/auth/sign-up*` → 403). Optou-se por isso em vez de `disableSignUp` porque este último também barraria a criação server-side (`auth.api.signUpEmail`) usada pelo admin. Verificado por smoke test (403 no signup, 401 no login com credencial falsa).
- **2.2** `linkDocument`/`unlinkDocument` agora validam que os itens são da unidade (helper `assertItemsInUnit`); testes de isolamento cobrindo os dois.
- **2.3** Rate limit do better-auth ligado explicitamente (`enabled: true`, login mais estrito), independente de `NODE_ENV`.
- **2.5** CSV injection neutralizado (`neutralizeFormula`).
- **3.1 / 3.2** Conflito de nome entre tipos de equipamento vira `CONFLICT` amigável (pré-checagem no import + tradução de violação única no upsert); import agora é transacional.
- **3.3** Renomear item renomeia a pasta dele no PIE (`renameItemFolder`).
- **3.4** `unitId` validado como UUID no export; `documentUnlinkSchema` exige exatamente um alvo.
- **3.5** Exclusão de autorização + purge do PDF numa única transação (`purgeDocumentsTx`).
- **4.1** Migration 0019 com 14 índices nas FKs quentes.
- **5.2** `services/pdf.ts` unifica Gotenberg + `escapeHtml`. **5.5** warning do oxlint corrigido.

Deferido de propósito:

- **NODE_ENV=production no compose (2.3/2.6)**: neste compose de demo (http://localhost) o path de nomeação de cookie do better-auth usa `isProduction` para o prefixo `__Secure-`, o que quebraria o login sem HTTPS. Pertence a um compose de produção atrás de TLS, não a este. O rate limit — a real preocupação — já foi ligado sem depender disso. Os defaults de credenciais do compose local são intencionais.
- **5.1 (quebrar páginas de 1.000+ linhas)** e **4.4 (paginação)**: refactors grandes, melhor tratar isoladamente.
- **Seção 6 (e-mail/notificações)**: funcionalidade não implementada, fora do escopo de "corrigir".
- **Correção do relatório:** as tabelas legadas (`register_group`/`register_item`/`register_folder`) mencionadas em 6 **já haviam sido removidas** nas migrations 0005/0007 — não há limpeza pendente.

## 9. Conclusão

A base é sólida: arquitetura de permissões exemplar, isolamento de tenant pensado desde o início (com as duas exceções pontuais do item 2.2), infra reproduzível e suíte de testes de API real. Os achados de maior gravidade são **configuração** (signup aberto, rate limit desligado) e **duas validações de tenant faltando** — todos de correção barata. O restante é robustez de borda (imports, validações) e preparação para escala (índices, paginação), que podem ser tratados conforme o produto crescer.
