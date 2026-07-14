import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { requirementCreateSchema } from '@easynr10/shared';
import { z } from 'zod';
import { unitAction } from '../../trpc';
import { resolveRegisterDocumentLinks } from '../../services/register-links';
import { ensureItemRequirements, findUnitAdequacyItem } from './shared';

const { adequacyItem, adequacyItemRequirement, employee, equipment } = schema;

// Requisitos de evidência do item (§7.6, RF13): CRUD + expansão de cadastro.

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
          fieldKey: adequacyItemRequirement.fieldKey,
        })
        .from(adequacyItemRequirement)
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
        targetGroup: input.type === 'cadastro' ? input.targetGroup : null,
        fieldKey: input.type === 'cadastro' ? input.fieldKey : null,
      })
      .returning();
    return created;
  }),

  // Renomear a pergunta do requisito (✎ da árvore de configuração). Tipo e
  // alvo de cadastro não mudam — para isso, remove e recria.
  updateRequirement: unitAction('diagnostico.requisitos')
    .input(z.object({ requirementId: z.uuid(), question: z.string().trim().min(1) }))
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
      const [updated] = await ctx.db
        .update(adequacyItemRequirement)
        .set({ question: input.question })
        .where(eq(adequacyItemRequirement.id, row.id))
        .returning();
      return updated;
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

  // Expande um requisito tipo cadastro: um item de prova por item do cadastro-alvo,
  // com o documento e a nota já vinculados naquela coluna (field_key). Item sem
  // vínculo entra sem documento (nota vazia ⇒ Inexistente no cálculo).
  expandCadastroRequirement: unitAction('diagnostico.ler')
    .input(z.object({ requirementId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [requirement] = await ctx.db
        .select({
          id: adequacyItemRequirement.id,
          question: adequacyItemRequirement.question,
          targetGroup: adequacyItemRequirement.targetGroup,
          fieldKey: adequacyItemRequirement.fieldKey,
        })
        .from(adequacyItemRequirement)
        .innerJoin(adequacyItem, eq(adequacyItemRequirement.adequacyItemId, adequacyItem.id))
        .where(
          and(
            eq(adequacyItemRequirement.id, input.requirementId),
            eq(adequacyItem.unitId, input.unitId),
            notDeleted(adequacyItemRequirement),
          ),
        );
      if (!requirement?.targetGroup || !requirement.fieldKey) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Requisito de cadastro não encontrado' });
      }
      const fieldKey = requirement.fieldKey;

      // Itens do cadastro-alvo: colaboradores ou equipamentos de um tipo.
      const members =
        requirement.targetGroup === 'colaboradores'
          ? (
              await ctx.db
                .select({ id: employee.id, name: employee.name })
                .from(employee)
                .where(and(eq(employee.unitId, input.unitId), notDeleted(employee)))
                .orderBy(asc(employee.name))
            ).map((row) => ({ ...row, kind: 'employee' as const }))
          : (
              await ctx.db
                .select({ id: equipment.id, name: equipment.name })
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

      // Vínculos daquela coluna, por item — MESMO resolvedor da tela de
      // cadastros (explícitos + auto-vínculo por nome na pasta do item), para
      // a avaliação enxergar exatamente o que o cadastro mostra.
      const links = await resolveRegisterDocumentLinks(ctx.db, input.unitId, { fieldKey });
      const linkByItem = new Map(
        links.map((link) => [link.employeeId ?? link.equipmentId, link]),
      );

      return members.map((member) => {
        const link = linkByItem.get(member.id);
        return {
          employeeId: member.kind === 'employee' ? member.id : null,
          equipmentId: member.kind === 'equipment' ? member.id : null,
          label: `${requirement.question} de ${member.name}`,
          documentId: link?.documentId ?? null,
          documentName: link?.documentName ?? null,
          // Vencimento do documento vinculado — documento vencido gera a NC
          // automática (Parcial) na avaliação.
          expiresAt: link?.expiresAt ?? null,
          // Nota default = a do vínculo (que nasceu da aderência do documento).
          adherence: link?.adherence ?? null,
        };
      });
    }),
};
