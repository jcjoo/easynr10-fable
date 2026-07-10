import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import {
  actionPriority,
  compareNormCodes,
  diagnosticStatusScore,
  documentGroups,
  documentSituation,
  localDateString,
  timelineIntervals,
  weightedAdherencePercent,
  type ActionStatus,
  type DiagnosticStatus,
  type DocumentSituation,
} from '@easynr10/shared';

import { visibleUnits, type Viewer } from './visibility';

const { actionItem, adequacyItem, company, diagnostic, document, folder, norm } = schema;

// Camada de dados dos relatórios/dashboards (RF19–RF22) — consumida pelo
// router tRPC (telas) E pela rota HTTP de exportação; nenhum dos dois conhece
// SQL, só este serviço.

// Itens de adequação ATIVOS da unidade com a norma e o último diagnóstico —
// base do dashboard, do relatório de não conformidades e da aderência geral.
export async function adequacySnapshot(db: Db, unitId: string) {
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
        notDeleted(adequacyItem),
      ),
    );
  items.sort((a, b) => compareNormCodes(a.normCode, b.normCode));
  if (items.length === 0) return [];

  const rows = await db
    .select({
      adequacyItemId: diagnostic.adequacyItemId,
      status: diagnostic.status,
      score: diagnostic.score,
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
        notDeleted(diagnostic),
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
      score: last?.score ?? null,
      deadline: last?.deadline ?? null,
      responsible: last?.responsible ?? null,
      recommendedAction: last?.recommendedAction ?? null,
      lastDiagnosticAt: last?.createdAt ?? null,
    };
  });
}

// Aderência agregada (mesma regra do topo do Diagnóstico): média dos scores
// ponderada pelo peso da norma, só dos itens avaliados — regra única no
// shared (weightedAdherencePercent), compartilhada com a Visão Geral do front.
export const weightedPercent = weightedAdherencePercent;

// Relatório de Não Conformidades (RF21): itens ativos abaixo de Plena,
// incluindo os sem avaliação (não conformidade presumida até avaliar).
// O peso da norma fica no servidor (só alimenta as médias ponderadas).
export async function nonConformityRows(db: Db, unitId: string) {
  const snapshot = await adequacySnapshot(db, unitId);
  return snapshot
    .filter((row) => row.status !== 'plena')
    .map(({ importanceWeight: _importanceWeight, ...row }) => row);
}

// Regra única de vencimento no shared (mesma do front) — re-exportada para
// os consumidores da camada de relatórios.
export { documentSituation } from '@easynr10/shared';

// Situação documental do PIE (RF21): todos os documentos da unidade com o
// caminho da pasta e a situação de validade.
export async function documentSituationRows(db: Db, unitId: string) {
  const folders = await db
    .select({ id: folder.id, parentId: folder.parentId, name: folder.name })
    .from(folder)
    .where(and(eq(folder.unitId, unitId), notDeleted(folder)));
  const byId = new Map(folders.map((node) => [node.id, node]));
  const pathOf = (folderId: string) => {
    const names: string[] = [];
    for (
      let node = byId.get(folderId);
      node;
      node = node.parentId ? byId.get(node.parentId) : undefined
    ) {
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
        notDeleted(document),
      ),
    )
    .orderBy(asc(document.name));

  const today = localDateString();
  return docs.map((doc) => ({
    ...doc,
    path: pathOf(doc.folderId),
    ...documentSituation(doc.expiresAt, doc.warnDaysBefore, today),
  }));
}

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

// Dashboard da unidade (RF19): aderência, distribuição, grupos documentais,
// plano de ação e situação documental num payload só.
export async function unitOverview(db: Db, unitId: string) {
  const [snapshot, actions, documents] = await Promise.all([
    adequacySnapshot(db, unitId),
    actionPlanRows(db, unitId, 'todas'),
    documentSituationRows(db, unitId),
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

// Painel geral (rota /): pendências consolidadas de TODAS as unidades
// visíveis ao usuário — documentos vencidos/a vencer, itens de adequação sem
// diagnóstico e ações do plano pendentes/atrasadas, agrupadas por empresa.
// Mesma regra de visibilidade do companyOverview (admin: tudo; cliente:
// unidades onde é membro), sem exigir papel por unidade.
export async function globalOverview(db: Db, viewer: Viewer) {
  const totals = {
    expiredDocs: 0,
    expiringDocs: 0,
    unevaluated: 0,
    overdueActions: 0,
    pendingActions: 0,
  };
  const units = await visibleUnits(db, viewer);
  if (units.length === 0) return { totals, companies: [] };

  const unitIds = units.map((row) => row.id);
  const companyIds = [...new Set(units.map((row) => row.companyId))];

  const [companies, items, docs, actions] = await Promise.all([
    db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(and(inArray(company.id, companyIds), notDeleted(company)))
      .orderBy(asc(company.name)),
    db
      .select({
        id: adequacyItem.id,
        unitId: adequacyItem.unitId,
        importanceWeight: norm.importanceWeight,
      })
      .from(adequacyItem)
      .innerJoin(norm, eq(adequacyItem.normId, norm.id))
      .where(
        and(
          inArray(adequacyItem.unitId, unitIds),
          eq(adequacyItem.isActive, true),
          notDeleted(adequacyItem),
        ),
      ),
    db
      .select({
        unitId: folder.unitId,
        expiresAt: document.expiresAt,
        warnDaysBefore: document.warnDaysBefore,
      })
      .from(document)
      .innerJoin(folder, eq(document.folderId, folder.id))
      .where(and(inArray(folder.unitId, unitIds), notDeleted(document), notDeleted(folder))),
    db
      .select({
        unitId: adequacyItem.unitId,
        status: actionItem.status,
        deadline: actionItem.deadline,
      })
      .from(actionItem)
      .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
      .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
      .where(and(inArray(adequacyItem.unitId, unitIds), notDeleted(actionItem))),
  ]);

  // Último diagnóstico por item — mesma varredura do adequacySnapshot.
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
          notDeleted(diagnostic),
        ),
      )
      .orderBy(desc(diagnostic.createdAt));
    for (const row of rows) {
      if (!latest.has(row.adequacyItemId)) latest.set(row.adequacyItemId, row.status);
    }
  }

  const today = localDateString();
  const isPending = (status: ActionStatus) => status === 'pendente' || status === 'em_andamento';
  const unitRows = units.map((row) => {
    const unitItems = items
      .filter((item) => item.unitId === row.id)
      .map((item) => ({
        importanceWeight: item.importanceWeight,
        status: latest.get(item.id) ?? null,
      }));
    const situations = docs
      .filter((doc) => doc.unitId === row.id)
      .map((doc) => documentSituation(doc.expiresAt, doc.warnDaysBefore, today).situation);
    const pending = actions.filter((action) => action.unitId === row.id && isPending(action.status));
    return {
      unitId: row.id,
      companyId: row.companyId,
      name: row.name,
      percent: weightedPercent(unitItems),
      activeTotal: unitItems.length,
      unevaluated: unitItems.filter((item) => item.status === null).length,
      expiredDocs: situations.filter((situation) => situation === 'vencido').length,
      expiringDocs: situations.filter((situation) => situation === 'a_vencer').length,
      pendingActions: pending.length,
      overdueActions: pending.filter((action) => action.deadline < today).length,
    };
  });

  for (const row of unitRows) {
    totals.expiredDocs += row.expiredDocs;
    totals.expiringDocs += row.expiringDocs;
    totals.unevaluated += row.unevaluated;
    totals.overdueActions += row.overdueActions;
    totals.pendingActions += row.pendingActions;
  }

  return {
    totals,
    companies: companies.map((row) => ({
      ...row,
      units: unitRows.filter((unitRow) => unitRow.companyId === row.id),
    })),
  };
}

// Evolução da aderência no tempo (relatório timeline do legado): varredura de
// diagnósticos por ponto — em cada data vale o último diagnóstico até ali.
// Itens ainda sem avaliação na data não entram na média (regra da v2).
export async function timelineSeries(
  db: Db,
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
        notDeleted(adequacyItem),
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
        notDeleted(diagnostic),
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
