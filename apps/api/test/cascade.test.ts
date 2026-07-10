// Exclusão em cascata de unidade/empresa: soft delete de TODA a árvore
// (pastas, documentos, adequação, cadastros, vínculos, memberships) + purge
// dos objetos no MinIO (stack local, prefixo units/<uuid>/ isolado).
import { describe, expect, test } from 'bun:test';
import { eq, isNotNull, and } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../src/db';
import { presignUpload, purgeUnitObjects } from '../src/s3';
import {
  isoDaysFromNow,
  memberCaller,
  seedDocument,
  seedNorm,
  seedAdequacyItem,
  setupUnit,
  uniqueName,
} from './helpers';

// Unidade com um exemplar de cada tipo de filho.
async function buildTree() {
  const { adminCaller, company, unit } = await setupUnit();
  const folder = (await adminCaller.folders.create({
    unitId: unit.id,
    parentId: null,
    name: uniqueName('Pasta'),
  }))!;
  const doc = await seedDocument(adminCaller, unit.id, folder.id);

  const employee = (await adminCaller.registers.upsertEmployee({
    unitId: unit.id,
    name: uniqueName('Colaborador'),
    metadata: {},
  }))!;
  await adminCaller.registers.linkDocument({
    unitId: unit.id,
    fieldKey: 'aso',
    documentId: doc.id,
    employeeIds: [employee.id],
    equipmentIds: [],
  });
  await adminCaller.registers.addCustomField({
    unitId: unit.id,
    target: 'colaboradores',
    name: 'Setor',
  });
  const folderSchema = (await adminCaller.folderSchemas.create({
    unitId: unit.id,
    name: uniqueName('Estrutura'),
    structure: [{ name: 'X' }],
  }))!;
  // Config de grupo-alvo: ficava ATIVA após a exclusão até o cascade virar
  // declarativo (lacuna corrigida em 05/07/2026).
  await adminCaller.registers.setTargetSetting({
    unitId: unit.id,
    target: 'colaboradores',
    folderSchemaId: folderSchema.id,
  });

  const norm = await seedNorm({ requirements: [{ type: 'opinion', question: 'Parecer?' }] });
  const item = await seedAdequacyItem(unit.id, norm.id);
  await adminCaller.adequacy.requirements({ unitId: unit.id, adequacyItemId: item.id });
  await adminCaller.adequacy.diagnose({
    unitId: unit.id,
    adequacyItemId: item.id,
    deadline: isoDaysFromNow(10),
    evidences: [{ type: 'opinion', question: 'Parecer?', items: [{ label: 'P', answer: 'ok' }] }],
  });

  const { user: member } = await memberCaller(adminCaller, unit.id, 'Leitor');

  return { adminCaller, company, unit, folder, doc, employee, folderSchema, item, member };
}

async function assertUnitTreeDeleted(tree: Awaited<ReturnType<typeof buildTree>>) {
  const { unit } = tree;
  const deleted = async (rows: { deletedAt: Date | null }[]) =>
    rows.length > 0 && rows.every((row) => row.deletedAt !== null);

  expect(await db.query.unit.findFirst({ where: eq(schema.unit.id, unit.id) })).toMatchObject({
    deletedAt: expect.any(Date),
  });
  expect(
    await deleted(await db.query.folder.findMany({ where: eq(schema.folder.unitId, unit.id) })),
  ).toBe(true);
  expect(
    await deleted([
      (await db.query.document.findFirst({ where: eq(schema.document.id, tree.doc.id) }))!,
    ]),
  ).toBe(true);
  expect(
    await deleted(
      await db.query.employee.findMany({ where: eq(schema.employee.unitId, unit.id) }),
    ),
  ).toBe(true);
  expect(
    await deleted(
      await db.query.registerDocumentLink.findMany({
        where: eq(schema.registerDocumentLink.employeeId, tree.employee.id),
      }),
    ),
  ).toBe(true);
  expect(
    await deleted(
      await db.query.customField.findMany({ where: eq(schema.customField.unitId, unit.id) }),
    ),
  ).toBe(true);
  expect(
    await deleted(
      await db.query.registerTargetSetting.findMany({
        where: eq(schema.registerTargetSetting.unitId, unit.id),
      }),
    ),
  ).toBe(true);
  expect(
    await deleted([
      (await db.query.folderSchema.findFirst({
        where: eq(schema.folderSchema.id, tree.folderSchema.id),
      }))!,
    ]),
  ).toBe(true);
  expect(
    await deleted(
      await db.query.adequacyItem.findMany({
        where: eq(schema.adequacyItem.unitId, unit.id),
      }),
    ),
  ).toBe(true);
  expect(
    await deleted(
      await db.query.adequacyItemRequirement.findMany({
        where: eq(schema.adequacyItemRequirement.adequacyItemId, tree.item.id),
      }),
    ),
  ).toBe(true);
  const diagnostics = await db.query.diagnostic.findMany({
    where: eq(schema.diagnostic.adequacyItemId, tree.item.id),
  });
  expect(await deleted(diagnostics)).toBe(true);
  for (const diag of diagnostics) {
    expect(
      await deleted(
        await db.query.actionItem.findMany({
          where: eq(schema.actionItem.diagnosticId, diag.id),
        }),
      ),
    ).toBe(true);
    const evidences = await db.query.evidence.findMany({
      where: eq(schema.evidence.diagnosticId, diag.id),
    });
    expect(await deleted(evidences)).toBe(true);
    for (const ev of evidences) {
      expect(
        await deleted(
          await db.query.evidenceItem.findMany({
            where: eq(schema.evidenceItem.evidenceId, ev.id),
          }),
        ),
      ).toBe(true);
    }
  }
  expect(
    await deleted(
      await db.query.membership.findMany({
        where: and(
          eq(schema.membership.unitId, unit.id),
          eq(schema.membership.userId, tree.member.id),
        ),
      }),
    ),
  ).toBe(true);
}

describe('cascata de exclusão', () => {
  test('units.remove soft-deleta a árvore inteira da unidade', async () => {
    const tree = await buildTree();
    await tree.adminCaller.units.remove({ id: tree.unit.id });
    await assertUnitTreeDeleted(tree);
  });

  test('companies.remove exclui cada unidade em cascata e a empresa', async () => {
    const tree = await buildTree();
    await tree.adminCaller.companies.remove({ id: tree.company.id });
    await assertUnitTreeDeleted(tree);
    const company = await db.query.company.findFirst({
      where: and(eq(schema.company.id, tree.company.id), isNotNull(schema.company.deletedAt)),
    });
    expect(company).toBeDefined();
  });

  test('purgeUnitObjects remove os objetos da unidade no bucket (MinIO real)', async () => {
    const unitId = crypto.randomUUID();
    const storageKey = `units/${unitId}/${crypto.randomUUID()}/prova.txt`;
    const uploadUrl = await presignUpload(storageKey, 'text/plain');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: 'conteúdo de teste',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(put.ok).toBe(true);

    const removed = await purgeUnitObjects(unitId);
    expect(removed).toBeGreaterThanOrEqual(1);
    // Idempotente: purgar de novo não encontra mais nada.
    expect(await purgeUnitObjects(unitId)).toBe(0);
  });
});
