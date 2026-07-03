import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import {
  actionItemStatusSchema,
  adequacyItemUpdateSchema,
  diagnosticCreateSchema,
  requirementCreateSchema,
} from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { router, unitProcedure } from '../trpc';

const {
  adequacyItem,
  adequacyItemRequirement,
  actionItem,
  defaultDocument,
  diagnostic,
  document,
  evidence,
  evidenceItem,
  folder,
  norm,
  normRequirement,
  registerGroup,
  registerItem,
  user,
} = schema;

// Ordenação natural de códigos de norma: 10.2.4a < 10.2.4b < 10.11.7
// (ordenar como texto colocaria 10.11 antes de 10.2).
function compareNormCodes(a: string, b: string) {
  const segmentsA = a.split('.');
  const segmentsB = b.split('.');
  const length = Math.max(segmentsA.length, segmentsB.length);
  for (let index = 0; index < length; index += 1) {
    const rawA = segmentsA[index] ?? '';
    const rawB = segmentsB[index] ?? '';
    const numberA = parseInt(rawA, 10) || 0;
    const numberB = parseInt(rawB, 10) || 0;
    if (numberA !== numberB) return numberA - numberB;
    const suffixA = rawA.replace(/^\d+/, '');
    const suffixB = rawB.replace(/^\d+/, '');
    if (suffixA !== suffixB) return suffixA.localeCompare(suffixB);
  }
  return 0;
}

async function findUnitAdequacyItem(unitId: string, adequacyItemId: string) {
  const found = await db.query.adequacyItem.findFirst({
    where: and(
      eq(adequacyItem.id, adequacyItemId),
      eq(adequacyItem.unitId, unitId),
      isNull(adequacyItem.deletedAt),
    ),
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Item de adequação não encontrado' });
  }
  return found;
}

// Copia os requisitos do catálogo (norm_requirement) para o item UMA vez —
// como o evento adequacyItem.created do legado, mas lazy (itens antigos
// ganham os requisitos no primeiro acesso). Conta também os excluídos para
// não ressuscitar requisitos que o consultor removeu.
async function ensureItemRequirements(item: { id: string; normId: string }) {
  const [existing] = await db
    .select({ total: count() })
    .from(adequacyItemRequirement)
    .where(eq(adequacyItemRequirement.adequacyItemId, item.id));
  if ((existing?.total ?? 0) > 0) return;

  const templates = await db
    .select({ type: normRequirement.type, question: normRequirement.question })
    .from(normRequirement)
    .where(and(eq(normRequirement.normId, item.normId), isNull(normRequirement.deletedAt)));
  if (templates.length === 0) return;

  await db.insert(adequacyItemRequirement).values(
    templates.map((template) => ({
      adequacyItemId: item.id,
      type: template.type,
      question: template.question,
    })),
  );
}

export const adequacyRouter = router({
  // Itens de adequação da unidade com a aderência do diagnóstico mais recente.
  list: unitProcedure.query(async ({ input }) => {
    const items = await db
      .select({
        id: adequacyItem.id,
        isActive: adequacyItem.isActive,
        orientation: adequacyItem.orientation,
        normCode: norm.code,
        normDescription: norm.description,
        normOrientation: norm.orientation,
        importanceWeight: norm.importanceWeight,
        documentGroup: norm.documentGroup,
      })
      .from(adequacyItem)
      .innerJoin(norm, eq(adequacyItem.normId, norm.id))
      .where(and(eq(adequacyItem.unitId, input.unitId), isNull(adequacyItem.deletedAt)));

    items.sort((a, b) => compareNormCodes(a.normCode, b.normCode));

    if (items.length === 0) return [];

    // Diagnóstico mais recente por item (reduzido em memória — volume: ~90 itens).
    const rows = await db
      .select({
        adequacyItemId: diagnostic.adequacyItemId,
        status: diagnostic.status,
        deadline: diagnostic.deadline,
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

    return items.map((item) => ({
      ...item,
      status: latest.get(item.id)?.status ?? null,
      deadline: latest.get(item.id)?.deadline ?? null,
      lastDiagnosticAt: latest.get(item.id)?.createdAt ?? null,
    }));
  }),

  // Gera os itens da unidade a partir do catálogo de normas (idempotente).
  generate: unitProcedure.mutation(async ({ input }) => {
    const norms = await db
      .select({ id: norm.id })
      .from(norm)
      .where(isNull(norm.deletedAt));
    if (norms.length === 0) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Catálogo de normas vazio' });
    }
    const inserted = await db
      .insert(adequacyItem)
      .values(norms.map((row) => ({ unitId: input.unitId, normId: row.id })))
      .onConflictDoNothing()
      .returning();
    // Requisitos do catálogo entram junto com os itens (§7.6).
    for (const item of inserted) {
      await ensureItemRequirements(item);
    }
    return { created: inserted.length };
  }),

  // — Configuração do item (RF13.1) —

  itemDetail: unitProcedure
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ input }) => {
      const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
      const [row] = await db
        .select({
          id: adequacyItem.id,
          isActive: adequacyItem.isActive,
          orientation: adequacyItem.orientation,
          normCode: norm.code,
          normDescription: norm.description,
          normOrientation: norm.orientation,
          importanceWeight: norm.importanceWeight,
        })
        .from(adequacyItem)
        .innerJoin(norm, eq(adequacyItem.normId, norm.id))
        .where(eq(adequacyItem.id, item.id));
      return row!;
    }),

  updateItem: unitProcedure.input(adequacyItemUpdateSchema).mutation(async ({ input }) => {
    const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
    await db
      .update(adequacyItem)
      .set({ isActive: input.isActive, orientation: input.orientation ?? null })
      .where(eq(adequacyItem.id, item.id));
    return { success: true };
  }),

  // Requisitos de evidência do item (copiados do catálogo no primeiro acesso).
  requirements: unitProcedure
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ input }) => {
      const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
      await ensureItemRequirements(item);
      return db
        .select({
          id: adequacyItemRequirement.id,
          type: adequacyItemRequirement.type,
          question: adequacyItemRequirement.question,
          registerGroupId: adequacyItemRequirement.registerGroupId,
          registerGroupName: registerGroup.name,
          defaultDocumentId: adequacyItemRequirement.defaultDocumentId,
          defaultDocumentName: defaultDocument.name,
        })
        .from(adequacyItemRequirement)
        .leftJoin(registerGroup, eq(adequacyItemRequirement.registerGroupId, registerGroup.id))
        .leftJoin(
          defaultDocument,
          eq(adequacyItemRequirement.defaultDocumentId, defaultDocument.id),
        )
        .where(
          and(
            eq(adequacyItemRequirement.adequacyItemId, item.id),
            isNull(adequacyItemRequirement.deletedAt),
          ),
        )
        .orderBy(asc(adequacyItemRequirement.createdAt));
    }),

  addRequirement: unitProcedure.input(requirementCreateSchema).mutation(async ({ input }) => {
    const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
    if (input.registerGroupId) {
      const group = await db.query.registerGroup.findFirst({
        where: and(
          eq(registerGroup.id, input.registerGroupId),
          eq(registerGroup.unitId, input.unitId),
          isNull(registerGroup.deletedAt),
        ),
      });
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Grupo de cadastro não encontrado' });
      }
    }
    const [created] = await db
      .insert(adequacyItemRequirement)
      .values({
        adequacyItemId: item.id,
        type: input.type,
        question: input.question,
        registerGroupId: input.type === 'group' ? input.registerGroupId : null,
        defaultDocumentId: input.type === 'group' ? input.defaultDocumentId : null,
      })
      .returning();
    return created;
  }),

  removeRequirement: unitProcedure
    .input(z.object({ requirementId: z.uuid() }))
    .mutation(async ({ input }) => {
      const [row] = await db
        .select({ id: adequacyItemRequirement.id })
        .from(adequacyItemRequirement)
        .innerJoin(adequacyItem, eq(adequacyItemRequirement.adequacyItemId, adequacyItem.id))
        .where(
          and(
            eq(adequacyItemRequirement.id, input.requirementId),
            eq(adequacyItem.unitId, input.unitId),
            isNull(adequacyItemRequirement.deletedAt),
          ),
        );
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Requisito não encontrado' });
      }
      await db
        .update(adequacyItemRequirement)
        .set({ deletedAt: new Date() })
        .where(eq(adequacyItemRequirement.id, row.id));
      return { success: true };
    }),

  removeAllRequirements: unitProcedure
    .input(z.object({ adequacyItemId: z.uuid() }))
    .mutation(async ({ input }) => {
      const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
      await db
        .update(adequacyItemRequirement)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(adequacyItemRequirement.adequacyItemId, item.id),
            isNull(adequacyItemRequirement.deletedAt),
          ),
        );
      return { success: true };
    }),

  // Expande um requisito tipo group: um item de prova por membro do grupo,
  // com sugestão de documento pela pasta do item (legado: EvidencyGroupStrategy).
  expandGroupRequirement: unitProcedure
    .input(z.object({ requirementId: z.uuid() }))
    .query(async ({ input }) => {
      const [requirement] = await db
        .select({
          id: adequacyItemRequirement.id,
          question: adequacyItemRequirement.question,
          registerGroupId: adequacyItemRequirement.registerGroupId,
          searchTerm: defaultDocument.name,
        })
        .from(adequacyItemRequirement)
        .innerJoin(adequacyItem, eq(adequacyItemRequirement.adequacyItemId, adequacyItem.id))
        .leftJoin(
          defaultDocument,
          eq(adequacyItemRequirement.defaultDocumentId, defaultDocument.id),
        )
        .where(
          and(
            eq(adequacyItemRequirement.id, input.requirementId),
            eq(adequacyItem.unitId, input.unitId),
            isNull(adequacyItemRequirement.deletedAt),
          ),
        );
      if (!requirement?.registerGroupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Requisito de grupo não encontrado' });
      }

      const members = await db
        .select({ id: registerItem.id, name: registerItem.name, folderId: registerItem.folderId })
        .from(registerItem)
        .where(
          and(
            eq(registerItem.groupId, requirement.registerGroupId),
            isNull(registerItem.deletedAt),
          ),
        )
        .orderBy(asc(registerItem.name));

      // Subárvores de pastas para a busca do documento sugerido.
      const allFolders = await db
        .select({ id: folder.id, parentId: folder.parentId })
        .from(folder)
        .where(and(eq(folder.unitId, input.unitId), isNull(folder.deletedAt)));
      const byParent = new Map<string, string[]>();
      for (const node of allFolders) {
        if (node.parentId) {
          byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
        }
      }
      const subtree = (rootId: string) => {
        const ids = [rootId];
        for (let i = 0; i < ids.length; i++) ids.push(...(byParent.get(ids[i]!) ?? []));
        return ids;
      };

      const term = requirement.searchTerm?.trim();
      return Promise.all(
        members.map(async (member) => {
          let suggestion: { id: string; name: string } | null = null;
          if (member.folderId && term) {
            const [match] = await db
              .select({ id: document.id, name: document.name })
              .from(document)
              .where(
                and(
                  inArray(document.folderId, subtree(member.folderId)),
                  ilike(document.name, `%${term}%`),
                  isNull(document.deletedAt),
                ),
              )
              .limit(1);
            suggestion = match ?? null;
          }
          return {
            registerItemId: member.id,
            label: `${requirement.question} de ${member.name}`,
            suggestedDocumentId: suggestion?.id ?? null,
            suggestedDocumentName: suggestion?.name ?? null,
          };
        }),
      );
    }),

  // Evidências (snapshot) de um diagnóstico do histórico.
  diagnosticEvidences: unitProcedure
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

  setActive: unitProcedure
    .input(z.object({ adequacyItemId: z.uuid(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const item = await findUnitAdequacyItem(input.unitId, input.adequacyItemId);
      await db
        .update(adequacyItem)
        .set({ isActive: input.isActive })
        .where(eq(adequacyItem.id, item.id));
      return { success: true };
    }),

  // Histórico de diagnósticos do item.
  history: unitProcedure
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

  // Novo diagnóstico; aderência abaixo de conforme com prazo gera ação (RF16).
  diagnose: unitProcedure.input(diagnosticCreateSchema).mutation(async ({ ctx, input }) => {
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
      if (input.status !== 'conforme' && input.deadline) {
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
            registerItemId: item.registerItemId ?? null,
          })),
        );
      }
      return created;
    });
  }),

  // — Plano de ação —
  actionItems: unitProcedure.query(async ({ input }) => {
    return db
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
        adequacyItemId: adequacyItem.id,
      })
      .from(actionItem)
      .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
      .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
      .innerJoin(norm, eq(adequacyItem.normId, norm.id))
      .where(and(eq(adequacyItem.unitId, input.unitId), isNull(actionItem.deletedAt)))
      .orderBy(asc(actionItem.deadline));
  }),

  setActionStatus: unitProcedure.input(actionItemStatusSchema).mutation(async ({ input }) => {
    const [row] = await db
      .select({ id: actionItem.id })
      .from(actionItem)
      .innerJoin(diagnostic, eq(actionItem.diagnosticId, diagnostic.id))
      .innerJoin(adequacyItem, eq(diagnostic.adequacyItemId, adequacyItem.id))
      .where(
        and(
          eq(actionItem.id, input.actionItemId),
          eq(adequacyItem.unitId, input.unitId),
          isNull(actionItem.deletedAt),
        ),
      );
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ação não encontrada' });
    }
    await db
      .update(actionItem)
      .set({
        status: input.status,
        completedAt: input.status === 'concluida' ? new Date() : null,
      })
      .where(eq(actionItem.id, row.id));
    return { success: true };
  }),

  // Contagens para o painel/empty-states.
  counts: unitProcedure.query(async ({ input }) => {
    const [items] = await db
      .select({ total: count() })
      .from(adequacyItem)
      .where(and(eq(adequacyItem.unitId, input.unitId), isNull(adequacyItem.deletedAt)));
    return { items: items?.total ?? 0 };
  }),
});
