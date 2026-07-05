import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { unitCreateSchema, unitUpdateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { visibleUnits } from '../services/visibility';
import { adminProcedure, protectedProcedure, router, unitProcedure } from '../trpc';
import { cascadeDeleteUnit } from '../cascade';
import { ensureRegisterSkeleton } from './registers';

const { unit } = schema;

export const unitsRouter = router({
  // Permissões efetivas do usuário logado na unidade (papel do membership;
  // admin = todas) — a sidebar esconde módulos sem "*.ler".
  myPermissions: unitProcedure.query(({ ctx }) => [...ctx.unitPermissions]),

  // Unidades de uma empresa visíveis ao usuário — regra no serviço (RF04).
  listByCompany: protectedProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(({ ctx, input }) => visibleUnits(ctx.session.user, input.companyId)),

  byId: unitProcedure.query(async ({ input }) => {
    return db.query.unit.findFirst({
      where: and(eq(unit.id, input.unitId), isNull(unit.deletedAt)),
    });
  }),

  create: adminProcedure.input(unitCreateSchema).mutation(async ({ input }) => {
    const [created] = await db
      .insert(unit)
      .values({ companyId: input.companyId, name: input.name })
      .returning();
    // Esqueleto de pastas dos cadastros nasce junto com a unidade.
    await ensureRegisterSkeleton(created!.id);
    return created;
  }),

  update: adminProcedure.input(unitUpdateSchema).mutation(async ({ input }) => {
    const [updated] = await db
      .update(unit)
      .set({ name: input.name })
      .where(and(eq(unit.id, input.id), isNull(unit.deletedAt)))
      .returning();
    return updated;
  }),

  // Cascata: soft delete de toda a árvore da unidade + purge no MinIO.
  remove: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ input }) => {
    const found = await db.query.unit.findFirst({
      where: and(eq(unit.id, input.id), isNull(unit.deletedAt)),
    });
    if (!found) return { success: true };
    await cascadeDeleteUnit(found.id);
    return { success: true };
  }),
});
