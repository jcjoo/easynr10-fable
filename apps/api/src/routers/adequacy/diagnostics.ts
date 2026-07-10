import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import {
  diagnosticAdherenceScore,
  diagnosticCreateSchema,
  scoreToStatus,
} from '@easynr10/shared';
import { z } from 'zod';
import { unitAction } from '../../trpc';
import { findUnitAdequacyItem } from './shared';

const { actionItem, adequacyItem, diagnostic, document, evidence, evidenceItem, user } = schema;

// Diagnósticos do item (RF14–RF16): registrar, histórico e evidências snapshot.

export const diagnosticProcedures = {
  // Histórico de diagnósticos do item.
  history: unitAction('diagnostico.ler')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      return ctx.db
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
    }),

  // Novo diagnóstico; a aderência do item é CALCULADA pela média das notas das
  // evidências (peso 1 cada). Abaixo de Plena com prazo gera ação (RF16).
  diagnose: unitAction('diagnostico.avaliar').input(diagnosticCreateSchema).mutation(async ({ ctx, input }) => {
    const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
    const evidences = input.evidences ?? [];
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
      return created;
    });
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
