import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id } from './helpers';
import { actionStatus, diagnosticStatus, requirementType } from './enums';
import { adequacyItem } from './norms';
import { document } from './pie';
import { employee, equipment } from './registers';
import { user } from './auth';

export const diagnostic = pgTable(
  'diagnostic',
  {
    id: id(),
    adequacyItemId: uuid('adequacy_item_id')
      .notNull()
      .references(() => adequacyItem.id),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    // Aderência do item = média das notas das evidências. score (0..100) é o
    // valor exato; status é a faixa derivada (compat. prioridade/relatórios).
    status: diagnosticStatus('status').notNull(),
    score: integer('score'),
    deadline: date('deadline'),
    responsible: varchar('responsible', { length: 255 }),
    recommendedAction: text('recommended_action'),
    technicalOpinion: text('technical_opinion'),
    ...audit,
  },
  // "Último diagnóstico por item" (dashboard/relatórios) filtra por adequacy_item_id.
  (t) => [index('idx_diagnostic_adequacy_item').on(t.adequacyItemId)],
);

// Snapshot do requisito no momento do diagnóstico: reconfigurar o item
// de adequação não reescreve diagnósticos já realizados (projeto.md §7.6).
export const evidence = pgTable(
  'evidence',
  {
    id: id(),
    diagnosticId: uuid('diagnostic_id')
      .notNull()
      .references(() => diagnostic.id),
    type: requirementType('type').notNull(),
    question: text('question').notNull(),
    // Nota da evidência (document/opinion). Em cadastro a nota vem dos itens.
    adherence: diagnosticStatus('adherence'),
    ...audit,
  },
  (t) => [index('idx_evidence_diagnostic').on(t.diagnosticId)],
);

export const evidenceItem = pgTable(
  'evidence_item',
  {
    id: id(),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id),
    // Membro do grupo comprovado (requisitos tipo group).
    employeeId: uuid('employee_id').references(() => employee.id),
    equipmentId: uuid('equipment_id').references(() => equipment.id),
    // Documento do PIE usado como prova (sugerido ou vinculado manualmente).
    documentId: uuid('document_id').references(() => document.id),
    label: varchar('label', { length: 512 }).notNull(),
    answer: text('answer'),
    // Nota do item de prova (usada nos itens de evidência tipo cadastro).
    adherence: diagnosticStatus('adherence'),
    ...audit,
  },
  // evidence_id: itens de uma evidência; document_id: purge do documento.
  (t) => [
    index('idx_evidence_item_evidence').on(t.evidenceId),
    index('idx_evidence_item_document').on(t.documentId),
  ],
);

// NC marcada no diagnóstico (snapshot, como as evidências): código, descrição,
// ação e nota copiados da configuração no momento — reconfigurar as NCs não
// reescreve diagnósticos. Em requisitos de cadastro, uma linha por item
// marcado (item_label identifica o colaborador/equipamento).
export const diagnosticNc = pgTable(
  'diagnostic_nc',
  {
    id: id(),
    diagnosticId: uuid('diagnostic_id')
      .notNull()
      .references(() => diagnostic.id),
    code: varchar('code', { length: 30 }).notNull(),
    description: text('description').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    requirementQuestion: text('requirement_question').notNull(),
    itemLabel: varchar('item_label', { length: 512 }),
    adherence: diagnosticStatus('adherence').notNull(),
    ...audit,
  },
  // "NCs do último diagnóstico" (relatório) busca por diagnostic_id.
  (t) => [index('idx_diagnostic_nc_diagnostic').on(t.diagnosticId)],
);

export const actionItem = pgTable(
  'action_item',
  {
    id: id(),
    diagnosticId: uuid('diagnostic_id')
      .notNull()
      .references(() => diagnostic.id),
    status: actionStatus('status').notNull().default('pendente'),
    deadline: date('deadline').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...audit,
  },
  (t) => [uniqueIndex('uq_action_item_diagnostic').on(t.diagnosticId)],
);
