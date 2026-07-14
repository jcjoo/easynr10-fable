import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { ncCreateSchema, ncUpdateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { unitAction } from '../../trpc';
import { ensureItemNcs, ensureItemRequirements, findUnitAdequacyItem } from './shared';

const { adequacyItem, adequacyItemNc, adequacyItemRequirement } = schema;

// Não conformidades do item (tabeladas do checklist): cada NC pertence a um
// requisito e carrega a nota que implica — na avaliação marca-se a NC (não a
// nota); sem NC o requisito é Pleno (ver diagnostics.ts).

// O vínculo NC→requisito só vale dentro do MESMO item (e da unidade).
async function assertRequirementInItem(
  db: Db,
  adequacyItemId: string,
  requirementId: string | null | undefined,
) {
  if (!requirementId) return;
  const [found] = await db
    .select({ id: adequacyItemRequirement.id })
    .from(adequacyItemRequirement)
    .where(
      and(
        eq(adequacyItemRequirement.id, requirementId),
        eq(adequacyItemRequirement.adequacyItemId, adequacyItemId),
        notDeleted(adequacyItemRequirement),
      ),
    );
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Requisito não encontrado neste item' });
  }
}

export const ncProcedures = {
  // NCs do item (copiadas do catálogo no primeiro acesso, como os requisitos).
  ncs: unitAction('diagnostico.ler')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      await ensureItemRequirements(ctx.db, item);
      await ensureItemNcs(ctx.db, item);
      return ctx.db
        .select({
          id: adequacyItemNc.id,
          code: adequacyItemNc.code,
          description: adequacyItemNc.description,
          recommendedAction: adequacyItemNc.recommendedAction,
          requirementId: adequacyItemNc.requirementId,
          adherence: adequacyItemNc.adherence,
        })
        .from(adequacyItemNc)
        .where(
          and(eq(adequacyItemNc.adequacyItemId, item.id), notDeleted(adequacyItemNc)),
        )
        .orderBy(asc(adequacyItemNc.code), asc(adequacyItemNc.createdAt));
    }),

  addNc: unitAction('diagnostico.requisitos').input(ncCreateSchema).mutation(async ({ ctx, input }) => {
    const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
    await assertRequirementInItem(ctx.db, item.id, input.requirementId);
    const [created] = await ctx.db
      .insert(adequacyItemNc)
      .values({
        adequacyItemId: item.id,
        requirementId: input.requirementId ?? null,
        code: input.code,
        description: input.description,
        recommendedAction: input.recommendedAction,
        adherence: input.adherence,
      })
      .returning();
    return created;
  }),

  updateNc: unitAction('diagnostico.requisitos').input(ncUpdateSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ id: adequacyItemNc.id, adequacyItemId: adequacyItemNc.adequacyItemId })
      .from(adequacyItemNc)
      .innerJoin(adequacyItem, eq(adequacyItemNc.adequacyItemId, adequacyItem.id))
      .where(
        and(
          eq(adequacyItemNc.id, input.ncId),
          eq(adequacyItem.unitId, input.unitId),
          notDeleted(adequacyItemNc),
        ),
      );
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Não conformidade não encontrada' });
    }
    await assertRequirementInItem(ctx.db, row.adequacyItemId, input.requirementId);
    const [updated] = await ctx.db
      .update(adequacyItemNc)
      .set({
        code: input.code,
        description: input.description,
        recommendedAction: input.recommendedAction,
        requirementId: input.requirementId ?? null,
        adherence: input.adherence,
      })
      .where(eq(adequacyItemNc.id, row.id))
      .returning();
    return updated;
  }),

  removeNc: unitAction('diagnostico.requisitos')
    .input(z.object({ ncId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: adequacyItemNc.id })
        .from(adequacyItemNc)
        .innerJoin(adequacyItem, eq(adequacyItemNc.adequacyItemId, adequacyItem.id))
        .where(
          and(
            eq(adequacyItemNc.id, input.ncId),
            eq(adequacyItem.unitId, input.unitId),
            notDeleted(adequacyItemNc),
          ),
        );
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Não conformidade não encontrada' });
      }
      await ctx.db
        .update(adequacyItemNc)
        .set({ deletedAt: new Date() })
        .where(eq(adequacyItemNc.id, row.id));
      return { success: true };
    }),
};
