// Pastas do PIE: criação (com pai validado), renome e a regra de exclusão —
// cliente só remove pasta vazia; admin remove em cascata (soft delete).
import { describe, expect, test } from 'bun:test';
import { expectTRPCError, memberCaller, seedDocument, setupUnit, uniqueName } from './helpers';

describe('folders', () => {
  test('cria, renomeia e valida pasta pai de outra unidade', async () => {
    const { adminCaller, unit } = await setupUnit();
    const { unit: otherUnit } = await setupUnit();

    const root = (await adminCaller.folders.create({
      unitId: unit.id,
      parentId: null,
      name: uniqueName('Raiz'),
    }))!;
    const child = (await adminCaller.folders.create({
      unitId: unit.id,
      parentId: root.id,
      name: 'Filha',
    }))!;
    expect(child.parentId).toBe(root.id);

    // Pai de OUTRA unidade não pode ser referenciado (isolamento de tenant).
    await expectTRPCError(
      adminCaller.folders.create({ unitId: otherUnit.id, parentId: root.id, name: 'Invasora' }),
      'NOT_FOUND',
    );

    const renamed = await adminCaller.folders.rename({
      unitId: unit.id,
      folderId: child.id,
      name: 'Renomeada',
    });
    expect(renamed?.name).toBe('Renomeada');
  });

  test('cliente não remove pasta com conteúdo; admin remove em cascata', async () => {
    const { adminCaller, unit } = await setupUnit();
    const { caller: manager } = await memberCaller(adminCaller, unit.id, 'Gestor');

    const parent = (await manager.folders.create({
      unitId: unit.id,
      parentId: null,
      name: uniqueName('Pai'),
    }))!;
    const child = (await manager.folders.create({
      unitId: unit.id,
      parentId: parent.id,
      name: 'Filha',
    }))!;
    await seedDocument(manager, unit.id, child.id);

    // Gestor (cliente) esbarra na regra de pasta não vazia.
    await expectTRPCError(
      manager.folders.remove({ unitId: unit.id, folderId: parent.id }),
      'CONFLICT',
    );

    // Pasta vazia o cliente remove.
    const empty = (await manager.folders.create({
      unitId: unit.id,
      parentId: null,
      name: uniqueName('Vazia'),
    }))!;
    expect(
      (await manager.folders.remove({ unitId: unit.id, folderId: empty.id })).success,
    ).toBe(true);

    // Admin remove a árvore inteira; documentos somem das listagens.
    const result = await adminCaller.folders.remove({ unitId: unit.id, folderId: parent.id });
    expect(result).toEqual({ success: true, folders: 2, documents: 1 });
    const remaining = await adminCaller.folders.list({ unitId: unit.id });
    expect(remaining.some((row) => row.id === parent.id || row.id === child.id)).toBe(false);
    expect(
      await adminCaller.documents.listByFolder({ unitId: unit.id, folderId: child.id }),
    ).toHaveLength(0);
  });
});
