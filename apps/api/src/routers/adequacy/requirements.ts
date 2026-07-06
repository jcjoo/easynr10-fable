import { TRPCError } from '@trpc/server';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { requirementCreateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { unitAction } from '../../trpc';
import { ensureItemRequirements, findUnitAdequacyItem } from './shared';

const {
  adequacyItem,
  adequacyItemRequirement,
  defaultDocument,
  document,
  employee,
  equipment,
  folder,
} = schema;

// Requisitos de evidência do item (§7.6, RF13): CRUD + expansão de grupo.

export const requirementProcedures = {
  // Requisitos de evidência do item (copiados do catálogo no primeiro acesso).
  requirements: unitAction('diagnostico.ler')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      await ensureItemRequirements(ctx.db, item);
      return ctx.db
        .select({
          id: adequacyItemRequirement.id,
          type: adequacyItemRequirement.type,
          question: adequacyItemRequirement.question,
          targetGroup: adequacyItemRequirement.targetGroup,
          defaultDocumentId: adequacyItemRequirement.defaultDocumentId,
          defaultDocumentName: defaultDocument.name,
        })
        .from(adequacyItemRequirement)
        .leftJoin(
          defaultDocument,
          eq(adequacyItemRequirement.defaultDocumentId, defaultDocument.id),
        )
        .where(
          and(
            eq(adequacyItemRequirement.adequacyItemId, item.id),
            notDeleted(adequacyItemRequirement),
          ),
        )
        .orderBy(asc(adequacyItemRequirement.createdAt));
    }),

  addRequirement: unitAction('diagnostico.requisitos').input(requirementCreateSchema).mutation(async ({ ctx, input }) => {
    const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
    const [created] = await ctx.db
      .insert(adequacyItemRequirement)
      .values({
        adequacyItemId: item.id,
        type: input.type,
        question: input.question,
        targetGroup: input.type === 'group' ? input.targetGroup : null,
        defaultDocumentId: input.type === 'group' ? input.defaultDocumentId : null,
      })
      .returning();
    return created;
  }),

  removeRequirement: unitAction('diagnostico.requisitos')
    .input(z.object({ requirementId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: adequacyItemRequirement.id })
        .from(adequacyItemRequirement)
        .innerJoin(adequacyItem, eq(adequacyItemRequirement.adequacyItemId, adequacyItem.id))
        .where(
          and(
            eq(adequacyItemRequirement.id, input.requirementId),
            eq(adequacyItem.unitId, input.unitId),
            notDeleted(adequacyItemRequirement),
          ),
        );
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Requisito não encontrado' });
      }
      await ctx.db
        .update(adequacyItemRequirement)
        .set({ deletedAt: new Date() })
        .where(eq(adequacyItemRequirement.id, row.id));
      return { success: true };
    }),

  removeAllRequirements: unitAction('diagnostico.requisitos')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      await ctx.db
        .update(adequacyItemRequirement)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(adequacyItemRequirement.adequacyItemId, item.id),
            notDeleted(adequacyItemRequirement),
          ),
        );
      return { success: true };
    }),

  // Expande um requisito tipo group: um item de prova por membro do grupo,
  // com sugestão de documento pela pasta do item (legado: EvidencyGroupStrategy).
  expandGroupRequirement: unitAction('diagnostico.ler')
    .input(z.object({ requirementId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [requirement] = await ctx.db
        .select({
          id: adequacyItemRequirement.id,
          question: adequacyItemRequirement.question,
          targetGroup: adequacyItemRequirement.targetGroup,
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
            notDeleted(adequacyItemRequirement),
          ),
        );
      if (!requirement?.targetGroup) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Requisito de grupo não encontrado' });
      }

      // Membros do alvo fixo: colaboradores ou equipamentos de um tipo.
      const members =
        requirement.targetGroup === 'colaboradores'
          ? (
              await ctx.db
                .select({ id: employee.id, name: employee.name, folderId: employee.folderId })
                .from(employee)
                .where(and(eq(employee.unitId, input.unitId), notDeleted(employee)))
                .orderBy(asc(employee.name))
            ).map((row) => ({ ...row, kind: 'employee' as const }))
          : (
              await ctx.db
                .select({ id: equipment.id, name: equipment.name, folderId: equipment.folderId })
                .from(equipment)
                .where(
                  and(
                    eq(equipment.unitId, input.unitId),
                    eq(equipment.type, requirement.targetGroup),
                    notDeleted(equipment),
                  ),
                )
                .orderBy(asc(equipment.name))
            ).map((row) => ({ ...row, kind: 'equipment' as const }));

      // Subárvores de pastas para a busca do documento sugerido.
      const allFolders = await ctx.db
        .select({ id: folder.id, parentId: folder.parentId })
        .from(folder)
        .where(and(eq(folder.unitId, input.unitId), notDeleted(folder)));
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
            const [match] = await ctx.db
              .select({ id: document.id, name: document.name })
              .from(document)
              .where(
                and(
                  inArray(document.folderId, subtree(member.folderId)),
                  ilike(document.name, `%${term}%`),
                  notDeleted(document),
                ),
              )
              .limit(1);
            suggestion = match ?? null;
          }
          return {
            employeeId: member.kind === 'employee' ? member.id : null,
            equipmentId: member.kind === 'equipment' ? member.id : null,
            label: `${requirement.question} de ${member.name}`,
            suggestedDocumentId: suggestion?.id ?? null,
            suggestedDocumentName: suggestion?.name ?? null,
          };
        }),
      );
    }),
};
