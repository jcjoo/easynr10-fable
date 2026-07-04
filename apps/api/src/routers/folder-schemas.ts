import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import type { FolderSchemaNode } from '@easynr10/db/schema';
import {
  folderSchemaApplySchema,
  folderSchemaCreateSchema,
  folderSchemaUpdateSchema,
} from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { router, unitProcedure } from '../trpc';

const { folder, folderSchema } = schema;

async function findUnitSchema(unitId: string, schemaId: string) {
  const found = await db.query.folderSchema.findFirst({
    where: and(
      eq(folderSchema.id, schemaId),
      eq(folderSchema.unitId, unitId),
      isNull(folderSchema.deletedAt),
    ),
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Estrutura não encontrada' });
  }
  return found;
}

// Como no legado: os modelos globais (unit_id nulo) são copiados para a
// unidade no primeiro uso, e a partir daí a unidade edita as suas cópias.
async function ensureUnitSchemas(unitId: string) {
  // Conta também as excluídas: a cópia dos modelos acontece UMA vez por
  // unidade. Sem isso, excluir a última estrutura fazia os modelos
  // ressuscitarem no próximo listByUnit (exclusão "não funcionava").
  const existing = await db
    .select({ id: folderSchema.id })
    .from(folderSchema)
    .where(eq(folderSchema.unitId, unitId))
    .limit(1);
  if (existing.length > 0) return;

  const defaults = await db.query.folderSchema.findMany({
    where: and(isNull(folderSchema.unitId), isNull(folderSchema.deletedAt)),
  });
  if (defaults.length === 0) return;

  await db.insert(folderSchema).values(
    defaults.map((template) => ({
      unitId,
      name: template.name,
      structure: template.structure,
      isDefault: template.isDefault,
    })),
  );
}

export const folderSchemasRouter = router({
  listByUnit: unitProcedure.query(async ({ input }) => {
    await ensureUnitSchemas(input.unitId);
    return db
      .select({
        id: folderSchema.id,
        name: folderSchema.name,
        structure: folderSchema.structure,
        isDefault: folderSchema.isDefault,
      })
      .from(folderSchema)
      .where(and(eq(folderSchema.unitId, input.unitId), isNull(folderSchema.deletedAt)))
      .orderBy(asc(folderSchema.name));
  }),

  create: unitProcedure.input(folderSchemaCreateSchema).mutation(async ({ input }) => {
    const [created] = await db
      .insert(folderSchema)
      .values({
        unitId: input.unitId,
        name: input.name,
        structure: input.structure as FolderSchemaNode[],
      })
      .returning();
    return created;
  }),

  update: unitProcedure.input(folderSchemaUpdateSchema).mutation(async ({ input }) => {
    const found = await findUnitSchema(input.unitId, input.schemaId);
    const [updated] = await db
      .update(folderSchema)
      .set({ name: input.name, structure: input.structure as FolderSchemaNode[] })
      .where(eq(folderSchema.id, found.id))
      .returning();
    return updated;
  }),

  remove: unitProcedure
    .input(z.object({ schemaId: z.uuid() }))
    .mutation(async ({ input }) => {
      const found = await findUnitSchema(input.unitId, input.schemaId);
      await db
        .update(folderSchema)
        .set({ deletedAt: new Date() })
        .where(eq(folderSchema.id, found.id));
      return { success: true };
    }),

  // Gera a estrutura a partir da pasta atual (parentId nulo = raiz),
  // pulando pastas que já existem no mesmo nível — idempotente.
  applyToUnit: unitProcedure.input(folderSchemaApplySchema).mutation(async ({ input }) => {
    const selected = await findUnitSchema(input.unitId, input.schemaId);

    if (input.parentId) {
      const parent = await db.query.folder.findFirst({
        where: and(
          eq(folder.id, input.parentId),
          eq(folder.unitId, input.unitId),
          isNull(folder.deletedAt),
        ),
      });
      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada' });
      }
    }

    const created = await ensureFolderStructure(
      input.unitId,
      selected.structure,
      input.parentId,
      selected.id,
    );
    return { created, schemaName: selected.name };
  }),
});

// Cria as pastas da estrutura sob parentId, pulando as que já existem no
// mesmo nível (idempotente). Reusado pelos cadastros (pasta do colaborador/
// equipamento pode nascer com uma estrutura dentro).
export async function ensureFolderStructure(
  unitId: string,
  nodes: FolderSchemaNode[],
  parentId: string | null,
  schemaId?: string,
): Promise<number> {
  let createdCount = 0;
  for (const node of nodes) {
    const existing = await db.query.folder.findFirst({
      where: and(
        eq(folder.unitId, unitId),
        parentId === null ? isNull(folder.parentId) : eq(folder.parentId, parentId),
        eq(folder.name, node.name),
        isNull(folder.deletedAt),
      ),
    });
    let folderId = existing?.id;
    if (!folderId) {
      const [created] = await db
        .insert(folder)
        .values({ unitId, parentId, name: node.name, schemaId })
        .returning();
      folderId = created!.id;
      createdCount += 1;
    }
    if (node.children?.length) {
      createdCount += await ensureFolderStructure(unitId, node.children, folderId, schemaId);
    }
  }
  return createdCount;
}

export async function findUnitSchemaOrThrow(unitId: string, schemaId: string) {
  return findUnitSchema(unitId, schemaId);
}
