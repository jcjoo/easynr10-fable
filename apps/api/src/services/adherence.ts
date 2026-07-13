import { and, eq, inArray } from 'drizzle-orm';
import { notDeleted, schema, type DbOrTx } from '@easynr10/db';
import type { DiagnosticStatus, EvidenceInput, RequirementType } from '@easynr10/shared';

const { document, employee, equipment, folder, registerDocumentLink } = schema;

// Notas de aderência atravessando fronteiras de módulo. Cada função é a
// operação do módulo DONO da tabela — quem está do outro lado da fronteira
// (ex.: o diagnóstico, ao propagar as notas das evidências) chama por aqui em
// vez de operar tabelas alheias. Semântica comum: só toca o que é da unidade;
// alvo inválido é ignorado em silêncio (o snapshot da evidência preserva a
// nota de qualquer forma).

export interface DocumentAdherenceWrite {
  documentId: string;
  adherence: DiagnosticStatus | null;
}

// P.I.E: nota do documento. A validação de escopo (documento∈unidade, via
// pasta) mora aqui — não em quem chama.
export async function setDocumentsAdherence(
  db: DbOrTx,
  unitId: string,
  writes: DocumentAdherenceWrite[],
): Promise<void> {
  if (writes.length === 0) return;
  const ids = [...new Set(writes.map((w) => w.documentId))];
  const valid = new Set(
    (
      await db
        .select({ id: document.id })
        .from(document)
        .innerJoin(folder, eq(document.folderId, folder.id))
        .where(and(inArray(document.id, ids), eq(folder.unitId, unitId), notDeleted(document)))
    ).map((row) => row.id),
  );
  for (const write of writes) {
    if (!valid.has(write.documentId)) continue;
    await db
      .update(document)
      .set({ adherence: write.adherence })
      .where(eq(document.id, write.documentId));
  }
}

export interface RegisterLinkWrite {
  employeeId: string | null;
  equipmentId: string | null;
  fieldKey: string;
  /** Documento escolhido para o item (null = manter o vínculo como está). */
  documentId: string | null;
  adherence: DiagnosticStatus | null;
}

// Cadastros: nota do vínculo item+campo, com upsert na MESMA semântica do
// linkDocument (máx. 1 vínculo ativo por item+campo):
//  - com documentId: mesmo documento do vínculo ativo só atualiza a nota;
//    documento diferente (ou item sem vínculo) substitui/cria o vínculo —
//    sem isso, a nota dada na avaliação para um item sem vínculo explícito
//    (ex.: só auto-vínculo) se perdia em silêncio;
//  - sem documentId: só atualiza a nota do vínculo existente.
export async function upsertRegisterLinksAdherence(
  db: DbOrTx,
  unitId: string,
  writes: RegisterLinkWrite[],
): Promise<void> {
  const targeted = writes.filter((w) => w.employeeId || w.equipmentId);
  if (targeted.length === 0) return;

  // Validação de tenant em lote: itens e documentos precisam ser da unidade.
  const collect = (pick: (w: RegisterLinkWrite) => string | null) => [
    ...new Set(targeted.flatMap((w) => (pick(w) ? [pick(w)!] : []))),
  ];
  const empIds = collect((w) => w.employeeId);
  const eqpIds = collect((w) => w.equipmentId);
  const docIds = collect((w) => w.documentId);
  const toIdSet = (rows: { id: string }[]) => new Set(rows.map((row) => row.id));
  const [validEmp, validEqp, validDoc] = await Promise.all([
    empIds.length
      ? db
          .select({ id: employee.id })
          .from(employee)
          .where(and(inArray(employee.id, empIds), eq(employee.unitId, unitId), notDeleted(employee)))
          .then(toIdSet)
      : new Set<string>(),
    eqpIds.length
      ? db
          .select({ id: equipment.id })
          .from(equipment)
          .where(and(inArray(equipment.id, eqpIds), eq(equipment.unitId, unitId), notDeleted(equipment)))
          .then(toIdSet)
      : new Set<string>(),
    docIds.length
      ? db
          .select({ id: document.id })
          .from(document)
          .innerJoin(folder, eq(document.folderId, folder.id))
          .where(and(inArray(document.id, docIds), eq(folder.unitId, unitId), notDeleted(document)))
          .then(toIdSet)
      : new Set<string>(),
  ]);

  for (const write of targeted) {
    const okItem = write.employeeId
      ? validEmp.has(write.employeeId)
      : validEqp.has(write.equipmentId!);
    if (!okItem) continue;

    const itemWhere = write.employeeId
      ? eq(registerDocumentLink.employeeId, write.employeeId)
      : eq(registerDocumentLink.equipmentId, write.equipmentId!);
    const [active] = await db
      .select({ id: registerDocumentLink.id, documentId: registerDocumentLink.documentId })
      .from(registerDocumentLink)
      .where(
        and(itemWhere, eq(registerDocumentLink.fieldKey, write.fieldKey), notDeleted(registerDocumentLink)),
      );

    const wantsDoc = write.documentId && validDoc.has(write.documentId) ? write.documentId : null;
    if (wantsDoc && active?.documentId !== wantsDoc) {
      // Substitui: soft-delete do vínculo ativo + insert com o novo documento.
      if (active) {
        await db
          .update(registerDocumentLink)
          .set({ deletedAt: new Date() })
          .where(eq(registerDocumentLink.id, active.id));
      }
      await db.insert(registerDocumentLink).values({
        documentId: wantsDoc,
        fieldKey: write.fieldKey,
        employeeId: write.employeeId,
        equipmentId: write.equipmentId,
        adherence: write.adherence,
      });
    } else if (active) {
      await db
        .update(registerDocumentLink)
        .set({ adherence: write.adherence })
        .where(eq(registerDocumentLink.id, active.id));
    }
  }
}

// — Propagação das notas das evidências do diagnóstico (RF14/§7.6) —
// Um propagador por tipo de evidência (OCP: tipo novo = entrada nova no mapa,
// o fluxo do diagnose não muda).

type Propagator = (db: DbOrTx, unitId: string, evidences: EvidenceInput[]) => Promise<void>;

const evidencePropagators: Record<RequirementType, Propagator> = {
  // Nota da evidência de documento vira a aderência do documento no P.I.E.
  document: (db, unitId, evidences) =>
    setDocumentsAdherence(
      db,
      unitId,
      evidences
        .filter((ev) => ev.items[0]?.documentId)
        .map((ev) => ({ documentId: ev.items[0]!.documentId!, adherence: ev.adherence ?? null })),
    ),
  // Nota de cada item de cadastro vira a aderência do vínculo item+campo.
  cadastro: (db, unitId, evidences) =>
    upsertRegisterLinksAdherence(
      db,
      unitId,
      evidences
        .filter((ev) => ev.fieldKey)
        .flatMap((ev) =>
          ev.items.map((item) => ({
            employeeId: item.employeeId ?? null,
            equipmentId: item.equipmentId ?? null,
            fieldKey: ev.fieldKey!,
            documentId: item.documentId ?? null,
            adherence: item.adherence ?? null,
          })),
        ),
    ),
  // Parecer não propaga — vive só no snapshot da evidência.
  opinion: async () => {},
};

export async function propagateEvidenceAdherence(
  db: DbOrTx,
  unitId: string,
  evidences: EvidenceInput[],
): Promise<void> {
  for (const type of Object.keys(evidencePropagators) as RequirementType[]) {
    const batch = evidences.filter((ev) => ev.type === type);
    if (batch.length > 0) await evidencePropagators[type](db, unitId, batch);
  }
}
