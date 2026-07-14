// Adequação: geração dos itens pelo catálogo, requisitos (cópia lazy do
// catálogo + CRUD), diagnóstico com evidências snapshot e plano de ação.
import { describe, expect, test } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../src/db';
import {
  expectTRPCError,
  isoDaysFromNow,
  seedDocument,
  seedNorm,
  setupUnit,
  uniqueName,
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
    // NC marcada define a nota: NC default (Inexistente) ⇒ score 0 ⇒ gera ação.
    const badReq = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: bad.id,
      type: 'opinion',
      question: 'Parecer?',
    }))!;
    const badNc = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: bad.id,
      code: 'NC01',
      description: 'Ausência de laudo',
      recommendedAction: 'Providenciar laudo',
      requirementId: badReq.id,
    }))!;
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: bad.id,
      deadline,
      responsible: 'Fulano',
      evidences: [
        {
          type: 'opinion',
          question: 'Parecer?',
          requirementId: badReq.id,
          ncId: badNc.id,
          items: [{ label: 'Parecer técnico', answer: 'Sem laudo no local' }],
        },
      ],
    });
    // Item sem NC configurada = modo manual: nota Plena ⇒ não gera ação.
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

  test('expandCadastroRequirement enxerga o auto-vínculo (mesma regra da tela de cadastros)', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    // Documento com o nome do documento padrão do campo, NA PASTA do item,
    // SEM linkDocument: é o auto-vínculo que a tela de cadastros mostra.
    const luva = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva Auto',
      type: 'epi',
      metadata: {},
    }))!;
    const equip = await db.query.equipment.findFirst({ where: eq(schema.equipment.id, luva.id) });
    const doc = await seedDocument(adminCaller, unit.id, equip!.folderId!, {
      name: 'Certificado de Aprovação (CA) - Luva Auto',
      adherence: 'suficiente',
    });

    // Sanidade: a tela de cadastros enxerga o auto-vínculo.
    const links = await adminCaller.registers.documentLinks({ unitId: unit.id });
    expect(links.some((l) => l.equipmentId === luva.id && l.auto)).toBe(true);

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
    const row = expanded.find((r) => r.equipmentId === luva.id)!;
    expect(row.documentId).toBe(doc.id);
    expect(row.adherence).toBe('suficiente');
  });

  test('diagnóstico cria o vínculo quando o item não tinha vínculo explícito e troca o documento quando difere', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    const luva = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva Sem Vinculo',
      type: 'epi',
      metadata: {},
    }))!;
    const equip = await db.query.equipment.findFirst({ where: eq(schema.equipment.id, luva.id) });
    const docA = await seedDocument(adminCaller, unit.id, equip!.folderId!, { name: 'CA Doc A' });
    const docB = await seedDocument(adminCaller, unit.id, equip!.folderId!, { name: 'CA Doc B' });

    const activeLink = () =>
      db.query.registerDocumentLink.findFirst({
        where: and(
          eq(schema.registerDocumentLink.equipmentId, luva.id),
          eq(schema.registerDocumentLink.fieldKey, 'ca'),
          isNull(schema.registerDocumentLink.deletedAt),
        ),
      });

    // Requisito de cadastro com NC Parcial: a marcação define a nota do item.
    const requirement = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'cadastro',
      question: 'CA',
      targetGroup: 'epi',
      fieldKey: 'ca',
    }))!;
    const nc = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: item.id,
      code: 'NC01',
      description: 'CA em desacordo',
      recommendedAction: 'Regularizar',
      requirementId: requirement.id,
      adherence: 'parcial',
    }))!;

    // Item sem vínculo: o consultor escolhe documento + NC na avaliação —
    // o vínculo do cadastro nasce dali (antes a nota se perdia em silêncio).
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: item.id,
      evidences: [
        {
          type: 'cadastro',
          question: 'CA',
          requirementId: requirement.id,
          fieldKey: 'ca',
          items: [
            { label: 'CA de Luva', equipmentId: luva.id, documentId: docA.id, ncId: nc.id },
          ],
        },
      ],
    });
    const created = await activeLink();
    expect(created?.documentId).toBe(docA.id);
    expect(created?.adherence).toBe('parcial');

    // Nova avaliação com OUTRO documento e sem NC (Plena): substitui o vínculo
    // (máx. 1 por item+campo, mesma semântica do linkDocument).
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: item.id,
      evidences: [
        {
          type: 'cadastro',
          question: 'CA',
          requirementId: requirement.id,
          fieldKey: 'ca',
          items: [
            { label: 'CA de Luva', equipmentId: luva.id, documentId: docB.id },
          ],
        },
      ],
    });
    const replaced = await activeLink();
    expect(replaced?.documentId).toBe(docB.id);
    expect(replaced?.adherence).toBe('plena');
  });

  test('salvar diagnóstico propaga as notas para o vínculo do cadastro e para o documento', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    const luva = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: 'Luva Propaga',
      type: 'epi',
      metadata: {},
    }))!;
    const equip = await db.query.equipment.findFirst({ where: eq(schema.equipment.id, luva.id) });
    const doc = await seedDocument(adminCaller, unit.id, equip!.folderId!, {
      name: 'CA Luva Propaga',
      adherence: 'plena',
    });
    await adminCaller.registers.linkDocument({
      unitId: unit.id,
      fieldKey: 'ca',
      documentId: doc.id,
      equipmentIds: [luva.id],
    });

    // NCs configuradas nos requisitos: a marcação delas define as notas que
    // propagam (cadastro → inadequada; documento → parcial).
    const reqCad = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'cadastro',
      question: 'CA',
      targetGroup: 'epi',
      fieldKey: 'ca',
    }))!;
    const reqDoc = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'document',
      question: 'Documento',
    }))!;
    const ncCad = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: item.id,
      code: 'NCC',
      description: 'CA em desacordo',
      recommendedAction: 'Regularizar o CA',
      requirementId: reqCad.id,
      adherence: 'inadequada',
    }))!;
    const ncDoc = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: item.id,
      code: 'NCD',
      description: 'Documento incompleto',
      recommendedAction: 'Completar o documento',
      requirementId: reqDoc.id,
      adherence: 'parcial',
    }))!;
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: item.id,
      evidences: [
        {
          type: 'cadastro',
          question: 'CA',
          requirementId: reqCad.id,
          fieldKey: 'ca',
          items: [
            {
              label: 'CA de Luva',
              equipmentId: luva.id,
              documentId: doc.id,
              ncId: ncCad.id,
            },
          ],
        },
        {
          type: 'document',
          question: 'Documento',
          requirementId: reqDoc.id,
          ncId: ncDoc.id,
          items: [{ label: 'Documento', documentId: doc.id }],
        },
      ],
    });

    // O vínculo do cadastro recebeu a nota do item...
    const link = await db.query.registerDocumentLink.findFirst({
      where: and(
        eq(schema.registerDocumentLink.equipmentId, luva.id),
        eq(schema.registerDocumentLink.fieldKey, 'ca'),
        isNull(schema.registerDocumentLink.deletedAt),
      ),
    });
    expect(link?.adherence).toBe('inadequada');

    // ...e o documento recebeu a nota da evidência de documento.
    const updatedDoc = await db.query.document.findFirst({
      where: eq(schema.document.id, doc.id),
    });
    expect(updatedDoc?.adherence).toBe('parcial');
  });
});

describe('adequacy: não conformidades', () => {
  test('NCs do catálogo copiam ligadas ao requisito de origem (item multi-requisito)', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm({
      requirements: [
        { type: 'document', question: 'Relatório de inspeções' },
        { type: 'document', question: 'Relatório de aterramento' },
      ],
    });
    const catalogReqs = await db
      .select({ id: schema.normRequirement.id, question: schema.normRequirement.question })
      .from(schema.normRequirement)
      .where(eq(schema.normRequirement.normId, norm.id));
    const reqIdByQuestion = new Map(catalogReqs.map((row) => [row.question, row.id]));
    await db.insert(schema.normNc).values([
      {
        normId: norm.id,
        normRequirementId: reqIdByQuestion.get('Relatório de inspeções')!,
        code: 'NC01',
        description: 'Ausência do relatório de inspeções',
        recommendedAction: 'Providenciar o relatório de inspeções',
      },
      {
        normId: norm.id,
        normRequirementId: reqIdByQuestion.get('Relatório de aterramento')!,
        code: 'NC02',
        description: 'Ausência do relatório de aterramento',
        recommendedAction: 'Providenciar o relatório de aterramento',
      },
    ]);
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    const itemReqs = await adminCaller.adequacy.requirements({
      unitId: unit.id,
      adequacyItemId: item.id,
    });
    const itemReqByQuestion = new Map(itemReqs.map((req) => [req.question, req.id]));
    const ncs = await adminCaller.adequacy.ncs({ unitId: unit.id, adequacyItemId: item.id });
    expect(ncs.map((nc) => nc.code)).toEqual(['NC01', 'NC02']);
    expect(ncs[0]!.requirementId).toBe(itemReqByQuestion.get('Relatório de inspeções')!);
    expect(ncs[1]!.requirementId).toBe(itemReqByQuestion.get('Relatório de aterramento')!);
  });

  test('NC marcada define a nota do requisito; sem NC é Plena', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm({
      requirements: [{ type: 'opinion', question: 'Parecer geral' }],
    });
    // Catálogo de NCs da norma (planilha): copiadas implicando Inexistente.
    await db.insert(schema.normNc).values([
      {
        normId: norm.id,
        code: 'NC01',
        description: 'Ausência do documento exigido',
        recommendedAction: 'Providenciar o documento',
      },
      {
        normId: norm.id,
        code: 'NC02',
        description: 'Documento apenas parcialmente atendido',
        recommendedAction: 'Complementar o documento',
      },
    ]);
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;

    // Cópia lazy: item com UM requisito ⇒ NCs nascem vinculadas a ele,
    // implicando Inexistente.
    const ncs = await adminCaller.adequacy.ncs({ unitId: unit.id, adequacyItemId: item.id });
    expect(ncs.map((nc) => nc.code)).toEqual(['NC01', 'NC02']);
    expect(ncs.every((nc) => nc.adherence === 'inexistente')).toBe(true);
    const requirement = (
      await adminCaller.adequacy.requirements({ unitId: unit.id, adequacyItemId: item.id })
    )[0]!;
    expect(ncs.every((nc) => nc.requirementId === requirement.id)).toBe(true);

    // NC02 passa a implicar Suficiente.
    await adminCaller.adequacy.updateNc({
      unitId: unit.id,
      ncId: ncs[1]!.id,
      code: 'NC02',
      description: ncs[1]!.description,
      recommendedAction: ncs[1]!.recommendedAction,
      requirementId: requirement.id,
      adherence: 'suficiente',
    });

    const diagnoseWith = (ncId: string | null) =>
      adminCaller.adequacy.diagnose({
        unitId: unit.id,
        adequacyItemId: item.id,
        evidences: [
          {
            type: 'opinion',
            question: requirement.question,
            requirementId: requirement.id,
            ncId,
            items: [{ label: requirement.question }],
          },
        ],
      });
    const myRows = async () =>
      (await adminCaller.reports.nonConformities({ unitId: unit.id })).filter(
        (row) => row.normCode === norm.code,
      );
    const lastStatus = async () =>
      (await adminCaller.adequacy.history({ unitId: unit.id, adequacyItemId: item.id }))[0]!
        .status;

    // NC01 marcada ⇒ requisito Inexistente e a NC no relatório.
    await diagnoseWith(ncs[0]!.id);
    expect(await lastStatus()).toBe('inexistente');
    // A linha do tempo carrega a contagem e o snapshot expõe a ficha.
    const [latest] = await adminCaller.adequacy.history({
      unitId: unit.id,
      adequacyItemId: item.id,
    });
    expect(latest!.ncCount).toBe(1);
    const snapshot = await adminCaller.adequacy.diagnosticNcs({
      unitId: unit.id,
      diagnosticId: latest!.id,
    });
    expect(snapshot.map((nc) => nc.code)).toEqual(['NC01']);
    expect(snapshot[0]!.requirementQuestion).toBe(requirement.question);
    let rows = await myRows();
    expect(rows.map((row) => row.code)).toEqual(['NC01']);
    expect(rows[0]!.adherence).toBe('inexistente');
    expect(rows[0]!.recommendedAction).toBe('Providenciar o documento');
    expect(rows[0]!.requirementQuestion).toBe(requirement.question);

    // NC02 marcada ⇒ Suficiente (o relatório reflete só o último diagnóstico).
    await diagnoseWith(ncs[1]!.id);
    expect(await lastStatus()).toBe('suficiente');
    rows = await myRows();
    expect(rows.map((row) => row.code)).toEqual(['NC02']);

    // Sem NC ⇒ Plena, nenhuma NC gerada — mesmo que o cliente tente mandar nota.
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: item.id,
      evidences: [
        {
          type: 'opinion',
          question: requirement.question,
          requirementId: requirement.id,
          adherence: 'inexistente', // ignorada: a nota vem da NC
          items: [{ label: requirement.question }],
        },
      ],
    });
    expect(await lastStatus()).toBe('plena');
    expect(await myRows()).toHaveLength(0);

    // Renomear a pergunta do requisito (✎ da árvore de configuração).
    await adminCaller.adequacy.updateRequirement({
      unitId: unit.id,
      requirementId: requirement.id,
      question: 'Parecer geral (revisado)',
    });
    const renamed = await adminCaller.adequacy.requirements({
      unitId: unit.id,
      adequacyItemId: item.id,
    });
    expect(renamed.find((req) => req.id === requirement.id)?.question).toBe(
      'Parecer geral (revisado)',
    );

    // Requisito SEM NC configurada volta ao modo manual: a nota enviada vale.
    const manualReq = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'opinion',
      question: 'Parecer manual',
    }))!;
    await adminCaller.adequacy.diagnose({
      unitId: unit.id,
      adequacyItemId: item.id,
      evidences: [
        {
          type: 'opinion',
          question: manualReq.question,
          requirementId: manualReq.id,
          adherence: 'parcial',
          items: [{ label: manualReq.question }],
        },
      ],
    });
    expect(await lastStatus()).toBe('parcial');
    // Nota manual não gera NC no relatório.
    expect(await myRows()).toHaveLength(0);
  });

  test('documento faltante só aceita NC Inexistente; vencido soma NC automática Parcial e vale a menor', async () => {
    const { adminCaller, unit } = await setupUnit();
    const norm = await seedNorm();
    await adminCaller.adequacy.generate({ unitId: unit.id });
    const item = (await adminCaller.adequacy.list({ unitId: unit.id })).find(
      (row) => row.normCode === norm.code,
    )!;
    const requirement = (await adminCaller.adequacy.addRequirement({
      unitId: unit.id,
      adequacyItemId: item.id,
      type: 'document',
      question: 'Laudo técnico',
    }))!;
    const ncInexistente = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: item.id,
      code: 'NC01',
      description: 'Ausência do laudo técnico',
      recommendedAction: 'Providenciar o laudo',
      requirementId: requirement.id,
    }))!;
    const ncParcial = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: item.id,
      code: 'NC02',
      description: 'Laudo técnico incompleto',
      recommendedAction: 'Complementar o laudo',
      requirementId: requirement.id,
      adherence: 'parcial',
    }))!;
    const ncInadequada = (await adminCaller.adequacy.addNc({
      unitId: unit.id,
      adequacyItemId: item.id,
      code: 'NC03',
      description: 'Laudo técnico fora da norma',
      recommendedAction: 'Refazer o laudo',
      requirementId: requirement.id,
      adherence: 'inadequada',
    }))!;

    const diagnoseWith = (ncId: string | null, documentId: string | null) =>
      adminCaller.adequacy.diagnose({
        unitId: unit.id,
        adequacyItemId: item.id,
        evidences: [
          {
            type: 'document',
            question: requirement.question,
            requirementId: requirement.id,
            ncId,
            items: [{ label: requirement.question, documentId }],
          },
        ],
      });
    const latest = async () =>
      (await adminCaller.adequacy.history({ unitId: unit.id, adequacyItemId: item.id }))[0]!;

    // 1) Sem documento vinculado, NC de nota != Inexistente é rejeitada…
    await expectTRPCError(diagnoseWith(ncParcial.id, null), 'BAD_REQUEST');
    // …e a NC Inexistente passa.
    await diagnoseWith(ncInexistente.id, null);
    expect((await latest()).status).toBe('inexistente');

    // Marcar NC é opcional, mas sem documento o Conforme não se aplica:
    // sem NC e sem documento, o requisito conta como Inexistente (0 NCs).
    await diagnoseWith(null, null);
    let semSelecao = await latest();
    expect(semSelecao.status).toBe('inexistente');
    expect(semSelecao.ncCount).toBe(0);

    // 2) Documento vencido: Conforme (sem NC) vira Parcial + NC automática VENC.
    const folder = (await adminCaller.folders.create({
      unitId: unit.id,
      parentId: null,
      name: uniqueName('Laudos'),
    }))!;
    const expiredDoc = await seedDocument(adminCaller, unit.id, folder.id, {
      name: uniqueName('Laudo vencido'),
      expiresAt: isoDaysFromNow(-5),
    });
    await diagnoseWith(null, expiredDoc.id);
    let last = await latest();
    expect(last.status).toBe('parcial');
    expect(last.ncCount).toBe(1);
    let snapshot = await adminCaller.adequacy.diagnosticNcs({
      unitId: unit.id,
      diagnosticId: last.id,
    });
    expect(snapshot.map((nc) => nc.code)).toEqual(['VENC']);
    expect(snapshot[0]!.adherence).toBe('parcial');

    // Com documento vinculado, a ausência (Inexistente) não se aplica.
    await expectTRPCError(diagnoseWith(ncInexistente.id, expiredDoc.id), 'BAD_REQUEST');

    // 3) Mais de uma NC no requisito (marcada + vencido) ⇒ vale a MENOR nota.
    await diagnoseWith(ncInadequada.id, expiredDoc.id);
    last = await latest();
    expect(last.status).toBe('inadequada');
    expect(last.ncCount).toBe(2);
    snapshot = await adminCaller.adequacy.diagnosticNcs({
      unitId: unit.id,
      diagnosticId: last.id,
    });
    expect(snapshot.map((nc) => nc.code).sort()).toEqual(['NC03', 'VENC']);
  });
});

