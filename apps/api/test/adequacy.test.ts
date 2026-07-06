// Adequação: geração dos itens pelo catálogo, requisitos (cópia lazy do
// catálogo + CRUD), diagnóstico com evidências snapshot e plano de ação.
import { describe, expect, test } from 'bun:test';
import { isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../src/db';
import { expectTRPCError, isoDaysFromNow, seedNorm, setupUnit } from './helpers';

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
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: bad.id,
      status: 'inexistente',
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
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: good.id,
      status: 'plena',
      deadline,
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

  test('expandGroupRequirement gera um item de prova por membro do grupo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    // Documento padrão do catálogo (termo da sugestão) + membros do grupo.
    const [defaultDoc] = await db
      .insert(schema.defaultDocument)
      .values({ name: `Certificado ${crypto.randomUUID().slice(0, 8)}`, documentGroup: 'equipamentos' })
      .returning();
    await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva A',
      type: 'epi',
      metadata: {},
    });
    await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva B',
      type: 'epi',
      metadata: {},
    });

    const requirement = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'group',
      question: 'CA válido',
      targetGroup: 'epi',
      defaultDocumentId: defaultDoc!.id,
    }))!;

    const expanded = await adminCaller.adequacy.expandGroupRequirement({
      unitId: unit.id,
      requirementId: requirement.id,
    });
    expect(expanded.map((row) => row.label).sort()).toEqual([
      'CA válido de Luva A',
      'CA válido de Luva B',
    ]);
    expect(expanded.every((row) => row.equipmentId)).toBe(true);
  });
});
