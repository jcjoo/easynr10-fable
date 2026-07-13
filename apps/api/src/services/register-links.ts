import { and, eq } from 'drizzle-orm';
import { notDeleted, schema, type DbOrTx } from '@easynr10/db';
import {
  defaultRegisterFields,
  normalizeText,
  type RegisterField,
  type RegisterTarget,
} from '@easynr10/shared';

const { document, employee, equipment, folder, registerDocumentLink } = schema;

// Resolução dos vínculos campo→documento dos cadastros (explícitos + auto).
// É A regra de "qual documento está vinculado a este item nesta coluna" — a
// tela de cadastros (registers.documentLinks) e a expansão de evidências do
// diagnóstico (expandCadastroRequirement) consomem o MESMO resolvedor; antes
// cada um tinha a própria query e o auto-vínculo divergia entre os módulos.

export interface ResolvedRegisterLink {
  /** `auto:<itemId>:<fieldKey>` nos auto-vínculos (não persistidos). */
  id: string;
  employeeId: string | null;
  equipmentId: string | null;
  fieldKey: string;
  documentId: string;
  documentName: string;
  documentFolderId: string | null;
  adherence: (typeof registerDocumentLink.$inferSelect)['adherence'];
  expiresAt: string | null;
  warnDaysBefore: number | null;
  auto: boolean;
}

// Um documento casa com o documento padrão de um campo quando tem o mesmo nome
// (sem acento/caixa), tolerando o sufixo por item da convenção do catálogo
// ("Nome - <item>", RF11). Casa contra o label exibido E o defaultDocName (nome
// do catálogo, quando difere). Exato ou prefixo "<nome> - " evita que "NR10
// Básico" case com "NR10 Básico Reciclagem" (que é o padrão de outro campo).
function docMatchesField(docName: string, field: RegisterField) {
  const doc = normalizeText(docName).trim();
  const names = [field.label, field.defaultDocName].filter((name): name is string => Boolean(name));
  return names.some((name) => {
    const n = normalizeText(name).trim();
    return doc === n || doc.startsWith(`${n} - `);
  });
}

export async function resolveRegisterDocumentLinks(
  db: DbOrTx,
  unitId: string,
  opts: { fieldKey?: string } = {},
): Promise<ResolvedRegisterLink[]> {
  const explicit = await db
    .select({
      id: registerDocumentLink.id,
      employeeId: registerDocumentLink.employeeId,
      equipmentId: registerDocumentLink.equipmentId,
      fieldKey: registerDocumentLink.fieldKey,
      documentId: registerDocumentLink.documentId,
      documentName: document.name,
      documentFolderId: document.folderId,
      adherence: registerDocumentLink.adherence,
      expiresAt: document.expiresAt,
      warnDaysBefore: document.warnDaysBefore,
    })
    .from(registerDocumentLink)
    .innerJoin(document, eq(registerDocumentLink.documentId, document.id))
    .innerJoin(folder, eq(document.folderId, folder.id))
    .where(
      and(
        eq(folder.unitId, unitId),
        ...(opts.fieldKey ? [eq(registerDocumentLink.fieldKey, opts.fieldKey)] : []),
        notDeleted(registerDocumentLink),
        // Documento excluído (ex.: cascata do delete de pasta) não pode
        // seguir aparecendo como evidência vinculada.
        notDeleted(document),
      ),
    );

  // Auto-vínculo: um documento com o nome do documento padrão do campo, na
  // pasta do item ou abaixo dela, é vinculado automaticamente. Não persiste —
  // reflete o estado atual da pasta; o vínculo manual sempre tem precedência.
  const [employees, equipments, folders, documents] = await Promise.all([
    db
      .select({
        id: employee.id,
        folderId: employee.folderId,
        nivelAutorizacao: employee.nivelAutorizacao,
        metadata: employee.metadata,
      })
      .from(employee)
      .where(and(eq(employee.unitId, unitId), notDeleted(employee))),
    db
      .select({
        id: equipment.id,
        type: equipment.type,
        folderId: equipment.folderId,
        metadata: equipment.metadata,
      })
      .from(equipment)
      .where(and(eq(equipment.unitId, unitId), notDeleted(equipment))),
    db
      .select({ id: folder.id, parentId: folder.parentId })
      .from(folder)
      .where(and(eq(folder.unitId, unitId), notDeleted(folder))),
    db
      .select({
        id: document.id,
        folderId: document.folderId,
        name: document.name,
        adherence: document.adherence,
        expiresAt: document.expiresAt,
        warnDaysBefore: document.warnDaysBefore,
      })
      .from(document)
      .innerJoin(folder, eq(document.folderId, folder.id))
      .where(and(eq(folder.unitId, unitId), notDeleted(document))),
  ]);

  // Subárvore de pastas a partir da pasta do item (RF18.3) + docs por pasta.
  const byParent = new Map<string, string[]>();
  for (const node of folders) {
    if (node.parentId) {
      byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
    }
  }
  const subtree = (rootId: string) => {
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) ids.push(...(byParent.get(ids[i]!) ?? []));
    return ids;
  };
  const docsByFolder = new Map<string, typeof documents>();
  for (const doc of documents) {
    docsByFolder.set(doc.folderId, [...(docsByFolder.get(doc.folderId) ?? []), doc]);
  }

  const covered = new Set(
    explicit.map((link) => `${link.employeeId ?? link.equipmentId}:${link.fieldKey}`),
  );
  const items = [
    ...employees.map((e) => ({
      kind: 'employee' as const,
      id: e.id,
      folderId: e.folderId,
      metadata: {
        ...e.metadata,
        ...(e.nivelAutorizacao ? { nivel_autorizacao: e.nivelAutorizacao } : {}),
      } as Record<string, string>,
      target: 'colaboradores' as RegisterTarget,
    })),
    ...equipments.map((q) => ({
      kind: 'equipment' as const,
      id: q.id,
      folderId: q.folderId,
      metadata: q.metadata,
      target: q.type as RegisterTarget,
    })),
  ];

  const auto = items.flatMap((item) => {
    if (!item.folderId) return [];
    const subtreeDocs = subtree(item.folderId).flatMap((fid) => docsByFolder.get(fid) ?? []);
    return (defaultRegisterFields[item.target] ?? [])
      .filter(
        (field) =>
          field.kind === 'document' &&
          (!opts.fieldKey || field.key === opts.fieldKey) &&
          !covered.has(`${item.id}:${field.key}`) &&
          // Colunas condicionadas (ex.: SEP) não se auto-vinculam se não se
          // aplicam ao item.
          (!field.requires || item.metadata?.[field.requires.fieldKey] === field.requires.value),
      )
      .flatMap((field) => {
        const match = subtreeDocs.find((doc) => docMatchesField(doc.name, field));
        if (!match) return [];
        return [
          {
            id: `auto:${item.id}:${field.key}`,
            employeeId: item.kind === 'employee' ? item.id : null,
            equipmentId: item.kind === 'equipment' ? item.id : null,
            fieldKey: field.key,
            documentId: match.id,
            documentName: match.name,
            documentFolderId: match.folderId,
            // Auto-vínculo não persiste nota própria: usa a do documento.
            adherence: match.adherence,
            expiresAt: match.expiresAt,
            warnDaysBefore: match.warnDaysBefore,
            auto: true,
          },
        ];
      });
  });

  return [...explicit.map((link) => ({ ...link, auto: false })), ...auto];
}
