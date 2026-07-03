import { z } from 'zod';
import {
  actionStatuses,
  diagnosticStatuses,
  documentGroups,
  equipmentTypes,
  groupKinds,
  memberRoles,
  requirementTypes,
} from './enums';

// Schemas de entrada compartilhados entre web (formulários) e api (procedures).

export const companyCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyUpdateSchema = companyCreateSchema.partial().extend({
  id: z.uuid(),
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
});
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;

export const membershipSetSchema = z.object({
  unitId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(memberRoles),
});
export type MembershipSetInput = z.infer<typeof membershipSetSchema>;

// — PIE (F2) —

export interface FolderSchemaNodeInput {
  name: string;
  children?: FolderSchemaNodeInput[];
}
export const folderSchemaNodeSchema: z.ZodType<FolderSchemaNodeInput> = z.lazy(() =>
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
});
export type DocumentConfirmInput = z.infer<typeof documentConfirmSchema>;

export const documentUpdateSchema = z.object({
  unitId: z.uuid(),
  documentId: z.uuid(),
  name: z.string().trim().min(1).max(255).optional(),
  expiresAt: z.iso.date().nullable().optional(),
  warnDaysBefore: z.number().int().positive().nullable().optional(),
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
export type DocumentVersionConfirmInput = z.infer<typeof documentVersionConfirmSchema>;

// — Avaliação da Conformidade (F3) —

// Evidência enviada no diagnóstico: snapshot do requisito (type/question)
// com os itens de prova (projeto.md §7.6).
export const evidenceInputSchema = z.object({
  type: z.enum(requirementTypes),
  question: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(512),
        answer: z.string().trim().nullish(),
        documentId: z.uuid().nullish(),
        registerItemId: z.uuid().nullish(),
      }),
    )
    .min(1),
});
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

export const diagnosticCreateSchema = z.object({
  unitId: z.uuid(),
  adequacyItemId: z.uuid(),
  status: z.enum(diagnosticStatuses),
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

// Requisito tipo group exige grupo de cadastro e documento padrão (legado).
export const requirementCreateSchema = z
  .object({
    unitId: z.uuid(),
    adequacyItemId: z.uuid(),
    type: z.enum(requirementTypes),
    question: z.string().trim().min(1),
    registerGroupId: z.uuid().nullish(),
    defaultDocumentId: z.uuid().nullish(),
  })
  .refine((value) => value.type !== 'group' || (value.registerGroupId && value.defaultDocumentId), {
    message: 'Requisito de grupo exige grupo de cadastro e documento padrão',
  });
export type RequirementCreateInput = z.infer<typeof requirementCreateSchema>;

export const actionItemStatusSchema = z.object({
  unitId: z.uuid(),
  actionItemId: z.uuid(),
  status: z.enum(actionStatuses),
});
export type ActionItemStatusInput = z.infer<typeof actionItemStatusSchema>;

export const registerGroupCreateSchema = z.object({
  unitId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  kind: z.enum(groupKinds).default('custom'),
});
export type RegisterGroupCreateInput = z.infer<typeof registerGroupCreateSchema>;

export const equipmentCreateSchema = z.object({
  unitId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  type: z.enum(equipmentTypes),
});
export type EquipmentCreateInput = z.infer<typeof equipmentCreateSchema>;

export const employeeCreateSchema = z.object({
  unitId: z.uuid(),
  name: z.string().trim().min(1).max(255),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
