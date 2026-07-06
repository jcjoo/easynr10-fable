import { and, eq } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { unitCreateSchema, unitUpdateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { visibleUnits } from '../services/visibility';
import { adminProcedure, protectedProcedure, router, unitProcedure } from '../trpc';
import { cascadeDeleteUnit } from '../cascade';
import { ensureRegisterSkeleton } from '../services/register-folders';

const { unit } = schema;

export const unitsRouter = router({
  // Permissões efetivas do usuário logado na unidade (papel do membership;
  // admin = todas) — a sidebar esconde módulos sem "*.ler".
  myPermissions: unitProcedure.query(({ ctx }) => [...ctx.unitPermissions]),

  // Unidades de uma empresa visíveis ao usuário — regra no serviço (RF04).
  listByCompany: protectedProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(({ ctx, input }) => visibleUnits(ctx.db, ctx.session.user, input.companyId)),

  byId: unitProcedure.query(async ({ ctx, input }) => {
    return ctx.db.query.unit.findFirst({
      where: and(eq(unit.id, input.unitId), notDeleted(unit)),
    });
  }),

  create: adminProcedure.input(unitCreateSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(unit)
      .values({ companyId: input.companyId, name: input.name })
      .returning();
    // Esqueleto de pastas dos cadastros nasce junto com a unidade.
    await ensureRegisterSkeleton(ctx.db, created!.id);
    return created;
  }),

  update: adminProcedure.input(unitUpdateSchema).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(unit)
      .set({ name: input.name })
      .where(and(eq(unit.id, input.id), notDeleted(unit)))
      .returning();
    return updated;
  }),

  // Cascata: soft delete de toda a árvore da unidade + purge no MinIO.
  remove: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.query.unit.findFirst({
      where: and(eq(unit.id, input.id), notDeleted(unit)),
    });
    if (!found) return { success: true };
    await cascadeDeleteUnit(ctx.db, found.id);
    return { success: true };
  }),
});
