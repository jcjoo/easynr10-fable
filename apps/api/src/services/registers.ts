import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import type { EquipmentType, RegisterTarget } from '@easynr10/shared';
import { createItemFolder } from './register-folders';

const { employee, equipment } = schema;

// Colaboradores e Equipamentos compartilham os MESMOS fluxos (upsert com
// pasta do item, importação com merge de metadata) — o que muda é a tabela.
// Cada tabela pluga um "store" mínimo (DIP) e os fluxos vivem uma vez só;
// antes eram pares de procedures ~80% idênticas no router.

interface RegisterRow {
  id: string;
  name: string;
  folderId: string | null;
  metadata: Record<string, string>;
}

interface RegisterStore<Row extends RegisterRow> {
  // Rótulo do NOT_FOUND e alvo que define o caminho fixo da pasta do item.
  label: string;
  target: RegisterTarget;
  update(
    db: Db,
    unitId: string,
    id: string,
    values: { name?: string; metadata: Record<string, string> },
  ): Promise<Row | undefined>;
  insert(
    db: Db,
    values: { unitId: string; name: string; folderId: string; metadata: Record<string, string> },
  ): Promise<Row>;
  listByNames(db: Db, unitId: string, names: string[]): Promise<Row[]>;
}

export const employeeStore: RegisterStore<typeof employee.$inferSelect> = {
  label: 'Colaborador',
  target: 'colaboradores',
  async update(db, unitId, id, values) {
    const [updated] = await db
      .update(employee)
      .set(values)
      .where(and(eq(employee.id, id), eq(employee.unitId, unitId), notDeleted(employee)))
      .returning();
    return updated;
  },
  async insert(db, values) {
    const [created] = await db.insert(employee).values(values).returning();
    return created!;
  },
  listByNames(db, unitId, names) {
    if (names.length === 0) return Promise.resolve([]);
    return db.query.employee.findMany({
      where: and(
        eq(employee.unitId, unitId),
        inArray(employee.name, names),
        notDeleted(employee),
      ),
    });
  },
};

// Store parametrizado pelo tipo (função superior): o tipo entra nas escritas
// e define o caminho da pasta (Equipamentos/<Tipo>/Lista de <Tipo>).
export function equipmentStore(type: EquipmentType): RegisterStore<typeof equipment.$inferSelect> {
  return {
    label: 'Equipamento',
    target: type,
    async update(db, unitId, id, values) {
      const [updated] = await db
        .update(equipment)
        .set({ ...values, type })
        .where(and(eq(equipment.id, id), eq(equipment.unitId, unitId), notDeleted(equipment)))
        .returning();
      return updated;
    },
    async insert(db, values) {
      const [created] = await db
        .insert(equipment)
        .values({ ...values, type })
        .returning();
      return created!;
    },
    listByNames(db, unitId, names) {
      if (names.length === 0) return Promise.resolve([]);
      return db.query.equipment.findMany({
        where: and(
          eq(equipment.unitId, unitId),
          inArray(equipment.name, names),
          notDeleted(equipment),
        ),
      });
    },
  };
}

// Upsert: com id atualiza (escopado à unidade); sem id cria com a pasta do
// item sob a lista do grupo (+ estrutura opcional).
export async function upsertRegisterItem<Row extends RegisterRow>(
  db: Db,
  store: RegisterStore<Row>,
  input: {
    unitId: string;
    itemId?: string;
    name: string;
    metadata: Record<string, string>;
    folderSchemaId?: string | null;
  },
): Promise<Row> {
  if (input.itemId) {
    const updated = await store.update(db, input.unitId, input.itemId, {
      name: input.name,
      metadata: input.metadata,
    });
    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `${store.label} não encontrado` });
    }
    return updated;
  }
  const folderId = await createItemFolder(
    db,
    input.unitId,
    store.target,
    input.name,
    input.folderSchemaId,
  );
  return store.insert(db, {
    unitId: input.unitId,
    name: input.name,
    folderId,
    metadata: input.metadata,
  });
}

// Importação por planilha: upsert por nome com merge de metadata. Os
// existentes vêm em UMA query (sem N+1 de findFirst por linha); só a pasta
// dos itens novos continua por item (inerente à estrutura).
export async function importRegisterItems<Row extends RegisterRow>(
  db: Db,
  store: RegisterStore<Row>,
  input: { unitId: string; items: { name: string; metadata: Record<string, string> }[] },
) {
  const existing = await store.listByNames(
    db,
    input.unitId,
    input.items.map((item) => item.name),
  );
  const byName = new Map(existing.map((row) => [row.name, row]));
  let created = 0;
  let updated = 0;
  for (const item of input.items) {
    const found = byName.get(item.name);
    if (found) {
      await store.update(db, input.unitId, found.id, {
        metadata: { ...found.metadata, ...item.metadata },
      });
      updated += 1;
    } else {
      const folderId = await createItemFolder(db, input.unitId, store.target, item.name);
      const inserted = await store.insert(db, {
        unitId: input.unitId,
        name: item.name,
        folderId,
        metadata: item.metadata,
      });
      byName.set(item.name, inserted); // nome repetido na planilha vira update
      created += 1;
    }
  }
  return { created, updated };
}
