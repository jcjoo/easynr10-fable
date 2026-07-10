import { TRPCError } from '@trpc/server';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { notDeleted, schema, type Db, type DbOrTx } from '@easynr10/db';
import { columnFieldKeys, type EquipmentType, type RegisterTarget } from '@easynr10/shared';
import { createItemFolder, renameItemFolder } from './register-folders';

const {
  employee,
  equipment,
  equipmentEletrico,
  equipmentFerramenta,
  equipmentEpi,
  equipmentEpc,
} = schema;

// Colaboradores e Equipamentos compartilham os MESMOS fluxos (upsert com
// pasta do item, importação). O que muda é ONDE cada valor mora: campos default
// do sistema são COLUNAS (na própria tabela ou numa tabela-filho por tipo) e só
// os campos PERSONALIZADOS ficam no metadata (jsonb). Cada tabela pluga um
// "store" que sabe fazer esse split na escrita e recompor o mapa na leitura.

interface RegisterRow {
  id: string;
  name: string;
  folderId: string | null;
  // Mapa unificado (colunas default + personalizados) — o formato que a UI
  // consome; no banco os defaults estão em colunas e só os custom no metadata.
  metadata: Record<string, string>;
}

interface RegisterStore {
  // Rótulo do NOT_FOUND e alvo que define o caminho fixo da pasta do item.
  label: string;
  target: RegisterTarget;
  update(
    db: DbOrTx,
    unitId: string,
    id: string,
    values: { name?: string; fields: Record<string, string> },
  ): Promise<RegisterRow | undefined>;
  insert(
    db: DbOrTx,
    values: { unitId: string; name: string; folderId: string; fields: Record<string, string> },
  ): Promise<RegisterRow>;
  listByNames(db: DbOrTx, unitId: string, names: string[]): Promise<RegisterRow[]>;
  // Nomes que já existem na unidade mas este store NÃO consegue reaproveitar
  // (equipamento de OUTRO tipo — o nome é único por unidade, cruzando tipos).
  // Detectados antes de qualquer escrita para não deixar import pela metade.
  conflictingNames(db: DbOrTx, unitId: string, names: string[]): Promise<string[]>;
}

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

// Separa o mapa recebido da UI em colunas default × metadata personalizado.
function splitFields(target: RegisterTarget, fields: Record<string, string>) {
  const keys = new Set(columnFieldKeys(target));
  const columns: Record<string, string | null> = {};
  const metadata: Record<string, string> = {};
  for (const key of keys) columns[key] = null; // limpa colunas não enviadas
  for (const [key, value] of Object.entries(fields)) {
    if (keys.has(key)) columns[key] = value?.trim() ? value : null;
    else metadata[key] = value;
  }
  return { columns, metadata };
}

// — Colaboradores: coluna nivel_autorizacao + metadata personalizado —

function composeEmployee(row: typeof employee.$inferSelect): RegisterRow {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folderId,
    metadata: {
      ...row.metadata,
      ...(row.nivelAutorizacao ? { nivel_autorizacao: row.nivelAutorizacao } : {}),
    },
  };
}

export const employeeStore: RegisterStore = {
  label: 'Colaborador',
  target: 'colaboradores',
  async update(db, unitId, id, { name, fields }) {
    const { columns, metadata } = splitFields('colaboradores', fields);
    const [updated] = await db
      .update(employee)
      .set({
        ...(name !== undefined ? { name } : {}),
        nivelAutorizacao: (columns.nivel_autorizacao as typeof employee.$inferInsert.nivelAutorizacao) ?? null,
        metadata,
      })
      .where(and(eq(employee.id, id), eq(employee.unitId, unitId), notDeleted(employee)))
      .returning();
    return updated ? composeEmployee(updated) : undefined;
  },
  async insert(db, { unitId, name, folderId, fields }) {
    const { columns, metadata } = splitFields('colaboradores', fields);
    const [created] = await db
      .insert(employee)
      .values({
        unitId,
        name,
        folderId,
        nivelAutorizacao: (columns.nivel_autorizacao as typeof employee.$inferInsert.nivelAutorizacao) ?? null,
        metadata,
      })
      .returning();
    return composeEmployee(created!);
  },
  async listByNames(db, unitId, names) {
    if (names.length === 0) return [];
    const rows = await db
      .select()
      .from(employee)
      .where(and(eq(employee.unitId, unitId), inArray(employee.name, names), notDeleted(employee)));
    return rows.map(composeEmployee);
  },
  // Colaborador é tabela única: nunca há conflito de "outro tipo".
  async conflictingNames() {
    return [];
  },
};

// — Equipamentos: colunas default numa tabela-filho por tipo + metadata —

// Tabela-filho por tipo. `AnyDetail` folga a tipagem de união (drizzle não
// infere bem operações sobre a união dos 4 pgTable) — a forma é validada em
// runtime pelos testes e pelo schema.
type AnyDetail = typeof equipmentEletrico;
const detailTables: Record<EquipmentType, AnyDetail> = {
  eletrico: equipmentEletrico,
  ferramenta: equipmentFerramenta as unknown as AnyDetail,
  epi: equipmentEpi as unknown as AnyDetail,
  epc: equipmentEpc as unknown as AnyDetail,
};

// Grava (upsert 1:1 por equipment_id) as colunas default do tipo na tabela-filho
// e limpa qualquer linha das outras tabelas (o tipo do equipamento pode mudar).
async function writeDetail(
  db: DbOrTx,
  type: EquipmentType,
  equipmentId: string,
  columns: Record<string, string | null>,
) {
  const table = detailTables[type];
  // Tipos sem coluna default (ex.: EPC) não gravam linha na tabela-filho.
  if (Object.keys(columns).length > 0) {
    await db
      .insert(table)
      .values({ equipmentId, ...columns } as typeof table.$inferInsert)
      .onConflictDoUpdate({ target: table.equipmentId, set: columns });
  }
  for (const other of Object.keys(detailTables) as EquipmentType[]) {
    if (other !== type) {
      await db.delete(detailTables[other]).where(eq(detailTables[other].equipmentId, equipmentId));
    }
  }
}

export function equipmentStore(type: EquipmentType): RegisterStore {
  const table = detailTables[type];
  return {
    label: 'Equipamento',
    target: type,
    async update(db, unitId, id, { name, fields }) {
      const { columns, metadata } = splitFields(type, fields);
      const [updated] = await db
        .update(equipment)
        .set({ ...(name !== undefined ? { name } : {}), type, metadata })
        .where(and(eq(equipment.id, id), eq(equipment.unitId, unitId), notDeleted(equipment)))
        .returning();
      if (!updated) return undefined;
      await writeDetail(db, type, updated.id, columns);
      return {
        id: updated.id,
        name: updated.name,
        folderId: updated.folderId,
        metadata: { ...metadata, ...cleanColumns(columns) },
      };
    },
    async insert(db, { unitId, name, folderId, fields }) {
      const { columns, metadata } = splitFields(type, fields);
      const [created] = await db
        .insert(equipment)
        .values({ unitId, name, folderId, type, metadata })
        .returning();
      await writeDetail(db, type, created!.id, columns);
      return {
        id: created!.id,
        name: created!.name,
        folderId: created!.folderId,
        metadata: { ...metadata, ...cleanColumns(columns) },
      };
    },
    async listByNames(db, unitId, names) {
      if (names.length === 0) return [];
      const rows = await db
        .select({ equipment, detail: table })
        .from(equipment)
        .leftJoin(table, eq(table.equipmentId, equipment.id))
        .where(
          and(
            eq(equipment.unitId, unitId),
            eq(equipment.type, type),
            inArray(equipment.name, names),
            notDeleted(equipment),
          ),
        );
      return rows.map((row) => ({
        id: row.equipment.id,
        name: row.equipment.name,
        folderId: row.equipment.folderId,
        metadata: { ...row.equipment.metadata, ...detailToMetadata(row.detail) },
      }));
    },
    async conflictingNames(db, unitId, names) {
      if (names.length === 0) return [];
      const rows = await db
        .select({ name: equipment.name })
        .from(equipment)
        .where(
          and(
            eq(equipment.unitId, unitId),
            ne(equipment.type, type),
            inArray(equipment.name, names),
            notDeleted(equipment),
          ),
        );
      return rows.map((row) => row.name);
    },
  };
}

// Valores não-nulos das colunas viram entradas do mapa (string).
function cleanColumns(columns: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(columns).filter(([, value]) => value != null) as [string, string][],
  );
}

// Linha da tabela-filho (menos id/equipmentId) → entradas do mapa unificado.
export function detailToMetadata(
  detail: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!detail) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (key === 'id' || key === 'equipmentId') continue;
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
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
