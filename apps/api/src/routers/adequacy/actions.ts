import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { actionItemStatusSchema, actionPriority } from '@easynr10/shared';
import { unitAction } from '../../trpc';

const { actionItem, adequacyItem, diagnostic, norm } = schema;

// Plano de ação (RF16/RF17): ações geradas pelos diagnósticos.

export const actionProcedures = {
  actionItems: unitAction('plano.ler').query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: actionItem.id,
        status: actionItem.status,
        deadline: actionItem.deadline,
        completedAt: actionItem.completedAt,
        normCode: norm.code,
        normDescription: norm.description,
        importanceWeight: norm.importanceWeight,
        adherence: diagnostic.status,
        responsible: diagnostic.responsible,
        recommendedAction: diagnostic.recommendedAction,
        adequacyItemId: adequacyItem.id,
      })
      .from(actionItem)
      .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
      .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
      .innerJoin(norm, eq(adequacyItem.normId, norm.id))
      .where(and(eq(adequacyItem.unitId, input.unitId), notDeleted(actionItem)))
      .orderBy(asc(actionItem.deadline));
    // O peso fica no servidor — o front recebe só a prioridade derivada.
    return rows.map(({ importanceWeight, ...row }) => ({
      ...row,
      priority: actionPriority(importanceWeight, row.adherence).priority,
    }));
  }),

  setActionStatus: unitAction('plano.status').input(actionItemStatusSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ id: actionItem.id })
      .from(actionItem)
      .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
      .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
      .where(
        and(
          eq(actionItem.id, input.actionItemId),
          eq(adequacyItem.unitId, input.unitId),
          notDeleted(actionItem),
        ),
      );
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ação não encontrada' });
    }
    await ctx.db
      .update(actionItem)
      .set({
        status: input.status,
        completedAt: input.status === 'concluida' ? new Date() : null,
      })
      .where(eq(actionItem.id, row.id));
    return { success: true };
  }),
};
