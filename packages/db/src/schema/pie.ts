import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { audit, id, whereActive } from './helpers';
import { diagnosticStatus, documentGroup } from './enums';
import { unit } from './org';
import { user } from './auth';

// Esquemas globais (is_default, unit_id nulo) servem de modelo e são
// copiados para a unidade na criação/primeiro uso — como no legado.
export const folderSchema = pgTable('folder_schema', {
  id: id(),
  // Nulo = modelo global; preenchido = esquema da unidade (editável por ela).
  unitId: uuid('unit_id').references(() => unit.id),
  name: varchar('name', { length: 255 }).notNull(),
  // Árvore de pastas do modelo: nós aninhados por nome.
  structure: jsonb('structure').$type<FolderSchemaNode[]>().notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  ...audit,
});

export interface FolderSchemaNode {
  name: string;
  children?: FolderSchemaNode[];
}

export const folder = pgTable(
  'folder',
  {
    id: id(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id),
    parentId: uuid('parent_id').references((): AnyPgColumn => folder.id),
    name: varchar('name', { length: 255 }).notNull(),
    schemaId: uuid('schema_id').references(() => folderSchema.id),
    ...audit,
  },
  (t) => [
    uniqueIndex('uq_folder_unit_parent_name').on(t.unitId, t.parentId, t.name).where(whereActive(t)),
  ],
);

export const document = pgTable(
  'document',
  {
    id: id(),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folder.id),
    // FK circular com document_version; a constraint é criada na migration.
    currentVersionId: uuid('current_version_id').references((): AnyPgColumn => documentVersion.id),
    name: varchar('name', { length: 255 }).notNull(),
    documentGroup: documentGroup('document_group'),
    // Aderência opcional (escala do diagnóstico) — nota que propaga para
    // vínculos no cadastro e evidências no diagnóstico.
    adherence: diagnosticStatus('adherence'),
    expiresAt: date('expires_at'),
    warnDaysBefore: integer('warn_days_before'),
    ...audit,
  },
  // Listagem por pasta e cascata por subárvore filtram por folder_id.
  (t) => [index('idx_document_folder').on(t.folderId)],
);

// Catálogo global de documentos padrão (RF11) — nomes esperados no prontuário,
// portados do seed do sistema legado. Sufixo " - *" = nome por item
// (ex.: "Certificado de Aprovação (CA) - <equipamento>").
export const defaultDocument = pgTable(
  'default_document',
  {
    id: id(),
    name: varchar('name', { length: 255 }).notNull(),
    documentGroup: documentGroup('document_group').notNull(),
    isOptional: boolean('is_optional').notNull().default(false),
    ...audit,
  },
  (t) => [
    uniqueIndex('uq_default_document_name_group').on(t.name, t.documentGroup).where(whereActive(t)),
  ],
);

// Versões são imutáveis: sem updated_at/deleted_at (projeto.md §7.5).
export const documentVersion = pgTable(
  'document_version',
  {
    id: id(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id),
    number: integer('number').notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => user.id),
    createdAt: audit.createdAt,
  },
  (t) => [uniqueIndex('uq_document_version_number').on(t.documentId, t.number)],
);
