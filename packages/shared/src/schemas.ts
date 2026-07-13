import { z } from "zod";
import {
  actionStatuses,
  diagnosticStatuses,
  documentGroups,
  equipmentTypes,
  registerTargets,
  requirementTypes,
} from "./enums";

// Schemas de entrada compartilhados entre web (formulários) e api (procedures).

export const companyCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyUpdateSchema = companyCreateSchema.partial().extend({
  id: z.uuid(),
  // Key do objeto no S3 (retornada pelo logoUploadUrl); null remove o logo.
  logoKey: z.string().max(512).nullable().optional(),
});
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export const unitCreateSchema = z.object({
  companyId: z.uuid(),
  name: z.string().trim().min(2).max(255),
});
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;

export const unitUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(255).optional(),
  logoKey: z.string().max(512).nullable().optional(),
});
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;

// — PIE (F2) —

export interface FolderSchemaNodeInput {
  name: string;
  children?: FolderSchemaNodeInput[];
}
export const folderSchemaNodeSchema: z.ZodType<FolderSchemaNodeInput> = z.lazy(
  () =>
    z.object({
      name: z.string().trim().min(1).max(255),
      children: z.array(folderSchemaNodeSchema).optional(),
    }),
);

export const folderSchemaCreateSchema = z.object({
  unitId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  structure: z.array(folderSchemaNodeSchema).min(1),
});
export type FolderSchemaCreateInput = z.infer<typeof folderSchemaCreateSchema>;

export const folderSchemaUpdateSchema = z.object({
  unitId: z.uuid(),
  schemaId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  structure: z.array(folderSchemaNodeSchema).min(1),
});
export type FolderSchemaUpdateInput = z.infer<typeof folderSchemaUpdateSchema>;

export const folderSchemaApplySchema = z.object({
  unitId: z.uuid(),
  schemaId: z.uuid(),
  // Pasta onde a estrutura será gerada (nulo = raiz do prontuário).
  parentId: z.uuid().nullable(),
});
export type FolderSchemaApplyInput = z.infer<typeof folderSchemaApplySchema>;

export const folderCreateSchema = z.object({
  unitId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(255),
});
export type FolderCreateInput = z.infer<typeof folderCreateSchema>;

export const uploadRequestSchema = z.object({
  unitId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(255),
});
export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;

export const documentConfirmSchema = z.object({
  unitId: z.uuid(),
  folderId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  storageKey: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
  expiresAt: z.iso.date().nullish(),
  warnDaysBefore: z.number().int().positive().nullish(),
  // Grupo herdado do documento padrão selecionado (referência por nome, como no legado).
  documentGroup: z.enum(documentGroups).nullish(),
  // Aderência opcional do documento (nota que propaga para vínculos/evidências).
  adherence: z.enum(diagnosticStatuses).nullish(),
});
export type DocumentConfirmInput = z.infer<typeof documentConfirmSchema>;

export const documentUpdateSchema = z.object({
  unitId: z.uuid(),
  documentId: z.uuid(),
  name: z.string().trim().min(1).max(255).optional(),
  expiresAt: z.iso.date().nullable().optional(),
  warnDaysBefore: z.number().int().positive().nullable().optional(),
  adherence: z.enum(diagnosticStatuses).nullable().optional(),
});
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;

export const folderRenameSchema = z.object({
  unitId: z.uuid(),
  folderId: z.uuid(),
  name: z.string().trim().min(1).max(255),
});
export type FolderRenameInput = z.infer<typeof folderRenameSchema>;

export const documentVersionConfirmSchema = z.object({
  unitId: z.uuid(),
  documentId: z.uuid(),
  storageKey: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
});
export type DocumentVersionConfirmInput = z.infer<
  typeof documentVersionConfirmSchema
>;

// — Avaliação da Conformidade (F3) —

// Evidência enviada no diagnóstico: snapshot do requisito (type/question)
// com os itens de prova (projeto.md §7.6).
export const evidenceInputSchema = z.object({
  type: z.enum(requirementTypes),
  question: z.string().trim().min(1),
  // Coluna do cadastro (só nas evidências tipo cadastro) — permite propagar a
  // nota de cada item de volta ao vínculo do cadastro ao salvar.
  fieldKey: z.string().trim().max(120).nullish(),
  // Nota da evidência (document/opinion). Em cadastro a nota vem dos itens.
  adherence: z.enum(diagnosticStatuses).nullish(),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(512),
        answer: z.string().trim().nullish(),
        documentId: z.uuid().nullish(),
        employeeId: z.uuid().nullish(),
        equipmentId: z.uuid().nullish(),
        // Nota do item (usada nos itens de cadastro).
        adherence: z.enum(diagnosticStatuses).nullish(),
      }),
    )
    .min(1),
});
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

// A aderência do item NÃO é mais escolhida à mão: é calculada pela média das
// notas das evidências (peso 1 cada). O status/score são derivados no servidor.
export const diagnosticCreateSchema = z.object({
  unitId: z.uuid(),
  adequacyItemId: z.uuid(),
  deadline: z.iso.date().nullish(),
  responsible: z.string().trim().max(255).nullish(),
  recommendedAction: z.string().trim().nullish(),
  technicalOpinion: z.string().trim().nullish(),
  evidences: z.array(evidenceInputSchema).optional(),
});
export type DiagnosticCreateInput = z.infer<typeof diagnosticCreateSchema>;

export const adequacyItemUpdateSchema = z.object({
  unitId: z.uuid(),
  adequacyItemId: z.uuid(),
  isActive: z.boolean(),
  orientation: z.string().trim().nullish(),
});
export type AdequacyItemUpdateInput = z.infer<typeof adequacyItemUpdateSchema>;

// Requisito tipo cadastro aponta para um dos 5 cadastros (colaboradores/tipo de
// equipamento) e uma coluna de documento vinculado (fieldKey). No diagnóstico
// expande na lista de itens do cadastro com os documentos e notas vinculados.
export const requirementCreateSchema = z
  .object({
    unitId: z.uuid(),
    adequacyItemId: z.uuid(),
    type: z.enum(requirementTypes),
    question: z.string().trim().min(1),
    targetGroup: z.enum(registerTargets).nullish(),
    fieldKey: z.string().trim().max(120).nullish(),
  })
  .refine(
    (value) =>
      value.type !== "cadastro" || (value.targetGroup && value.fieldKey),
    {
      message: "Requisito de cadastro exige o cadastro alvo e a coluna de documento",
    },
  );
export type RequirementCreateInput = z.infer<typeof requirementCreateSchema>;

export const actionItemStatusSchema = z.object({
  unitId: z.uuid(),
  actionItemId: z.uuid(),
  status: z.enum(actionStatuses),
});
export type ActionItemStatusInput = z.infer<typeof actionItemStatusSchema>;

// — Cadastros (Colaboradores/Equipamentos) —
// metadata carrega os valores dos campos default do sistema + campos
// personalizados da unidade (chave → valor texto). A pasta do item no PIE é
// criada AUTOMATICAMENTE sob a pasta do grupo; folderSchemaId (opcional, só
// na criação) gera uma estrutura de pastas dentro da pasta do item.

const registerMetadataSchema = z.record(z.string(), z.string().trim().max(512));

export const employeeUpsertSchema = z.object({
  unitId: z.uuid(),
  employeeId: z.uuid().optional(),
  name: z.string().trim().min(1).max(255),
  metadata: registerMetadataSchema.default({}),
  folderSchemaId: z.uuid().nullish(),
});
export type EmployeeUpsertInput = z.infer<typeof employeeUpsertSchema>;

export const equipmentUpsertSchema = z.object({
  unitId: z.uuid(),
  equipmentId: z.uuid().optional(),
  name: z.string().trim().min(1).max(255),
  type: z.enum(equipmentTypes),
  metadata: registerMetadataSchema.default({}),
  folderSchemaId: z.uuid().nullish(),
});
export type EquipmentUpsertInput = z.infer<typeof equipmentUpsertSchema>;

export const customFieldCreateSchema = z.object({
  unitId: z.uuid(),
  target: z.enum(registerTargets),
  name: z.string().trim().min(1).max(120),
});
export type CustomFieldCreateInput = z.infer<typeof customFieldCreateSchema>;

// Vincula um documento do PIE a um campo kind=document de N itens de uma vez
// (ex.: um Certificado de Aprovação para várias EPIs).
export const documentLinkSchema = z
  .object({
    unitId: z.uuid(),
    fieldKey: z.string().trim().min(1).max(120),
    documentId: z.uuid(),
    employeeIds: z.array(z.uuid()).default([]),
    equipmentIds: z.array(z.uuid()).default([]),
    // Nota POR item (id do item → nota). Item ausente do mapa ⇒ o servidor
    // copia a aderência do documento como default.
    adherences: z.record(z.uuid(), z.enum(diagnosticStatuses).nullable()).optional(),
  })
  .refine((value) => value.employeeIds.length + value.equipmentIds.length > 0, {
    message: "Selecione ao menos um item para vincular",
  });
export type DocumentLinkInput = z.infer<typeof documentLinkSchema>;

// Edita a nota de um vínculo já existente (uma linha item+campo).
export const documentLinkAdherenceSchema = z
  .object({
    unitId: z.uuid(),
    fieldKey: z.string().trim().min(1).max(120),
    employeeId: z.uuid().nullish(),
    equipmentId: z.uuid().nullish(),
    adherence: z.enum(diagnosticStatuses).nullable(),
  })
  .refine((value) => Boolean(value.employeeId) !== Boolean(value.equipmentId), {
    message: "Informe um colaborador OU um equipamento",
  });
export type DocumentLinkAdherenceInput = z.infer<typeof documentLinkAdherenceSchema>;

export const documentUnlinkSchema = z
  .object({
    unitId: z.uuid(),
    fieldKey: z.string().trim().min(1).max(120),
    employeeId: z.uuid().nullish(),
    equipmentId: z.uuid().nullish(),
  })
  // Exatamente um alvo: sem isso o router cairia em eq(equipmentId, '') e o
  // Postgres estouraria (string vazia em coluna uuid).
  .refine((value) => Boolean(value.employeeId) !== Boolean(value.equipmentId), {
    message: "Informe um colaborador OU um equipamento",
  });
export type DocumentUnlinkInput = z.infer<typeof documentUnlinkSchema>;

// Importação por planilha (linhas já mapeadas no cliente via de-para).
const importItemSchema = z.object({
  name: z.string().trim().min(1).max(255),
  metadata: registerMetadataSchema.default({}),
});
export const employeeImportSchema = z.object({
  unitId: z.uuid(),
  items: z.array(importItemSchema).min(1).max(2000),
});
export type EmployeeImportInput = z.infer<typeof employeeImportSchema>;

export const equipmentImportSchema = z.object({
  unitId: z.uuid(),
  type: z.enum(equipmentTypes),
  items: z.array(importItemSchema).min(1).max(2000),
});
export type EquipmentImportInput = z.infer<typeof equipmentImportSchema>;

// — Autorizações —

// Conteúdo por tipo: união discriminada casada com AuthorizationDetails.
export const workPermitDetailsSchema = z.object({
  atividades: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
  local: z.string().trim().max(255).optional(),
  validade: z.iso.date().optional(),
});

export const epiSheetDetailsSchema = z.object({
  epis: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(255),
        ca: z.string().trim().max(60).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const authorizationCreateSchema = z.discriminatedUnion("type", [
  z.object({
    unitId: z.uuid(),
    employeeId: z.uuid(),
    type: z.literal("permissao_trabalho"),
    details: workPermitDetailsSchema,
  }),
  z.object({
    unitId: z.uuid(),
    employeeId: z.uuid(),
    type: z.literal("ficha_epi"),
    details: epiSheetDetailsSchema,
  }),
]);
export type AuthorizationCreateInput = z.infer<typeof authorizationCreateSchema>;

// Assinatura desenhada no canvas (PNG pequeno embutido no PDF).
export const signatureDataUrlSchema = z
  .string()
  .startsWith("data:image/png;base64,")
  .max(300_000, "Assinatura muito grande — limpe e assine novamente");

// Catálogo de atividades da unidade (RF: checklist da Autorização de
// Trabalho) — mesmo id em create/update para reaproveitar um único diálogo.
export const activityUpsertSchema = z.object({
  unitId: z.uuid(),
  activityId: z.uuid().optional(),
  name: z.string().trim().min(1).max(255),
});
export type ActivityUpsertInput = z.infer<typeof activityUpsertSchema>;
