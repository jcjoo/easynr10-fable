import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type DbOrTx } from '@easynr10/db';

const { document, employee, equipment, folder } = schema;

// Checagens de tenant compartilhadas — a regra "pertence à unidade" de cada
// entidade num lugar só (documento é escopado via pasta; item de cadastro,
// direto pela coluna unit_id). O mesmo join estava copiado em routers e
// services e podia divergir.

// Ids (dentre `ids`) que são documentos vivos da unidade.
export async function unitDocumentIds(
  db: DbOrTx,
  unitId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: document.id })
    .from(document)
    .innerJoin(folder, eq(document.folderId, folder.id))
    .where(
      and(inArray(document.id, [...new Set(ids)]), eq(folder.unitId, unitId), notDeleted(document)),
    );
  return new Set(rows.map((row) => row.id));
}

// Documento da unidade (via pasta) ou 404 — garante o isolamento de tenant
// mesmo com um documentId de outra unidade.
export async function findUnitDocument(db: DbOrTx, unitId: string, documentId: string) {
  const [row] = await db
    .select({ document })
    .from(document)
    .innerJoin(folder, eq(document.folderId, folder.id))
    .where(and(eq(document.id, documentId), eq(folder.unitId, unitId), notDeleted(document)));
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' });
  }
  return row.document;
}

// Ids (dentre `ids`) que são itens vivos do cadastro da unidade.
export async function unitRegisterItemIds(
  db: DbOrTx,
  unitId: string,
  kind: 'employee' | 'equipment',
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const table = kind === 'employee' ? employee : equipment;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.unitId, unitId), inArray(table.id, [...new Set(ids)]), notDeleted(table)));
  return new Set(rows.map((row) => row.id));
}

// Todos os `ids` na unidade, ou NOT_FOUND (vínculo em lote dos cadastros).
export async function assertItemsInUnit(
  db: DbOrTx,
  unitId: string,
  kind: 'employee' | 'equipment',
  ids: string[],
) {
  if (ids.length === 0) return;
  const found = await unitRegisterItemIds(db, unitId, kind, ids);
  if (found.size !== new Set(ids).size) {
    const label = kind === 'employee' ? 'Colaborador' : 'Equipamento';
    throw new TRPCError({ code: 'NOT_FOUND', message: `${label} não encontrado nesta unidade` });
  }
}
