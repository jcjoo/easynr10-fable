import { jsonb, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id, whereActive } from './helpers';
import { equipmentType, groupKind } from './enums';
import { unit } from './org';
import { folder } from './pie';

// Base do motor de evidências tipo grupo (projeto.md §7.6).
export const registerGroup = pgTable(
  'register_group',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    name: varchar('name', { length: 255 }).notNull(),
    kind: groupKind('kind').notNull().default('custom'),
    metadataConfig: jsonb('metadata_config').$type<Record<string, unknown>>(),
    folderId: uuid('folder_id').references(() => folder.id),
    ...audit,
  },
  (t) => [uniqueIndex('uq_register_group_unit_name').on(t.unitId, t.name).where(whereActive(t))],
);

export const registerItem = pgTable(
  'register_item',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => registerGroup.id),
    name: varchar('name', { length: 255 }).notNull(),
    // Pasta do item no PIE, configurada na tela do módulo dono (RF18.3).
    folderId: uuid('folder_id').references(() => folder.id),
    metadata: jsonb('metadata').$type<Record<string, string>>(),
    ...audit,
  },
  (t) => [uniqueIndex('uq_register_item_group_name').on(t.groupId, t.name).where(whereActive(t))],
);

// Detalhes especializados (RF18.1): ponte 1:1 com register_item.
// Colunas de domínio entram quando a necessidade aparecer (projeto.md §7.3).

export const employee = pgTable(
  'employee',
  {
    id: id(),
    registerItemId: uuid('register_item_id')
      .notNull()
      .references(() => registerItem.id),
    ...audit,
  },
  (t) => [uniqueIndex('uq_employee_register_item').on(t.registerItemId)],
);

export const equipment = pgTable(
  'equipment',
  {
    id: id(),
    registerItemId: uuid('register_item_id')
      .notNull()
      .references(() => registerItem.id),
    type: equipmentType('type').notNull(),
    ...audit,
  },
  (t) => [uniqueIndex('uq_equipment_register_item').on(t.registerItemId)],
);
