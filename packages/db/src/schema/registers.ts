import { jsonb, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id, whereActive } from './helpers';
import { equipmentType, registerTarget } from './enums';
import { unit } from './org';
import { document, folder, folderSchema } from './pie';

// Cadastros da unidade (decisão do usuário em 03/07/2026: sem módulo genérico
// de grupos — Colaboradores e Equipamentos são módulos próprios; o requisito
// tipo group aponta para um alvo fixo: colaboradores ou um tipo de equipamento).
// metadata = valores dos campos default do sistema + personalizados da unidade.

export const employee = pgTable(
  'employee',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    name: varchar('name', { length: 255 }).notNull(),
    // Pasta do colaborador no PIE (RF18.3) — base da sugestão de evidências.
    folderId: uuid('folder_id').references(() => folder.id),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    ...audit,
  },
  (t) => [uniqueIndex('uq_employee_unit_name').on(t.unitId, t.name).where(whereActive(t))],
);

export const equipment = pgTable(
  'equipment',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    name: varchar('name', { length: 255 }).notNull(),
    type: equipmentType('type').notNull(),
    folderId: uuid('folder_id').references(() => folder.id),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    ...audit,
  },
  (t) => [uniqueIndex('uq_equipment_unit_name').on(t.unitId, t.name).where(whereActive(t))],
);

// Campos personalizados da unidade, por grupo-alvo (cada tipo de equipamento
// tem estrutura própria); valores no metadata do item.
export const customField = pgTable(
  'custom_field',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    target: registerTarget('target').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    ...audit,
  },
  (t) => [
    uniqueIndex('uq_custom_field_unit_target_name')
      .on(t.unitId, t.target, t.name)
      .where(whereActive(t)),
  ],
);

// Configuração do grupo-alvo por unidade: estrutura de pastas padrão que vem
// PRÉ-selecionada (mas opcional) ao criar um item do grupo — a pasta do item
// nasce com essa estrutura dentro.
export const registerTargetSetting = pgTable(
  'register_target_setting',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    target: registerTarget('target').notNull(),
    folderSchemaId: uuid('folder_schema_id').references(() => folderSchema.id),
    ...audit,
  },
  (t) => [
    uniqueIndex('uq_register_target_setting')
      .on(t.unitId, t.target)
      .where(whereActive(t)),
  ],
);

// Vínculo campo→documento do PIE (campos kind=document, ex.: CA do EPI).
// Um documento pode cobrir N itens; cada item tem no máximo um documento
// ativo por campo. Base das automações de vencimento (diagnóstico/alertas).
export const registerDocumentLink = pgTable(
  'register_document_link',
  {
    id: id(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id),
    employeeId: uuid('employee_id').references(() => employee.id),
    equipmentId: uuid('equipment_id').references(() => equipment.id),
    fieldKey: varchar('field_key', { length: 120 }).notNull(),
    ...audit,
  },
  (t) => [
    uniqueIndex('uq_register_doc_link_employee_field')
      .on(t.employeeId, t.fieldKey)
      .where(whereActive(t)),
    uniqueIndex('uq_register_doc_link_equipment_field')
      .on(t.equipmentId, t.fieldKey)
      .where(whereActive(t)),
  ],
);
