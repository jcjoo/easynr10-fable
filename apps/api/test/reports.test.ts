// Relatórios/dashboards (services/reports.ts via router): fixture controlada
// com itens inseridos direto (generate pegaria normas de outros testes).
import { describe, expect, test } from 'bun:test';
import {
  callerFor,
  createUser,
  isoDaysFromNow,
  memberCaller,
  seedAdequacyItem,
  seedDocument,
  seedNorm,
  setupUnit,
  uniqueName,
} from './helpers';

// Unidade com 2 itens avaliados (peso 4 parcial + peso 1 plena → 60%),
// 1 ação vencida e 4 documentos em situações distintas.
async function buildFixture() {
  const { adminCaller, company, unit } = await setupUnit();
  const heavy = await seedNorm({ weight: 4, documentGroup: 'instalacoes' });
  const light = await seedNorm({ weight: 1, documentGroup: 'colaboradores' });
  const itemHeavy = await seedAdequacyItem(unit.id, heavy.id);
  const itemLight = await seedAdequacyItem(unit.id, light.id);

  // A nota vem da NC marcada: NC Parcial no item pesado ⇒ score 50 (peso 4);
  // item leve sem NC configurada usa nota manual Plena ⇒ 100 (peso 1).
  const heavyReq = (await adminCaller.adequacy.addRequirement({
    unitId: unit.id,
    adequacyItemId: itemHeavy.id,
    type: 'opinion',
    question: 'Parecer?',
  }))!;
  const heavyNc = (await adminCaller.adequacy.addNc({
    unitId: unit.id,
    adequacyItemId: itemHeavy.id,
    code: 'NC01',
    description: 'Medidas de controle parciais',
    recommendedAction: 'Completar as medidas',
    requirementId: heavyReq.id,
    adherence: 'parcial',
  }))!;
  await adminCaller.adequacy.diagnose({
    unitId: unit.id,
    adequacyItemId: itemHeavy.id,
    deadline: isoDaysFromNow(-1), // ação já vencida
    responsible: 'Fulano',
    evidences: [
      {
        type: 'opinion',
        question: 'Parecer?',
        requirementId: heavyReq.id,
        ncId: heavyNc.id,
        items: [{ label: 'P' }],
      },
    ],
  });
  // Item leve sem NC configurada = modo manual (nota Plena direta).
  await adminCaller.adequacy.diagnose({
    unitId: unit.id,
    adequacyItemId: itemLight.id,
    evidences: [
      { type: 'opinion', question: 'Parecer?', adherence: 'plena', items: [{ label: 'P' }] },
    ],
  });

  const folder = (await adminCaller.folders.create({
    unitId: unit.id,
    parentId: null,
    name: uniqueName('Relatórios'),
  }))!;
  await seedDocument(adminCaller, unit.id, folder.id, { expiresAt: isoDaysFromNow(-10) });
  await seedDocument(adminCaller, unit.id, folder.id, { expiresAt: isoDaysFromNow(10) });
  await seedDocument(adminCaller, unit.id, folder.id, { expiresAt: isoDaysFromNow(90) });
  await seedDocument(adminCaller, unit.id, folder.id, { expiresAt: null });

  return { adminCaller, company, unit, heavy, light };
}

describe('reports', () => {
  test('overview agrega aderência ponderada, ações e situação documental', async () => {
    const { adminCaller, unit } = await buildFixture();
    const overview = await adminCaller.reports.overview({ unitId: unit.id });

    // (4×0,5 + 1×1) / 5 = 60%
    expect(overview.adherence.percent).toBe(60);
    expect(overview.adherence.evaluated).toBe(2);
    expect(overview.adherence.activeTotal).toBe(2);
    expect(overview.adherence.distribution.parcial).toBe(1);
    expect(overview.adherence.distribution.plena).toBe(1);

    expect(overview.actions.counts.pendente).toBe(1);
    expect(overview.actions.overdue).toBe(1);

    expect(overview.documents.counts).toEqual({
      vencido: 1,
      a_vencer: 1,
      em_dia: 1,
      sem_validade: 1,
    });

    // Grupos documentais: peso do grupo reflete só os itens do grupo.
    const instalacoes = overview.groups.find((row) => row.group === 'instalacoes');
    expect(instalacoes?.percent).toBe(50); // só o item parcial (peso 4)
  });

  test('não conformidades listam as NCs marcadas no último diagnóstico', async () => {
    const { adminCaller, unit, heavy } = await buildFixture();
    const rows = await adminCaller.reports.nonConformities({ unitId: unit.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.normCode).toBe(heavy.code);
    expect(rows[0]?.code).toBe('NC01');
    expect(rows[0]?.adherence).toBe('parcial');
    expect(rows[0]?.recommendedAction).toBe('Completar as medidas');
  });

  test('situação documental traz caminho da pasta e dias para vencer', async () => {
    const { adminCaller, unit } = await buildFixture();
    const rows = await adminCaller.reports.documentsSituation({ unitId: unit.id });
    const expired = rows.find((row) => row.situation === 'vencido');
    expect(expired?.daysToExpiry).toBe(-10);
    expect(expired?.path.length).toBeGreaterThan(0);
    const noExpiry = rows.find((row) => row.situation === 'sem_validade');
    expect(noExpiry?.daysToExpiry).toBeNull();
  });

  test('plano de ação: escopo pendências × todas e flag de atraso', async () => {
    const { adminCaller, unit } = await buildFixture();
    const pending = await adminCaller.reports.actionPlan({
      unitId: unit.id,
      scope: 'pendencias',
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.overdue).toBe(true);

    await adminCaller.adequacy.setActionStatus({
      unitId: unit.id,
      actionItemId: pending[0]!.id,
      status: 'concluida',
    });
    expect(
      await adminCaller.reports.actionPlan({ unitId: unit.id, scope: 'pendencias' }),
    ).toHaveLength(0);
    expect(
      await adminCaller.reports.actionPlan({ unitId: unit.id, scope: 'todas' }),
    ).toHaveLength(1);
  });

  test('timeline: pontos antes do primeiro diagnóstico ficam nulos', async () => {
    const { adminCaller, unit } = await buildFixture();
    const series = await adminCaller.reports.timeline({
      unitId: unit.id,
      from: isoDaysFromNow(-7),
      to: isoDaysFromNow(0),
      interval: 'daily',
    });
    expect(series).toHaveLength(8);
    expect(series[0]?.percent).toBeNull();
    expect(series.at(-1)?.percent).toBe(60);
    expect(series.at(-1)?.evaluated).toBe(2);
  });

  test('companyOverview lista aderência por unidade visível', async () => {
    const { adminCaller, company, unit } = await buildFixture();
    // Unidade irmã sem itens: percent null.
    const sibling = (await adminCaller.units.create({
      companyId: company.id,
      name: uniqueName('Sem itens'),
    }))!;

    const rows = await adminCaller.reports.companyOverview({ companyId: company.id });
    expect(rows.find((row) => row.unitId === unit.id)?.percent).toBe(60);
    expect(rows.find((row) => row.unitId === sibling.id)?.percent).toBeNull();
  });

  // globalOverview testado pela visão de um MEMBRO (o banco de teste é
  // compartilhado entre arquivos — admin veria unidades de outros testes).
  test('globalOverview consolida pendências das unidades visíveis', async () => {
    const { adminCaller, company, unit } = await buildFixture();
    // Item ativo sem diagnóstico: entra em "sem avaliação" sem mexer no %.
    const norm = await seedNorm({ weight: 2 });
    await seedAdequacyItem(unit.id, norm.id);

    const { caller } = await memberCaller(adminCaller, unit.id, 'Leitor');
    const overview = await caller.reports.globalOverview();

    expect(overview.companies).toHaveLength(1);
    expect(overview.companies[0]?.name).toBe(company.name);
    const row = overview.companies[0]?.units.find((u) => u.unitId === unit.id);
    expect(row?.percent).toBe(60);
    expect(row?.unevaluated).toBe(1);
    expect(row?.expiredDocs).toBe(1);
    expect(row?.expiringDocs).toBe(1);
    expect(row?.pendingActions).toBe(1);
    expect(row?.overdueActions).toBe(1);

    expect(overview.totals).toEqual({
      expiredDocs: 1,
      expiringDocs: 1,
      unevaluated: 1,
      overdueActions: 1,
      pendingActions: 1,
    });
  });

  test('globalOverview sem unidades visíveis vem vazio', async () => {
    const stranger = await createUser('client');
    const overview = await callerFor(stranger).reports.globalOverview();
    expect(overview.companies).toHaveLength(0);
    expect(overview.totals.expiredDocs).toBe(0);
  });
});
