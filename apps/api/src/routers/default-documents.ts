import { asc } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import { protectedProcedure, router } from '../trpc';

const { defaultDocument } = schema;

// Catálogo global de nomes de documentos padrão (RF11): alimenta o select
// do modal de upload — nomes com " - *" pedem complemento.
export const defaultDocumentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: defaultDocument.id,
        name: defaultDocument.name,
        documentGroup: defaultDocument.documentGroup,
        isOptional: defaultDocument.isOptional,
      })
      .from(defaultDocument)
      .where(notDeleted(defaultDocument))
      .orderBy(asc(defaultDocument.name));
  }),
});
