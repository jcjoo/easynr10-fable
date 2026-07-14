import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import {
  daysUntilExpiry,
  diagnosticAdherenceScore,
  diagnosticCreateSchema,
  formatDate,
  scoreToStatus,
  worstStatus,
  type DiagnosticStatus,
  type EvidenceInput,
} from '@easynr10/shared';
import { z } from 'zod';
import { unitAction } from '../../trpc';
import { propagateEvidenceAdherence } from '../../services/adherence';
import { findUnitAdequacyItem } from './shared';

const {
  actionItem,
  adequacyItem,
  adequacyItemNc,
  diagnostic,
  diagnosticNc,
  document,
  evidence,
  evidenceItem,
  folder,
  user,
} = schema;

type NcConfig = typeof adequacyItemNc.$inferSelect;

// NC gerada no diagnóstico (marcada pelo consultor ou automática de documento
// vencido) — vira linha de diagnostic_nc.
interface FiredNc {
  code: string;
  description: string;
  recommendedAction: string;
  adherence: DiagnosticStatus;
  question: string;
  itemLabel: string | null;
}

interface EvidenceDoc {
  name: string;
  expiresAt: string | null;
}

// Documentos citados nas evidências (nome + vencimento), escopados à unidade —
// a base das regras de documento faltante/vencido.
async function evidenceDocuments(db: Db, unitId: string, evidences: EvidenceInput[]) {
  const ids = [
    ...new Set(
      evidences.flatMap((ev) => ev.items.flatMap((item) => (item.documentId ? [item.documentId] : []))),
    ),
  ];
  if (ids.length === 0) return new Map<string, EvidenceDoc>();
  const rows = await db
    .select({ id: document.id, name: document.name, expiresAt: document.expiresAt })
    .from(document)
    .innerJoin(folder, eq(document.folderId, folder.id))
    .where(and(inArray(document.id, ids), eq(folder.unitId, unitId), notDeleted(document)));
  return new Map(rows.map((row) => [row.id, { name: row.name, expiresAt: row.expiresAt }]));
}

const isExpired = (doc: EvidenceDoc | undefined) =>
  Boolean(doc?.expiresAt && daysUntilExpiry(doc.expiresAt) < 0);

// NC automática de documento vencido (Parcial) — soma-se à NC marcada; a nota
// do requisito/item é a MENOR entre as duas.
function expiredNc(doc: EvidenceDoc, question: string, itemLabel: string | null): FiredNc {
  return {
    code: 'VENC',
    description: `Documento vinculado vencido: ${doc.name} (venceu em ${formatDate(doc.expiresAt)}).`,
    recommendedAction: 'Renovar/atualizar o documento vinculado.',
    adherence: 'parcial',
    question,
    itemLabel,
  };
}

// A NOTA vem das NCs que atingem o requisito: a marcada pelo consultor + a
// automática de documento vencido — com mais de uma, vale a MENOR. Marcar NC
// é opcional: sem NC, requisito de documento COM documento está Pleno; SEM
// documento, Conforme não se aplica — conta como Inexistente (documento
// faltante). Sem documento só se aceita NC Inexistente; com documento,
// Inexistente é vetada. Requisito SEM NENHUMA NC configurada volta ao modo
// manual — a nota do cliente vale (a regra do vencido continua valendo).
function deriveFromNcs(
  evidences: EvidenceInput[],
  configs: NcConfig[],
  docs: Map<string, EvidenceDoc>,
): { evidences: EvidenceInput[]; fired: FiredNc[] } {
  const byId = new Map(configs.map((nc) => [nc.id, nc]));
  const withNcs = new Set(configs.flatMap((nc) => (nc.requirementId ? [nc.requirementId] : [])));
  const fired: FiredNc[] = [];

  const resolve = (ncId: string | null | undefined, requirementId: string | null | undefined) => {
    const nc = ncId ? byId.get(ncId) : undefined;
    if (!nc || !requirementId || nc.requirementId !== requirementId) return null;
    return nc;
  };

  // Nota da parte "escolhida" + regra do vencido; registra as NCs geradas.
  const settle = (
    base: DiagnosticStatus | null,
    documentId: string | null | undefined,
    question: string,
    itemLabel: string | null,
  ): DiagnosticStatus | null => {
    const doc = documentId ? docs.get(documentId) : undefined;
    if (!isExpired(doc)) return base;
    fired.push(expiredNc(doc!, question, itemLabel));
    // Sem nota (manual em branco) já conta como Inexistente — pior que Parcial.
    return base === null ? null : worstStatus(base, 'parcial');
  };

  // NC × documento: sem documento vinculado, o requisito está ausente — só NC
  // Inexistente; COM documento, ausência não se aplica — Inexistente é vetada.
  const assertNcMatchesDocument = (
    nc: NcConfig | null,
    documentId: string | null | undefined,
    question: string,
  ) => {
    if (!nc) return;
    if (nc.adherence !== 'inexistente' && !documentId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Sem documento vinculado, "${question}" só aceita NC de nota Inexistente (${nc.code} implica outra nota).`,
      });
    }
    if (nc.adherence === 'inexistente' && documentId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Com documento vinculado, "${question}" não aceita NC de nota Inexistente (${nc.code}).`,
      });
    }
  };

  const derived = evidences.map((ev) => {
    const manual = !ev.requirementId || !withNcs.has(ev.requirementId);
    if (ev.type === 'cadastro') {
      return {
        ...ev,
        adherence: null,
        items: ev.items.map((item) => {
          if (manual) {
            return {
              ...item,
              ncId: null,
              adherence: settle(item.adherence ?? null, item.documentId, ev.question, item.label),
            };
          }
          const nc = resolve(item.ncId, ev.requirementId);
          assertNcMatchesDocument(nc, item.documentId, ev.question);
          if (nc) fired.push({ ...nc, question: ev.question, itemLabel: item.label });
          // Sem NC: Pleno com documento; Inexistente sem (Conforme bloqueado).
          const base = nc
            ? nc.adherence
            : item.documentId
              ? ('plena' as const)
              : ('inexistente' as const);
          return {
            ...item,
            adherence: settle(base, item.documentId, ev.question, item.label) ?? base,
          };
        }),
      };
    }

    const documentId = ev.type === 'document' ? ev.items[0]?.documentId : null;
    if (manual) {
      return {
        ...ev,
        ncId: null,
        adherence: settle(ev.adherence ?? null, documentId, ev.question, null),
      };
    }
    const nc = resolve(ev.ncId, ev.requirementId);
    if (ev.type === 'document') assertNcMatchesDocument(nc, documentId, ev.question);
    if (nc) fired.push({ ...nc, question: ev.question, itemLabel: null });
    // Sem NC: Pleno — exceto requisito de documento SEM documento vinculado
    // (Conforme bloqueado ⇒ Inexistente, documento faltante).
    const base = nc
      ? nc.adherence
      : ev.type === 'document' && !documentId
        ? ('inexistente' as const)
        : ('plena' as const);
    return { ...ev, adherence: settle(base, documentId, ev.question, null) ?? base };
  });

  return { evidences: derived, fired };
}

// Diagnósticos do item (RF14–RF16): registrar, histórico e evidências snapshot.

export const diagnosticProcedures = {
  // Histórico de diagnósticos do item, com a contagem de NCs marcadas em cada
  // um (a linha do tempo da tela de histórico mostra "N NCs" por entrada).
  history: unitAction('diagnostico.ler')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      const rows = await ctx.db
        .select({
          id: diagnostic.id,
          status: diagnostic.status,
          score: diagnostic.score,
          deadline: diagnostic.deadline,
          responsible: diagnostic.responsible,
          recommendedAction: diagnostic.recommendedAction,
          technicalOpinion: diagnostic.technicalOpinion,
          author: user.name,
          createdAt: diagnostic.createdAt,
        })
        .from(diagnostic)
        .leftJoin(user, eq(diagnostic.authorId, user.id))
        .where(and(eq(diagnostic.adequacyItemId, item.id), notDeleted(diagnostic)))
        .orderBy(desc(diagnostic.createdAt));
      if (rows.length === 0) return [];

      const counts = await ctx.db
        .select({ diagnosticId: diagnosticNc.diagnosticId, total: count() })
        .from(diagnosticNc)
        .where(
          and(
            inArray(
              diagnosticNc.diagnosticId,
              rows.map((row) => row.id),
            ),
            notDeleted(diagnosticNc),
          ),
        )
        .groupBy(diagnosticNc.diagnosticId);
      const countById = new Map(counts.map((row) => [row.diagnosticId, row.total]));
      return rows.map((row) => ({ ...row, ncCount: countById.get(row.id) ?? 0 }));
    }),

  // Novo diagnóstico; a aderência do item é CALCULADA pela média das notas das
  // evidências (peso 1 cada). Abaixo de Plena com prazo gera ação (RF16).
  diagnose: unitAction('diagnostico.avaliar').input(diagnosticCreateSchema).mutation(async ({ ctx, input }) => {
    const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);

    // As notas são derivadas das NCs marcadas (config do item é a autoridade;
    // em requisito COM NCs a nota do cliente é descartada). Sem NC = Plena;
    // requisito sem NC configurada aceita a nota manual do cliente. Documento
    // vinculado vencido soma a NC automática (Parcial) — vale a menor nota.
    const ncConfigs = await ctx.db
      .select()
      .from(adequacyItemNc)
      .where(and(eq(adequacyItemNc.adequacyItemId, item.id), notDeleted(adequacyItemNc)));
    const docs = await evidenceDocuments(ctx.db, input.unitId, input.evidences ?? []);
    const { evidences, fired } = deriveFromNcs(input.evidences ?? [], ncConfigs, docs);

    const score = Math.round(diagnosticAdherenceScore(evidences) * 100);
    const status = scoreToStatus(score);
    return ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(diagnostic)
        .values({
          adequacyItemId: item.id,
          authorId: ctx.session.user.id,
          status,
          score,
          deadline: input.deadline ?? null,
          responsible: input.responsible ?? null,
          recommendedAction: input.recommendedAction ?? null,
          technicalOpinion: input.technicalOpinion ?? null,
        })
        .returning();
      if (status !== 'plena' && input.deadline) {
        await tx.insert(actionItem).values({
          diagnosticId: created!.id,
          deadline: input.deadline,
        });
      }
      // Evidências snapshot (§7.6): type/question/nota copiados do requisito no
      // momento do diagnóstico + itens de prova (com nota nos itens de cadastro).
      for (const ev of evidences) {
        const [createdEvidence] = await tx
          .insert(evidence)
          .values({
            diagnosticId: created!.id,
            type: ev.type,
            question: ev.question,
            adherence: ev.adherence ?? null,
          })
          .returning();
        await tx.insert(evidenceItem).values(
          ev.items.map((evItem) => ({
            evidenceId: createdEvidence!.id,
            label: evItem.label,
            answer: evItem.answer ?? null,
            documentId: evItem.documentId ?? null,
            employeeId: evItem.employeeId ?? null,
            equipmentId: evItem.equipmentId ?? null,
            adherence: evItem.adherence ?? null,
          })),
        );
      }

      // — NCs geradas (snapshot, como as evidências): as marcadas pelo
      // consultor + as automáticas de documento vencido; em cadastro, uma
      // linha por item. A tela de Não Conformidades lê daqui. —
      if (fired.length > 0) {
        await tx.insert(diagnosticNc).values(
          fired.map((nc) => ({
            diagnosticId: created!.id,
            code: nc.code,
            description: nc.description,
            recommendedAction: nc.recommendedAction,
            requirementQuestion: nc.question,
            itemLabel: nc.itemLabel,
            adherence: nc.adherence,
          })),
        );
      }

      // Propaga as notas de volta aos módulos de origem (P.I.E, Cadastros):
      // as operações — e as validações de escopo — são dos módulos donos, em
      // services/adherence.ts; aqui só se entrega o lote, na mesma transação.
      await propagateEvidenceAdherence(tx, input.unitId, evidences);
      return created;
    });
  }),

  // NCs marcadas (snapshot) de um diagnóstico do histórico — as fichas que a
  // tela de histórico mostra no detalhe de cada diagnóstico.
  diagnosticNcs: unitAction('diagnostico.ler')
    .input(z.object({ diagnosticId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [found] = await ctx.db
        .select({ id: diagnostic.id })
        .from(diagnostic)
        .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
        .where(
          and(eq(diagnostic.id, input.diagnosticId), eq(adequacyItem.unitId, input.unitId)),
        );
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Diagnóstico não encontrado' });
      }
      return ctx.db
        .select({
          id: diagnosticNc.id,
          code: diagnosticNc.code,
          description: diagnosticNc.description,
          recommendedAction: diagnosticNc.recommendedAction,
          requirementQuestion: diagnosticNc.requirementQuestion,
          itemLabel: diagnosticNc.itemLabel,
          adherence: diagnosticNc.adherence,
        })
        .from(diagnosticNc)
        .where(and(eq(diagnosticNc.diagnosticId, found.id), notDeleted(diagnosticNc)))
        .orderBy(asc(diagnosticNc.code), asc(diagnosticNc.createdAt));
    }),

  // Evidências (snapshot) de um diagnóstico do histórico.
  diagnosticEvidences: unitAction('diagnostico.ler')
    .input(z.object({ diagnosticId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [found] = await ctx.db
        .select({ id: diagnostic.id })
        .from(diagnostic)
        .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
        .where(
          and(eq(diagnostic.id, input.diagnosticId), eq(adequacyItem.unitId, input.unitId)),
        );
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Diagnóstico não encontrado' });
      }
      const evidences = await ctx.db
        .select({
          id: evidence.id,
          type: evidence.type,
          question: evidence.question,
          adherence: evidence.adherence,
        })
        .from(evidence)
        .where(and(eq(evidence.diagnosticId, found.id), notDeleted(evidence)))
        .orderBy(asc(evidence.createdAt));
      if (evidences.length === 0) return [];

      const items = await ctx.db
        .select({
          id: evidenceItem.id,
          evidenceId: evidenceItem.evidenceId,
          label: evidenceItem.label,
          answer: evidenceItem.answer,
          documentId: evidenceItem.documentId,
          documentName: document.name,
          adherence: evidenceItem.adherence,
        })
        .from(evidenceItem)
        .leftJoin(document, eq(evidenceItem.documentId, document.id))
        .where(
          and(
            inArray(
              evidenceItem.evidenceId,
              evidences.map((row) => row.id),
            ),
            notDeleted(evidenceItem),
          ),
        )
        .orderBy(asc(evidenceItem.createdAt));

      return evidences.map((row) => ({
        ...row,
        items: items.filter((item) => item.evidenceId === row.id),
      }));
    }),
};
