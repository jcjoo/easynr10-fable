import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import {
  documentConfirmSchema,
  documentUpdateSchema,
  documentVersionConfirmSchema,
  uploadRequestSchema,
} from '@easynr10/shared';
import { z } from 'zod';
import { db } from '../db';
import { router, unitProcedure } from '../trpc';
import { buildStorageKey, presignDownload, presignUpload } from '../s3';

const { document, documentVersion, folder, user } = schema;

// Documento da unidade (via pasta) ou 404 — garante o isolamento de tenant
// mesmo com um documentId de outra unidade.
async function findUnitDocument(unitId: string, documentId: string) {
  const [row] = await db
    .select({ document })
    .from(document)
    .innerJoin(folder, eq(document.folderId, folder.id))
    .where(
      and(eq(document.id, documentId), eq(folder.unitId, unitId), isNull(document.deletedAt)),
    );
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' });
  }
  return row.document;
}

export const documentsRouter = router({
  listByFolder: unitProcedure
    .input(z.object({ folderId: z.uuid() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: document.id,
          name: document.name,
          expiresAt: document.expiresAt,
          warnDaysBefore: document.warnDaysBefore,
          version: documentVersion.number,
          mimeType: documentVersion.mimeType,
          sizeBytes: documentVersion.sizeBytes,
          uploadedBy: user.name,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        })
        .from(document)
        .innerJoin(folder, eq(document.folderId, folder.id))
        .leftJoin(documentVersion, eq(document.currentVersionId, documentVersion.id))
        .leftJoin(user, eq(documentVersion.uploadedBy, user.id))
        .where(
          and(
            eq(document.folderId, input.folderId),
            eq(folder.unitId, input.unitId),
            isNull(document.deletedAt),
          ),
        )
        .orderBy(desc(document.updatedAt));
    }),

  // Visão "apenas documentos": tudo abaixo da pasta (null = unidade inteira),
  // com folderId para a coluna Local. Descendentes calculados da lista flat.
  listBySubtree: unitProcedure
    .input(z.object({ folderId: z.uuid().nullable() }))
    .query(async ({ input }) => {
      const allFolders = await db
        .select({ id: folder.id, parentId: folder.parentId })
        .from(folder)
        .where(and(eq(folder.unitId, input.unitId), isNull(folder.deletedAt)));

      let folderIds = allFolders.map((node) => node.id);
      if (input.folderId != null) {
        const byParent = new Map<string, string[]>();
        for (const node of allFolders) {
          if (node.parentId) {
            byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
          }
        }
        folderIds = [input.folderId];
        for (let i = 0; i < folderIds.length; i++) {
          folderIds.push(...(byParent.get(folderIds[i]!) ?? []));
        }
      }
      if (folderIds.length === 0) return [];

      return db
        .select({
          id: document.id,
          name: document.name,
          folderId: document.folderId,
          expiresAt: document.expiresAt,
          warnDaysBefore: document.warnDaysBefore,
          version: documentVersion.number,
          mimeType: documentVersion.mimeType,
          sizeBytes: documentVersion.sizeBytes,
          uploadedBy: user.name,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        })
        .from(document)
        .leftJoin(documentVersion, eq(document.currentVersionId, documentVersion.id))
        .leftJoin(user, eq(documentVersion.uploadedBy, user.id))
        .where(and(inArray(document.folderId, folderIds), isNull(document.deletedAt)))
        .orderBy(desc(document.updatedAt));
    }),

  // Passo 1 do upload: URL presigned de PUT direto no S3 (RF09).
  createUploadUrl: unitProcedure.input(uploadRequestSchema).mutation(async ({ input }) => {
    const storageKey = buildStorageKey(input.unitId, input.fileName);
    const uploadUrl = await presignUpload(storageKey, input.mimeType);
    return { uploadUrl, storageKey };
  }),

  // Passo 2: confirma e cria documento + versão 1 (RF09.1).
  confirmUpload: unitProcedure.input(documentConfirmSchema).mutation(async ({ ctx, input }) => {
    const parent = await db.query.folder.findFirst({
      where: and(
        eq(folder.id, input.folderId),
        eq(folder.unitId, input.unitId),
        isNull(folder.deletedAt),
      ),
    });
    if (!parent) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada' });
    }

    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(document)
        .values({
          folderId: input.folderId,
          name: input.name,
          expiresAt: input.expiresAt ?? null,
          warnDaysBefore: input.warnDaysBefore ?? null,
          documentGroup: input.documentGroup ?? null,
        })
        .returning();
      const [version] = await tx
        .insert(documentVersion)
        .values({
          documentId: created!.id,
          number: 1,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          uploadedBy: ctx.session.user.id,
        })
        .returning();
      await tx
        .update(document)
        .set({ currentVersionId: version!.id })
        .where(eq(document.id, created!.id));
      return created;
    });
  }),

  // Novo upload sobre documento existente → versão n+1 (RF09.1).
  confirmNewVersion: unitProcedure
    .input(documentVersionConfirmSchema)
    .mutation(async ({ ctx, input }) => {
      const doc = await findUnitDocument(input.unitId, input.documentId);
      return db.transaction(async (tx) => {
        const [last] = await tx
          .select({ number: max(documentVersion.number) })
          .from(documentVersion)
          .where(eq(documentVersion.documentId, doc.id));
        const [version] = await tx
          .insert(documentVersion)
          .values({
            documentId: doc.id,
            number: (last?.number ?? 0) + 1,
            storageKey: input.storageKey,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            uploadedBy: ctx.session.user.id,
          })
          .returning();
        await tx
          .update(document)
          .set({ currentVersionId: version!.id })
          .where(eq(document.id, doc.id));
        return version;
      });
    }),

  // Restaurar versão = nova versão reutilizando o conteúdo antigo (RF09.4).
  // O histórico registra a restauração; nada é sobrescrito.
  restoreVersion: unitProcedure
    .input(z.object({ documentId: z.uuid(), versionId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await findUnitDocument(input.unitId, input.documentId);
      const source = await db.query.documentVersion.findFirst({
        where: and(
          eq(documentVersion.id, input.versionId),
          eq(documentVersion.documentId, doc.id),
        ),
      });
      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Versão não encontrada' });
      }
      return db.transaction(async (tx) => {
        const [last] = await tx
          .select({ number: max(documentVersion.number) })
          .from(documentVersion)
          .where(eq(documentVersion.documentId, doc.id));
        const [version] = await tx
          .insert(documentVersion)
          .values({
            documentId: doc.id,
            number: (last?.number ?? 0) + 1,
            storageKey: source.storageKey,
            mimeType: source.mimeType,
            sizeBytes: source.sizeBytes,
            uploadedBy: ctx.session.user.id,
          })
          .returning();
        await tx
          .update(document)
          .set({ currentVersionId: version!.id })
          .where(eq(document.id, doc.id));
        return version;
      });
    }),

  // Nome e validade (RF10).
  update: unitProcedure.input(documentUpdateSchema).mutation(async ({ input }) => {
    const doc = await findUnitDocument(input.unitId, input.documentId);
    const [updated] = await db
      .update(document)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.warnDaysBefore !== undefined
          ? { warnDaysBefore: input.warnDaysBefore }
          : {}),
      })
      .where(eq(document.id, doc.id))
      .returning();
    return updated;
  }),

  // Soft-delete: o prontuário é registro legal — versões e objetos ficam retidos.
  remove: unitProcedure
    .input(z.object({ documentId: z.uuid() }))
    .mutation(async ({ input }) => {
      const doc = await findUnitDocument(input.unitId, input.documentId);
      await db.update(document).set({ deletedAt: new Date() }).where(eq(document.id, doc.id));
      return { success: true };
    }),

  // Histórico de versões (RF09.2).
  versions: unitProcedure
    .input(z.object({ documentId: z.uuid() }))
    .query(async ({ input }) => {
      const doc = await findUnitDocument(input.unitId, input.documentId);
      return db
        .select({
          id: documentVersion.id,
          number: documentVersion.number,
          sizeBytes: documentVersion.sizeBytes,
          mimeType: documentVersion.mimeType,
          uploadedBy: user.name,
          createdAt: documentVersion.createdAt,
        })
        .from(documentVersion)
        .leftJoin(user, eq(documentVersion.uploadedBy, user.id))
        .where(eq(documentVersion.documentId, doc.id))
        .orderBy(desc(documentVersion.number));
    }),

  // Download presigned da versão corrente ou de uma versão específica (RF09.3).
  downloadUrl: unitProcedure
    .input(z.object({ documentId: z.uuid(), versionId: z.uuid().optional() }))
    .mutation(async ({ input }) => {
      const doc = await findUnitDocument(input.unitId, input.documentId);
      const versionId = input.versionId ?? doc.currentVersionId;
      if (!versionId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento sem conteúdo' });
      }
      const version = await db.query.documentVersion.findFirst({
        where: and(
          eq(documentVersion.id, versionId),
          eq(documentVersion.documentId, doc.id),
        ),
      });
      if (!version) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Versão não encontrada' });
      }
      const url = await presignDownload(version.storageKey, doc.name);
      return { url };
    }),
});
