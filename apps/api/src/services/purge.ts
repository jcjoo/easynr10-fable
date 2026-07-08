import { inArray } from 'drizzle-orm';
import { schema, type Db } from '@easynr10/db';
import { purgeObjects } from '../s3';

const { authorization, document, documentVersion, evidenceItem, registerDocumentLink } = schema;

// Exclusão DEFINITIVA de documentos (só admin): erros que não podem aparecer
// para clientes/auditores somem de verdade — versões, vínculos (cadastros,
// evidências, autorizações) e os objetos no bucket. Diferente do soft delete
// padrão (recuperável pelo suporte), aqui não há volta.
export async function purgeDocuments(db: Db, documentIds: string[]) {
  if (documentIds.length === 0) return { purgedObjects: 0 };

  const versions = await db
    .select({ storageKey: documentVersion.storageKey })
    .from(documentVersion)
    .where(inArray(documentVersion.documentId, documentIds));

  await db.transaction(async (tx) => {
    // Referências primeiro (FK): evidências que usavam o documento como prova,
    // vínculos de campo dos cadastros e o ponteiro das autorizações assinadas.
    await tx.delete(evidenceItem).where(inArray(evidenceItem.documentId, documentIds));
    await tx
      .delete(registerDocumentLink)
      .where(inArray(registerDocumentLink.documentId, documentIds));
    await tx
      .update(authorization)
      .set({ documentId: null })
      .where(inArray(authorization.documentId, documentIds));
    // FK circular document ↔ document_version: solta o current antes.
    await tx
      .update(document)
      .set({ currentVersionId: null })
      .where(inArray(document.id, documentIds));
    await tx.delete(documentVersion).where(inArray(documentVersion.documentId, documentIds));
    await tx.delete(document).where(inArray(document.id, documentIds));
  });

  // Fora da transação: storage não participa do rollback do banco.
  const purgedObjects = await purgeObjects([...new Set(versions.map((v) => v.storageKey))]);
  return { purgedObjects };
}
