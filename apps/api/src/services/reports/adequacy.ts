import { and, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { compareNormCodes, weightedAdherencePercent } from '@easynr10/shared';

const { adequacyItem, diagnostic, norm } = schema;

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
