import { inArray } from 'drizzle-orm';
import { schema, type Db, type DbOrTx } from '@easynr10/db';
import { purgeObjects } from '../s3';

const { authorization, document, documentVersion, evidenceItem, registerDocumentLink } = schema;

// Parte de BANCO da exclusão definitiva de documentos: remove versões, vínculos
// (evidências, cadastros) e o próprio documento. Recebe a transação de fora
// para poder ser ATÔMICA junto de outra operação (ex.: excluir a autorização
// que aponta para o PDF). Devolve as storage keys para o chamador apagar do
// bucket FORA da transação (storage não participa do rollback do banco).
export async function purgeDocumentsTx(tx: DbOrTx, documentIds: string[]): Promise<string[]> {
  if (documentIds.length === 0) return [];

  const versions = await tx
    .select({ storageKey: documentVersion.storageKey })
    .from(documentVersion)
    .where(inArray(documentVersion.documentId, documentIds));

  // Referências primeiro (FK): evidências que usavam o documento como prova,
  // vínculos de campo dos cadastros e o ponteiro das autorizações assinadas.
  await tx.delete(evidenceItem).where(inArray(evidenceItem.documentId, documentIds));
  await tx.delete(registerDocumentLink).where(inArray(registerDocumentLink.documentId, documentIds));
  await tx
    .update(authorization)
    .set({ documentId: null })
    .where(inArray(authorization.documentId, documentIds));
  // FK circular document ↔ document_version: solta o current antes.
  await tx.update(document).set({ currentVersionId: null }).where(inArray(document.id, documentIds));
  await tx.delete(documentVersion).where(inArray(documentVersion.documentId, documentIds));
  await tx.delete(document).where(inArray(document.id, documentIds));

  return [...new Set(versions.map((v) => v.storageKey))];
}

// Exclusão DEFINITIVA de documentos (só admin): erros que não podem aparecer
// para clientes/auditores somem de verdade — versões, vínculos e os objetos no
// bucket. Diferente do soft delete padrão (recuperável pelo suporte), aqui não
// há volta. Wrapper para o uso direto (sem outra operação a unir).
export async function purgeDocuments(db: Db, documentIds: string[]) {
  if (documentIds.length === 0) return { purgedObjects: 0 };
  const keys = await db.transaction((tx) => purgeDocumentsTx(tx, documentIds));
  const purgedObjects = await purgeObjects(keys);
  return { purgedObjects };
}
