import {
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { audit, id, whereActive } from './helpers';
import { user } from './auth';

export const company = pgTable(
  'company',
  {
    id: id(),
    name: varchar('name', { length: 255 }).notNull(),
    logoKey: varchar('logo_key', { length: 512 }),
    ...audit,
  },
  (t) => [uniqueIndex('uq_company_name').on(t.name).where(whereActive(t))],
);

export const unit = pgTable(
  'unit',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => company.id),
    name: varchar('name', { length: 255 }).notNull(),
    logoKey: varchar('logo_key', { length: 512 }),
    // host/porta/remetente; credenciais ficam no secret manager (projeto.md §7.3)
    emailConfig: jsonb('email_config').$type<{ host: string; port: number; from: string }>(),
    ...audit,
  },
  (t) => [uniqueIndex('uq_unit_company_name').on(t.companyId, t.name).where(whereActive(t))],
);


// Papéis de acesso por unidade, com mapeamento de permissões (ações de
// escrita do catálogo unitActions do shared). Papéis-sistema (Gestor/Leitor)
// são seedados na migration e não podem ser excluídos.
export const appRole = pgTable(
  'app_role',
  {
    id: id(),
    // NULL = papel padrão do sistema (Gestor/Leitor), disponível em TODAS as
    // empresas e imutável; com company_id = papel customizado da empresa.
    companyId: uuid('company_id').references(() => company.id),
    name: varchar('name', { length: 120 }).notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    ...audit,
  },
  (t) => [
    uniqueIndex('uq_app_role_company_name').on(t.companyId, t.name).where(whereActive(t)),
  ],
);

export const membership = pgTable(
  'membership',
  {
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => appRole.id),
    ...audit,
  },
  (t) => [primaryKey({ columns: [t.unitId, t.userId] })],
);
