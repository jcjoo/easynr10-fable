import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import {
  authorizationEventLabels,
  authorizationTypeLabels,
  defaultRegisterFields,
  type AuthorizationEventType,
  type EpiSheetDetails,
  type WorkPermitDetails,
} from '@easynr10/shared';
import { env } from '../env';
import { buildStorageKey, putObject } from '../s3';
import { createItemFolder } from './register-folders';

const { authorization, authorizationEvent, document, documentVersion, employee, unit, company } =
  schema;

// Fluxo de assinatura das autorizações (Autorização de Trabalho / Ficha de EPI):
// assinou (presencial ou link público) → PDF com trilha de auditoria via
// Gotenberg → objeto no S3 → documento na pasta do colaborador no P.I.E,
// vinculado à autorização (document_id).

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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const formatDateTime = (value: Date) =>
  value.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });

const formatDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

interface TrailEvent {
  type: AuthorizationEventType;
  actor: string;
  at: Date;
}

// Corpo do documento por tipo — o essencial de cada um.
function detailsHtml(bundle: AuthorizationBundle) {
  const details = bundle.authorization.details;
  if (bundle.authorization.type === 'permissao_trabalho') {
    const pt = details as WorkPermitDetails;
    const atividades = pt.atividades
      .map((atividade) => `<li>${escapeHtml(atividade)}</li>`)
      .join('\n');
    return `
      <table class="fields">
        <tr><th>Atividades autorizadas</th><td><ul>${atividades}</ul></td></tr>
        ${pt.local ? `<tr><th>Local</th><td>${escapeHtml(pt.local)}</td></tr>` : ''}
        ${pt.validade ? `<tr><th>Válida até</th><td>${formatDate(pt.validade)}</td></tr>` : ''}
      </table>`;
  }
  const ficha = details as EpiSheetDetails;
  return `
    <table class="list">
      <thead><tr><th>EPI entregue</th><th>CA</th></tr></thead>
      <tbody>
        ${ficha.epis
          .map(
            (epi) =>
              `<tr><td>${escapeHtml(epi.nome)}</td><td>${epi.ca ? escapeHtml(epi.ca) : '—'}</td></tr>`,
          )
          .join('\n')}
      </tbody>
    </table>
    <p class="declaration">Declaro que recebi os EPIs relacionados acima, em perfeito estado de
    conservação, com orientação de uso, guarda e conservação, e estou ciente das obrigações
    previstas na NR-06.</p>`;
}

// PDF final: documento + assinatura + ficha "Trilha de auditoria" (mesmo
// formato das assinaturas eletrônicas: Detalhes + Atividade com carimbos).
export function renderAuthorizationHtml(options: {
  bundle: AuthorizationBundle;
  fileName: string;
  signatureDataUrl: string;
  signedAt: Date;
  events: TrailEvent[];
}) {
  const { bundle, fileName, signatureDataUrl, signedAt, events } = options;
  const typeLabel = authorizationTypeLabels[bundle.authorization.type];
  const metadata = bundle.employee.metadata ?? {};
  const employeeFields = defaultRegisterFields.colaboradores
    .filter((field) => metadata[field.key])
    .map(
      (field) =>
        `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(metadata[field.key]!)}</td></tr>`,
    )
    .join('\n');

  const trail = events
    .map(
      (event) => `
      <tr>
        <td class="evt">${escapeHtml(authorizationEventLabels[event.type]).toUpperCase()}</td>
        <td>${escapeHtml(event.actor)}</td>
        <td class="stamp">${formatDateTime(event.at)}</td>
      </tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  body { font: 11px/1.5 Helvetica, Arial, sans-serif; color: #1a1d21; }
  header { display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 2px solid #1a1d21; padding-bottom: 8px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0; }
  .brand { font-size: 10px; font-weight: bold; letter-spacing: .08em; text-transform: uppercase; }
  .sub { color: #555; margin: 4px 0 0; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin: 18px 0 6px; }
  table.fields { width: 100%; border-collapse: collapse; }
  table.fields th { width: 34%; text-align: left; font-size: 9px; text-transform: uppercase;
    letter-spacing: .05em; color: #555; padding: 6px 8px; vertical-align: top; }
  table.fields td { padding: 6px 8px; white-space: pre-wrap; }
  table.fields td ul { margin: 0; padding-left: 16px; }
  table.fields tr { border-bottom: 0.5px solid #c9ccd1; }
  table.list { width: 100%; border-collapse: collapse; }
  table.list th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em;
    color: #555; border-bottom: 1.5px solid #1a1d21; padding: 5px 8px; }
  table.list td { border-bottom: 0.5px solid #c9ccd1; padding: 5px 8px; }
  .declaration { color: #333; margin-top: 12px; }
  .signature { margin-top: 28px; text-align: center; }
  .signature img { max-height: 90px; max-width: 320px; }
  .signature .line { border-top: 1px solid #1a1d21; width: 320px; margin: 4px auto 0; padding-top: 6px; }
  .signature .who { font-weight: bold; }
  .signature .when { color: #555; font-size: 10px; }
  .audit { page-break-before: always; }
  .audit h1 { font-size: 18px; margin-bottom: 12px; }
  .box { border: 1px solid #c9ccd1; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px; }
  .box h2 { margin: 0 0 8px; }
  .box table { width: 100%; border-collapse: collapse; }
  .box th { width: 30%; text-align: left; font-size: 9px; text-transform: uppercase;
    letter-spacing: .05em; color: #555; padding: 7px 6px; vertical-align: top; }
  .box td { padding: 7px 6px; border-bottom: 0.5px solid #e2e4e8; }
  .box tr:last-child td { border-bottom: none; }
  .ok { color: #157347; font-weight: bold; }
  .evt { font-size: 9px; letter-spacing: .05em; color: #555; width: 18%; }
  .stamp { width: 24%; color: #555; white-space: nowrap; }
  .foot { color: #777; font-size: 9px; margin-top: 10px; }
</style></head><body>

<header>
  <div>
    <h1>${escapeHtml(typeLabel)}</h1>
    <p class="sub">${escapeHtml(bundle.companyName)} — ${escapeHtml(bundle.unitName)}</p>
  </div>
  <span class="brand">EasyNR10 · PSO Engenharia</span>
</header>

<h2>Colaborador</h2>
<table class="fields">
  <tr><th>Nome</th><td>${escapeHtml(bundle.employee.name)}</td></tr>
  ${employeeFields}
</table>

<h2>${bundle.authorization.type === 'permissao_trabalho' ? 'Permissão' : 'Entrega'}</h2>
${detailsHtml(bundle)}

<div class="signature">
  <img src="${signatureDataUrl}" alt="Assinatura" />
  <div class="line">
    <p class="who">${escapeHtml(bundle.employee.name)}</p>
    <p class="when">Assinado em ${formatDateTime(signedAt)}</p>
  </div>
</div>

<section class="audit">
  <h1>Trilha de auditoria</h1>
  <div class="box">
    <h2>Detalhes</h2>
    <table>
      <tr><th>Nome do arquivo</th><td>${escapeHtml(fileName)}</td></tr>
      <tr><th>Status</th><td class="ok">● Assinado</td></tr>
      <tr><th>Carimbo de data/hora do status</th><td>${formatDateTime(signedAt)}</td></tr>
    </table>
  </div>
  <div class="box">
    <h2>Atividade</h2>
    <table>
      ${trail}
    </table>
  </div>
  <p class="foot">Documento gerado eletronicamente pelo EasyNR10; a trilha acima registra os
  eventos da autorização com data e hora (horário de Brasília).</p>
</section>

</body></html>`;
}

async function htmlToPdf(html: string) {
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  const response = await fetch(`${env.GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Gotenberg respondeu ${response.status}: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

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
