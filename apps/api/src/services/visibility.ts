import { and, asc, eq, type SQL } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';

const { membership, unit } = schema;

// Regra de visibilidade organizacional NUM LUGAR SÓ (RF04): admin enxerga
// tudo; cliente enxerga as unidades onde tem membership (e, por consequência,
// as empresas dessas unidades). Procedures que listam/checam empresa ou
// unidade consomem daqui — nada de branch por papel dentro das rotas.

export interface Viewer {
  id: string;
  role: string;
}

// Unidades visíveis ao usuário, opcionalmente restritas a uma empresa.
export async function visibleUnits(db: Db, viewer: Viewer, companyId?: string) {
  const companyFilter: SQL | undefined = companyId ? eq(unit.companyId, companyId) : undefined;
  if (viewer.role === 'admin') {
    return db
      .select({ id: unit.id, name: unit.name, companyId: unit.companyId })
      .from(unit)
      .where(and(companyFilter, notDeleted(unit)))
      .orderBy(asc(unit.name));
  }
  return db
    .select({ id: unit.id, name: unit.name, companyId: unit.companyId })
    .from(membership)
    .innerJoin(unit, eq(membership.unitId, unit.id))
    .where(
      and(
        eq(membership.userId, viewer.id),
        companyFilter,
        notDeleted(membership),
        notDeleted(unit),
      ),
    )
    .orderBy(asc(unit.name));
}

export async function canAccessCompany(db: Db, viewer: Viewer, companyId: string) {
  if (viewer.role === 'admin') return true;
  const units = await visibleUnits(db, viewer, companyId);
  return units.length > 0;
}
