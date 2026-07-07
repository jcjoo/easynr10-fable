// Cadeia de autorização (trpc.ts): publica → autenticado → admin →
// membro-da-unidade → ação do papel. Cada nível é testado pela procedure
// real que o usa — o mesmo caminho da produção.
import { describe, expect, test } from 'bun:test';
import {
  callerFor,
  createUser,
  expectTRPCError,
  memberCaller,
  setupUnit,
  uniqueName,
} from './helpers';

describe('protectedProcedure', () => {
  test('anônimo recebe UNAUTHORIZED', async () => {
    const anonymous = callerFor(null);
    await expectTRPCError(anonymous.companies.list(), 'UNAUTHORIZED');
  });

  test('autenticado acessa', async () => {
    const user = await createUser('client');
    const caller = callerFor(user);
    expect(await caller.companies.list()).toEqual([]);
  });
});

describe('adminProcedure', () => {
  test('cliente recebe FORBIDDEN; admin acessa', async () => {
    const client = await createUser('client');
    await expectTRPCError(callerFor(client).users.list(), 'FORBIDDEN');
    await expectTRPCError(
      callerFor(client).companies.create({ name: uniqueName('Empresa') }),
      'FORBIDDEN',
    );

    const admin = await createUser('admin');
    const users = await callerFor(admin).users.list();
    expect(users.some((row) => row.id === client.id)).toBe(true);
  });
});

describe('unitProcedure (isolamento de tenant)', () => {
  test('não-membro recebe FORBIDDEN; membro acessa; admin ignora membership', async () => {
    const { adminCaller, unit } = await setupUnit();

    const outsider = await createUser('client');
    await expectTRPCError(
      callerFor(outsider).units.myPermissions({ unitId: unit.id }),
      'FORBIDDEN',
    );

    const { caller: reader } = await memberCaller(adminCaller, unit.id, 'Leitor');
    const readerPermissions = await reader.units.myPermissions({ unitId: unit.id });
    expect(readerPermissions).toContain('pie.ler');
    expect(readerPermissions).not.toContain('pie.pasta.criar');

    // Admin nunca tem membership e mesmo assim enxerga todas as ações.
    const adminPermissions = await adminCaller.units.myPermissions({ unitId: unit.id });
    expect(adminPermissions).toContain('pie.pasta.criar');
    expect(adminPermissions).toContain('cadastros.itens');
  });

  test('membership revogada volta a dar FORBIDDEN', async () => {
    const { adminCaller, unit } = await setupUnit();
    const { user, caller } = await memberCaller(adminCaller, unit.id, 'Leitor');
    expect(await caller.units.myPermissions({ unitId: unit.id })).toContain('pie.ler');

    await adminCaller.users.revoke({ userId: user.id, unitIds: [unit.id] });
    await expectTRPCError(caller.units.myPermissions({ unitId: unit.id }), 'FORBIDDEN');
  });

  test('papel de unidade: herdado na listagem, atribuível só na própria unidade', async () => {
    const { adminCaller, company, unit } = await setupUnit();
    const sibling = (await adminCaller.units.create({
      companyId: company.id,
      name: uniqueName('Filial'),
    }))!;

    const companyRole = (await adminCaller.users.createRole({
      companyId: company.id,
      name: uniqueName('Da Empresa'),
      permissions: [],
    }))!;
    const unitRole = (await adminCaller.users.createRole({
      companyId: company.id,
      unitId: unit.id,
      name: uniqueName('Da Unidade'),
      permissions: [],
    }))!;

    // A unidade herda sistema + empresa e soma o próprio.
    const unitRoles = await adminCaller.users.roles({ companyId: company.id, unitId: unit.id });
    const ids = new Set(unitRoles.map((role) => role.id));
    expect(ids.has(companyRole.id)).toBe(true);
    expect(ids.has(unitRole.id)).toBe(true);
    expect(unitRoles.some((role) => role.isSystem)).toBe(true);

    // Fora da unidade o papel próprio não aparece nem pode ser atribuído.
    const companyRoles = await adminCaller.users.roles({ companyId: company.id });
    expect(companyRoles.some((role) => role.id === unitRole.id)).toBe(false);
    const siblingRoles = await adminCaller.users.roles({
      companyId: company.id,
      unitId: sibling.id,
    });
    expect(siblingRoles.some((role) => role.id === unitRole.id)).toBe(false);

    const someone = await createUser('client');
    await adminCaller.users.grant({
      userId: someone.id,
      unitIds: [unit.id],
      roleId: unitRole.id,
    });
    await expectTRPCError(
      adminCaller.users.grant({ userId: someone.id, unitIds: [sibling.id], roleId: unitRole.id }),
      'BAD_REQUEST',
    );

    // Papel de unidade de OUTRA empresa não pode ser criado.
    const { unit: foreignUnit } = await setupUnit();
    await expectTRPCError(
      adminCaller.users.createRole({
        companyId: company.id,
        unitId: foreignUnit.id,
        name: uniqueName('Inválido'),
        permissions: [],
      }),
      'BAD_REQUEST',
    );
  });

  test('listByUnit traz só os membros da unidade, com o papel do vínculo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const { user: reader } = await memberCaller(adminCaller, unit.id, 'Leitor');
    // Membro de OUTRA unidade não aparece.
    const { unit: otherUnit } = await setupUnit();
    await memberCaller(adminCaller, otherUnit.id, 'Gestor');

    const rows = await adminCaller.users.listByUnit({ unitId: unit.id });
    expect(rows.map((row) => row.id)).toEqual([reader.id]);
    expect(rows[0]?.roleName).toBe('Leitor');

    // Revogado sai da lista.
    await adminCaller.users.revoke({ userId: reader.id, unitIds: [unit.id] });
    expect(await adminCaller.users.listByUnit({ unitId: unit.id })).toHaveLength(0);
  });
});

describe('unitAction (papel granular)', () => {
  test('Leitor lê mas não escreve; Gestor escreve', async () => {
    const { adminCaller, unit } = await setupUnit();

    const { caller: reader } = await memberCaller(adminCaller, unit.id, 'Leitor');
    expect(Array.isArray(await reader.folders.list({ unitId: unit.id }))).toBe(true);
    await expectTRPCError(
      reader.folders.create({ unitId: unit.id, parentId: null, name: 'Nova' }),
      'FORBIDDEN',
    );

    const { caller: manager } = await memberCaller(adminCaller, unit.id, 'Gestor');
    const created = await manager.folders.create({
      unitId: unit.id,
      parentId: null,
      name: uniqueName('Pasta'),
    });
    expect(created?.id).toBeDefined();
  });

  test('papel custom destrava exatamente as ações mapeadas', async () => {
    const { adminCaller, company, unit } = await setupUnit();
    const role = await adminCaller.users.createRole({
      companyId: company.id,
      name: uniqueName('Só cadastros'),
      permissions: ['cadastros.ler', 'cadastros.itens'],
    });

    const { caller } = await memberCaller(adminCaller, unit.id, { roleId: role!.id });
    const employee = await caller.registers.upsertEmployee({
      unitId: unit.id,
      name: uniqueName('Colaborador'),
      metadata: {},
    });
    expect(employee?.id).toBeDefined();

    // Sem cadastros.importar nem pie.ler: outras ações continuam bloqueadas.
    await expectTRPCError(
      caller.registers.importEmployees({ unitId: unit.id, items: [{ name: 'X', metadata: {} }] }),
      'FORBIDDEN',
    );
    await expectTRPCError(caller.folders.list({ unitId: unit.id }), 'FORBIDDEN');
  });
});

describe('papéis (users router)', () => {
  test('papel do sistema é imutável e não pode ser excluído', async () => {
    const { adminCaller, company } = await setupUnit();
    const roles = await adminCaller.users.roles({ companyId: company.id });
    const gestor = roles.find((row) => row.isSystem && row.name === 'Gestor')!;

    await expectTRPCError(
      adminCaller.users.updateRole({ roleId: gestor.id, name: 'Outro nome' }),
      'BAD_REQUEST',
    );
    await expectTRPCError(adminCaller.users.removeRole({ roleId: gestor.id }), 'BAD_REQUEST');
  });

  test('papel em uso não pode ser excluído; re-liberar reativa vínculo', async () => {
    const { adminCaller, company, unit } = await setupUnit();
    const role = await adminCaller.users.createRole({
      companyId: company.id,
      name: uniqueName('Custom'),
      permissions: ['pie.ler'],
    });
    const { user, caller } = await memberCaller(adminCaller, unit.id, { roleId: role!.id });

    await expectTRPCError(adminCaller.users.removeRole({ roleId: role!.id }), 'BAD_REQUEST');

    // Revoga e re-libera com outro papel: mesmo vínculo (PK) reativado.
    await adminCaller.users.revoke({ userId: user.id, unitIds: [unit.id] });
    const gestor = (await adminCaller.users.roles({ companyId: company.id })).find(
      (row) => row.name === 'Gestor',
    )!;
    await adminCaller.users.grant({ userId: user.id, unitIds: [unit.id], roleId: gestor.id });
    const permissions = await caller.units.myPermissions({ unitId: unit.id });
    expect(permissions).toContain('pie.pasta.criar');
  });
});
