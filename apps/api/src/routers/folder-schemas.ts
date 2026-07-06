import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import type { FolderSchemaNode } from '@easynr10/db/schema';
import {
  folderSchemaApplySchema,
  folderSchemaCreateSchema,
  folderSchemaUpdateSchema,
} from '@easynr10/shared';
import { z } from 'zod';
import { router, unitAction } from '../trpc';
import { ensureFolderStructure, findUnitSchemaOrThrow } from '../services/folders';

const { folder, folderSchema } = schema;

// Como no legado: os modelos globais (unit_id nulo) são copiados para a
// unidade no primeiro uso, e a partir daí a unidade edita as suas cópias.
async function ensureUnitSchemas(db: Db, unitId: string) {
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
    where: and(isNull(folderSchema.unitId), notDeleted(folderSchema)),
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
  listByUnit: unitAction('pie.ler').query(async ({ ctx, input }) => {
    await ensureUnitSchemas(ctx.db, input.unitId);
    return ctx.db
      .select({
        id: folderSchema.id,
        name: folderSchema.name,
        structure: folderSchema.structure,
        isDefault: folderSchema.isDefault,
      })
      .from(folderSchema)
      .where(and(eq(folderSchema.unitId, input.unitId), notDeleted(folderSchema)))
      .orderBy(asc(folderSchema.name));
  }),

  create: unitAction('pie.estruturas.gerenciar')
    .input(folderSchemaCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(folderSchema)
        .values({
          unitId: input.unitId,
          name: input.name,
          structure: input.structure as FolderSchemaNode[],
        })
        .returning();
      return created;
    }),

  update: unitAction('pie.estruturas.gerenciar')
    .input(folderSchemaUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const found = await findUnitSchemaOrThrow(ctx.db, input.unitId, input.schemaId);
      const [updated] = await ctx.db
        .update(folderSchema)
        .set({ name: input.name, structure: input.structure as FolderSchemaNode[] })
        .where(eq(folderSchema.id, found.id))
        .returning();
      return updated;
    }),

  remove: unitAction('pie.estruturas.gerenciar')
    .input(z.object({ schemaId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const found = await findUnitSchemaOrThrow(ctx.db, input.unitId, input.schemaId);
      await ctx.db
        .update(folderSchema)
        .set({ deletedAt: new Date() })
        .where(eq(folderSchema.id, found.id));
      return { success: true };
    }),

  // Gera a estrutura a partir da pasta atual (parentId nulo = raiz),
  // pulando pastas que já existem no mesmo nível — idempotente.
  applyToUnit: unitAction('pie.estruturas.gerenciar')
    .input(folderSchemaApplySchema)
    .mutation(async ({ ctx, input }) => {
      const selected = await findUnitSchemaOrThrow(ctx.db, input.unitId, input.schemaId);

      if (input.parentId) {
        const parent = await ctx.db.query.folder.findFirst({
          where: and(
            eq(folder.id, input.parentId),
            eq(folder.unitId, input.unitId),
            notDeleted(folder),
          ),
        });
        if (!parent) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada' });
        }
      }

      const created = await ensureFolderStructure(
        ctx.db,
        input.unitId,
        selected.structure,
        input.parentId,
        selected.id,
      );
      return { created, schemaName: selected.name };
    }),
});
