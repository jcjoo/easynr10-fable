import { and, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { timelineIntervals, type DiagnosticStatus } from '@easynr10/shared';
import { z } from 'zod';
import {
  actionPlanRows,
  documentSituationRows,
  nonConformityRows,
  timelineSeries,
  unitOverview,
  weightedPercent,
} from '../services/reports';
import { visibleUnits } from '../services/visibility';
import { protectedProcedure, router, unitAction } from '../trpc';

const { adequacyItem, diagnostic, norm } = schema;

// Procedures de relatórios/dashboards (RF19–RF22); os dados vêm da camada de
// serviço (services/reports.ts), compartilhada com a exportação HTTP.

export const reportsRouter = router({
  overview: unitAction('painel.ler').query(({ ctx, input }) => unitOverview(ctx.db, input.unitId)),

  // Painel da empresa (RF19): aderência agregada por unidade visível ao
  // usuário (admin: todas; cliente: onde é membro — regra de units.listByCompany).
  companyOverview: protectedProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const units = await visibleUnits(ctx.db, ctx.session.user, input.companyId);
      if (units.length === 0) return [];

      const items = await ctx.db
        .select({
          id: adequacyItem.id,
          unitId: adequacyItem.unitId,
          importanceWeight: norm.importanceWeight,
        })
        .from(adequacyItem)
        .innerJoin(norm, eq(adequacyItem.normId, norm.id))
        .where(
          and(
            inArray(
              adequacyItem.unitId,
              units.map((row) => row.id),
            ),
            eq(adequacyItem.isActive, true),
            notDeleted(adequacyItem),
          ),
        );

      const latest = new Map<string, DiagnosticStatus>();
      if (items.length > 0) {
        const rows = await ctx.db
          .select({ adequacyItemId: diagnostic.adequacyItemId, status: diagnostic.status })
          .from(diagnostic)
          .where(
            and(
              inArray(
                diagnostic.adequacyItemId,
                items.map((item) => item.id),
              ),
              notDeleted(diagnostic),
            ),
          )
          .orderBy(desc(diagnostic.createdAt));
        for (const row of rows) {
          if (!latest.has(row.adequacyItemId)) latest.set(row.adequacyItemId, row.status);
        }
      }

      return units.map((row) => {
        const unitItems = items
          .filter((item) => item.unitId === row.id)
          .map((item) => ({
            importanceWeight: item.importanceWeight,
            status: latest.get(item.id) ?? null,
          }));
        return {
          unitId: row.id,
          name: row.name,
          percent: weightedPercent(unitItems),
          evaluated: unitItems.filter((item) => item.status !== null).length,
          activeTotal: unitItems.length,
        };
      });
    }),

  timeline: unitAction('painel.ler')
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        interval: z.enum(timelineIntervals).default('weekly'),
      }),
    )
    .query(({ ctx, input }) => timelineSeries(ctx.db, input.unitId, input.from, input.to, input.interval)),

  nonConformities: unitAction('relatorios.ler').query(({ ctx, input }) => nonConformityRows(ctx.db, input.unitId)),

  documentsSituation: unitAction('relatorios.ler').query(({ ctx, input }) => documentSituationRows(ctx.db, input.unitId)),

  actionPlan: unitAction('relatorios.ler')
    .input(z.object({ scope: z.enum(['pendencias', 'todas']).default('pendencias') }))
    .query(({ ctx, input }) => actionPlanRows(ctx.db, input.unitId, input.scope)),
});
