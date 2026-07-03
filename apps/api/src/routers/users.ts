import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { z } from 'zod';
import { db } from '../db';
import { adminProcedure, router } from '../trpc';

const { user, membership, unit, company } = schema;

// Painel de usuários (admin): listar usuários e liberar/revogar acesso a
// unidades (RF03/RF04). "Liberar empresa" = liberar todas as unidades dela
// (o vínculo do modelo é por unidade — tabela membership).
export const usersRouter = router({
  list: adminProcedure.query(async () => {
    return db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(asc(user.name));
  }),

  // Unidades liberadas para um usuário.
  memberships: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select({ unitId: membership.unitId })
        .from(membership)
        .where(and(eq(membership.userId, input.userId), isNull(membership.deletedAt)));
    }),

  // Empresas com suas unidades, para montar a matriz de acesso.
  accessTree: adminProcedure.query(async () => {
    const companies = await db.query.company.findMany({
      where: isNull(company.deletedAt),
      orderBy: [asc(company.name)],
    });
    const units = await db
      .select({ id: unit.id, name: unit.name, companyId: unit.companyId })
      .from(unit)
      .where(isNull(unit.deletedAt))
      .orderBy(asc(unit.name));
    return companies.map((item) => ({
      id: item.id,
      name: item.name,
      units: units.filter((row) => row.companyId === item.id),
    }));
  }),

  grant: adminProcedure
    .input(z.object({ userId: z.string(), unitIds: z.array(z.uuid()).min(1) }))
    .mutation(async ({ input }) => {
      // PK (unit_id, user_id): re-liberar um vínculo soft-deletado o reativa.
      await db
        .insert(membership)
        .values(input.unitIds.map((unitId) => ({ unitId, userId: input.userId })))
        .onConflictDoUpdate({
          target: [membership.unitId, membership.userId],
          set: { deletedAt: null },
        });
      return { success: true };
    }),

  revoke: adminProcedure
    .input(z.object({ userId: z.string(), unitIds: z.array(z.uuid()).min(1) }))
    .mutation(async ({ input }) => {
      await db
        .update(membership)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(membership.userId, input.userId),
            inArray(membership.unitId, input.unitIds),
            isNull(membership.deletedAt),
          ),
        );
      return { success: true };
    }),
});
