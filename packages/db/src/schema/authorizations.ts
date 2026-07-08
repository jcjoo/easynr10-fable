import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { AuthorizationDetails } from '@easynr10/shared';
import { audit, id, whereActive } from './helpers';
import { authorizationEventType, authorizationStatus, authorizationType } from './enums';
import { unit } from './org';
import { employee } from './registers';
import { document } from './pie';
import { user } from './auth';

// Autorizações (Permissão de Trabalho / Ficha de EPI): o operador gera o
// documento para um colaborador assinar — presencial ou pelo link público
// (sign_token; colaborador pode não ter acesso ao sistema). Assinado, o PDF
// com trilha de auditoria entra na pasta do colaborador no P.I.E (document_id).

export const authorization = pgTable(
  'authorization',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    type: authorizationType('type').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id),
    // Conteúdo essencial por tipo (PT: atividade/local/validade; EPI: itens).
    details: jsonb('details').$type<AuthorizationDetails>().notNull(),
    status: authorizationStatus('status').notNull().default('pendente'),
    signToken: varchar('sign_token', { length: 64 }).notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    documentId: uuid('document_id').references(() => document.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    ...audit,
  },
  (t) => [uniqueIndex('uq_authorization_sign_token').on(t.signToken)],
);

// Catálogo de atividades da unidade: opções do checklist da Autorização de
// Trabalho (details.atividades guarda o NOME escolhido, não o id — ver
// WorkPermitDetails).
export const activity = pgTable(
  'activity',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    name: varchar('name', { length: 255 }).notNull(),
    ...audit,
  },
  (t) => [uniqueIndex('uq_activity_unit_name').on(t.unitId, t.name).where(whereActive(t))],
);

// Trilha de auditoria: eventos imutáveis (sem update/soft-delete), impressos
// na ficha final do PDF assinado.
export const authorizationEvent = pgTable('authorization_event', {
  id: id(),
  authorizationId: uuid('authorization_id')
    .notNull()
    .references(() => authorization.id),
  type: authorizationEventType('type').notNull(),
  // Quem fez: nome do operador (criada/cancelada) ou do colaborador
  // (assinada); "assinada" registra também o meio (presencial/link).
  actor: varchar('actor', { length: 255 }).notNull(),
  createdAt: audit.createdAt,
});
