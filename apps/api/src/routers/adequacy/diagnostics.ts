import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { diagnosticCreateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../../db';
import { unitAction } from '../../trpc';
import { findUnitAdequacyItem } from './shared';

const { actionItem, adequacyItem, diagnostic, document, evidence, evidenceItem, user } = schema;

// Diagnósticos do item (RF14–RF16): registrar, histórico e evidências snapshot.

export const diagnosticProcedures = {
  // Histórico de diagnósticos do item.
  history: unitAction('diagnostico.ler')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ input }) => {
      const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
      return db
        .select({
          id: diagnostic.id,
          status: diagnostic.status,
          deadline: diagnostic.deadline,
          responsible: diagnostic.responsible,
          recommendedAction: diagnostic.recommendedAction,
          technicalOpinion: diagnostic.technicalOpinion,
          author: user.name,
          createdAt: diagnostic.createdAt,
        })
        .from(diagnostic)
        .leftJoin(user, eq(diagnostic.authorId, user.id))
        .where(and(eq(diagnostic.adequacyItemId, item.id), isNull(diagnostic.deletedAt)))
        .orderBy(desc(diagnostic.createdAt));
    }),

  // Novo diagnóstico; aderência abaixo de Plena com prazo gera ação (RF16).
  diagnose: unitAction('diagnostico.avaliar').input(diagnosticCreateSchema).mutation(async ({ ctx, input }) => {
    const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(diagnostic)
        .values({
          adequacyItemId: item.id,
          authorId: ctx.session.user.id,
          status: input.status,
          deadline: input.deadline ?? null,
          responsible: input.responsible ?? null,
          recommendedAction: input.recommendedAction ?? null,
          technicalOpinion: input.technicalOpinion ?? null,
        })
        .returning();
      if (input.status !== 'plena' && input.deadline) {
        await tx.insert(actionItem).values({
          diagnosticId: created!.id,
          deadline: input.deadline,
        });
      }
      // Evidências snapshot (§7.6): type/question copiados do requisito no
      // momento do diagnóstico + itens de prova.
      for (const ev of input.evidences ?? []) {
        const [createdEvidence] = await tx
          .insert(evidence)
          .values({ diagnosticId: created!.id, type: ev.type, question: ev.question })
          .returning();
        await tx.insert(evidenceItem).values(
          ev.items.map((item) => ({
            evidenceId: createdEvidence!.id,
            label: item.label,
            answer: item.answer ?? null,
            documentId: item.documentId ?? null,
            employeeId: item.employeeId ?? null,
            equipmentId: item.equipmentId ?? null,
          })),
        );
      }
      return created;
    });
  }),

  // Evidências (snapshot) de um diagnóstico do histórico.
  diagnosticEvidences: unitAction('diagnostico.ler')
    .input(z.object({ diagnosticId: z.uuid() }))
    .query(async ({ input }) => {
      const [found] = await db
        .select({ id: diagnostic.id })
        .from(diagnostic)
        .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
        .where(
          and(eq(diagnostic.id, input.diagnosticId), eq(adequacyItem.unitId, input.unitId)),
        );
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Diagnóstico não encontrado' });
      }
      const evidences = await db
        .select({ id: evidence.id, type: evidence.type, question: evidence.question })
        .from(evidence)
        .where(and(eq(evidence.diagnosticId, found.id), isNull(evidence.deletedAt)))
        .orderBy(asc(evidence.createdAt));
      if (evidences.length === 0) return [];

      const items = await db
        .select({
          id: evidenceItem.id,
          evidenceId: evidenceItem.evidenceId,
          label: evidenceItem.label,
          answer: evidenceItem.answer,
          documentId: evidenceItem.documentId,
          documentName: document.name,
        })
        .from(evidenceItem)
        .leftJoin(document, eq(evidenceItem.documentId, document.id))
        .where(
          and(
            inArray(
              evidenceItem.evidenceId,
              evidences.map((row) => row.id),
            ),
            isNull(evidenceItem.deletedAt),
          ),
        )
        .orderBy(asc(evidenceItem.createdAt));

      return evidences.map((row) => ({
        ...row,
        items: items.filter((item) => item.evidenceId === row.id),
      }));
    }),
};
