import { and, asc, eq } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { actionPriority, localDateString, type ActionStatus } from '@easynr10/shared';

const { actionItem, adequacyItem, diagnostic, norm } = schema;

// Pendências do plano de ação (RF21). scope 'todas' inclui concluídas/canceladas.
export async function actionPlanRows(db: Db, unitId: string, scope: 'pendencias' | 'todas') {
  const rows = await db
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
      createdAt: actionItem.createdAt,
    })
    .from(actionItem)
    .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
    .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
    .innerJoin(norm, eq(adequacyItem.normId, norm.id))
    .where(and(eq(adequacyItem.unitId, unitId), notDeleted(actionItem)))
    .orderBy(asc(actionItem.deadline));

  const today = localDateString();
  const isPending = (status: ActionStatus) => status === 'pendente' || status === 'em_andamento';
  return rows
    .filter((row) => scope === 'todas' || isPending(row.status))
    .map(({ importanceWeight, ...row }) => ({
      ...row,
      overdue: isPending(row.status) && row.deadline < today,
      priority: actionPriority(importanceWeight, row.adherence).priority,
    }));
}
