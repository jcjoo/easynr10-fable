import { TRPCError } from '@trpc/server';
import { type Db } from '@easynr10/db';
import { createItemFolder, renameItemFolder } from '../register-folders';
import type { RegisterRow, RegisterStore } from './stores';

// Violação de índice único do Postgres (nome duplicado na unidade) — traduzida
// para um erro amigável em vez do 500 cru. O drizzle embrulha o erro do pg,
// então o código `23505` pode estar na cadeia de `cause`.
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current != null; ) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: string }).code === '23505'
    ) {
      return true;
    }
    const next = (current as { cause?: unknown }).cause;
    if (next === current) break;
    current = next;
  }
  return false;
}

// Upsert: com id atualiza (escopado à unidade); sem id cria com a pasta do
// item sob a lista do grupo (+ estrutura opcional).
export async function upsertRegisterItem(
  db: Db,
  store: RegisterStore,
  input: {
    unitId: string;
    itemId?: string;
    name: string;
    fields: Record<string, string>;
    folderSchemaId?: string | null;
  },
): Promise<RegisterRow> {
  if (input.itemId) {
    return db.transaction(async (tx) => {
      const updated = await store.update(tx, input.unitId, input.itemId!, {
        name: input.name,
        fields: input.fields,
      });
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `${store.label} não encontrado` });
      }
      // Renomear o item renomeia a pasta dele no PIE (mantém a convenção
      // pasta↔item; sem isso a pasta ficava com o nome antigo).
      if (updated.folderId) {
        await renameItemFolder(tx, input.unitId, updated.folderId, input.name);
      }
      return updated;
    });
  }
  try {
    const folderId = await createItemFolder(
      db,
      input.unitId,
      store.target,
      input.name,
      input.folderSchemaId,
    );
    return await store.insert(db, {
      unitId: input.unitId,
      name: input.name,
      folderId,
      fields: input.fields,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Já existe um ${store.label.toLowerCase()} com esse nome nesta unidade`,
      });
    }
    throw error;
  }
}

// Importação por planilha: upsert por nome com merge dos campos. Os existentes
// vêm em UMA query (sem N+1); só a pasta dos itens novos continua por item.
export async function importRegisterItems(
  db: Db,
  store: RegisterStore,
  input: { unitId: string; items: { name: string; metadata: Record<string, string> }[] },
) {
  const names = input.items.map((item) => item.name);

  // Pré-checagem antes de qualquer escrita: nomes que colidem com um item de
  // OUTRO tipo (o nome é único por unidade cruzando tipos) não podem ser
  // mesclados — barrar aqui evita import pela metade e o 500 da constraint.
  const conflicts = await store.conflictingNames(db, input.unitId, names);
  if (conflicts.length > 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Já existe cadastro de outro tipo com este nome: ${[...new Set(conflicts)].join(', ')}`,
    });
  }

  // Tudo numa transação: uma falha inesperada no meio desfaz o lote inteiro
  // (sem deixar parte da planilha importada e parte não).
  return db.transaction(async (tx) => {
    const existing = await store.listByNames(tx, input.unitId, names);
    const byName = new Map(existing.map((row) => [row.name, row]));
    let created = 0;
    let updated = 0;
    for (const item of input.items) {
      const found = byName.get(item.name);
      if (found) {
        const merged = await store.update(tx, input.unitId, found.id, {
          fields: { ...found.metadata, ...item.metadata },
        });
        if (merged) byName.set(item.name, merged);
        updated += 1;
      } else {
        const folderId = await createItemFolder(tx, input.unitId, store.target, item.name);
        const inserted = await store.insert(tx, {
          unitId: input.unitId,
          name: item.name,
          folderId,
          fields: item.metadata,
        });
        byName.set(item.name, inserted); // nome repetido na planilha vira update
        created += 1;
      }
    }
    return { created, updated };
  });
}
