// Adequação: geração dos itens pelo catálogo, requisitos (cópia lazy do
// catálogo + CRUD), diagnóstico com evidências snapshot e plano de ação.
import { describe, expect, test } from 'bun:test';
import { eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../src/db';
import {
  expectTRPCError,
  isoDaysFromNow,
  seedDocument,
  seedNorm,
  setupUnit,
} from './helpers';

async function activeNormCount() {
  const rows = await db
    .select({ id: schema.norm.id })
    .from(schema.norm)
    .where(isNull(schema.norm.deletedAt));
  return rows.length;
}

describe('adequacy: itens', () => {
  test('generate cria um item por norma do catálogo e é idempotente', async () => {
    await seedNorm();
    await seedNorm({ weight: 2 });
    const { adminCaller, unit } = await setupUnit();

    const result = await adminCaller.adequacy.generate({ unitId: unit.id });
    expect(result.created).toBe(await activeNormCount());

    const again = await adminCaller.adequacy.generate({ unitId: unit.id });
    expect(again.created).toBe(0);

    const items = await adminCaller.adequacy.list({ unitId: unit.id });
    expect(items).toHaveLength(result.created);
    expect(items.every((item) => item.status === null)).toBe(true);
  });

  test('updateItem configura escopo e orientação da unidade', async () => {
    const norm = await seedNorm();
    const { adminCaller, unit } = await setupUnit();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const items = await adminCaller.adequacy.list({ unitId: unit.id });
    const item = items.find((row) => row.normCode === norm.code)!;

    await adminCaller.adequacy.updateItem({
      unitId: unit.id,
      adequacyItemId: item.id,
      isActive: false,
      orientation: 'Fora do escopo desta unidade',
    });
    const detail = await adminCaller.adequacy.itemDetail({
      unitId: unit.id,
      adequacyItemId: item.id,
    });
    expect(detail.isActive).toBe(false);
    expect(detail.orientation).toBe('Fora do escopo desta unidade');
  });
});

describe('adequacy: requisitos', () => {
  test('requisitos do catálogo são copiados para o item no primeiro acesso', async () => {
    const norm = await seedNorm({
      requirements: [
        { type: 'document', question: 'Existe laudo do SPDA?' },
        { type: 'opinion', question: 'Parecer do responsável?' },
      ],
    });
    const { adminCaller, unit } = await setupUnit();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    const requirements = await adminCaller.adequacy.requirements({
      unitId: unit.id,
      adequacyItemId: item.id,
    });
    expect(requirements.map((row) => row.question).sort()).toEqual([
      'Existe laudo do SPDA?',
      'Parecer do responsável?',
    ]);

    // Remover um não o ressuscita no próximo acesso (conta os excluídos).
    await adminCaller.adequacy.removeRequirement({
      unitId: unit.id,
      requirementId: requirements[0]!.id,
    });
    const after = await adminCaller.adequacy.requirements({
      unitId: unit.id,
      adequacyItemId: item.id,
    });
    expect(after).toHaveLength(1);
  });
});

describe('adequacy: diagnóstico e plano de ação', () => {
  test('diagnóstico abaixo de plena com prazo gera ação; plena não gera', async () => {
    const norm = await seedNorm({ weight: 4 });
    const normOk = await seedNorm({ weight: 1 });
    const { adminCaller, unit } = await setupUnit();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const items = await adminCaller.adequacy.list({ unitId: unit.id });
    const bad = items.find((row) => row.normCode === norm.code)!;
    const good = items.find((row) => row.normCode === normOk.code)!;

    const deadline = isoDaysFromNow(30);
    // Aderência calculada: parecer sem nota ⇒ Inexistente (0) ⇒ gera ação.
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: bad.id,
      deadline,
      responsible: 'Fulano',
      evidences: [
        {
          type: 'opinion',
          question: 'Parecer?',
          items: [{ label: 'Parecer técnico', answer: 'Sem laudo no local' }],
        },
      ],
    });
    // Parecer com nota Plena ⇒ score 100 ⇒ Plena ⇒ não gera ação.
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: good.id,
      deadline,
      evidences: [
        {
          type: 'opinion',
          question: 'Parecer?',
          adherence: 'plena',
          items: [{ label: 'Parecer técnico', answer: 'Tudo certo' }],
        },
      ],
    });

    const actions = await adminCaller.adequacy.actionItems({ unitId: unit.id });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.normCode).toBe(norm.code);
    // Peso 4 + inexistente → prioridade alta; o peso em si não vaza.
    expect(actions[0]?.priority).toBe('alta');
    expect('importanceWeight' in actions[0]!).toBe(false);

    // Histórico e evidências snapshot.
    const history = await adminCaller.adequacy.history({
      unitId: unit.id,
      adequacyItemId: bad.id,
    });
    expect(history).toHaveLength(1);
    // Status/score calculados pela média das evidências (sem status manual).
    expect(history[0]?.status).toBe('inexistente');
    expect(history[0]?.score).toBe(0);
    const evidences = await adminCaller.adequacy.diagnosticEvidences({
      unitId: unit.id,
      diagnosticId: history[0]!.id,
    });
    expect(evidences[0]?.items[0]?.answer).toBe('Sem laudo no local');

    // Status da ação: concluir carimba completedAt.
    await adminCaller.adequacy.setActionStatus({
      unitId: unit.id,
      actionItemId: actions[0]!.id,
      status: 'concluida',
    });
    const done = await adminCaller.adequacy.actionItems({ unitId: unit.id });
    expect(done[0]?.status).toBe('concluida');
    expect(done[0]?.completedAt).not.toBeNull();
  });

  test('item de outra unidade é invisível (NOT_FOUND)', async () => {
    await seedNorm();
    const { adminCaller, unit } = await setupUnit();
    const { unit: otherUnit } = await setupUnit();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const [item] = await adminCaller.adequacy.list({ unitId: unit.id });

    await expectTRPCError(
      adminCaller.adequacy.itemDetail({ unitId: otherUnit.id, adequacyItemId: item!.id }),
      'NOT_FOUND',
    );
  });

  test('expandCadastroRequirement lista os itens do cadastro com o documento e a nota vinculados', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    const luvaA = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva A',
      type: 'epi',
      metadata: {},
    }))!;
    await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva B',
      type: 'epi',
      metadata: {},
    });

    // Documento com aderência na pasta da Luva A, vinculado na coluna 'ca'.
    const eqA = await db.query.equipment.findFirst({
      where: eq(schema.equipment.id, luvaA.id),
    });
    const doc = await seedDocument(adminCaller, unit.id, eqA!.folderId!, {
      name: 'CA Luva A',
      adherence: 'suficiente',
    });
    await adminCaller.registers.linkDocument({
      unitId: unit.id,
      fieldKey: 'ca',
      documentId: doc.id,
      equipmentIds: [luvaA.id],
    });

    const requirement = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'cadastro',
      question: 'CA válido',
      targetGroup: 'epi',
      fieldKey: 'ca',
    }))!;

    const expanded = await adminCaller.adequacy.expandCadastroRequirement({
      unitId: unit.id,
      requirementId: requirement.id,
    });
    expect(expanded.map((row) => row.label).sort()).toEqual([
      'CA válido de Luva A',
      'CA válido de Luva B',
    ]);
    expect(expanded.every((row) => row.equipmentId)).toBe(true);
    // Luva A tem documento e nota (herdada do documento); Luva B, não.
    const rowA = expanded.find((row) => row.label === 'CA válido de Luva A')!;
    const rowB = expanded.find((row) => row.label === 'CA válido de Luva B')!;
    expect(rowA.documentId).toBe(doc.id);
    expect(rowA.adherence).toBe('suficiente');
    expect(rowB.documentId).toBeNull();
    expect(rowB.adherence).toBeNull();
  });
});
