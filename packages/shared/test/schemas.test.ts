import { describe, expect, test } from 'bun:test';
import {
  documentConfirmSchema,
  documentLinkSchema,
  employeeUpsertSchema,
  folderSchemaCreateSchema,
  requirementCreateSchema,
} from '../src/schemas';

const unitId = crypto.randomUUID();

describe('employeeUpsertSchema', () => {
  test('aplica default de metadata e apara o nome', () => {
    const parsed = employeeUpsertSchema.parse({ unitId, name: '  Maria  ' });
    expect(parsed.name).toBe('Maria');
    expect(parsed.metadata).toEqual({});
  });

  test('rejeita nome vazio', () => {
    expect(() => employeeUpsertSchema.parse({ unitId, name: '   ' })).toThrow();
  });
});

describe('documentLinkSchema', () => {
  test('exige ao menos um item selecionado', () => {
    const base = { unitId, fieldKey: 'ca', documentId: crypto.randomUUID() };
    expect(() => documentLinkSchema.parse(base)).toThrow();
    expect(
      documentLinkSchema.parse({ ...base, employeeIds: [crypto.randomUUID()] }).employeeIds,
    ).toHaveLength(1);
  });
});

describe('requirementCreateSchema', () => {
  const base = {
    unitId,
    adequacyItemId: crypto.randomUUID(),
    question: 'Existe laudo?',
  };

  test('tipo cadastro exige alvo e coluna de documento', () => {
    expect(() => requirementCreateSchema.parse({ ...base, type: 'cadastro' })).toThrow();
    expect(
      requirementCreateSchema.parse({
        ...base,
        type: 'cadastro',
        targetGroup: 'epi',
        fieldKey: 'ca',
      }).targetGroup,
    ).toBe('epi');
  });

  test('tipo document não exige alvo', () => {
    expect(requirementCreateSchema.parse({ ...base, type: 'document' }).type).toBe('document');
  });
});

describe('documentConfirmSchema', () => {
  const base = {
    unitId,
    folderId: crypto.randomUUID(),
    name: 'Laudo SPDA',
    storageKey: 'units/x/y/laudo.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  };

  test('aceita data ISO e rejeita formato inválido', () => {
    expect(documentConfirmSchema.parse({ ...base, expiresAt: '2026-12-31' }).expiresAt).toBe(
      '2026-12-31',
    );
    expect(() => documentConfirmSchema.parse({ ...base, expiresAt: '31/12/2026' })).toThrow();
    expect(() => documentConfirmSchema.parse({ ...base, sizeBytes: -1 })).toThrow();
  });
});

describe('folderSchemaCreateSchema', () => {
  test('estrutura recursiva com filhos válida; vazia é rejeitada', () => {
    const parsed = folderSchemaCreateSchema.parse({
      unitId,
      name: 'Padrão',
      structure: [{ name: 'Raiz', children: [{ name: 'Filha' }] }],
    });
    expect(parsed.structure[0]?.children?.[0]?.name).toBe('Filha');
    expect(() =>
      folderSchemaCreateSchema.parse({ unitId, name: 'Padrão', structure: [] }),
    ).toThrow();
  });
});
