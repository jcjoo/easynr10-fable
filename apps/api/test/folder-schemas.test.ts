// Estruturas de pastas (folder schemas): cópia dos modelos globais no
// primeiro uso, aplicação idempotente e exclusão que não ressuscita modelos.
import { describe, expect, test } from 'bun:test';
import { schema } from '@easynr10/db';
import { db } from '../src/db';
import { setupUnit, uniqueName } from './helpers';

describe('folderSchemas', () => {
  test('modelos globais são copiados para a unidade UMA vez', async () => {
    // Modelo global (o seed de produção não roda nos testes).
    const globalName = uniqueName('Modelo global');
    await db
      .insert(schema.folderSchema)
      .values({ name: globalName, structure: [{ name: 'Prontuário' }], isDefault: true });

    const { adminCaller, unit } = await setupUnit();
    const list = await adminCaller.folderSchemas.listByUnit({ unitId: unit.id });
    const copy = list.find((row) => row.name === globalName);
    expect(copy).toBeDefined();

    // Excluir a cópia NÃO faz o modelo global ressuscitar na próxima listagem.
    await adminCaller.folderSchemas.remove({ unitId: unit.id, schemaId: copy!.id });
    const after = await adminCaller.folderSchemas.listByUnit({ unitId: unit.id });
    expect(after.some((row) => row.name === globalName)).toBe(false);
  });

  test('applyToUnit gera a árvore e é idempotente', async () => {
    const { adminCaller, unit } = await setupUnit();
    const created = (await adminCaller.folderSchemas.create({
      unitId: unit.id,
      name: uniqueName('Estrutura'),
      structure: [{ name: 'Instalações', children: [{ name: 'Laudos' }, { name: 'Projetos' }] }],
    }))!;

    const first = await adminCaller.folderSchemas.applyToUnit({
      unitId: unit.id,
      schemaId: created.id,
      parentId: null,
    });
    expect(first.created).toBe(3);

    // Aplicar de novo no mesmo lugar não duplica nada.
    const second = await adminCaller.folderSchemas.applyToUnit({
      unitId: unit.id,
      schemaId: created.id,
      parentId: null,
    });
    expect(second.created).toBe(0);
  });

  test('update edita nome e estrutura da cópia da unidade', async () => {
    const { adminCaller, unit } = await setupUnit();
    const created = (await adminCaller.folderSchemas.create({
      unitId: unit.id,
      name: uniqueName('Original'),
      structure: [{ name: 'A' }],
    }))!;
    const updated = await adminCaller.folderSchemas.update({
      unitId: unit.id,
      schemaId: created.id,
      name: 'Editada',
      structure: [{ name: 'A' }, { name: 'B' }],
    });
    expect(updated?.name).toBe('Editada');
    expect(updated?.structure).toHaveLength(2);
  });
});
