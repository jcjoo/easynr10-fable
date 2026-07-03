import { boolean, integer, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id, whereActive } from './helpers';
import { documentGroup, requirementType } from './enums';
import { unit } from './org';
import { defaultDocument } from './pie';
import { registerGroup } from './registers';

export const norm = pgTable(
  'norm',
  {
    id: id(),
    code: varchar('code', { length: 50 }).notNull(),
    description: text('description').notNull(),
    orientation: text('orientation').notNull(),
    importanceWeight: integer('importance_weight').notNull(),
    documentGroup: documentGroup('document_group'),
    ...audit,
  },
  (t) => [uniqueIndex('uq_norm_code').on(t.code).where(whereActive(t))],
);

// Requisito de evidência do catálogo (modelo copiado para o item de adequação).
export const normRequirement = pgTable('norm_requirement', {
  id: id(),
  normId: uuid('norm_id')
    .notNull()
    .references(() => norm.id),
  type: requirementType('type').notNull(),
  question: text('question').notNull(),
  ...audit,
});

export const adequacyItem = pgTable(
  'adequacy_item',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    normId: uuid('norm_id')
      .notNull()
      .references(() => norm.id),
    isActive: boolean('is_active').notNull().default(true),
    // Orientação específica da unidade (complementa a orientação do catálogo).
    orientation: text('orientation'),
    ...audit,
  },
  (t) => [uniqueIndex('uq_adequacy_item_unit_norm').on(t.unitId, t.normId).where(whereActive(t))],
);

// Requisito configurado no item (RF13.1); tipo group aponta para um grupo de cadastro.
export const adequacyItemRequirement = pgTable('adequacy_item_requirement', {
  id: id(),
  adequacyItemId: uuid('adequacy_item_id')
    .notNull()
    .references(() => adequacyItem.id),
  type: requirementType('type').notNull(),
  question: text('question').notNull(),
  registerGroupId: uuid('register_group_id').references(() => registerGroup.id),
  // Nome de documento padrão do catálogo — termo de busca da sugestão
  // automática nos requisitos tipo group (como no legado).
  defaultDocumentId: uuid('default_document_id').references(() => defaultDocument.id),
  ...audit,
});
