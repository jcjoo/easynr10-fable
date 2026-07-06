import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { adequacyItemUpdateSchema, compareNormCodes } from '@easynr10/shared';
import { z } from 'zod';
import { unitAction } from '../../trpc';
import { ensureItemRequirements, findUnitAdequacyItem } from './shared';

const { adequacyItem, diagnostic, norm } = schema;

// Itens de adequação da unidade: listagem, geração pelo catálogo e
// configuração (ativo/orientação) — RF12/RF13.

export const itemProcedures = {
  // Itens de adequação da unidade com a aderência do diagnóstico mais recente.
  list: unitAction('diagnostico.ler').query(async ({ ctx, input }) => {
    const items = await ctx.db
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
      .where(and(eq(adequacyItem.unitId, input.unitId), notDeleted(adequacyItem)));

    items.sort((a, b) => compareNormCodes(a.normCode, b.normCode));

    if (items.length === 0) return [];

    // Diagnóstico mais recente por item (reduzido em memória — volume: ~90 itens).
    const rows = await ctx.db
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
          notDeleted(diagnostic),
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
  generate: unitAction('diagnostico.gerar').mutation(async ({ ctx, input }) => {
    const norms = await ctx.db.select({ id: norm.id }).from(norm).where(notDeleted(norm));
    if (norms.length === 0) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Catálogo de normas vazio' });
    }
    const inserted = await ctx.db
      .insert(adequacyItem)
      .values(norms.map((row) => ({ unitId: input.unitId, normId: row.id })))
      .onConflictDoNothing()
      .returning();
    // Requisitos do catálogo entram junto com os itens (§7.6).
    for (const item of inserted) {
      await ensureItemRequirements(ctx.db, item);
    }
    return { created: inserted.length };
  }),

  // — Configuração do item (RF13.1) —

  itemDetail: unitAction('diagnostico.ler')
    .input(z.object({ adequacyItemId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      const [row] = await ctx.db
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

  updateItem: unitAction('diagnostico.configurar').input(adequacyItemUpdateSchema).mutation(async ({ ctx, input }) => {
    const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
    await ctx.db
      .update(adequacyItem)
      .set({ isActive: input.isActive, orientation: input.orientation ?? null })
      .where(eq(adequacyItem.id, item.id));
    return { success: true };
  }),

  setActive: unitAction('diagnostico.configurar')
    .input(z.object({ adequacyItemId: z.uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const item = await findUnitAdequacyItem(ctx.db, input.unitId, input.adequacyItemId);
      await ctx.db
        .update(adequacyItem)
        .set({ isActive: input.isActive })
        .where(eq(adequacyItem.id, item.id));
      return { success: true };
    }),

  // Contagens para o painel/empty-states.
  counts: unitAction('diagnostico.ler').query(async ({ ctx, input }) => {
    const [items] = await ctx.db
      .select({ total: count() })
      .from(adequacyItem)
      .where(and(eq(adequacyItem.unitId, input.unitId), notDeleted(adequacyItem)));
    return { items: items?.total ?? 0 };
  }),
};
