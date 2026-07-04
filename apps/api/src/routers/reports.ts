import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import {
  compareNormCodes,
  diagnosticStatusScore,
  documentGroups,
  timelineIntervals,
  type ActionStatus,
  type DiagnosticStatus,
  type DocumentSituation,
} from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { protectedProcedure, router, unitProcedure } from '../trpc';

const { actionItem, adequacyItem, diagnostic, document, folder, membership, norm, unit } = schema;

// Builders de dados compartilhados entre as queries tRPC (telas) e a rota
// HTTP de exportação (report-export.ts) — RF19–RF22.

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// Itens de adequação ATIVOS da unidade com a norma e o último diagnóstico —
// base do dashboard, do relatório de não conformidades e da aderência geral.
export async function adequacySnapshot(unitId: string) {
  const items = await db
    .select({
      id: adequacyItem.id,
      normCode: norm.code,
      normDescription: norm.description,
      importanceWeight: norm.importanceWeight,
      documentGroup: norm.documentGroup,
    })
    .from(adequacyItem)
    .innerJoin(norm, eq(adequacyItem.normId, norm.id))
    .where(
      and(
        eq(adequacyItem.unitId, unitId),
        eq(adequacyItem.isActive, true),
        isNull(adequacyItem.deletedAt),
      ),
    );
  items.sort((a, b) => compareNormCodes(a.normCode, b.normCode));
  if (items.length === 0) return [];

  const rows = await db
    .select({
      adequacyItemId: diagnostic.adequacyItemId,
      status: diagnostic.status,
      deadline: diagnostic.deadline,
      responsible: diagnostic.responsible,
      recommendedAction: diagnostic.recommendedAction,
      createdAt: diagnostic.createdAt,
    })
    .from(diagnostic)
    .where(
      and(
        inArray(
          diagnostic.adequacyItemId,
          items.map((item) => item.id),
        ),
        isNull(diagnostic.deletedAt),
      ),
    )
    .orderBy(desc(diagnostic.createdAt));

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.adequacyItemId)) latest.set(row.adequacyItemId, row);
  }

  return items.map((item) => {
    const last = latest.get(item.id);
    return {
      ...item,
      status: last?.status ?? null,
      deadline: last?.deadline ?? null,
      responsible: last?.responsible ?? null,
      recommendedAction: last?.recommendedAction ?? null,
      lastDiagnosticAt: last?.createdAt ?? null,
    };
  });
}

// Aderência agregada (mesma regra do topo do Diagnóstico): média dos scores
// ponderada pelo peso da norma, só dos itens avaliados.
function weightedPercent(rows: { importanceWeight: number; status: DiagnosticStatus | null }[]) {
  const evaluated = rows.filter((row) => row.status !== null);
  const weightSum = evaluated.reduce((sum, row) => sum + row.importanceWeight, 0);
  if (weightSum === 0) return null;
  const scoreSum = evaluated.reduce(
    (sum, row) => sum + row.importanceWeight * diagnosticStatusScore[row.status!],
    0,
  );
  return Math.round((scoreSum / weightSum) * 100);
}

// Relatório de Não Conformidades (RF21): itens ativos abaixo de Plena,
// incluindo os sem avaliação (não conformidade presumida até avaliar).
export async function nonConformityRows(unitId: string) {
  const snapshot = await adequacySnapshot(unitId);
  return snapshot.filter((row) => row.status !== 'plena');
}

export function documentSituation(
  expiresAt: string | null,
  warnDaysBefore: number | null,
  today: string,
): { situation: DocumentSituation; daysToExpiry: number | null } {
  if (!expiresAt) return { situation: 'sem_validade', daysToExpiry: null };
  const days = Math.round(
    (Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return { situation: 'vencido', daysToExpiry: days };
  if (days <= (warnDaysBefore ?? 30)) return { situation: 'a_vencer', daysToExpiry: days };
  return { situation: 'em_dia', daysToExpiry: days };
}

// Situação documental do PIE (RF21): todos os documentos da unidade com o
// caminho da pasta e a situação de validade.
export async function documentSituationRows(unitId: string) {
  const folders = await db
    .select({ id: folder.id, parentId: folder.parentId, name: folder.name })
    .from(folder)
    .where(and(eq(folder.unitId, unitId), isNull(folder.deletedAt)));
  const byId = new Map(folders.map((node) => [node.id, node]));
  const pathOf = (folderId: string) => {
    const names: string[] = [];
    for (let node = byId.get(folderId); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
      names.unshift(node.name);
    }
    return names.join(' / ');
  };
  if (folders.length === 0) return [];

  const docs = await db
    .select({
      id: document.id,
      name: document.name,
      folderId: document.folderId,
      documentGroup: document.documentGroup,
      expiresAt: document.expiresAt,
      warnDaysBefore: document.warnDaysBefore,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .where(
      and(
        inArray(
          document.folderId,
          folders.map((node) => node.id),
        ),
        isNull(document.deletedAt),
      ),
    )
    .orderBy(asc(document.name));

  const today = todayDateString();
  return docs.map((doc) => ({
    ...doc,
    path: pathOf(doc.folderId),
    ...documentSituation(doc.expiresAt, doc.warnDaysBefore, today),
  }));
}

// Pendências do plano de ação (RF21). scope 'todas' inclui concluídas/canceladas.
export async function actionPlanRows(unitId: string, scope: 'pendencias' | 'todas') {
  const rows = await db
    .select({
      id: actionItem.id,
      status: actionItem.status,
      deadline: actionItem.deadline,
      completedAt: actionItem.completedAt,
      normCode: norm.code,
      normDescription: norm.description,
      adherence: diagnostic.status,
      responsible: diagnostic.responsible,
      recommendedAction: diagnostic.recommendedAction,
      createdAt: actionItem.createdAt,
    })
    .from(actionItem)
    .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
    .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
    .innerJoin(norm, eq(adequacyItem.normId, norm.id))
    .where(and(eq(adequacyItem.unitId, unitId), isNull(actionItem.deletedAt)))
    .orderBy(asc(actionItem.deadline));

  const today = todayDateString();
  const isPending = (status: ActionStatus) => status === 'pendente' || status === 'em_andamento';
  return rows
    .filter((row) => scope === 'todas' || isPending(row.status))
    .map((row) => ({ ...row, overdue: isPending(row.status) && row.deadline < today }));
}

// Dashboard da unidade (RF19): aderência, distribuição, grupos documentais,
// plano de ação e situação documental num payload só.
export async function unitOverview(unitId: string) {
  const [snapshot, actions, documents] = await Promise.all([
    adequacySnapshot(unitId),
    actionPlanRows(unitId, 'todas'),
    documentSituationRows(unitId),
  ]);

  const distribution: Record<DiagnosticStatus | 'sem_avaliacao', number> = {
    inexistente: 0,
    inadequada: 0,
    parcial: 0,
    suficiente: 0,
    plena: 0,
    sem_avaliacao: 0,
  };
  for (const row of snapshot) distribution[row.status ?? 'sem_avaliacao'] += 1;

  const groups = documentGroups.map((group) => {
    const rows = snapshot.filter((row) => row.documentGroup === group);
    return {
      group,
      count: rows.length,
      evaluated: rows.filter((row) => row.status !== null).length,
      percent: weightedPercent(rows),
    };
  });

  const actionCounts: Record<ActionStatus, number> = {
    pendente: 0,
    em_andamento: 0,
    concluida: 0,
    cancelada: 0,
  };
  for (const action of actions) actionCounts[action.status] += 1;

  const documentCounts: Record<DocumentSituation, number> = {
    vencido: 0,
    a_vencer: 0,
    em_dia: 0,
    sem_validade: 0,
  };
  for (const doc of documents) documentCounts[doc.situation] += 1;

  return {
    adherence: {
      percent: weightedPercent(snapshot),
      evaluated: snapshot.filter((row) => row.status !== null).length,
      activeTotal: snapshot.length,
      distribution,
    },
    groups,
    actions: {
      counts: actionCounts,
      overdue: actions.filter((action) => action.overdue).length,
    },
    documents: { counts: documentCounts, total: documents.length },
  };
}

// Evolução da aderência no tempo (relatório timeline do legado): varredura de
// diagnósticos por ponto — em cada data vale o último diagnóstico até ali.
// Itens ainda sem avaliação na data não entram na média (regra da v2).
export async function timelineSeries(
  unitId: string,
  from: string,
  to: string,
  interval: (typeof timelineIntervals)[number],
) {
  const items = await db
    .select({ id: adequacyItem.id, importanceWeight: norm.importanceWeight })
    .from(adequacyItem)
    .innerJoin(norm, eq(adequacyItem.normId, norm.id))
    .where(
      and(
        eq(adequacyItem.unitId, unitId),
        eq(adequacyItem.isActive, true),
        isNull(adequacyItem.deletedAt),
      ),
    );

  const points: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && points.length < 400) {
    points.push(cursor.toISOString().slice(0, 10));
    if (interval === 'daily') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (interval === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  if (items.length === 0 || points.length === 0) {
    return points.map((date) => ({ date, percent: null as number | null, evaluated: 0 }));
  }

  // Todos os diagnósticos até o fim do período, mais antigos primeiro —
  // inclui a baseline anterior ao início (último estado conhecido).
  const events = await db
    .select({
      adequacyItemId: diagnostic.adequacyItemId,
      status: diagnostic.status,
      createdAt: diagnostic.createdAt,
    })
    .from(diagnostic)
    .where(
      and(
        inArray(
          diagnostic.adequacyItemId,
          items.map((item) => item.id),
        ),
        lte(diagnostic.createdAt, new Date(`${to}T23:59:59.999Z`)),
        isNull(diagnostic.deletedAt),
      ),
    )
    .orderBy(asc(diagnostic.createdAt));

  const weightById = new Map(items.map((item) => [item.id, item.importanceWeight]));
  const current = new Map<string, DiagnosticStatus>();
  let pointer = 0;

  return points.map((date) => {
    const pointEnd = Date.parse(`${date}T23:59:59.999Z`);
    while (pointer < events.length && events[pointer]!.createdAt.getTime() <= pointEnd) {
      current.set(events[pointer]!.adequacyItemId, events[pointer]!.status);
      pointer += 1;
    }
    let weightSum = 0;
    let scoreSum = 0;
    for (const [itemId, status] of current) {
      const weight = weightById.get(itemId) ?? 0;
      weightSum += weight;
      scoreSum += weight * diagnosticStatusScore[status];
    }
    return {
      date,
      percent: weightSum > 0 ? Math.round((scoreSum / weightSum) * 100) : null,
      evaluated: current.size,
    };
  });
}

export const reportsRouter = router({
  overview: unitProcedure.query(({ input }) => unitOverview(input.unitId)),

  // Painel da empresa (RF19): aderência agregada por unidade visível ao
  // usuário (admin: todas; cliente: onde é membro — regra de units.listByCompany).
  companyOverview: protectedProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const visibleUnits =
        ctx.session.user.role === 'admin'
          ? await db
              .select({ id: unit.id, name: unit.name })
              .from(unit)
              .where(and(eq(unit.companyId, input.companyId), isNull(unit.deletedAt)))
              .orderBy(asc(unit.name))
          : await db
              .select({ id: unit.id, name: unit.name })
              .from(membership)
              .innerJoin(unit, eq(membership.unitId, unit.id))
              .where(
                and(
                  eq(membership.userId, ctx.session.user.id),
                  eq(unit.companyId, input.companyId),
                  isNull(membership.deletedAt),
                  isNull(unit.deletedAt),
                ),
              )
              .orderBy(asc(unit.name));
      if (visibleUnits.length === 0) return [];

      const items = await db
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
              visibleUnits.map((row) => row.id),
            ),
            eq(adequacyItem.isActive, true),
            isNull(adequacyItem.deletedAt),
          ),
        );

      const latest = new Map<string, DiagnosticStatus>();
      if (items.length > 0) {
        const rows = await db
          .select({ adequacyItemId: diagnostic.adequacyItemId, status: diagnostic.status })
          .from(diagnostic)
          .where(
            and(
              inArray(
                diagnostic.adequacyItemId,
                items.map((item) => item.id),
              ),
              isNull(diagnostic.deletedAt),
            ),
          )
          .orderBy(desc(diagnostic.createdAt));
        for (const row of rows) {
          if (!latest.has(row.adequacyItemId)) latest.set(row.adequacyItemId, row.status);
        }
      }

      return visibleUnits.map((row) => {
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

  timeline: unitProcedure
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        interval: z.enum(timelineIntervals).default('weekly'),
      }),
    )
    .query(({ input }) => timelineSeries(input.unitId, input.from, input.to, input.interval)),

  nonConformities: unitProcedure.query(({ input }) => nonConformityRows(input.unitId)),

  documentsSituation: unitProcedure.query(({ input }) => documentSituationRows(input.unitId)),

  actionPlan: unitProcedure
    .input(z.object({ scope: z.enum(['pendencias', 'todas']).default('pendencias') }))
    .query(({ input }) => actionPlanRows(input.unitId, input.scope)),
});
