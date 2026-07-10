// Helpers dos testes de integração: chamam as procedures reais via caller
// (mesma cadeia de middlewares da produção) contra o banco easynr10_test
// (ver packages/db/tests/preload.ts). Cada teste cria seus próprios dados
// com nomes/e-mails únicos — nada de truncate entre arquivos.
import { expect } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import type { DiagnosticStatus, DocumentGroup, RequirementType } from '@easynr10/shared';
import { db } from '../src/db';
import { auth } from '../src/auth';
import { appRouter } from '../src/routers';
import { createCallerFactory, type Context } from '../src/trpc';

const factory = createCallerFactory(appRouter);

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
}

let counter = 0;
export function uniqueName(prefix: string) {
  counter += 1;
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}-${counter}`;
}

// Usuário real via better-auth (hash/conta como em produção).
export async function createUser(role: 'admin' | 'client' = 'client'): Promise<TestUser> {
  const email = `t-${crypto.randomUUID()}@teste.local`;
  const name = uniqueName(role === 'admin' ? 'Admin' : 'Cliente');
  const result = await auth.api.signUpEmail({
    body: { name, email, password: 'senha-forte-123' },
  });
  if (role === 'admin') {
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, result.user.id));
  }
  return { id: result.user.id, name, email, role };
}

// Caller com sessão construída à mão (null = anônimo). O db entra pelo
// contexto — mesma injeção da produção (createContext).
export function callerFor(user: TestUser | null) {
  const session = user
    ? ({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        session: { id: crypto.randomUUID(), userId: user.id },
      } as unknown as Context['session'])
    : null;
  return factory({ session, db });
}
export type Caller = ReturnType<typeof callerFor>;

export async function systemRole(name: 'Gestor' | 'Leitor') {
  const role = await db.query.appRole.findFirst({
    where: and(
      eq(schema.appRole.name, name),
      eq(schema.appRole.isSystem, true),
      isNull(schema.appRole.deletedAt),
    ),
  });
  if (!role) throw new Error(`Papel do sistema "${name}" não seedado pelas migrations`);
  return role;
}

// Empresa + unidade novas com um admin para operá-las.
export async function setupUnit() {
  const admin = await createUser('admin');
  const adminCaller = callerFor(admin);
  const company = (await adminCaller.companies.create({ name: uniqueName('Empresa') }))!;
  const unit = (await adminCaller.units.create({
    companyId: company.id,
    name: uniqueName('Unidade'),
  }))!;
  return { admin, adminCaller, company, unit };
}

// Cliente vinculado à unidade com um papel (sistema ou custom por id).
export async function memberCaller(
  adminCaller: Caller,
  unitId: string,
  role: 'Gestor' | 'Leitor' | { roleId: string },
) {
  const user = await createUser('client');
  const roleId = typeof role === 'object' ? role.roleId : (await systemRole(role)).id;
  await adminCaller.users.grant({ userId: user.id, unitIds: [unitId], roleId });
  return { user, caller: callerFor(user) };
}

// Norma direto no catálogo (o seed de produção não roda nos testes).
export async function seedNorm(options: {
  weight?: number;
  documentGroup?: DocumentGroup;
  requirements?: { type: RequirementType; question: string }[];
} = {}) {
  const [created] = await db
    .insert(schema.norm)
    .values({
      code: uniqueName('10.99'),
      description: 'Norma de teste',
      orientation: 'Orientação de teste',
      documentGroup: options.documentGroup ?? 'instalacoes',
      importanceWeight: options.weight ?? 4,
    })
    .returning();
  if (options.requirements?.length) {
    await db.insert(schema.normRequirement).values(
      options.requirements.map((req) => ({ normId: created!.id, ...req })),
    );
  }
  return created!;
}

// Item de adequação direto (para fixtures controladas de relatório —
// `adequacy.generate` pegaria normas de outros testes do mesmo run).
export async function seedAdequacyItem(unitId: string, normId: string) {
  const [created] = await db
    .insert(schema.adequacyItem)
    .values({ unitId, normId })
    .returning();
  return created!;
}

// Documento com versão 1 via fluxo real (confirmUpload) sem passar pelo S3.
export async function seedDocument(
  caller: Caller,
  unitId: string,
  folderId: string,
  options: {
    name?: string;
    expiresAt?: string | null;
    warnDaysBefore?: number | null;
    adherence?: DiagnosticStatus | null;
  } = {},
) {
  const created = await caller.documents.confirmUpload({
    unitId,
    folderId,
    name: options.name ?? uniqueName('Documento'),
    storageKey: `units/${unitId}/${crypto.randomUUID()}/doc.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 4,
    expiresAt: options.expiresAt ?? null,
    warnDaysBefore: options.warnDaysBefore ?? null,
    adherence: options.adherence ?? null,
  });
  return created!;
}

export function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function expectTRPCError(promise: Promise<unknown>, code: string) {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  if (!thrown) throw new Error(`esperava TRPCError ${code}, mas a chamada resolveu`);
  expect((thrown as { code?: string }).code).toBe(code);
}
