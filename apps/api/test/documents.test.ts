// Documentos do PIE: upload confirmado (v1), novas versões, restauração,
// edição, soft delete, subárvore e isolamento entre unidades.
import { describe, expect, test } from 'bun:test';
import { expectTRPCError, seedDocument, setupUnit, uniqueName } from './helpers';

async function makeFolder(caller: Awaited<ReturnType<typeof setupUnit>>['adminCaller'], unitId: string, parentId: string | null = null) {
  return (await caller.folders.create({ unitId, parentId, name: uniqueName('Pasta') }))!;
}

describe('documents', () => {
  test('confirmUpload cria documento com versão 1 corrente', async () => {
    const { adminCaller, unit } = await setupUnit();
    const folder = await makeFolder(adminCaller, unit.id);
    const doc = await seedDocument(adminCaller, unit.id, folder.id, { name: 'Laudo SPDA' });

    const [row] = await adminCaller.documents.listByFolder({
      unitId: unit.id,
      folderId: folder.id,
    });
    expect(row?.name).toBe('Laudo SPDA');
    expect(row?.version).toBe(1);

    const versions = await adminCaller.documents.versions({
      unitId: unit.id,
      documentId: doc.id,
    });
    expect(versions.map((v) => v.number)).toEqual([1]);
  });

  test('nova versão incrementa e restaurar cria versão nova com conteúdo antigo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const folder = await makeFolder(adminCaller, unit.id);
    const doc = await seedDocument(adminCaller, unit.id, folder.id);

    await adminCaller.documents.confirmNewVersion({
      unitId: unit.id,
      documentId: doc.id,
      storageKey: `units/${unit.id}/v2/doc.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 8,
    });
    let versions = await adminCaller.documents.versions({ unitId: unit.id, documentId: doc.id });
    expect(versions.map((v) => v.number)).toEqual([2, 1]);

    // Restaurar v1 → v3 reutilizando o storage antigo (nada é sobrescrito).
    const v1 = versions.find((v) => v.number === 1)!;
    const restored = await adminCaller.documents.restoreVersion({
      unitId: unit.id,
      documentId: doc.id,
      versionId: v1.id,
    });
    expect(restored?.number).toBe(3);
    versions = await adminCaller.documents.versions({ unitId: unit.id, documentId: doc.id });
    expect(versions).toHaveLength(3);

    const [listed] = await adminCaller.documents.listByFolder({
      unitId: unit.id,
      folderId: folder.id,
    });
    expect(listed?.version).toBe(3);
  });

  test('update edita nome/validade e remove tira das listagens', async () => {
    const { adminCaller, unit } = await setupUnit();
    const folder = await makeFolder(adminCaller, unit.id);
    const doc = await seedDocument(adminCaller, unit.id, folder.id);

    const updated = await adminCaller.documents.update({
      unitId: unit.id,
      documentId: doc.id,
      name: 'Novo nome',
      expiresAt: '2027-01-31',
      warnDaysBefore: 15,
    });
    expect(updated?.name).toBe('Novo nome');
    expect(updated?.expiresAt).toBe('2027-01-31');

    await adminCaller.documents.remove({ unitId: unit.id, documentId: doc.id });
    expect(
      await adminCaller.documents.listByFolder({ unitId: unit.id, folderId: folder.id }),
    ).toHaveLength(0);
  });

  test('listBySubtree traz documentos das subpastas; null = unidade toda', async () => {
    const { adminCaller, unit } = await setupUnit();
    const parent = await makeFolder(adminCaller, unit.id);
    const child = await makeFolder(adminCaller, unit.id, parent.id);
    const sibling = await makeFolder(adminCaller, unit.id);
    const inParent = await seedDocument(adminCaller, unit.id, parent.id);
    const inChild = await seedDocument(adminCaller, unit.id, child.id);
    const inSibling = await seedDocument(adminCaller, unit.id, sibling.id);

    const subtree = await adminCaller.documents.listBySubtree({
      unitId: unit.id,
      folderId: parent.id,
    });
    expect(new Set(subtree.map((row) => row.id))).toEqual(new Set([inParent.id, inChild.id]));

    const all = await adminCaller.documents.listBySubtree({ unitId: unit.id, folderId: null });
    const ids = new Set(all.map((row) => row.id));
    expect(ids.has(inSibling.id)).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });

  test('documento de outra unidade é invisível (NOT_FOUND)', async () => {
    const { adminCaller, unit } = await setupUnit();
    const { unit: otherUnit } = await setupUnit();
    const folder = await makeFolder(adminCaller, unit.id);
    const doc = await seedDocument(adminCaller, unit.id, folder.id);

    await expectTRPCError(
      adminCaller.documents.update({ unitId: otherUnit.id, documentId: doc.id, name: 'X' }),
      'NOT_FOUND',
    );
    await expectTRPCError(
      adminCaller.documents.versions({ unitId: otherUnit.id, documentId: doc.id }),
      'NOT_FOUND',
    );
  });

  test('createUploadUrl devolve URL presignada com a chave da unidade', async () => {
    const { adminCaller, unit } = await setupUnit();
    const { uploadUrl, storageKey } = await adminCaller.documents.createUploadUrl({
      unitId: unit.id,
      fileName: 'laudo elétrico.pdf',
      mimeType: 'application/pdf',
    });
    expect(storageKey.startsWith(`units/${unit.id}/`)).toBe(true);
    // Nome sanitizado (sem espaços/acentos fora de \w.-)
    expect(storageKey.endsWith('laudo_el_trico.pdf')).toBe(true);
    expect(uploadUrl).toContain('X-Amz-Signature');
  });
});
