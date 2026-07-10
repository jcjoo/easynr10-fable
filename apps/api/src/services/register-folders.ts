import { and, eq, isNull } from 'drizzle-orm';
import { notDeleted, schema, type Db, type DbOrTx } from '@easynr10/db';
import { registerBasePath, registerTargets, type RegisterTarget } from '@easynr10/shared';
import { ensureFolderStructure, findUnitSchemaOrThrow } from './folders';

const { folder } = schema;

// Estrutura FIXA dos cadastros no PIE, criada sob demanda (RF18):
//   Colaboradores/Lista de Colaboradores/[nome]/[estrutura opcional]
//   Equipamentos/<Tipo>/Lista de <Tipo>/[nome]/[estrutura opcional]

async function findOrCreateChild(db: DbOrTx, unitId: string, parentId: string | null, name: string) {
  const existing = await db.query.folder.findFirst({
    where: and(
      eq(folder.unitId, unitId),
      parentId === null ? isNull(folder.parentId) : eq(folder.parentId, parentId),
      eq(folder.name, name),
      notDeleted(folder),
    ),
  });
  if (existing) return existing.id;
  const [created] = await db.insert(folder).values({ unitId, parentId, name }).returning();
  return created!.id;
}

async function ensureGroupPath(db: DbOrTx, unitId: string, target: RegisterTarget) {
  let parentId: string | null = null;
  for (const name of registerBasePath[target]) {
    parentId = await findOrCreateChild(db, unitId, parentId, name);
  }
  return parentId!;
}

// Esqueleto completo dos cadastros (todas as listas de todos os grupos).
// Chamado na criação da unidade e lazy nas listagens (unidades antigas).
export async function ensureRegisterSkeleton(db: Db, unitId: string) {
  for (const target of registerTargets) {
    await ensureGroupPath(db, unitId, target);
  }
}

// Mantém a pasta do item no PIE em sincronia com o nome do item — a convenção
// "Lista de <Grupo>/<nome>" (e a sugestão automática de evidências por
// subárvore) depende disso. Best-effort: no-op se o nome já bate; se já houver
// uma pasta irmã com o novo nome (uq_folder_unit_parent_name), não renomeia
// para não estourar a constraint — o vínculo por id segue intacto de qualquer
// forma.
export async function renameItemFolder(
  db: DbOrTx,
  unitId: string,
  folderId: string,
  name: string,
) {
  const current = await db.query.folder.findFirst({
    where: and(eq(folder.id, folderId), eq(folder.unitId, unitId), notDeleted(folder)),
  });
  if (!current || current.name === name) return;
  const clash = await db.query.folder.findFirst({
    where: and(
      eq(folder.unitId, unitId),
      current.parentId === null ? isNull(folder.parentId) : eq(folder.parentId, current.parentId),
      eq(folder.name, name),
      notDeleted(folder),
    ),
  });
  if (clash) return;
  await db.update(folder).set({ name }).where(eq(folder.id, folderId));
}

// Pasta do item dentro da lista do grupo + estrutura opcional dentro dela.
export async function createItemFolder(
  db: DbOrTx,
  unitId: string,
  target: RegisterTarget,
  itemName: string,
  folderSchemaId?: string | null,
) {
  const baseId = await ensureGroupPath(db, unitId, target);
  const itemFolderId = await findOrCreateChild(db, unitId, baseId, itemName);
  if (folderSchemaId) {
    const selected = await findUnitSchemaOrThrow(db, unitId, folderSchemaId);
    await ensureFolderStructure(db, unitId, selected.structure, itemFolderId, selected.id);
  }
  return itemFolderId;
}
