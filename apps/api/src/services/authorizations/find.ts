import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';

const { authorization, employee, unit, company } = schema;

export interface AuthorizationBundle {
  authorization: typeof authorization.$inferSelect;
  employee: typeof employee.$inferSelect;
  unitName: string;
  companyName: string;
}

// Autorização + colaborador + nomes de unidade/empresa; o filtro é o chamador
// quem define (por id dentro da unidade, ou por token público).
async function loadBundle(db: Db, where: ReturnType<typeof and>) {
  const [row] = await db
    .select({
      authorization,
      employee,
      unitName: unit.name,
      companyName: company.name,
    })
    .from(authorization)
    .innerJoin(employee, eq(authorization.employeeId, employee.id))
    .innerJoin(unit, eq(authorization.unitId, unit.id))
    .innerJoin(company, eq(unit.companyId, company.id))
    .where(where);
  return row ?? null;
}

export async function findUnitAuthorization(db: Db, unitId: string, authorizationId: string) {
  const bundle = await loadBundle(
    db,
    and(
      eq(authorization.id, authorizationId),
      eq(authorization.unitId, unitId),
      notDeleted(authorization),
    ),
  );
  if (!bundle) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Autorização não encontrada' });
  }
  return bundle;
}

export async function findAuthorizationByToken(db: Db, token: string) {
  const bundle = await loadBundle(
    db,
    and(eq(authorization.signToken, token), notDeleted(authorization)),
  );
  if (!bundle) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Link de assinatura inválido' });
  }
  return bundle;
}
