import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { companyCreateSchema, companyUpdateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { adminProcedure, protectedProcedure, router } from '../trpc';

const { company, unit, membership } = schema;

export const companiesRouter = router({
  // Admin vê todas; cliente vê apenas empresas com unidades das quais é membro (RF04).
  // unitCount segue a mesma visibilidade: admin conta todas as unidades,
  // cliente conta só as liberadas para ele.
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role === 'admin') {
      const companies = await db.query.company.findMany({
        where: isNull(company.deletedAt),
        orderBy: [asc(company.name)],
      });
      const counts = await db
        .select({ companyId: unit.companyId, total: count() })
        .from(unit)
        .where(isNull(unit.deletedAt))
        .groupBy(unit.companyId);
      const byCompany = new Map(counts.map((row) => [row.companyId, row.total]));
      return companies.map((item) => ({ ...item, unitCount: byCompany.get(item.id) ?? 0 }));
    }

    const memberUnits = await db
      .select({ companyId: unit.companyId })
      .from(membership)
      .innerJoin(unit, eq(membership.unitId, unit.id))
      .where(
        and(
          eq(membership.userId, ctx.session.user.id),
          isNull(membership.deletedAt),
          isNull(unit.deletedAt),
        ),
      );

    const countByCompany = new Map<string, number>();
    for (const row of memberUnits) {
      countByCompany.set(row.companyId, (countByCompany.get(row.companyId) ?? 0) + 1);
    }
    const companyIds = [...countByCompany.keys()];
    if (companyIds.length === 0) return [];

    const companies = await db.query.company.findMany({
      where: and(isNull(company.deletedAt), inArray(company.id, companyIds)),
      orderBy: [asc(company.name)],
    });
    return companies.map((item) => ({ ...item, unitCount: countByCompany.get(item.id) ?? 0 }));
  }),

  byId: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ input }) => {
    return db.query.company.findFirst({
      where: and(eq(company.id, input.id), isNull(company.deletedAt)),
    });
  }),

  create: adminProcedure.input(companyCreateSchema).mutation(async ({ input }) => {
    const [created] = await db.insert(company).values({ name: input.name }).returning();
    return created;
  }),

  update: adminProcedure.input(companyUpdateSchema).mutation(async ({ input }) => {
    const [updated] = await db
      .update(company)
      .set({ name: input.name })
      .where(and(eq(company.id, input.id), isNull(company.deletedAt)))
      .returning();
    return updated;
  }),

  remove: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ input }) => {
    await db
      .update(company)
      .set({ deletedAt: new Date() })
      .where(and(eq(company.id, input.id), isNull(company.deletedAt)));
    return { success: true };
  }),
});
