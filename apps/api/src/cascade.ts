import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { purgeUnitObjects } from './s3';

const {
  actionItem,
  adequacyItem,
  adequacyItemNc,
  adequacyItemRequirement,
  authorization,
  customField,
  diagnostic,
  diagnosticNc,
  document,
  evidence,
  evidenceItem,
  employee,
  equipment,
  folder,
  folderSchema,
  membership,
  registerDocumentLink,
  registerTargetSetting,
  unit,
} = schema;

// Exclusão em cascata de uma unidade: soft delete de TODA a árvore + purge
// dos objetos no MinIO. A árvore é DECLARADA em `cascadeSteps` (filhos antes
// dos pais) — tabela filha nova de unidade é uma linha ali, não um bloco novo
// de queries. Sem isso, excluir empresa/unidade deixava filhos ativos no
// banco e os arquivos no bucket (verificado pelo usuário em 03/07/2026).

// Conjuntos de ids ativos da unidade, coletados antes da transação.
interface CascadeIds {
  unitId: string;
  folderIds: string[];
  documentIds: string[];
  adequacyItemIds: string[];
  diagnosticIds: string[];
  evidenceIds: string[];
  employeeIds: string[];
  equipmentIds: string[];
}

// Condição do passo; devolver undefined pula o passo (conjunto vazio).
const byIds = (column: AnyPgColumn, ids: string[]): SQL | undefined =>
  ids.length > 0 ? inArray(column, ids) : undefined;

type SoftDeletable = PgTable & { deletedAt: AnyPgColumn };

const cascadeSteps: {
  table: SoftDeletable;
  where: (ids: CascadeIds) => SQL | undefined;
}[] = [
  { table: evidenceItem, where: (c) => byIds(evidenceItem.evidenceId, c.evidenceIds) },
  { table: evidence, where: (c) => byIds(evidence.id, c.evidenceIds) },
  { table: actionItem, where: (c) => byIds(actionItem.diagnosticId, c.diagnosticIds) },
  { table: diagnosticNc, where: (c) => byIds(diagnosticNc.diagnosticId, c.diagnosticIds) },
  { table: diagnostic, where: (c) => byIds(diagnostic.id, c.diagnosticIds) },
  {
    table: adequacyItemRequirement,
    where: (c) => byIds(adequacyItemRequirement.adequacyItemId, c.adequacyItemIds),
  },
  { table: adequacyItemNc, where: (c) => byIds(adequacyItemNc.adequacyItemId, c.adequacyItemIds) },
  { table: adequacyItem, where: (c) => byIds(adequacyItem.id, c.adequacyItemIds) },
  {
    table: registerDocumentLink,
    where: (c) => {
      const targets = [
        byIds(registerDocumentLink.employeeId, c.employeeIds),
        byIds(registerDocumentLink.equipmentId, c.equipmentIds),
      ].filter((cond): cond is SQL => cond !== undefined);
      return targets.length > 0 ? or(...targets) : undefined;
    },
  },
  // Eventos de autorização não têm deleted_at (imutáveis) — ficam órfãos e
  // inacessíveis, como as versões de documento.
  { table: authorization, where: (c) => eq(authorization.unitId, c.unitId) },
  { table: employee, where: (c) => byIds(employee.id, c.employeeIds) },
  { table: equipment, where: (c) => byIds(equipment.id, c.equipmentIds) },
  { table: document, where: (c) => byIds(document.id, c.documentIds) },
  { table: folder, where: (c) => byIds(folder.id, c.folderIds) },
  { table: folderSchema, where: (c) => eq(folderSchema.unitId, c.unitId) },
  { table: customField, where: (c) => eq(customField.unitId, c.unitId) },
  { table: registerTargetSetting, where: (c) => eq(registerTargetSetting.unitId, c.unitId) },
  { table: membership, where: (c) => eq(membership.unitId, c.unitId) },
  { table: unit, where: (c) => eq(unit.id, c.unitId) },
];

async function collectIds(db: Db, unitId: string): Promise<CascadeIds> {
  const idsOf = async (rows: { id: string }[]) => rows.map((row) => row.id);

  const folderIds = await idsOf(
    await db
      .select({ id: folder.id })
      .from(folder)
      .where(and(eq(folder.unitId, unitId), notDeleted(folder))),
  );
  const documentIds =
    folderIds.length > 0
      ? await idsOf(
          await db
            .select({ id: document.id })
            .from(document)
            .where(and(inArray(document.folderId, folderIds), notDeleted(document))),
        )
      : [];
  const adequacyItemIds = await idsOf(
    await db
      .select({ id: adequacyItem.id })
      .from(adequacyItem)
      .where(and(eq(adequacyItem.unitId, unitId), notDeleted(adequacyItem))),
  );
  const diagnosticIds =
    adequacyItemIds.length > 0
      ? await idsOf(
          await db
            .select({ id: diagnostic.id })
            .from(diagnostic)
            .where(
              and(inArray(diagnostic.adequacyItemId, adequacyItemIds), notDeleted(diagnostic)),
            ),
        )
      : [];
  const evidenceIds =
    diagnosticIds.length > 0
      ? await idsOf(
          await db
            .select({ id: evidence.id })
            .from(evidence)
            .where(and(inArray(evidence.diagnosticId, diagnosticIds), notDeleted(evidence))),
        )
      : [];
  const employeeIds = await idsOf(
    await db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.unitId, unitId), notDeleted(employee))),
  );
  const equipmentIds = await idsOf(
    await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(and(eq(equipment.unitId, unitId), notDeleted(equipment))),
  );

  return {
    unitId,
    folderIds,
    documentIds,
    adequacyItemIds,
    diagnosticIds,
    evidenceIds,
    employeeIds,
    equipmentIds,
  };
}

export async function cascadeDeleteUnit(db: Db, unitId: string) {
  const ids = await collectIds(db, unitId);
  const deletedAt = new Date();

  await db.transaction(async (tx) => {
    for (const step of cascadeSteps) {
      const where = step.where(ids);
      if (!where) continue;
      // `set` tipado à mão: a tabela do passo é heterogênea (SoftDeletable),
      // mas todas têm deleted_at (colunas de auditoria).
      await tx
        .update(step.table)
        .set({ deletedAt } as Record<string, Date>)
        .where(and(where, notDeleted(step.table)));
    }
  });

  // Fora da transação: storage não participa do rollback do banco.
  const purgedObjects = await purgeUnitObjects(unitId);
  return { purgedObjects };
}
