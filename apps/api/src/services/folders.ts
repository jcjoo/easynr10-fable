import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { notDeleted, schema, type Db, type DbOrTx } from '@easynr10/db';
import type { FolderSchemaNode } from '@easynr10/db/schema';

const { folder, folderSchema, document, employee, equipment, registerDocumentLink } = schema;

// Exclui (soft-delete) uma pasta e toda a subárvore: documentos, vínculos
// campo→documento dos cadastros e a referência de pasta dos itens que caírem
// na subárvore. Compartilhado por folders.remove (com guarda de vazio/admin no
// router) e pela exclusão de item (a pasta do item some junto — sem órfãs).
export async function removeFolderSubtree(db: Db, unitId: string, rootFolderId: string) {
  const all = await db
    .select({ id: folder.id, parentId: folder.parentId })
    .from(folder)
    .where(and(eq(folder.unitId, unitId), notDeleted(folder)));
  const byParent = new Map<string, string[]>();
  for (const node of all) {
    if (node.parentId) {
      byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
    }
  }
  const folderIds = [rootFolderId];
  for (let i = 0; i < folderIds.length; i++) {
    folderIds.push(...(byParent.get(folderIds[i]!) ?? []));
  }

  const docs = await db
    .select({ id: document.id })
    .from(document)
    .where(and(inArray(document.folderId, folderIds), notDeleted(document)));

  const deletedAt = new Date();
  if (docs.length > 0) {
    await db
      .update(document)
      .set({ deletedAt })
      .where(and(inArray(document.folderId, folderIds), notDeleted(document)));
    await db
      .update(registerDocumentLink)
      .set({ deletedAt })
      .where(
        and(
          inArray(
            registerDocumentLink.documentId,
            docs.map((doc) => doc.id),
          ),
          notDeleted(registerDocumentLink),
        ),
      );
  }
  await db.update(employee).set({ folderId: null }).where(inArray(employee.folderId, folderIds));
  await db.update(equipment).set({ folderId: null }).where(inArray(equipment.folderId, folderIds));
  await db.update(folder).set({ deletedAt }).where(inArray(folder.id, folderIds));
  return { folders: folderIds.length, documents: docs.length };
}

// Regras de estrutura de pastas do PIE — compartilhadas pelo router de
// estruturas (folder-schemas) e pelos cadastros (pasta do item pode nascer
// com uma estrutura dentro).

export async function findUnitSchemaOrThrow(db: DbOrTx, unitId: string, schemaId: string) {
  const found = await db.query.folderSchema.findFirst({
    where: and(
      eq(folderSchema.id, schemaId),
      eq(folderSchema.unitId, unitId),
      notDeleted(folderSchema),
    ),
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Estrutura não encontrada' });
  }
  return found;
}

// Cria as pastas da estrutura sob parentId, pulando as que já existem no
// mesmo nível (idempotente).
export async function ensureFolderStructure(
  db: DbOrTx,
  unitId: string,
  nodes: FolderSchemaNode[],
  parentId: string | null,
  schemaId?: string,
): Promise<number> {
  let createdCount = 0;
  for (const node of nodes) {
    const existing = await db.query.folder.findFirst({
      where: and(
        eq(folder.unitId, unitId),
        parentId === null ? isNull(folder.parentId) : eq(folder.parentId, parentId),
        eq(folder.name, node.name),
        notDeleted(folder),
      ),
    });
    let folderId = existing?.id;
    if (!folderId) {
      const [created] = await db
        .insert(folder)
        .values({ unitId, parentId, name: node.name, schemaId })
        .returning();
      folderId = created!.id;
      createdCount += 1;
    }
    if (node.children?.length) {
      createdCount += await ensureFolderStructure(db, unitId, node.children, folderId, schemaId);
    }
  }
  return createdCount;
}
