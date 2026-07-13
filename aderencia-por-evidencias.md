# Aderência por evidências — spec da mudança

**Início:** 10/07/2026 · **Motivação:** a aderência do item da norma deixa de ser um
status escolhido à mão e passa a ser **calculada pela média das notas das evidências**.

## Decisões (confirmadas com o usuário)

1. **Escala única de 5 níveis** para toda "aderência/nota" (documento, vínculo no
   cadastro, evidência): reaproveita `diagnosticStatuses`
   (Inexistente/Inadequada/Parcial/Suficiente/Plena = 0/25/50/75/100%).
2. **Item de cadastro sem documento/nota conta como Inexistente (0)** e entra na média.
3. **Status manual do item é removido** — a aderência do item passa a ser 100% calculada.
4. **Aderência do documento fica no `document`** (um valor editável, não por versão).

## Regra de cálculo

- Cada **evidência tem peso 1**.
- Evidência tipo **documento** ou **opinion**: nota = sua aderência (null ⇒ Inexistente=0).
- Evidência tipo **cadastro** (com N itens): nota = média das aderências dos N itens
  (item sem nota ⇒ 0). Cada item pesa 1/N dentro da evidência.
- **Nota do item** = média simples das notas das evidências (0..1).
- `diagnostic.score` = round(média × 100) (0..100). `diagnostic.status` = `adherenceBand(score).status`
  (derivado, para compatibilidade com prioridade de ação, distribuição e labels).

Helpers puros em `packages/shared/src/enums.ts` (reusados por API e preview no web):
`evidenceAdherenceScore`, `diagnosticAdherenceScore`, `scoreToStatus`.

## Requisito tipo `cadastro` (substitui `group`)

- `requirementTypes`: `group` → `cadastro`.
- `adequacy_item_requirement`: **remove** `default_document_id`; **adiciona** `field_key`
  (a coluna de documento do cadastro, ex.: `ca`, `treinamento_nr10_basico`). Mantém `target_group`.
- No diagnóstico, expande para os itens do cadastro-alvo; para cada item busca o
  `register_document_link` de (item, field_key) e usa sua aderência como nota default.

## Mudanças de schema (packages/db)

- `document.adherence` — `diagnostic_status` (nullable).
- `register_document_link.adherence` — `diagnostic_status` (nullable; default = a do doc no vínculo).
- `adequacy_item_requirement`: drop `default_document_id`, add `field_key varchar(120)`.
- `evidence.adherence` — `diagnostic_status` (nullable) — para document/opinion.
- `evidence_item.adherence` — `diagnostic_status` (nullable) — para itens de cadastro.
- `diagnostic.score integer` (0..100); `status` continua NOT NULL (derivado).
- **Reset:** apaga diagnósticos/evidências/ações existentes (dev; status antigo era manual).
- Enum: `ALTER TYPE requirement_type RENAME VALUE 'group' TO 'cadastro'` (à mão na migration).

## Camadas / progresso

- [x] **1. Fundação** — shared (enums+schemas) + db schema + migration 0020 (validada em tx no banco real).
- [x] **2. API** — documents (upload/update adherence), registers (link adherence +
      `setLinkAdherence`, adherence em documentLinks), adequacy/requirements (cadastro+field_key,
      `expandCadastroRequirement`), adequacy/diagnostics (computa score/status pelas evidências),
      reports (`weightedAdherencePercent` usa score, com fallback a status). Testes migrados
      (121 pass; 3 falhas pré-existentes são Gotenberg/PDF, ambientais).
- [x] **3. Web** — `AdherencePicker` (chips de 5 níveis) reusável; upload-document-dialog
      (nota opcional); registros link dialog + bolinha de nota no chip; diagnostico-item
      (requisito cadastro: alvo + coluna via defaultRegisterFields); assessment-dialog
      reescrito (auto-expande cadastro, nota por evidência/item, preview do score/status
      calculado, histórico mostra nota). `listBySubtree` passou a trazer adherence.
- [x] **5. Cadastros — ficha, foto e média** (migration 0021):
      - Nota do vínculo é **por item**, escolhida no modal (select ao lado de cada item marcado);
        default = aderência do documento. `documentLinkSchema.adherences` (mapa id→nota).
      - **Ficha do item** (clique no nome): `ItemSheetDialog` — foto, dados das colunas,
        documentos vinculados com notas, aderência média, link p/ pasta.
      - **Foto opcional** por item: `employee/equipment.photo_key`; router `photoUploadUrl` /
        `setItemPhoto` / `itemPhotoUrl` (mesmo padrão do logo da empresa). Editor faz
        upload→setItemPhoto no save.
      - **Coluna "Aderência"** na tabela = média das notas dos documentos vinculados do item.
- [x] **4. Validação** — typecheck (4 workspaces) + lint limpos; 121 testes passam
      (3 falhas Gotenberg/PDF ambientais); stack rebuildada, migration 0020 aplicada no
      boot (schema conferido: diagnostic.score, enum document/opinion/cadastro).
- [x] **6. Write-back + fronteiras de módulo** (sem migration):
      - Salvar diagnóstico **propaga as notas** de volta: evidência de documento →
        `document.adherence` (P.I.E); item de cadastro → `register_document_link.adherence`,
        com **upsert** na semântica do linkDocument (item sem vínculo explícito ganha o
        vínculo com o documento escolhido; documento diferente substitui). `fieldKey` entrou
        no `evidenceInputSchema`.
      - **`services/adherence.ts`**: operações de fronteira (`setDocumentsAdherence`,
        `upsertRegisterLinksAdherence`) + `propagateEvidenceAdherence` (mapa de propagadores
        por tipo de evidência — OCP). Router de um módulo não escreve mais em tabela alheia;
        `registers.setLinkAdherence` delega ao serviço.
      - **`services/register-links.ts`**: `resolveRegisterDocumentLinks` — resolvedor único
        (explícitos + auto-vínculo) usado por `registers.documentLinks` E
        `expandCadastroRequirement`; corrige a divergência em que o auto-vínculo aparecia
        no cadastro mas não na expansão da evidência.
      - Testes: 127 pass (2 novos — auto-vínculo na expansão; criação/troca do vínculo no
        write-back). Front já invalidava `registers.documentLinks` após o diagnose.

## Arquivos-chave

- shared: `enums.ts`, `schemas.ts`
- db: `schema/{pie,registers,norms,diagnostics}.ts` + `migrations/`
- api: `routers/documents.ts`, `routers/registers.ts`, `routers/adequacy/{requirements,diagnostics}.ts`,
  `routers/reports.ts`, `services/reports.ts`, `services/adherence.ts`, `services/register-links.ts`
- web: `components/pie/upload-document-dialog.tsx`, `pages/registros.tsx`,
  `pages/diagnostico-item.tsx`, `components/diagnostico/assessment-dialog.tsx`
