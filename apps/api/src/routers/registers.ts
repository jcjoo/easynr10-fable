import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import {
  customFieldCreateSchema,
  documentLinkSchema,
  documentUnlinkSchema,
  employeeImportSchema,
  employeeUpsertSchema,
  equipmentImportSchema,
  equipmentUpsertSchema,
  registerBasePath,
  registerTargets,
  type RegisterTarget,
} from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { router, unitAction } from '../trpc';
import { ensureFolderStructure, findUnitSchemaOrThrow } from './folder-schemas';

const {
  customField,
  document,
  employee,
  equipment,
  folder,
  registerDocumentLink,
  registerTargetSetting,
} = schema;

// Cadastros da unidade: Colaboradores e Equipamentos (RF18). A estrutura de
// pastas no PIE é FIXA e criada sob demanda:
//   Colaboradores/Lista de Colaboradores/[nome]/[estrutura opcional]
//   Equipamentos/<Tipo>/Lista de <Tipo>/[nome]/[estrutura opcional]

async function findOrCreateChild(unitId: string, parentId: string | null, name: string) {
  const existing = await db.query.folder.findFirst({
    where: and(
      eq(folder.unitId, unitId),
      parentId === null ? isNull(folder.parentId) : eq(folder.parentId, parentId),
      eq(folder.name, name),
      isNull(folder.deletedAt),
    ),
  });
  if (existing) return existing.id;
  const [created] = await db.insert(folder).values({ unitId, parentId, name }).returning();
  return created!.id;
}

async function ensureGroupPath(unitId: string, target: RegisterTarget) {
  let parentId: string | null = null;
  for (const name of registerBasePath[target]) {
    parentId = await findOrCreateChild(unitId, parentId, name);
  }
  return parentId!;
}

// Esqueleto completo dos cadastros (todas as listas de todos os grupos).
// Chamado na criação da unidade e lazy nas listagens (unidades antigas).
export async function ensureRegisterSkeleton(unitId: string) {
  for (const target of registerTargets) {
    await ensureGroupPath(unitId, target);
  }
}

// Pasta do item dentro da lista do grupo + estrutura opcional dentro dela.
async function createItemFolder(
  unitId: string,
  target: RegisterTarget,
  itemName: string,
  folderSchemaId?: string | null,
) {
  const baseId = await ensureGroupPath(unitId, target);
  const itemFolderId = await findOrCreateChild(unitId, baseId, itemName);
  if (folderSchemaId) {
    const selected = await findUnitSchemaOrThrow(unitId, folderSchemaId);
    await ensureFolderStructure(unitId, selected.structure, itemFolderId, selected.id);
  }
  return itemFolderId;
}

export const registersRouter = router({

  // — Colaboradores —

  listEmployees: unitAction('cadastros.ler').query(async ({ input }) => {
    await ensureRegisterSkeleton(input.unitId);
    return db
      .select({
        id: employee.id,
        name: employee.name,
        folderId: employee.folderId,
        folderName: folder.name,
        metadata: employee.metadata,
        createdAt: employee.createdAt,
      })
      .from(employee)
      .leftJoin(folder, eq(employee.folderId, folder.id))
      .where(and(eq(employee.unitId, input.unitId), isNull(employee.deletedAt)))
      .orderBy(asc(employee.name));
  }),

  upsertEmployee: unitAction('cadastros.itens').input(employeeUpsertSchema).mutation(async ({ input }) => {
    if (input.employeeId) {
      const [updated] = await db
        .update(employee)
        .set({ name: input.name, metadata: input.metadata })
        .where(
          and(
            eq(employee.id, input.employeeId),
            eq(employee.unitId, input.unitId),
            isNull(employee.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      }
      return updated;
    }
    const folderId = await createItemFolder(
      input.unitId,
      'colaboradores',
      input.name,
      input.folderSchemaId,
    );
    const [created] = await db
      .insert(employee)
      .values({ unitId: input.unitId, name: input.name, folderId, metadata: input.metadata })
      .returning();
    return created;
  }),

  removeEmployee: unitAction('cadastros.itens')
    .input(z.object({ employeeId: z.uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(employee)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(employee.id, input.employeeId),
            eq(employee.unitId, input.unitId),
            isNull(employee.deletedAt),
          ),
        );
      return { success: true };
    }),

  // — Equipamentos —

  listEquipment: unitAction('cadastros.ler').query(async ({ input }) => {
    await ensureRegisterSkeleton(input.unitId);
    return db
      .select({
        id: equipment.id,
        name: equipment.name,
        type: equipment.type,
        folderId: equipment.folderId,
        folderName: folder.name,
        metadata: equipment.metadata,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .leftJoin(folder, eq(equipment.folderId, folder.id))
      .where(and(eq(equipment.unitId, input.unitId), isNull(equipment.deletedAt)))
      .orderBy(asc(equipment.name));
  }),

  upsertEquipment: unitAction('cadastros.itens').input(equipmentUpsertSchema).mutation(async ({ input }) => {
    if (input.equipmentId) {
      const [updated] = await db
        .update(equipment)
        .set({ name: input.name, type: input.type, metadata: input.metadata })
        .where(
          and(
            eq(equipment.id, input.equipmentId),
            eq(equipment.unitId, input.unitId),
            isNull(equipment.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Equipamento não encontrado' });
      }
      return updated;
    }
    const folderId = await createItemFolder(
      input.unitId,
      input.type,
      input.name,
      input.folderSchemaId,
    );
    const [created] = await db
      .insert(equipment)
      .values({
        unitId: input.unitId,
        name: input.name,
        type: input.type,
        folderId,
        metadata: input.metadata,
      })
      .returning();
    return created;
  }),

  removeEquipment: unitAction('cadastros.itens')
    .input(z.object({ equipmentId: z.uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(equipment)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(equipment.id, input.equipmentId),
            eq(equipment.unitId, input.unitId),
            isNull(equipment.deletedAt),
          ),
        );
      return { success: true };
    }),

  // — Campos personalizados da unidade (por grupo-alvo) —

  // — Configuração do grupo-alvo: estrutura de pastas padrão pré-selecionada
  //   (opcional) ao criar itens do grupo —
  targetSettings: unitAction('cadastros.ler').query(async ({ input }) => {
    return db
      .select({
        target: registerTargetSetting.target,
        folderSchemaId: registerTargetSetting.folderSchemaId,
      })
      .from(registerTargetSetting)
      .where(
        and(
          eq(registerTargetSetting.unitId, input.unitId),
          isNull(registerTargetSetting.deletedAt),
        ),
      );
  }),

  setTargetSetting: unitAction('cadastros.config')
    .input(
      z.object({
        target: z.enum(registerTargets),
        folderSchemaId: z.uuid().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.folderSchemaId) {
        await findUnitSchemaOrThrow(input.unitId, input.folderSchemaId);
      }
      const existing = await db.query.registerTargetSetting.findFirst({
        where: and(
          eq(registerTargetSetting.unitId, input.unitId),
          eq(registerTargetSetting.target, input.target),
          isNull(registerTargetSetting.deletedAt),
        ),
      });
      if (existing) {
        await db
          .update(registerTargetSetting)
          .set({ folderSchemaId: input.folderSchemaId })
          .where(eq(registerTargetSetting.id, existing.id));
      } else {
        await db.insert(registerTargetSetting).values({
          unitId: input.unitId,
          target: input.target,
          folderSchemaId: input.folderSchemaId,
        });
      }
      return { success: true };
    }),

  listCustomFields: unitAction('cadastros.ler')
    .input(z.object({ target: z.enum(registerTargets) }))
    .query(async ({ input }) => {
      return db
        .select({ id: customField.id, name: customField.name })
        .from(customField)
        .where(
          and(
            eq(customField.unitId, input.unitId),
            eq(customField.target, input.target),
            isNull(customField.deletedAt),
          ),
        )
        .orderBy(asc(customField.createdAt));
    }),

  addCustomField: unitAction('cadastros.campos').input(customFieldCreateSchema).mutation(async ({ input }) => {
    const [created] = await db
      .insert(customField)
      .values({ unitId: input.unitId, target: input.target, name: input.name })
      .returning();
    return created;
  }),

  removeCustomField: unitAction('cadastros.campos')
    .input(z.object({ customFieldId: z.uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(customField)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(customField.id, input.customFieldId),
            eq(customField.unitId, input.unitId),
            isNull(customField.deletedAt),
          ),
        );
      return { success: true };
    }),

  // — Vínculo campo→documento (campos kind=document, ex.: CA do EPI) —

  documentLinks: unitAction('cadastros.ler').query(async ({ input }) => {
    const rows = await db
      .select({
        id: registerDocumentLink.id,
        employeeId: registerDocumentLink.employeeId,
        equipmentId: registerDocumentLink.equipmentId,
        fieldKey: registerDocumentLink.fieldKey,
        documentId: registerDocumentLink.documentId,
        documentName: document.name,
        expiresAt: document.expiresAt,
        warnDaysBefore: document.warnDaysBefore,
      })
      .from(registerDocumentLink)
      .innerJoin(document, eq(registerDocumentLink.documentId, document.id))
      .innerJoin(folder, eq(document.folderId, folder.id))
      .where(and(eq(folder.unitId, input.unitId), isNull(registerDocumentLink.deletedAt)));
    return rows;
  }),

  linkDocument: unitAction('cadastros.vinculos').input(documentLinkSchema).mutation(async ({ input }) => {
    // Documento precisa ser da unidade.
    const [doc] = await db
      .select({ id: document.id })
      .from(document)
      .innerJoin(folder, eq(document.folderId, folder.id))
      .where(
        and(
          eq(document.id, input.documentId),
          eq(folder.unitId, input.unitId),
          isNull(document.deletedAt),
        ),
      );
    if (!doc) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' });
    }

    const now = new Date();
    if (input.employeeIds.length > 0) {
      await db
        .update(registerDocumentLink)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(registerDocumentLink.employeeId, input.employeeIds),
            eq(registerDocumentLink.fieldKey, input.fieldKey),
            isNull(registerDocumentLink.deletedAt),
          ),
        );
      await db.insert(registerDocumentLink).values(
        input.employeeIds.map((employeeId) => ({
          documentId: input.documentId,
          employeeId,
          fieldKey: input.fieldKey,
        })),
      );
    }
    if (input.equipmentIds.length > 0) {
      await db
        .update(registerDocumentLink)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(registerDocumentLink.equipmentId, input.equipmentIds),
            eq(registerDocumentLink.fieldKey, input.fieldKey),
            isNull(registerDocumentLink.deletedAt),
          ),
        );
      await db.insert(registerDocumentLink).values(
        input.equipmentIds.map((equipmentId) => ({
          documentId: input.documentId,
          equipmentId,
          fieldKey: input.fieldKey,
        })),
      );
    }
    return { linked: input.employeeIds.length + input.equipmentIds.length };
  }),

  unlinkDocument: unitAction('cadastros.vinculos').input(documentUnlinkSchema).mutation(async ({ input }) => {
    await db
      .update(registerDocumentLink)
      .set({ deletedAt: new Date() })
      .where(
        and(
          input.employeeId
            ? eq(registerDocumentLink.employeeId, input.employeeId)
            : eq(registerDocumentLink.equipmentId, input.equipmentId ?? ''),
          eq(registerDocumentLink.fieldKey, input.fieldKey),
          isNull(registerDocumentLink.deletedAt),
        ),
      );
    return { success: true };
  }),

  // — Importação por planilha (linhas mapeadas no cliente) —
  // Upsert por nome: existente atualiza metadata (merge); novo cria com pasta.

  importEmployees: unitAction('cadastros.importar').input(employeeImportSchema).mutation(async ({ input }) => {
    let created = 0;
    let updated = 0;
    for (const item of input.items) {
      const existing = await db.query.employee.findFirst({
        where: and(
          eq(employee.unitId, input.unitId),
          eq(employee.name, item.name),
          isNull(employee.deletedAt),
        ),
      });
      if (existing) {
        await db
          .update(employee)
          .set({ metadata: { ...existing.metadata, ...item.metadata } })
          .where(eq(employee.id, existing.id));
        updated += 1;
      } else {
        const folderId = await createItemFolder(input.unitId, 'colaboradores', item.name);
        await db
          .insert(employee)
          .values({ unitId: input.unitId, name: item.name, folderId, metadata: item.metadata });
        created += 1;
      }
    }
    return { created, updated };
  }),

  importEquipment: unitAction('cadastros.importar').input(equipmentImportSchema).mutation(async ({ input }) => {
    let created = 0;
    let updated = 0;
    for (const item of input.items) {
      const existing = await db.query.equipment.findFirst({
        where: and(
          eq(equipment.unitId, input.unitId),
          eq(equipment.name, item.name),
          isNull(equipment.deletedAt),
        ),
      });
      if (existing) {
        await db
          .update(equipment)
          .set({ metadata: { ...existing.metadata, ...item.metadata }, type: input.type })
          .where(eq(equipment.id, existing.id));
        updated += 1;
      } else {
        const folderId = await createItemFolder(input.unitId, input.type, item.name);
        await db.insert(equipment).values({
          unitId: input.unitId,
          name: item.name,
          type: input.type,
          folderId,
          metadata: item.metadata,
        });
        created += 1;
      }
    }
    return { created, updated };
  }),
});
