import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { unitCreateSchema, unitUpdateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { visibleUnits } from '../services/visibility';
import { adminProcedure, protectedProcedure, router, unitProcedure } from '../trpc';
import { buildLogoKey, imageMimeFromKey, imageMimes, presignPreview, presignUpload } from '../s3';
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
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logoKey !== undefined ? { logoKey: input.logoKey } : {}),
      })
      .where(and(eq(unit.id, input.id), notDeleted(unit)))
      .returning();
    return updated;
  }),

  // Upload do logo (presigned PUT); a key fica sob units/<id>/ e é purgada
  // junto com a unidade. O cliente confirma via update({ logoKey }).
  logoUploadUrl: adminProcedure
    .input(z.object({ unitId: z.uuid(), mimeType: z.enum(imageMimes) }))
    .mutation(async ({ ctx, input }) => {
      const found = await ctx.db.query.unit.findFirst({
        where: and(eq(unit.id, input.unitId), notDeleted(unit)),
      });
      if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unidade não encontrada' });
      const storageKey = buildLogoKey(`units/${input.unitId}`, input.mimeType);
      return { storageKey, uploadUrl: await presignUpload(storageKey, input.mimeType) };
    }),

  // URL temporária do logo (null sem logo) — membro da unidade enxerga.
  logoUrl: unitProcedure.query(async ({ ctx, input }) => {
    const found = await ctx.db.query.unit.findFirst({
      where: and(eq(unit.id, input.unitId), notDeleted(unit)),
    });
    if (!found?.logoKey) return null;
    return presignPreview(found.logoKey, 'logo', imageMimeFromKey(found.logoKey));
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
