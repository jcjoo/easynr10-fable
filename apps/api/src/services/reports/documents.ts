import { and, asc, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { documentSituation, localDateString } from '@easynr10/shared';

const { document, folder } = schema;

// Regra única de vencimento no shared (mesma do front) — re-exportada para
// os consumidores da camada de relatórios.
export { documentSituation } from '@easynr10/shared';

// Situação documental do PIE (RF21): todos os documentos da unidade com o
// caminho da pasta e a situação de validade.
export async function documentSituationRows(db: Db, unitId: string) {
  const folders = await db
    .select({ id: folder.id, parentId: folder.parentId, name: folder.name })
    .from(folder)
    .where(and(eq(folder.unitId, unitId), notDeleted(folder)));
  const byId = new Map(folders.map((node) => [node.id, node]));
  const pathOf = (folderId: string) => {
    const names: string[] = [];
    for (
      let node = byId.get(folderId);
      node;
      node = node.parentId ? byId.get(node.parentId) : undefined
    ) {
      names.unshift(node.name);
    }
    return names.join(' / ');
  };
  if (folders.length === 0) return [];

  const docs = await db
    .select({
      id: document.id,
      name: document.name,
      folderId: document.folderId,
      documentGroup: document.documentGroup,
      expiresAt: document.expiresAt,
      warnDaysBefore: document.warnDaysBefore,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .where(
      and(
        inArray(
          document.folderId,
          folders.map((node) => node.id),
        ),
        notDeleted(document),
      ),
    )
    .orderBy(asc(document.name));

  const today = localDateString();
  return docs.map((doc) => ({
    ...doc,
    path: pathOf(doc.folderId),
    ...documentSituation(doc.expiresAt, doc.warnDaysBefore, today),
  }));
}
