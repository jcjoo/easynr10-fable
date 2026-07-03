import { sql, type SQL } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

// Colunas padrão do dicionário de dados (projeto.md §7.3):
// id uuid v7 gerado pela aplicação + colunas de auditoria com soft-delete.

export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

// Unicidade só entre registros ativos (soft-delete libera o nome para reuso).
export function whereActive(t: { deletedAt: unknown }): SQL {
  return sql`${t.deletedAt} IS NULL`;
}

export const audit = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};
