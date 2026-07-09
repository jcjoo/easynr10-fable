import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import {
  customFieldCreateSchema,
  defaultRegisterFields,
  documentLinkSchema,
  documentUnlinkSchema,
  employeeImportSchema,
  employeeUpsertSchema,
  equipmentImportSchema,
  equipmentUpsertSchema,
  normalizeText,
  registerTargets,
  type RegisterField,
  type RegisterTarget,
} from '@easynr10/shared';
import { z } from 'zod';
import { router, unitAction } from '../trpc';
import { findUnitSchemaOrThrow } from '../services/folders';
import { ensureRegisterSkeleton } from '../services/register-folders';
import {
  employeeStore,
  equipmentStore,
  importRegisterItems,
  upsertRegisterItem,
} from '../services/registers';

const {
  customField,
  document,
  employee,
  equipment,
  folder,
  registerDocumentLink,
  registerTargetSetting,
} = schema;

// Cadastros da unidade: Colaboradores e Equipamentos (RF18). Os fluxos
// compartilhados (upsert com pasta do item, importação) vivem em
// services/registers.ts — aqui só o contrato tRPC e as queries de leitura.

// Um documento casa com o documento padrão de um campo quando tem o mesmo nome
// (sem acento/caixa), tolerando o sufixo por item da convenção do catálogo
// ("Nome - <item>", RF11). Casa contra o label exibido E o defaultDocName (nome
// do catálogo, quando difere). Exato ou prefixo "<nome> - " evita que "NR10
// Básico" case com "NR10 Básico Reciclagem" (que é o padrão de outro campo).
function docMatchesField(docName: string, field: RegisterField) {
  const doc = normalizeText(docName).trim();
  const names = [field.label, field.defaultDocName].filter((name): name is string => Boolean(name));
  return names.some((name) => {
    const n = normalizeText(name).trim();
    return doc === n || doc.startsWith(`${n} - `);
  });
}

export const registersRouter = router({

  // — Colaboradores —

  listEmployees: unitAction('cadastros.ler').query(async ({ ctx, input }) => {
    await ensureRegisterSkeleton(ctx.db, input.unitId);
    return ctx.db
      .select({
        id: employee.id,
        name: employee.name,
        // folderId sai do JOIN filtrado: vínculo com pasta excluída (dados
        // antigos, antes da limpeza no folders.remove) aparece como sem pasta.
        folderId: folder.id,
        folderName: folder.name,
        metadata: employee.metadata,
        createdAt: employee.createdAt,
      })
      .from(employee)
      .leftJoin(folder, and(eq(employee.folderId, folder.id), notDeleted(folder)))
      .where(and(eq(employee.unitId, input.unitId), notDeleted(employee)))
      .orderBy(asc(employee.name));
  }),

  upsertEmployee: unitAction('cadastros.itens')
    .input(employeeUpsertSchema)
    .mutation(({ ctx, input }) =>
      upsertRegisterItem(ctx.db, employeeStore, {
        unitId: input.unitId,
        itemId: input.employeeId,
        name: input.name,
        metadata: input.metadata,
        folderSchemaId: input.folderSchemaId,
      }),
    ),

  removeEmployee: unitAction('cadastros.itens')
    .input(z.object({ employeeId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(employee)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(employee.id, input.employeeId),
            eq(employee.unitId, input.unitId),
            notDeleted(employee),
          ),
        );
      return { success: true };
    }),

  importEmployees: unitAction('cadastros.importar')
    .input(employeeImportSchema)
    .mutation(({ ctx, input }) => importRegisterItems(ctx.db, employeeStore, input)),

  // — Equipamentos —

  listEquipment: unitAction('cadastros.ler').query(async ({ ctx, input }) => {
    await ensureRegisterSkeleton(ctx.db, input.unitId);
    return ctx.db
      .select({
        id: equipment.id,
        name: equipment.name,
        type: equipment.type,
        folderId: folder.id,
        folderName: folder.name,
        metadata: equipment.metadata,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .leftJoin(folder, and(eq(equipment.folderId, folder.id), notDeleted(folder)))
      .where(and(eq(equipment.unitId, input.unitId), notDeleted(equipment)))
      .orderBy(asc(equipment.name));
  }),

  upsertEquipment: unitAction('cadastros.itens')
    .input(equipmentUpsertSchema)
    .mutation(({ ctx, input }) =>
      upsertRegisterItem(ctx.db, equipmentStore(input.type), {
        unitId: input.unitId,
        itemId: input.equipmentId,
        name: input.name,
        metadata: input.metadata,
        folderSchemaId: input.folderSchemaId,
      }),
    ),

  removeEquipment: unitAction('cadastros.itens')
    .input(z.object({ equipmentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(equipment)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(equipment.id, input.equipmentId),
            eq(equipment.unitId, input.unitId),
            notDeleted(equipment),
          ),
        );
      return { success: true };
    }),

  importEquipment: unitAction('cadastros.importar')
    .input(equipmentImportSchema)
    .mutation(({ ctx, input }) => importRegisterItems(ctx.db, equipmentStore(input.type), input)),

  // — Configuração do grupo-alvo: estrutura de pastas padrão pré-selecionada
  //   (opcional) ao criar itens do grupo —

  targetSettings: unitAction('cadastros.ler').query(async ({ ctx, input }) => {
    return ctx.db
      .select({
        target: registerTargetSetting.target,
        folderSchemaId: registerTargetSetting.folderSchemaId,
      })
      .from(registerTargetSetting)
      .where(
        and(eq(registerTargetSetting.unitId, input.unitId), notDeleted(registerTargetSetting)),
      );
  }),

  setTargetSetting: unitAction('cadastros.config')
    .input(
      z.object({
        target: z.enum(registerTargets),
        folderSchemaId: z.uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folderSchemaId) {
        await findUnitSchemaOrThrow(ctx.db, input.unitId, input.folderSchemaId);
      }
      const existing = await ctx.db.query.registerTargetSetting.findFirst({
        where: and(
          eq(registerTargetSetting.unitId, input.unitId),
          eq(registerTargetSetting.target, input.target),
          notDeleted(registerTargetSetting),
        ),
      });
      if (existing) {
        await ctx.db
          .update(registerTargetSetting)
          .set({ folderSchemaId: input.folderSchemaId })
          .where(eq(registerTargetSetting.id, existing.id));
      } else {
        await ctx.db.insert(registerTargetSetting).values({
          unitId: input.unitId,
          target: input.target,
          folderSchemaId: input.folderSchemaId,
        });
      }
      return { success: true };
    }),

  // — Campos personalizados da unidade (por grupo-alvo) —

  listCustomFields: unitAction('cadastros.ler')
    .input(z.object({ target: z.enum(registerTargets) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({ id: customField.id, name: customField.name })
        .from(customField)
        .where(
          and(
            eq(customField.unitId, input.unitId),
            eq(customField.target, input.target),
            notDeleted(customField),
          ),
        )
        .orderBy(asc(customField.createdAt));
    }),

  addCustomField: unitAction('cadastros.campos')
    .input(customFieldCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(customField)
        .values({ unitId: input.unitId, target: input.target, name: input.name })
        .returning();
      return created;
    }),

  removeCustomField: unitAction('cadastros.campos')
    .input(z.object({ customFieldId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(customField)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(customField.id, input.customFieldId),
            eq(customField.unitId, input.unitId),
            notDeleted(customField),
          ),
        );
      return { success: true };
    }),

  // — Vínculo campo→documento (campos kind=document, ex.: CA do EPI) —

  documentLinks: unitAction('cadastros.ler').query(async ({ ctx, input }) => {
    const explicit = await ctx.db
      .select({
        id: registerDocumentLink.id,
        employeeId: registerDocumentLink.employeeId,
        equipmentId: registerDocumentLink.equipmentId,
        fieldKey: registerDocumentLink.fieldKey,
        documentId: registerDocumentLink.documentId,
        documentName: document.name,
        expiresAt: document.expiresAt,
        warnDaysBefore: document.warnDaysBefore,
      })
      .from(registerDocumentLink)
      .innerJoin(document, eq(registerDocumentLink.documentId, document.id))
      .innerJoin(folder, eq(document.folderId, folder.id))
      .where(
        and(
          eq(folder.unitId, input.unitId),
          notDeleted(registerDocumentLink),
          // Documento excluído (ex.: cascata do delete de pasta) não pode
          // seguir aparecendo como evidência vinculada.
          notDeleted(document),
        ),
      );

    // Auto-vínculo: um documento com o nome do documento padrão do campo, na
    // pasta do item ou abaixo dela, é vinculado automaticamente. Não persiste —
    // reflete o estado atual da pasta; o vínculo manual sempre tem precedência.
    const [employees, equipments, folders, documents] = await Promise.all([
      ctx.db
        .select({ id: employee.id, folderId: employee.folderId, metadata: employee.metadata })
        .from(employee)
        .where(and(eq(employee.unitId, input.unitId), notDeleted(employee))),
      ctx.db
        .select({
          id: equipment.id,
          type: equipment.type,
          folderId: equipment.folderId,
          metadata: equipment.metadata,
        })
        .from(equipment)
        .where(and(eq(equipment.unitId, input.unitId), notDeleted(equipment))),
      ctx.db
        .select({ id: folder.id, parentId: folder.parentId })
        .from(folder)
        .where(and(eq(folder.unitId, input.unitId), notDeleted(folder))),
      ctx.db
        .select({
          id: document.id,
          folderId: document.folderId,
          name: document.name,
          expiresAt: document.expiresAt,
          warnDaysBefore: document.warnDaysBefore,
        })
        .from(document)
        .innerJoin(folder, eq(document.folderId, folder.id))
        .where(and(eq(folder.unitId, input.unitId), notDeleted(document))),
    ]);

    // Subárvore de pastas a partir da pasta do item (RF18.3) + docs por pasta.
    const byParent = new Map<string, string[]>();
    for (const node of folders) {
      if (node.parentId) {
        byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
      }
    }
    const subtree = (rootId: string) => {
      const ids = [rootId];
      for (let i = 0; i < ids.length; i++) ids.push(...(byParent.get(ids[i]!) ?? []));
      return ids;
    };
    const docsByFolder = new Map<string, typeof documents>();
    for (const doc of documents) {
      docsByFolder.set(doc.folderId, [...(docsByFolder.get(doc.folderId) ?? []), doc]);
    }

    const covered = new Set(
      explicit.map((link) => `${link.employeeId ?? link.equipmentId}:${link.fieldKey}`),
    );
    const items = [
      ...employees.map((e) => ({
        kind: 'employee' as const,
        id: e.id,
        folderId: e.folderId,
        metadata: e.metadata,
        target: 'colaboradores' as RegisterTarget,
      })),
      ...equipments.map((q) => ({
        kind: 'equipment' as const,
        id: q.id,
        folderId: q.folderId,
        metadata: q.metadata,
        target: q.type as RegisterTarget,
      })),
    ];

    const auto = items.flatMap((item) => {
      if (!item.folderId) return [];
      const subtreeDocs = subtree(item.folderId).flatMap((fid) => docsByFolder.get(fid) ?? []);
      return (defaultRegisterFields[item.target] ?? [])
        .filter(
          (field) =>
            field.kind === 'document' &&
            !covered.has(`${item.id}:${field.key}`) &&
            // Colunas condicionadas (ex.: SEP) não se auto-vinculam se não se
            // aplicam ao item.
            (!field.requires || item.metadata?.[field.requires.fieldKey] === field.requires.value),
        )
        .flatMap((field) => {
          const match = subtreeDocs.find((doc) => docMatchesField(doc.name, field));
          if (!match) return [];
          return [
            {
              id: `auto:${item.id}:${field.key}`,
              employeeId: item.kind === 'employee' ? item.id : null,
              equipmentId: item.kind === 'equipment' ? item.id : null,
              fieldKey: field.key,
              documentId: match.id,
              documentName: match.name,
              expiresAt: match.expiresAt,
              warnDaysBefore: match.warnDaysBefore,
              auto: true,
            },
          ];
        });
    });

    return [...explicit.map((link) => ({ ...link, auto: false })), ...auto];
  }),

  linkDocument: unitAction('cadastros.vinculos')
    .input(documentLinkSchema)
    .mutation(async ({ ctx, input }) => {
      // Documento precisa ser da unidade.
      const [doc] = await ctx.db
        .select({ id: document.id })
        .from(document)
        .innerJoin(folder, eq(document.folderId, folder.id))
        .where(
          and(
            eq(document.id, input.documentId),
            eq(folder.unitId, input.unitId),
            notDeleted(document),
          ),
        );
      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' });
      }

      // Mesmo fluxo para os dois alvos: substitui o vínculo ativo do campo
      // (máx. 1 documento por item+campo) e insere os novos.
      const now = new Date();
      const targets = [
        { ids: input.employeeIds, column: registerDocumentLink.employeeId, kind: 'employee' },
        { ids: input.equipmentIds, column: registerDocumentLink.equipmentId, kind: 'equipment' },
      ] as const;
      for (const { ids, column, kind } of targets) {
        if (ids.length === 0) continue;
        await ctx.db
          .update(registerDocumentLink)
          .set({ deletedAt: now })
          .where(
            and(
              inArray(column, ids),
              eq(registerDocumentLink.fieldKey, input.fieldKey),
              notDeleted(registerDocumentLink),
            ),
          );
        await ctx.db.insert(registerDocumentLink).values(
          ids.map((id) => ({
            documentId: input.documentId,
            fieldKey: input.fieldKey,
            employeeId: kind === 'employee' ? id : null,
            equipmentId: kind === 'equipment' ? id : null,
          })),
        );
      }
      return { linked: input.employeeIds.length + input.equipmentIds.length };
    }),

  unlinkDocument: unitAction('cadastros.vinculos')
    .input(documentUnlinkSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(registerDocumentLink)
        .set({ deletedAt: new Date() })
        .where(
          and(
            input.employeeId
              ? eq(registerDocumentLink.employeeId, input.employeeId)
              : eq(registerDocumentLink.equipmentId, input.equipmentId ?? ''),
            eq(registerDocumentLink.fieldKey, input.fieldKey),
            notDeleted(registerDocumentLink),
          ),
        );
      return { success: true };
    }),
});
