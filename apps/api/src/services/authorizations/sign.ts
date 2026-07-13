import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@easynr10/db';
import { authorizationTypeLabels } from '@easynr10/shared';
import { buildStorageKey, putObject } from '../../s3';
import { htmlToPdf } from '../pdf';
import { createItemFolder } from '../register-folders';
import type { AuthorizationBundle } from './find';
import { renderAuthorizationHtml, type TrailEvent } from './render';

const { authorization, authorizationEvent, document, documentVersion, employee } = schema;

// Assina a autorização: registra os eventos, gera o PDF e o arquiva como
// documento do P.I.E na pasta do colaborador. `via` distingue a assinatura
// presencial (dispositivo do operador) da pelo link público.
export async function signAuthorization(
  db: Db,
  bundle: AuthorizationBundle,
  input: { signatureDataUrl: string; via: 'presencial' | 'link' },
) {
  if (bundle.authorization.status !== 'pendente') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        bundle.authorization.status === 'assinada'
          ? 'Esta autorização já foi assinada'
          : 'Esta autorização foi cancelada',
    });
  }

  const signedAt = new Date();
  const typeLabel = authorizationTypeLabels[bundle.authorization.type];
  const fileName = `${typeLabel} - ${bundle.employee.name} - ${signedAt
    .toISOString()
    .slice(0, 10)}.pdf`;

  // Trilha completa para o PDF: eventos já gravados + os desta assinatura
  // (gravados na transação abaixo com os mesmos carimbos).
  const previous = await db
    .select()
    .from(authorizationEvent)
    .where(eq(authorizationEvent.authorizationId, bundle.authorization.id))
    .orderBy(authorizationEvent.createdAt);
  const signEvents: TrailEvent[] = [
    {
      type: 'assinada',
      actor: `${bundle.employee.name} (${input.via === 'link' ? 'pelo link público' : 'presencial'})`,
      at: signedAt,
    },
    { type: 'concluida', actor: 'Documento PDF gerado e arquivado no P.I.E', at: signedAt },
  ];
  const events: TrailEvent[] = [
    ...previous.map((event) => ({ type: event.type, actor: event.actor, at: event.createdAt })),
    ...signEvents,
  ];

  // PDF antes de qualquer escrita: se o Gotenberg/S3 falhar, a autorização
  // segue pendente e a assinatura pode ser refeita.
  const pdf = await htmlToPdf(
    renderAuthorizationHtml({
      bundle,
      fileName,
      signatureDataUrl: input.signatureDataUrl,
      signedAt,
      events,
    }),
  );
  const storageKey = buildStorageKey(bundle.authorization.unitId, fileName);
  await putObject(storageKey, pdf, 'application/pdf');

  // Pasta do colaborador no P.I.E (criada sob demanda, como nos cadastros).
  let folderId = bundle.employee.folderId;
  if (!folderId) {
    folderId = await createItemFolder(
      db,
      bundle.authorization.unitId,
      'colaboradores',
      bundle.employee.name,
    );
    await db.update(employee).set({ folderId }).where(eq(employee.id, bundle.employee.id));
  }

  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(document)
      .values({ folderId: folderId!, name: fileName, documentGroup: 'colaboradores' })
      .returning();
    const [version] = await tx
      .insert(documentVersion)
      .values({
        documentId: doc!.id,
        number: 1,
        storageKey,
        mimeType: 'application/pdf',
        sizeBytes: pdf.byteLength,
        // Assinatura pública não tem sessão — o autor do upload é quem gerou.
        uploadedBy: bundle.authorization.createdBy,
      })
      .returning();
    await tx.update(document).set({ currentVersionId: version!.id }).where(eq(document.id, doc!.id));

    const [updated] = await tx
      .update(authorization)
      .set({ status: 'assinada', signedAt, documentId: doc!.id })
      .where(eq(authorization.id, bundle.authorization.id))
      .returning();
    await tx.insert(authorizationEvent).values(
      signEvents.map((event) => ({
        authorizationId: bundle.authorization.id,
        type: event.type,
        actor: event.actor,
        createdAt: event.at,
      })),
    );
    return updated!;
  });
}
