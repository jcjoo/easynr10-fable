import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import {
  documentGroups,
  documentSituation,
  localDateString,
  type ActionStatus,
  type DiagnosticStatus,
  type DocumentSituation,
} from '@easynr10/shared';
import { visibleUnits, type Viewer } from '../visibility';
import { adequacySnapshot, weightedPercent } from './adequacy';
import { actionPlanRows } from './actions';
import { documentSituationRows } from './documents';

const { actionItem, adequacyItem, company, diagnostic, document, folder, norm } = schema;

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
