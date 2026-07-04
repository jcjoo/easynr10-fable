import { date, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id } from './helpers';
import { actionStatus, diagnosticStatus, requirementType } from './enums';
import { adequacyItem } from './norms';
import { document } from './pie';
import { employee, equipment } from './registers';
import { user } from './auth';

export const diagnostic = pgTable('diagnostic', {
  id: id(),
  adequacyItemId: uuid('adequacy_item_id')
    .notNull()
    .references(() => adequacyItem.id),
  authorId: text('author_id')
    .notNull()
    .references(() => user.id),
  status: diagnosticStatus('status').notNull(),
  deadline: date('deadline'),
  responsible: varchar('responsible', { length: 255 }),
  recommendedAction: text('recommended_action'),
  technicalOpinion: text('technical_opinion'),
  ...audit,
});

// Snapshot do requisito no momento do diagnóstico: reconfigurar o item
// de adequação não reescreve diagnósticos já realizados (projeto.md §7.6).
export const evidence = pgTable('evidence', {
  id: id(),
  diagnosticId: uuid('diagnostic_id')
    .notNull()
    .references(() => diagnostic.id),
  type: requirementType('type').notNull(),
  question: text('question').notNull(),
  ...audit,
});

export const evidenceItem = pgTable('evidence_item', {
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
  ...audit,
});

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
