import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../db';
import { router, unitProcedure } from '../trpc';

const { registerGroup } = schema;

// Mínimo para o motor de evidências (requisitos tipo group escolhem um
// grupo). O módulo completo de Grupos de Registro (F3) vem depois.
export const registersRouter = router({
  listGroups: unitProcedure.query(async ({ input }) => {
    return db
      .select({ id: registerGroup.id, name: registerGroup.name, kind: registerGroup.kind })
      .from(registerGroup)
      .where(and(eq(registerGroup.unitId, input.unitId), isNull(registerGroup.deletedAt)))
      .orderBy(asc(registerGroup.name));
  }),
});
