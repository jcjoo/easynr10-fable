// Seed idempotente: empresa/unidade de exemplo + catálogos (documentos
// padrão, esquema de pastas, normas NR-10). Roda no boot do container da
// API (Dockerfile) ou manualmente via `bun run db:seed`.
// O usuário admin é criado pela API no primeiro boot (apps/api/src/bootstrap-admin.ts).
import { createDb } from './index';
import {
  company,
  defaultDocument,
  folderSchema,
  norm,
  normNc,
  normRequirement,
  unit,
  type FolderSchemaNode,
} from './schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { DocumentGroup, RequirementType } from '@easynr10/shared';
import defaultDocuments from './seeds/default-documents.json';
import defaultFolderSchema from './seeds/default-folder-schema.json';
import norms from './seeds/norms.json';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

const db = createDb(databaseUrl);

const [pso] = await db
  .insert(company)
  .values({ name: 'PSO Engenharia (exemplo)' })
  .onConflictDoNothing()
  .returning();

if (pso) {
  await db
    .insert(unit)
    .values({ companyId: pso.id, name: 'Unidade Matriz' })
    .onConflictDoNothing();
  console.log(`Seed: empresa "${pso.name}" criada com unidade exemplo.`);
} else {
  console.log('Seed: empresa exemplo já existente.');
}

const inserted = await db
  .insert(defaultDocument)
  .values(
    (defaultDocuments as { name: string; documentGroup: DocumentGroup; isOptional: boolean }[]).map(
      (doc) => ({
        name: doc.name,
        documentGroup: doc.documentGroup,
        isOptional: doc.isOptional,
      }),
    ),
  )
  .onConflictDoNothing()
  .returning();
console.log(`Seed: ${inserted.length} documentos padrão inseridos.`);

// Esquema de pastas padrão (portado do legado)
const existingSchema = await db.query.folderSchema.findFirst({
  where: eq(folderSchema.isDefault, true),
});
if (!existingSchema) {
  await db.insert(folderSchema).values({
    name: 'Prontuário NR-10 (padrão)',
    structure: defaultFolderSchema as FolderSchemaNode[],
    isDefault: true,
  });
  console.log('Seed: esquema de pastas padrão criado.');
} else {
  console.log('Seed: esquema de pastas padrão já existente.');
}

// Catálogo de normas NR-10 + requisitos de evidência (portado do legado).
// Cada linha da planilha é um REQUISITO do item, com as próprias NCs — por
// isso as NCs vêm aninhadas no requisito (itens como 10.2.4b têm 2 requisitos,
// cada um com sua lista).
type NcSeed = { code: string; description: string; recommendedAction: string };
type NormSeed = {
  code: string;
  description: string;
  orientation: string;
  documentGroup: DocumentGroup;
  importanceWeight: number;
  requirements: { type: RequirementType; question: string; ncs: NcSeed[] }[];
};

async function insertRequirementNcs(
  normId: string,
  normRequirementId: string | null,
  ncs: NcSeed[],
) {
  if (ncs.length === 0) return;
  await db.insert(normNc).values(
    ncs.map((nc) => ({
      normId,
      normRequirementId,
      code: nc.code,
      description: nc.description,
      recommendedAction: nc.recommendedAction,
    })),
  );
}

let normCount = 0;
for (const item of norms as NormSeed[]) {
  const exists = await db.query.norm.findFirst({ where: eq(norm.code, item.code) });
  if (exists) continue;
  const [created] = await db
    .insert(norm)
    .values({
      code: item.code,
      description: item.description,
      orientation: item.orientation,
      documentGroup: item.documentGroup,
      importanceWeight: item.importanceWeight,
    })
    .returning();
  for (const req of item.requirements) {
    const [createdReq] = await db
      .insert(normRequirement)
      .values({ normId: created!.id, type: req.type, question: req.question })
      .returning();
    await insertRequirementNcs(created!.id, createdReq!.id, req.ncs);
  }
  normCount += 1;
}
console.log(`Seed: ${normCount} normas NR-10 inseridas.`);

// NCs do catálogo em bancos que já tinham as normas: passada idempotente —
// quando o conjunto ativo difere do catálogo (norma sem NC, seed antigo que
// perdia as NCs dos itens multi-requisito, ou NC ainda sem vínculo com o
// requisito), recria as NCs da norma ligadas ao requisito de origem.
let ncCount = 0;
for (const item of norms as NormSeed[]) {
  const wanted = item.requirements.reduce((total, req) => total + req.ncs.length, 0);
  if (wanted === 0) continue;
  const existing = await db.query.norm.findFirst({ where: eq(norm.code, item.code) });
  if (!existing) continue;
  const current = await db
    .select({ id: normNc.id, normRequirementId: normNc.normRequirementId })
    .from(normNc)
    .where(and(eq(normNc.normId, existing.id), isNull(normNc.deletedAt)));
  const upToDate = current.length === wanted && current.every((nc) => nc.normRequirementId);
  if (upToDate) continue;

  await db.update(normNc).set({ deletedAt: new Date() }).where(eq(normNc.normId, existing.id));
  const reqRows = await db
    .select({ id: normRequirement.id, question: normRequirement.question })
    .from(normRequirement)
    .where(and(eq(normRequirement.normId, existing.id), isNull(normRequirement.deletedAt)));
  const reqByQuestion = new Map(reqRows.map((row) => [row.question, row.id]));
  for (const req of item.requirements) {
    await insertRequirementNcs(existing.id, reqByQuestion.get(req.question) ?? null, req.ncs);
  }
  ncCount += wanted;
}
if (ncCount > 0) console.log(`Seed: ${ncCount} não conformidades do catálogo (re)inseridas.`);

process.exit(0);
