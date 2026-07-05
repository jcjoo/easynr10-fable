import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../db';

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
export async function visibleUnits(viewer: Viewer, companyId?: string) {
  const companyFilter: SQL | undefined = companyId ? eq(unit.companyId, companyId) : undefined;
  if (viewer.role === 'admin') {
    return db
      .select({ id: unit.id, name: unit.name, companyId: unit.companyId })
      .from(unit)
      .where(and(companyFilter, isNull(unit.deletedAt)))
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
        isNull(membership.deletedAt),
        isNull(unit.deletedAt),
      ),
    )
    .orderBy(asc(unit.name));
}

export async function canAccessCompany(viewer: Viewer, companyId: string) {
  if (viewer.role === 'admin') return true;
  const units = await visibleUnits(viewer, companyId);
  return units.length > 0;
}
