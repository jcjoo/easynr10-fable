import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { compareNormCodes, weightedAdherencePercent } from '@easynr10/shared';

const { adequacyItem, diagnostic, diagnosticNc, norm } = schema;

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

// Relatório de Não Conformidades (RF21): as NCs GERADAS pelo último
// diagnóstico de cada item ativo (snapshot em diagnostic_nc) — o estado atual
// da unidade, orientado às NCs tabeladas em vez de aos itens da norma.
export async function nonConformityRows(db: Db, unitId: string) {
  const items = await db
    .select({
      id: adequacyItem.id,
      normCode: norm.code,
      normDescription: norm.description,
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
  if (items.length === 0) return [];

  // Último diagnóstico por item (mesma varredura do adequacySnapshot).
  const diags = await db
    .select({
      id: diagnostic.id,
      adequacyItemId: diagnostic.adequacyItemId,
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
  const latestByItem = new Map<string, (typeof diags)[number]>();
  for (const diag of diags) {
    if (!latestByItem.has(diag.adequacyItemId)) latestByItem.set(diag.adequacyItemId, diag);
  }
  if (latestByItem.size === 0) return [];

  const ncs = await db
    .select()
    .from(diagnosticNc)
    .where(
      and(
        inArray(
          diagnosticNc.diagnosticId,
          [...latestByItem.values()].map((diag) => diag.id),
        ),
        notDeleted(diagnosticNc),
      ),
    )
    .orderBy(asc(diagnosticNc.code));

  const byDiagnostic = new Map<string, typeof ncs>();
  for (const nc of ncs) {
    byDiagnostic.set(nc.diagnosticId, [...(byDiagnostic.get(nc.diagnosticId) ?? []), nc]);
  }

  const rows = items.flatMap((item) => {
    const latest = latestByItem.get(item.id);
    if (!latest) return [];
    return (byDiagnostic.get(latest.id) ?? []).map((nc) => ({
      id: nc.id,
      normCode: item.normCode,
      normDescription: item.normDescription,
      documentGroup: item.documentGroup,
      code: nc.code,
      description: nc.description,
      recommendedAction: nc.recommendedAction,
      requirementQuestion: nc.requirementQuestion,
      // Em requisitos de cadastro, a NC é por item (colaborador/equipamento).
      itemLabel: nc.itemLabel,
      adherence: nc.adherence,
      diagnosticAt: latest.createdAt,
    }));
  });
  rows.sort(
    (a, b) => compareNormCodes(a.normCode, b.normCode) || a.code.localeCompare(b.code),
  );
  return rows;
}
