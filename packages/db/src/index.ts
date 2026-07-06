import { isNull, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;

// Filtro padrão de soft-delete: toda query sobre registros ativos usa
// notDeleted(tabela) em vez de repetir isNull(tabela.deletedAt) — um único
// ponto define o que é "ativo".
export function notDeleted(table: { deletedAt: AnyPgColumn }): SQL {
  return isNull(table.deletedAt);
}

export * as schema from './schema';
