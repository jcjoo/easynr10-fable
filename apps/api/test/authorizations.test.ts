// Autorizações (Permissão de Trabalho / Ficha de EPI): criação, permissões,
// link público e o fluxo completo de assinatura — PDF REAL via Gotenberg
// (docker-compose.dev, :3010) arquivado no MinIO e na pasta do colaborador.
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../src/db';
import {
  callerFor,
  expectTRPCError,
  memberCaller,
  setupUnit,
  uniqueName,
  type Caller,
} from './helpers';

// PNG 1x1 válido — o pad real manda algo assim (data URL de canvas).
const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function createEmployee(caller: Caller, unitId: string) {
  return (await caller.registers.upsertEmployee({
    unitId,
    name: uniqueName('Colaborador'),
    metadata: { funcao: 'Eletricista', matricula: '123' },
    folderSchemaId: null,
  }))!;
}

describe('autorizações', () => {
  test('criação exige autorizacoes.gerar; leitura exige autorizacoes.ler', async () => {
    const { adminCaller, unit } = await setupUnit();
    const employee = await createEmployee(adminCaller, unit.id);
    const gestor = await memberCaller(adminCaller, unit.id, 'Gestor');
    const leitor = await memberCaller(adminCaller, unit.id, 'Leitor');

    // Gestor (papel-sistema) ganhou autorizacoes.gerar pela migration.
    const created = await gestor.caller.authorizations.create({
      unitId: unit.id,
      type: 'permissao_trabalho',
      employeeId: employee.id,
      details: { atividade: 'Inspeção no QGBT-01' },
    });
    expect(created.status).toBe('pendente');
    expect(created.signToken.length).toBeGreaterThanOrEqual(16);

    // Leitor lê, mas não gera nem cancela.
    const listed = await leitor.caller.authorizations.list({
      unitId: unit.id,
      type: 'permissao_trabalho',
    });
    expect(listed.map((row) => row.id)).toContain(created.id);
    await expectTRPCError(
      leitor.caller.authorizations.create({
        unitId: unit.id,
        type: 'permissao_trabalho',
        employeeId: employee.id,
        details: { atividade: 'x' },
      }),
      'FORBIDDEN',
    );
    await expectTRPCError(
      leitor.caller.authorizations.cancel({ unitId: unit.id, authorizationId: created.id }),
      'FORBIDDEN',
    );

    // Trilha nasce com o evento de criação.
    const events = await leitor.caller.authorizations.events({
      unitId: unit.id,
      authorizationId: created.id,
    });
    expect(events.map((event) => event.type)).toEqual(['criada']);
  });

  test('colaborador de outra unidade não cria autorização (isolamento)', async () => {
    const { adminCaller, unit } = await setupUnit();
    const other = await setupUnit();
    const foreignEmployee = await createEmployee(other.adminCaller, other.unit.id);
    await expectTRPCError(
      adminCaller.authorizations.create({
        unitId: unit.id,
        type: 'permissao_trabalho',
        employeeId: foreignEmployee.id,
        details: { atividade: 'x' },
      }),
      'NOT_FOUND',
    );
  });

  test('assinatura presencial gera PDF no P.I.E, vincula e fecha a trilha', async () => {
    const { adminCaller, unit } = await setupUnit();
    const employee = await createEmployee(adminCaller, unit.id);
    const created = await adminCaller.authorizations.create({
      unitId: unit.id,
      type: 'ficha_epi',
      employeeId: employee.id,
      details: { epis: [{ nome: 'Luva isolante classe 0', ca: '12345' }, { nome: 'Capacete classe B' }] },
    });

    const signed = await adminCaller.authorizations.signInPerson({
      unitId: unit.id,
      authorizationId: created.id,
      signature: SIGNATURE,
    });
    expect(signed.status).toBe('assinada');
    expect(signed.signedAt).not.toBeNull();
    expect(signed.documentId).not.toBeNull();

    // Documento na pasta do colaborador (criada sob demanda), com versão 1.
    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.id, signed.documentId!));
    expect(doc!.name).toStartWith('Ficha de EPI - ');
    expect(doc!.documentGroup).toBe('colaboradores');
    const [owner] = await db
      .select()
      .from(schema.employee)
      .where(eq(schema.employee.id, employee.id));
    expect(doc!.folderId).toBe(owner!.folderId!);

    // PDF de verdade no bucket (via URL da própria API).
    const { url } = await adminCaller.authorizations.documentUrl({
      unitId: unit.id,
      authorizationId: created.id,
    });
    const pdf = await fetch(url);
    expect(pdf.ok).toBe(true);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    // Trilha completa e assinatura repetida bloqueada.
    const events = await adminCaller.authorizations.events({
      unitId: unit.id,
      authorizationId: created.id,
    });
    expect(events.map((event) => event.type)).toEqual(['criada', 'assinada', 'concluida']);
    await expectTRPCError(
      adminCaller.authorizations.signInPerson({
        unitId: unit.id,
        authorizationId: created.id,
        signature: SIGNATURE,
      }),
      'BAD_REQUEST',
    );
  });

  test('link público: consulta e assinatura sem sessão; token inválido é 404', async () => {
    const { adminCaller, unit } = await setupUnit();
    const employee = await createEmployee(adminCaller, unit.id);
    const created = await adminCaller.authorizations.create({
      unitId: unit.id,
      type: 'permissao_trabalho',
      employeeId: employee.id,
      details: { atividade: 'Troca de disjuntor', local: 'Subestação 2' },
    });

    const anon = callerFor(null);
    const info = await anon.authorizations.publicByToken({ token: created.signToken });
    expect(info.employeeName).toBe(employee.name);
    expect(info.status).toBe('pendente');

    const result = await anon.authorizations.publicSign({
      token: created.signToken,
      signature: SIGNATURE,
    });
    expect(result.downloadUrl).not.toBeNull();

    const after = await anon.authorizations.publicByToken({ token: created.signToken });
    expect(after.status).toBe('assinada');

    await expectTRPCError(
      anon.authorizations.publicByToken({ token: 'token-que-nao-existe-123' }),
      'NOT_FOUND',
    );
  });

  test('cancelada: link público morre para assinatura e não cancela de novo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const employee = await createEmployee(adminCaller, unit.id);
    const created = await adminCaller.authorizations.create({
      unitId: unit.id,
      type: 'permissao_trabalho',
      employeeId: employee.id,
      details: { atividade: 'Atividade cancelável' },
    });
    await adminCaller.authorizations.cancel({ unitId: unit.id, authorizationId: created.id });

    const anon = callerFor(null);
    const info = await anon.authorizations.publicByToken({ token: created.signToken });
    expect(info.status).toBe('cancelada');
    await expectTRPCError(
      anon.authorizations.publicSign({ token: created.signToken, signature: SIGNATURE }),
      'BAD_REQUEST',
    );
    await expectTRPCError(
      adminCaller.authorizations.cancel({ unitId: unit.id, authorizationId: created.id }),
      'BAD_REQUEST',
    );
  });
});

describe('exclusão definitiva', () => {
  test('remove apaga registro, trilha e PDF; Gestor não tem a ação', async () => {
    const { adminCaller, unit } = await setupUnit();
    const employee = await createEmployee(adminCaller, unit.id);
    const created = await adminCaller.authorizations.create({
      unitId: unit.id,
      type: 'permissao_trabalho',
      employeeId: employee.id,
      details: { atividade: 'Erro a ser apagado' },
    });
    await adminCaller.authorizations.signInPerson({
      unitId: unit.id,
      authorizationId: created.id,
      signature: SIGNATURE,
    });
    const { url } = await adminCaller.authorizations.documentUrl({
      unitId: unit.id,
      authorizationId: created.id,
    });

    // Papel sem exclusao.definitiva (Gestor) não exclui.
    const gestor = await memberCaller(adminCaller, unit.id, 'Gestor');
    await expectTRPCError(
      gestor.caller.authorizations.remove({ unitId: unit.id, authorizationId: created.id }),
      'FORBIDDEN',
    );

    await adminCaller.authorizations.remove({ unitId: unit.id, authorizationId: created.id });

    // Sumiu tudo: lista, eventos e documento (hard delete) + objeto no bucket.
    const listed = await adminCaller.authorizations.list({
      unitId: unit.id,
      type: 'permissao_trabalho',
    });
    expect(listed.map((row) => row.id)).not.toContain(created.id);
    const [rawAuth] = await db
      .select()
      .from(schema.authorization)
      .where(eq(schema.authorization.id, created.id));
    expect(rawAuth).toBeUndefined();
    const events = await db
      .select()
      .from(schema.authorizationEvent)
      .where(eq(schema.authorizationEvent.authorizationId, created.id));
    expect(events).toHaveLength(0);
    const gone = await fetch(url);
    expect(gone.status).toBe(404);
  });
});
