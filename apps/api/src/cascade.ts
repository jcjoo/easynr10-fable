import { and, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from './db';
import { purgeUnitObjects } from './s3';

const {
  actionItem,
  adequacyItem,
  adequacyItemRequirement,
  customField,
  diagnostic,
  document,
  evidence,
  evidenceItem,
  employee,
  equipment,
  folder,
  folderSchema,
  membership,
  registerDocumentLink,
  unit,
} = schema;

// Exclusão em cascata de uma unidade: soft delete de TODA a árvore (pastas,
// documentos, itens de adequação, diagnósticos/evidências, plano de ação,
// cadastros, vínculos, estruturas, memberships) + purge dos objetos no MinIO.
// Sem isso, excluir empresa/unidade deixava filhos ativos no banco e os
// arquivos no bucket (verificado pelo usuário em 03/07/2026).
export async function cascadeDeleteUnit(unitId: string) {
  const deletedAt = new Date();
  const active = { deletedAt };

  const folderIds = (
    await db
      .select({ id: folder.id })
      .from(folder)
      .where(and(eq(folder.unitId, unitId), isNull(folder.deletedAt)))
  ).map((row) => row.id);

  const documentIds =
    folderIds.length > 0
      ? (
          await db
            .select({ id: document.id })
            .from(document)
            .where(and(inArray(document.folderId, folderIds), isNull(document.deletedAt)))
        ).map((row) => row.id)
      : [];

  const adequacyItemIds = (
    await db
      .select({ id: adequacyItem.id })
      .from(adequacyItem)
      .where(and(eq(adequacyItem.unitId, unitId), isNull(adequacyItem.deletedAt)))
  ).map((row) => row.id);

  const diagnosticIds =
    adequacyItemIds.length > 0
      ? (
          await db
            .select({ id: diagnostic.id })
            .from(diagnostic)
            .where(
              and(inArray(diagnostic.adequacyItemId, adequacyItemIds), isNull(diagnostic.deletedAt)),
            )
        ).map((row) => row.id)
      : [];

  const evidenceIds =
    diagnosticIds.length > 0
      ? (
          await db
            .select({ id: evidence.id })
            .from(evidence)
            .where(and(inArray(evidence.diagnosticId, diagnosticIds), isNull(evidence.deletedAt)))
        ).map((row) => row.id)
      : [];

  const employeeIds = (
    await db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.unitId, unitId), isNull(employee.deletedAt)))
  ).map((row) => row.id);

  const equipmentIds = (
    await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(and(eq(equipment.unitId, unitId), isNull(equipment.deletedAt)))
  ).map((row) => row.id);

  await db.transaction(async (tx) => {
    if (evidenceIds.length > 0) {
      await tx
        .update(evidenceItem)
        .set(active)
        .where(and(inArray(evidenceItem.evidenceId, evidenceIds), isNull(evidenceItem.deletedAt)));
      await tx.update(evidence).set(active).where(inArray(evidence.id, evidenceIds));
    }
    if (diagnosticIds.length > 0) {
      await tx
        .update(actionItem)
        .set(active)
        .where(and(inArray(actionItem.diagnosticId, diagnosticIds), isNull(actionItem.deletedAt)));
      await tx.update(diagnostic).set(active).where(inArray(diagnostic.id, diagnosticIds));
    }
    if (adequacyItemIds.length > 0) {
      await tx
        .update(adequacyItemRequirement)
        .set(active)
        .where(
          and(
            inArray(adequacyItemRequirement.adequacyItemId, adequacyItemIds),
            isNull(adequacyItemRequirement.deletedAt),
          ),
        );
      await tx.update(adequacyItem).set(active).where(inArray(adequacyItem.id, adequacyItemIds));
    }
    if (employeeIds.length > 0) {
      await tx
        .update(registerDocumentLink)
        .set(active)
        .where(
          and(
            inArray(registerDocumentLink.employeeId, employeeIds),
            isNull(registerDocumentLink.deletedAt),
          ),
        );
      await tx.update(employee).set(active).where(inArray(employee.id, employeeIds));
    }
    if (equipmentIds.length > 0) {
      await tx
        .update(registerDocumentLink)
        .set(active)
        .where(
          and(
            inArray(registerDocumentLink.equipmentId, equipmentIds),
            isNull(registerDocumentLink.deletedAt),
          ),
        );
      await tx.update(equipment).set(active).where(inArray(equipment.id, equipmentIds));
    }
    if (documentIds.length > 0) {
      await tx.update(document).set(active).where(inArray(document.id, documentIds));
    }
    if (folderIds.length > 0) {
      await tx.update(folder).set(active).where(inArray(folder.id, folderIds));
    }
    await tx
      .update(folderSchema)
      .set(active)
      .where(and(eq(folderSchema.unitId, unitId), isNull(folderSchema.deletedAt)));
    await tx
      .update(customField)
      .set(active)
      .where(and(eq(customField.unitId, unitId), isNull(customField.deletedAt)));
    await tx
      .update(membership)
      .set(active)
      .where(and(eq(membership.unitId, unitId), isNull(membership.deletedAt)));
    await tx
      .update(unit)
      .set(active)
      .where(and(eq(unit.id, unitId), isNull(unit.deletedAt)));
  });

  // Fora da transação: storage não participa do rollback do banco.
  const purgedObjects = await purgeUnitObjects(unitId);
  return { purgedObjects };
}
