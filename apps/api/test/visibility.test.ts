// Visibilidade organizacional (services/visibility.ts via routers): admin vê
// tudo; cliente só as unidades onde tem membership e as empresas delas.
import { describe, expect, test } from 'bun:test';
import {
  callerFor,
  createUser,
  expectTRPCError,
  memberCaller,
  setupUnit,
  uniqueName,
} from './helpers';

describe('visibilidade de empresas e unidades', () => {
  test('cliente vê apenas empresas/unidades liberadas, com unitCount', async () => {
    const { adminCaller, company, unit } = await setupUnit();
    // Segunda unidade da mesma empresa, NÃO liberada para o cliente.
    await adminCaller.units.create({ companyId: company.id, name: uniqueName('Unidade B') });
    // Outra empresa, invisível para o cliente.
    const other = (await adminCaller.companies.create({ name: uniqueName('Outra') }))!;

    const { caller } = await memberCaller(adminCaller, unit.id, 'Leitor');

    const companies = await caller.companies.list();
    const visible = companies.find((row) => row.id === company.id);
    expect(visible?.unitCount).toBe(1); // só a unidade com membership
    expect(companies.some((row) => row.id === other.id)).toBe(false);

    const units = await caller.units.listByCompany({ companyId: company.id });
    expect(units.map((row) => row.id)).toEqual([unit.id]);

    await expectTRPCError(caller.companies.byId({ id: other.id }), 'FORBIDDEN');
    expect((await caller.companies.byId({ id: company.id }))?.id).toBe(company.id);
  });

  test('admin vê todas as empresas, inclusive sem unidade', async () => {
    const admin = await createUser('admin');
    const adminCaller = callerFor(admin);
    const empty = (await adminCaller.companies.create({ name: uniqueName('Sem unidade') }))!;
    const companies = await adminCaller.companies.list();
    const found = companies.find((row) => row.id === empty.id);
    expect(found).toBeDefined();
    expect(found?.unitCount).toBe(0);
  });

  test('cliente sem nenhum vínculo não vê empresa alguma', async () => {
    const { company } = await setupUnit();
    const loner = await createUser('client');
    const companies = await callerFor(loner).companies.list();
    expect(companies.some((row) => row.id === company.id)).toBe(false);
  });
});
