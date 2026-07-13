import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import {
  customFieldCreateSchema,
  documentLinkAdherenceSchema,
  documentLinkSchema,
  documentUnlinkSchema,
  employeeImportSchema,
  employeeUpsertSchema,
  equipmentImportSchema,
  equipmentUpsertSchema,
  registerTargets,
} from '@easynr10/shared';
import { z } from 'zod';
import { router, unitAction } from '../trpc';
import {
  buildLogoKey,
  imageMimes,
  imageMimeFromKey,
  presignPreview,
  presignUpload,
} from '../s3';
import { upsertRegisterLinksAdherence } from '../services/adherence';
import { findUnitSchemaOrThrow, removeFolderSubtree } from '../services/folders';
import { ensureRegisterSkeleton } from '../services/register-folders';
import { resolveRegisterDocumentLinks } from '../services/register-links';
import {
  detailToMetadata,
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
  equipmentEletrico,
  equipmentFerramenta,
  equipmentEpi,
  equipmentEpc,
  folder,
  registerDocumentLink,
  registerTargetSetting,
} = schema;

const equipmentDetailTables = {
  eletrico: equipmentEletrico,
  ferramenta: equipmentFerramenta,
  epi: equipmentEpi,
  epc: equipmentEpc,
} as const;

// Cadastros da unidade: Colaboradores e Equipamentos (RF18). Os fluxos
// compartilhados (upsert com pasta do item, importação) vivem em
// services/registers.ts — aqui só o contrato tRPC e as queries de leitura.

// Isolamento de tenant nos vínculos: os itens a (des)vincular precisam ser da
// unidade da procedure. Sem isso, um membro de uma unidade conseguiria criar/
// remover vínculos apontando para colaboradores/equipamentos de outra.
async function assertItemsInUnit(
  db: Db,
  unitId: string,
  kind: 'employee' | 'equipment',
  ids: string[],
) {
  if (ids.length === 0) return;
  const table = kind === 'employee' ? employee : equipment;
  const label = kind === 'employee' ? 'Colaborador' : 'Equipamento';
  const found = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.unitId, unitId), inArray(table.id, ids), notDeleted(table)));
  if (found.length !== new Set(ids).size) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `${label} não encontrado nesta unidade` });
  }
}

export const registersRouter = router({

  // — Colaboradores —

  listEmployees: unitAction('cadastros.ler').query(async ({ ctx, input }) => {
    await ensureRegisterSkeleton(ctx.db, input.unitId);
    const rows = await ctx.db
      .select({
        id: employee.id,
        name: employee.name,
        // folderId sai do JOIN filtrado: vínculo com pasta excluída (dados
        // antigos, antes da limpeza no folders.remove) aparece como sem pasta.
        folderId: folder.id,
        folderName: folder.name,
        nivelAutorizacao: employee.nivelAutorizacao,
        metadata: employee.metadata,
        createdAt: employee.createdAt,
      })
      .from(employee)
      .leftJoin(folder, and(eq(employee.folderId, folder.id), notDeleted(folder)))
      .where(and(eq(employee.unitId, input.unitId), notDeleted(employee)))
      .orderBy(asc(employee.name));
    // Mapa unificado p/ a UI: colunas default (nivel) + metadata personalizado.
    return rows.map(({ nivelAutorizacao, metadata, ...row }) => ({
      ...row,
      metadata: {
        ...metadata,
        ...(nivelAutorizacao ? { nivel_autorizacao: nivelAutorizacao } : {}),
      } as Record<string, string>,
    }));
  }),

  upsertEmployee: unitAction('cadastros.itens')
    .input(employeeUpsertSchema)
    .mutation(({ ctx, input }) =>
      upsertRegisterItem(ctx.db, employeeStore, {
        unitId: input.unitId,
        itemId: input.employeeId,
        name: input.name,
        fields: input.metadata,
        folderSchemaId: input.folderSchemaId,
      }),
    ),

  removeEmployee: unitAction('cadastros.itens')
    .input(z.object({ employeeId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db
        .update(employee)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(employee.id, input.employeeId),
            eq(employee.unitId, input.unitId),
            notDeleted(employee),
          ),
        )
        .returning({ folderId: employee.folderId });
      // A pasta do item vai junto — sem isso ela fica órfã em "Lista de …".
      if (removed?.folderId) {
        await removeFolderSubtree(ctx.db, input.unitId, removed.folderId);
      }
      return { success: true };
    }),

  importEmployees: unitAction('cadastros.importar')
    .input(employeeImportSchema)
    .mutation(({ ctx, input }) => importRegisterItems(ctx.db, employeeStore, input)),

  // — Equipamentos —

  listEquipment: unitAction('cadastros.ler').query(async ({ ctx, input }) => {
    await ensureRegisterSkeleton(ctx.db, input.unitId);
    const rows = await ctx.db
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

    // Colunas default de cada tipo vêm das tabelas-filho; junta num mapa por id.
    const ids = rows.map((row) => row.id);
    const detailByEquipment = new Map<string, Record<string, string>>();
    if (ids.length > 0) {
      for (const table of Object.values(equipmentDetailTables)) {
        const details = await ctx.db
          .select()
          .from(table)
          .where(inArray(table.equipmentId, ids));
        for (const detail of details) {
          detailByEquipment.set(detail.equipmentId, detailToMetadata(detail));
        }
      }
    }
    return rows.map((row) => ({
      ...row,
      metadata: { ...row.metadata, ...detailByEquipment.get(row.id) },
    }));
  }),

  upsertEquipment: unitAction('cadastros.itens')
    .input(equipmentUpsertSchema)
    .mutation(({ ctx, input }) =>
      upsertRegisterItem(ctx.db, equipmentStore(input.type), {
        unitId: input.unitId,
        itemId: input.equipmentId,
        name: input.name,
        fields: input.metadata,
        folderSchemaId: input.folderSchemaId,
      }),
    ),

  removeEquipment: unitAction('cadastros.itens')
    .input(z.object({ equipmentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db
        .update(equipment)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(equipment.id, input.equipmentId),
            eq(equipment.unitId, input.unitId),
            notDeleted(equipment),
          ),
        )
        .returning({ folderId: equipment.folderId });
      if (removed?.folderId) {
        await removeFolderSubtree(ctx.db, input.unitId, removed.folderId);
      }
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

  // A resolução (explícitos + auto-vínculo) vive em services/register-links.ts,
  // compartilhada com a expansão de evidências do diagnóstico.
  documentLinks: unitAction('cadastros.ler').query(async ({ ctx, input }) =>
    resolveRegisterDocumentLinks(ctx.db, input.unitId),
  ),

  linkDocument: unitAction('cadastros.vinculos')
    .input(documentLinkSchema)
    .mutation(async ({ ctx, input }) => {
      // Documento precisa ser da unidade.
      const [doc] = await ctx.db
        .select({ id: document.id, adherence: document.adherence })
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

      // Nota por item: a informada para o item ou, por padrão, a do documento.
      const adherenceFor = (id: string) =>
        input.adherences && id in input.adherences ? input.adherences[id]! : doc.adherence;

      // Itens também precisam ser da unidade (não só o documento).
      await assertItemsInUnit(ctx.db, input.unitId, 'employee', input.employeeIds);
      await assertItemsInUnit(ctx.db, input.unitId, 'equipment', input.equipmentIds);

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
            adherence: adherenceFor(id),
          })),
        );
      }
      return { linked: input.employeeIds.length + input.equipmentIds.length };
    }),

  unlinkDocument: unitAction('cadastros.vinculos')
    .input(documentUnlinkSchema)
    .mutation(async ({ ctx, input }) => {
      // O schema garante exatamente um alvo; aqui garantimos que é da unidade.
      await assertItemsInUnit(
        ctx.db,
        input.unitId,
        input.employeeId ? 'employee' : 'equipment',
        [(input.employeeId ?? input.equipmentId)!],
      );
      await ctx.db
        .update(registerDocumentLink)
        .set({ deletedAt: new Date() })
        .where(
          and(
            input.employeeId
              ? eq(registerDocumentLink.employeeId, input.employeeId)
              : eq(registerDocumentLink.equipmentId, input.equipmentId!),
            eq(registerDocumentLink.fieldKey, input.fieldKey),
            notDeleted(registerDocumentLink),
          ),
        );
      return { success: true };
    }),

  // Edita a nota de um vínculo já existente (uma linha item+campo).
  setLinkAdherence: unitAction('cadastros.vinculos')
    .input(documentLinkAdherenceSchema)
    .mutation(async ({ ctx, input }) => {
      await assertItemsInUnit(
        ctx.db,
        input.unitId,
        input.employeeId ? 'employee' : 'equipment',
        [(input.employeeId ?? input.equipmentId)!],
      );
      // Sem documentId ⇒ o serviço só atualiza a nota do vínculo ativo.
      await upsertRegisterLinksAdherence(ctx.db, input.unitId, [
        {
          employeeId: input.employeeId ?? null,
          equipmentId: input.equipmentId ?? null,
          fieldKey: input.fieldKey,
          documentId: null,
          adherence: input.adherence,
        },
      ]);
      return { success: true };
    }),

  // — Foto opcional do item de cadastro (mesmo fluxo do logo da empresa) —
  photoUploadUrl: unitAction('cadastros.itens')
    .input(z.object({ unitId: z.uuid(), mimeType: z.enum(imageMimes) }))
    .mutation(async ({ input }) => {
      const storageKey = buildLogoKey(`units/${input.unitId}/register-photos`, input.mimeType);
      return { storageKey, uploadUrl: await presignUpload(storageKey, input.mimeType) };
    }),

  setItemPhoto: unitAction('cadastros.itens')
    .input(
      z
        .object({
          unitId: z.uuid(),
          employeeId: z.uuid().nullish(),
          equipmentId: z.uuid().nullish(),
          photoKey: z.string().max(512).nullable(),
        })
        .refine((v) => Boolean(v.employeeId) !== Boolean(v.equipmentId), {
          message: 'Informe um colaborador OU um equipamento',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = input.employeeId
        ? await ctx.db
            .update(employee)
            .set({ photoKey: input.photoKey })
            .where(
              and(
                eq(employee.id, input.employeeId),
                eq(employee.unitId, input.unitId),
                notDeleted(employee),
              ),
            )
            .returning({ id: employee.id })
        : await ctx.db
            .update(equipment)
            .set({ photoKey: input.photoKey })
            .where(
              and(
                eq(equipment.id, input.equipmentId!),
                eq(equipment.unitId, input.unitId),
                notDeleted(equipment),
              ),
            )
            .returning({ id: equipment.id });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado' });
      return { success: true };
    }),

  itemPhotoUrl: unitAction('cadastros.ler')
    .input(
      z
        .object({
          unitId: z.uuid(),
          employeeId: z.uuid().nullish(),
          equipmentId: z.uuid().nullish(),
        })
        .refine((v) => Boolean(v.employeeId) !== Boolean(v.equipmentId), {
          message: 'Informe um colaborador OU um equipamento',
        }),
    )
    .query(async ({ ctx, input }) => {
      const found = input.employeeId
        ? await ctx.db.query.employee.findFirst({
            where: and(
              eq(employee.id, input.employeeId),
              eq(employee.unitId, input.unitId),
              notDeleted(employee),
            ),
          })
        : await ctx.db.query.equipment.findFirst({
            where: and(
              eq(equipment.id, input.equipmentId!),
              eq(equipment.unitId, input.unitId),
              notDeleted(equipment),
            ),
          });
      if (!found?.photoKey) return null;
      return presignPreview(found.photoKey, 'foto', imageMimeFromKey(found.photoKey));
    }),
});
