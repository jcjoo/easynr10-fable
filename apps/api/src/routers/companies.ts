import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { companyCreateSchema, companyUpdateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../trpc';
import { cascadeDeleteUnit } from '../cascade';
import { canAccessCompany, visibleUnits } from '../services/visibility';
import { buildLogoKey, imageMimeFromKey, imageMimes, presignPreview, presignUpload } from '../s3';

const { company, unit } = schema;

export const companiesRouter = router({
  // Visibilidade (RF04) vem do serviço: unidades visíveis dão as empresas e
  // o unitCount (admin: todas; cliente: só as liberadas).
  list: protectedProcedure.query(async ({ ctx }) => {
    const units = await visibleUnits(ctx.db, ctx.session.user);
    const countByCompany = new Map<string, number>();
    for (const row of units) {
      countByCompany.set(row.companyId, (countByCompany.get(row.companyId) ?? 0) + 1);
    }
    const isAdmin = ctx.session.user.role === 'admin';
    if (!isAdmin && countByCompany.size === 0) return [];
    const companies = await ctx.db.query.company.findMany({
      where: and(
        notDeleted(company),
        // Admin também vê empresas ainda sem unidade.
        isAdmin ? undefined : inArray(company.id, [...countByCompany.keys()]),
      ),
      orderBy: [asc(company.name)],
    });
    return companies.map((item) => ({ ...item, unitCount: countByCompany.get(item.id) ?? 0 }));
  }),

  // Cliente só enxerga empresas onde é membro de alguma unidade (RF04).
  byId: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    if (!(await canAccessCompany(ctx.db, ctx.session.user, input.id))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa' });
    }
    return ctx.db.query.company.findFirst({
      where: and(eq(company.id, input.id), notDeleted(company)),
    });
  }),

  create: adminProcedure.input(companyCreateSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db.insert(company).values({ name: input.name }).returning();
    return created;
  }),

  update: adminProcedure.input(companyUpdateSchema).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(company)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logoKey !== undefined ? { logoKey: input.logoKey } : {}),
      })
      .where(and(eq(company.id, input.id), notDeleted(company)))
      .returning();
    return updated;
  }),

  // Upload do logo: presigned PUT no S3; o cliente confirma gravando a key
  // via update({ logoKey }).
  logoUploadUrl: adminProcedure
    .input(z.object({ companyId: z.uuid(), mimeType: z.enum(imageMimes) }))
    .mutation(async ({ ctx, input }) => {
      const found = await ctx.db.query.company.findFirst({
        where: and(eq(company.id, input.companyId), notDeleted(company)),
      });
      if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empresa não encontrada' });
      const storageKey = buildLogoKey(`companies/${input.companyId}`, input.mimeType);
      return { storageKey, uploadUrl: await presignUpload(storageKey, input.mimeType) };
    }),

  // URL temporária do logo (null sem logo) — visível a quem vê a empresa.
  logoUrl: protectedProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      if (!(await canAccessCompany(ctx.db, ctx.session.user, input.companyId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa' });
      }
      const found = await ctx.db.query.company.findFirst({
        where: and(eq(company.id, input.companyId), notDeleted(company)),
      });
      if (!found?.logoKey) return null;
      return presignPreview(found.logoKey, 'logo', imageMimeFromKey(found.logoKey));
    }),

  // Cascata: cada unidade ativa é excluída com toda a árvore (+ MinIO),
  // depois a empresa.
  remove: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const units = await ctx.db
      .select({ id: unit.id })
      .from(unit)
      .where(and(eq(unit.companyId, input.id), notDeleted(unit)));
    for (const row of units) {
      await cascadeDeleteUnit(ctx.db, row.id);
    }
    await ctx.db
      .update(company)
      .set({ deletedAt: new Date() })
      .where(and(eq(company.id, input.id), notDeleted(company)));
    return { success: true };
  }),
});
