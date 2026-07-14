import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';

const { adequacyItem, adequacyItemNc, adequacyItemRequirement, normNc, normRequirement } = schema;

// Helpers compartilhados pelos módulos do router de adequação.

export async function findUnitAdequacyItem(db: Db, unitId: string, adequacyItemId: string) {
  const found = await db.query.adequacyItem.findFirst({
    where: and(
      eq(adequacyItem.id, adequacyItemId),
      eq(adequacyItem.unitId, unitId),
      notDeleted(adequacyItem),
    ),
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Item de adequação não encontrado' });
  }
  return found;
}

// Copia os requisitos do catálogo (norm_requirement) para o item UMA vez —
// como o evento adequacyItem.created do legado, mas lazy (itens antigos
// ganham os requisitos no primeiro acesso). Conta também os excluídos para
// não ressuscitar requisitos que o consultor removeu.
export async function ensureItemRequirements(db: Db, item: { id: string; normId: string }) {
  const [existing] = await db
    .select({ total: count() })
    .from(adequacyItemRequirement)
    .where(eq(adequacyItemRequirement.adequacyItemId, item.id));
  if ((existing?.total ?? 0) > 0) return;

  const templates = await db
    .select({ type: normRequirement.type, question: normRequirement.question })
    .from(normRequirement)
    .where(and(eq(normRequirement.normId, item.normId), notDeleted(normRequirement)));
  if (templates.length === 0) return;

  await db.insert(adequacyItemRequirement).values(
    templates.map((template) => ({
      adequacyItemId: item.id,
      type: template.type,
      question: template.question,
    })),
  );
}

// Copia as NCs do catálogo (norm_nc) para o item UMA vez — mesma mecânica
// lazy do ensureItemRequirements (rodar DEPOIS dele: o vínculo usa os
// requisitos do item). Cada NC nasce ligada ao requisito do item copiado do
// MESMO requisito do catálogo (casado pela pergunta — a cópia preserva o
// texto), implicando Inexistente ("ausência de…", padrão da planilha).
export async function ensureItemNcs(db: Db, item: { id: string; normId: string }) {
  const [existing] = await db
    .select({ total: count() })
    .from(adequacyItemNc)
    .where(eq(adequacyItemNc.adequacyItemId, item.id));
  if ((existing?.total ?? 0) > 0) return;

  const templates = await db
    .select({
      code: normNc.code,
      description: normNc.description,
      recommendedAction: normNc.recommendedAction,
      requirementQuestion: normRequirement.question,
    })
    .from(normNc)
    .leftJoin(normRequirement, eq(normNc.normRequirementId, normRequirement.id))
    .where(and(eq(normNc.normId, item.normId), notDeleted(normNc)));
  if (templates.length === 0) return;

  const requirements = await db
    .select({ id: adequacyItemRequirement.id, question: adequacyItemRequirement.question })
    .from(adequacyItemRequirement)
    .where(
      and(
        eq(adequacyItemRequirement.adequacyItemId, item.id),
        notDeleted(adequacyItemRequirement),
      ),
    );
  const byQuestion = new Map(requirements.map((req) => [req.question, req.id]));
  // NC sem requisito de origem (catálogo antigo/custom): cai no requisito
  // único do item, se houver — senão fica solta para vincular na tela.
  const fallback = requirements.length === 1 ? requirements[0]!.id : null;

  await db.insert(adequacyItemNc).values(
    templates.map((template) => ({
      adequacyItemId: item.id,
      requirementId:
        (template.requirementQuestion
          ? byQuestion.get(template.requirementQuestion)
          : undefined) ?? fallback,
      code: template.code,
      description: template.description,
      recommendedAction: template.recommendedAction,
      adherence: 'inexistente' as const,
    })),
  );
}
