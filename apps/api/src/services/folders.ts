import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import type { FolderSchemaNode } from '@easynr10/db/schema';

const { folder, folderSchema } = schema;

// Regras de estrutura de pastas do PIE — compartilhadas pelo router de
// estruturas (folder-schemas) e pelos cadastros (pasta do item pode nascer
// com uma estrutura dentro).

export async function findUnitSchemaOrThrow(db: Db, unitId: string, schemaId: string) {
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
  db: Db,
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
