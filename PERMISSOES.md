# Matriz de permissões da API

> Gerado por `bun run permissions` a partir dos metadados dos procedure
> builders (`apps/api/src/trpc.ts`). Não editar à mão.

| Permissão | Significado |
|---|---|
| 🌐 `publica` | Sem sessão |
| 🔑 `autenticado` | Qualquer usuário logado |
| 🛡️ `admin` | Somente consultores PSO (role admin) |
| 🏭 `membro-da-unidade` | Admin OU membro da unidade do `unitId` (isolamento de tenant) |

## Procedures tRPC

| Procedure | Tipo | Permissão | Ação do papel |
|---|---|---|---|
| `adequacy.actionItems` | query | 🏭 `membro-da-unidade` | `plano.ler` |
| `adequacy.addRequirement` | mutation | 🏭 `membro-da-unidade` | `diagnostico.requisitos` |
| `adequacy.counts` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.diagnose` | mutation | 🏭 `membro-da-unidade` | `diagnostico.avaliar` |
| `adequacy.diagnosticEvidences` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.expandGroupRequirement` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.generate` | mutation | 🏭 `membro-da-unidade` | `diagnostico.gerar` |
| `adequacy.history` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.itemDetail` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.list` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.removeAllRequirements` | mutation | 🏭 `membro-da-unidade` | `diagnostico.requisitos` |
| `adequacy.removeRequirement` | mutation | 🏭 `membro-da-unidade` | `diagnostico.requisitos` |
| `adequacy.requirements` | query | 🏭 `membro-da-unidade` | `diagnostico.ler` |
| `adequacy.setActionStatus` | mutation | 🏭 `membro-da-unidade` | `plano.status` |
| `adequacy.setActive` | mutation | 🏭 `membro-da-unidade` | `diagnostico.configurar` |
| `adequacy.updateItem` | mutation | 🏭 `membro-da-unidade` | `diagnostico.configurar` |
| `companies.byId` | query | 🔑 `autenticado` | — |
| `companies.create` | mutation | 🛡️ `admin` | — |
| `companies.list` | query | 🔑 `autenticado` | — |
| `companies.remove` | mutation | 🛡️ `admin` | — |
| `companies.update` | mutation | 🛡️ `admin` | — |
| `defaultDocuments.list` | query | 🔑 `autenticado` | — |
| `documents.confirmNewVersion` | mutation | 🏭 `membro-da-unidade` | `pie.documento.enviar` |
| `documents.confirmUpload` | mutation | 🏭 `membro-da-unidade` | `pie.documento.enviar` |
| `documents.createUploadUrl` | mutation | 🏭 `membro-da-unidade` | `pie.documento.enviar` |
| `documents.downloadUrl` | mutation | 🏭 `membro-da-unidade` | `pie.ler` |
| `documents.listByFolder` | query | 🏭 `membro-da-unidade` | `pie.ler` |
| `documents.listBySubtree` | query | 🏭 `membro-da-unidade` | `pie.ler` |
| `documents.previewUrl` | mutation | 🏭 `membro-da-unidade` | `pie.ler` |
| `documents.remove` | mutation | 🏭 `membro-da-unidade` | `pie.documento.excluir` |
| `documents.restoreVersion` | mutation | 🏭 `membro-da-unidade` | `pie.documento.restaurar` |
| `documents.update` | mutation | 🏭 `membro-da-unidade` | `pie.documento.editar` |
| `documents.versions` | query | 🏭 `membro-da-unidade` | `pie.ler` |
| `folders.create` | mutation | 🏭 `membro-da-unidade` | `pie.pasta.criar` |
| `folders.list` | query | 🏭 `membro-da-unidade` | `pie.ler` |
| `folders.remove` | mutation | 🏭 `membro-da-unidade` | `pie.pasta.excluir` |
| `folders.rename` | mutation | 🏭 `membro-da-unidade` | `pie.pasta.renomear` |
| `folderSchemas.applyToUnit` | mutation | 🏭 `membro-da-unidade` | `pie.estruturas.gerenciar` |
| `folderSchemas.create` | mutation | 🏭 `membro-da-unidade` | `pie.estruturas.gerenciar` |
| `folderSchemas.listByUnit` | query | 🏭 `membro-da-unidade` | `pie.ler` |
| `folderSchemas.remove` | mutation | 🏭 `membro-da-unidade` | `pie.estruturas.gerenciar` |
| `folderSchemas.update` | mutation | 🏭 `membro-da-unidade` | `pie.estruturas.gerenciar` |
| `registers.addCustomField` | mutation | 🏭 `membro-da-unidade` | `cadastros.campos` |
| `registers.documentLinks` | query | 🏭 `membro-da-unidade` | `cadastros.ler` |
| `registers.importEmployees` | mutation | 🏭 `membro-da-unidade` | `cadastros.importar` |
| `registers.importEquipment` | mutation | 🏭 `membro-da-unidade` | `cadastros.importar` |
| `registers.linkDocument` | mutation | 🏭 `membro-da-unidade` | `cadastros.vinculos` |
| `registers.listCustomFields` | query | 🏭 `membro-da-unidade` | `cadastros.ler` |
| `registers.listEmployees` | query | 🏭 `membro-da-unidade` | `cadastros.ler` |
| `registers.listEquipment` | query | 🏭 `membro-da-unidade` | `cadastros.ler` |
| `registers.removeCustomField` | mutation | 🏭 `membro-da-unidade` | `cadastros.campos` |
| `registers.removeEmployee` | mutation | 🏭 `membro-da-unidade` | `cadastros.itens` |
| `registers.removeEquipment` | mutation | 🏭 `membro-da-unidade` | `cadastros.itens` |
| `registers.setTargetSetting` | mutation | 🏭 `membro-da-unidade` | `cadastros.config` |
| `registers.targetSettings` | query | 🏭 `membro-da-unidade` | `cadastros.ler` |
| `registers.unlinkDocument` | mutation | 🏭 `membro-da-unidade` | `cadastros.vinculos` |
| `registers.upsertEmployee` | mutation | 🏭 `membro-da-unidade` | `cadastros.itens` |
| `registers.upsertEquipment` | mutation | 🏭 `membro-da-unidade` | `cadastros.itens` |
| `reports.actionPlan` | query | 🏭 `membro-da-unidade` | `relatorios.ler` |
| `reports.companyOverview` | query | 🔑 `autenticado` | — |
| `reports.documentsSituation` | query | 🏭 `membro-da-unidade` | `relatorios.ler` |
| `reports.nonConformities` | query | 🏭 `membro-da-unidade` | `relatorios.ler` |
| `reports.overview` | query | 🏭 `membro-da-unidade` | `painel.ler` |
| `reports.timeline` | query | 🏭 `membro-da-unidade` | `painel.ler` |
| `units.byId` | query | 🏭 `membro-da-unidade` | — |
| `units.create` | mutation | 🛡️ `admin` | — |
| `units.listByCompany` | query | 🔑 `autenticado` | — |
| `units.myPermissions` | query | 🏭 `membro-da-unidade` | — |
| `units.remove` | mutation | 🛡️ `admin` | — |
| `units.update` | mutation | 🛡️ `admin` | — |
| `users.accessTree` | query | 🛡️ `admin` | — |
| `users.create` | mutation | 🛡️ `admin` | — |
| `users.createForCompany` | mutation | 🛡️ `admin` | — |
| `users.createRole` | mutation | 🛡️ `admin` | — |
| `users.grant` | mutation | 🛡️ `admin` | — |
| `users.list` | query | 🛡️ `admin` | — |
| `users.listByCompany` | query | 🛡️ `admin` | — |
| `users.memberships` | query | 🛡️ `admin` | — |
| `users.permissionCatalog` | query | 🛡️ `admin` | — |
| `users.removeRole` | mutation | 🛡️ `admin` | — |
| `users.revoke` | mutation | 🛡️ `admin` | — |
| `users.roles` | query | 🛡️ `admin` | — |
| `users.updateRole` | mutation | 🛡️ `admin` | — |

## Rotas HTTP

| Rota | Tipo | Permissão |
|---|---|---|
| `GET/POST /api/auth/*` | http | 🌐 `publica` |
| `GET /api/reports/export` | http | 🏭 `membro-da-unidade` |
| `GET /health` | http | 🌐 `publica` |
