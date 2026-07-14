import { boolean, index, integer, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id, whereActive } from './helpers';
import { diagnosticStatus, documentGroup, registerTarget, requirementType } from './enums';
import { unit } from './org';

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
export const normRequirement = pgTable(
  'norm_requirement',
  {
    id: id(),
    normId: uuid('norm_id')
      .notNull()
      .references(() => norm.id),
    type: requirementType('type').notNull(),
    question: text('question').notNull(),
    ...audit,
  },
  // Requisitos do catálogo copiados por norma ao configurar o item.
  (t) => [index('idx_norm_requirement_norm').on(t.normId)],
);

// Não conformidade do catálogo (planilha do checklist: cada linha é um
// requisito do item, com sua lista de NÃO CONFORMIDADES pareada com AÇÕES
// RECOMENDADAS) — modelo copiado para o item, preservando o vínculo com o
// requisito de origem.
export const normNc = pgTable(
  'norm_nc',
  {
    id: id(),
    normId: uuid('norm_id')
      .notNull()
      .references(() => norm.id),
    normRequirementId: uuid('norm_requirement_id').references(() => normRequirement.id),
    code: varchar('code', { length: 30 }).notNull(),
    description: text('description').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    ...audit,
  },
  (t) => [index('idx_norm_nc_norm').on(t.normId)],
);

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

// Requisito configurado no item (RF13.1); tipo cadastro aponta para um dos 5
// cadastros (colaboradores/tipo de equipamento) + a coluna de documento
// vinculado (field_key) de onde sai a lista de itens e suas notas.
export const adequacyItemRequirement = pgTable(
  'adequacy_item_requirement',
  {
    id: id(),
    adequacyItemId: uuid('adequacy_item_id')
      .notNull()
      .references(() => adequacyItem.id),
    type: requirementType('type').notNull(),
    question: text('question').notNull(),
    targetGroup: registerTarget('target_group'),
    // Coluna de documento do cadastro (ex.: 'ca', 'treinamento_nr10_basico') —
    // casa com o field_key do register_document_link.
    fieldKey: varchar('field_key', { length: 120 }),
    ...audit,
  },
  // Requisitos por item de adequação (leitura da tela + cascata).
  (t) => [index('idx_adequacy_item_requirement_item').on(t.adequacyItemId)],
);

// NC configurada no item: vinculada a um requisito (sem vínculo não aparece
// na avaliação). Na avaliação o usuário marca a NC — não a nota: a nota do
// requisito É a da NC marcada (`adherence`); sem NC marcada, Plena. Um mesmo
// requisito pode ter NCs de notas diferentes (Inexistente numa, Suficiente
// noutra) — ou uma só, e então o requisito só pode ser Pleno ou aquela nota.
export const adequacyItemNc = pgTable(
  'adequacy_item_nc',
  {
    id: id(),
    adequacyItemId: uuid('adequacy_item_id')
      .notNull()
      .references(() => adequacyItem.id),
    requirementId: uuid('requirement_id').references(() => adequacyItemRequirement.id),
    code: varchar('code', { length: 30 }).notNull(),
    description: text('description').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    adherence: diagnosticStatus('adherence').notNull().default('inexistente'),
    ...audit,
  },
  (t) => [index('idx_adequacy_item_nc_item').on(t.adequacyItemId)],
);
