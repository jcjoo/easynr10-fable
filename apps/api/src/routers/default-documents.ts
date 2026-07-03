import { asc, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../db';
import { protectedProcedure, router } from '../trpc';

const { defaultDocument } = schema;

// Catálogo global de nomes de documentos padrão (RF11): alimenta o select
// do modal de upload — nomes com " - *" pedem complemento.
export const defaultDocumentsRouter = router({
  list: protectedProcedure.query(async () => {
    return db
      .select({
        id: defaultDocument.id,
        name: defaultDocument.name,
        documentGroup: defaultDocument.documentGroup,
        isOptional: defaultDocument.isOptional,
      })
      .from(defaultDocument)
      .where(isNull(defaultDocument.deletedAt))
      .orderBy(asc(defaultDocument.name));
  }),
});
