// Seed de desenvolvimento: empresa/unidade de exemplo + catálogo de
// documentos padrão (portado do sistema legado).
// O usuário admin é criado via better-auth na primeira execução da API (ver apps/api).
import { createDb } from './index';
import {
  company,
  defaultDocument,
  folderSchema,
  norm,
  normRequirement,
  unit,
  type FolderSchemaNode,
} from './schema';
import { eq } from 'drizzle-orm';
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

// Catálogo de normas NR-10 + requisitos de evidência (portado do legado)
type NormSeed = {
  code: string;
  description: string;
  orientation: string;
  documentGroup: DocumentGroup;
  importanceWeight: number;
  requirements: { type: RequirementType; question: string }[];
};
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
  if (item.requirements.length > 0) {
    await db.insert(normRequirement).values(
      item.requirements.map((req) => ({
        normId: created!.id,
        type: req.type,
        question: req.question,
      })),
    );
  }
  normCount += 1;
}
console.log(`Seed: ${normCount} normas NR-10 inseridas.`);

process.exit(0);
