import { TRPCError } from '@trpc/server';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { folderCreateSchema, folderRenameSchema } from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { router, unitAction } from '../trpc';

const { folder, document } = schema;

async function findUnitFolder(unitId: string, folderId: string) {
  const found = await db.query.folder.findFirst({
    where: and(eq(folder.id, folderId), eq(folder.unitId, unitId), isNull(folder.deletedAt)),
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada' });
  }
  return found;
}

export const foldersRouter = router({
  // Todas as pastas da unidade (flat); a árvore é montada no cliente.
  list: unitAction('pie.ler').query(async ({ input }) => {
    return db
      .select({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
      })
      .from(folder)
      .where(and(eq(folder.unitId, input.unitId), isNull(folder.deletedAt)))
      .orderBy(asc(folder.name));
  }),

  create: unitAction('pie.pasta.criar').input(folderCreateSchema).mutation(async ({ input }) => {
    if (input.parentId) {
      const parent = await db.query.folder.findFirst({
        where: and(
          eq(folder.id, input.parentId),
          eq(folder.unitId, input.unitId),
          isNull(folder.deletedAt),
        ),
      });
      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta pai não encontrada' });
      }
    }
    const [created] = await db
      .insert(folder)
      .values({ unitId: input.unitId, parentId: input.parentId, name: input.name })
      .returning();
    return created;
  }),

  rename: unitAction('pie.pasta.renomear').input(folderRenameSchema).mutation(async ({ input }) => {
    const found = await findUnitFolder(input.unitId, input.folderId);
    const [updated] = await db
      .update(folder)
      .set({ name: input.name })
      .where(eq(folder.id, found.id))
      .returning();
    return updated;
  }),

  // Cliente só remove pasta vazia; admin remove com todo o conteúdo
  // (subpastas e documentos, soft delete em cascata).
  remove: unitAction('pie.pasta.excluir')
    .input(z.object({ folderId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const found = await findUnitFolder(input.unitId, input.folderId);

      // Subárvore a partir da lista flat da unidade.
      const all = await db
        .select({ id: folder.id, parentId: folder.parentId })
        .from(folder)
        .where(and(eq(folder.unitId, input.unitId), isNull(folder.deletedAt)));
      const byParent = new Map<string, string[]>();
      for (const node of all) {
        if (node.parentId) {
          byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
        }
      }
      const folderIds = [found.id];
      for (let i = 0; i < folderIds.length; i++) {
        folderIds.push(...(byParent.get(folderIds[i]!) ?? []));
      }

      const [docs] = await db
        .select({ total: count() })
        .from(document)
        .where(and(inArray(document.folderId, folderIds), isNull(document.deletedAt)));
      const docCount = docs?.total ?? 0;

      const isEmpty = folderIds.length === 1 && docCount === 0;
      if (!isEmpty && ctx.session.user.role !== 'admin') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A pasta não está vazia — mova ou exclua o conteúdo antes.',
        });
      }

      const deletedAt = new Date();
      if (docCount > 0) {
        await db
          .update(document)
          .set({ deletedAt })
          .where(and(inArray(document.folderId, folderIds), isNull(document.deletedAt)));
      }
      await db.update(folder).set({ deletedAt }).where(inArray(folder.id, folderIds));
      return { success: true, folders: folderIds.length, documents: docCount };
    }),
});
