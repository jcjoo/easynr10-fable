import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { folderCreateSchema, folderRenameSchema } from '@easynr10/shared';
import { z } from 'zod';
import { router, unitAction } from '../trpc';
import { removeFolderSubtree } from '../services/folders';

const { folder, document } = schema;

async function findUnitFolder(db: Db, unitId: string, folderId: string) {
  const found = await db.query.folder.findFirst({
    where: and(eq(folder.id, folderId), eq(folder.unitId, unitId), notDeleted(folder)),
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada' });
  }
  return found;
}

export const foldersRouter = router({
  // Todas as pastas da unidade (flat); a árvore é montada no cliente.
  list: unitAction('pie.ler').query(async ({ ctx, input }) => {
    return ctx.db
      .select({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
      })
      .from(folder)
      .where(and(eq(folder.unitId, input.unitId), notDeleted(folder)))
      .orderBy(asc(folder.name));
  }),

  create: unitAction('pie.pasta.criar').input(folderCreateSchema).mutation(async ({ ctx, input }) => {
    if (input.parentId) {
      const parent = await ctx.db.query.folder.findFirst({
        where: and(
          eq(folder.id, input.parentId),
          eq(folder.unitId, input.unitId),
          notDeleted(folder),
        ),
      });
      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta pai não encontrada' });
      }
    }
    const [created] = await ctx.db
      .insert(folder)
      .values({ unitId: input.unitId, parentId: input.parentId, name: input.name })
      .returning();
    return created;
  }),

  rename: unitAction('pie.pasta.renomear').input(folderRenameSchema).mutation(async ({ ctx, input }) => {
    const found = await findUnitFolder(ctx.db, input.unitId, input.folderId);
    const [updated] = await ctx.db
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
      const found = await findUnitFolder(ctx.db, input.unitId, input.folderId);

      // Pasta não-vazia só o admin remove (a subárvore inteira vai junto).
      const childCount = await ctx.db
        .select({ id: folder.id })
        .from(folder)
        .where(and(eq(folder.parentId, found.id), notDeleted(folder)));
      const docsHere = await ctx.db
        .select({ id: document.id })
        .from(document)
        .where(and(eq(document.folderId, found.id), notDeleted(document)));
      const isEmpty = childCount.length === 0 && docsHere.length === 0;
      if (!isEmpty && ctx.session.user.role !== 'admin') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A pasta não está vazia — mova ou exclua o conteúdo antes.',
        });
      }

      const result = await removeFolderSubtree(ctx.db, input.unitId, found.id);
      return { success: true, ...result };
    }),
});
