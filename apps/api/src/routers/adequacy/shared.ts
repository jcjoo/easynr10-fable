import { TRPCError } from '@trpc/server';
import { and, count, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from '../../db';

const { adequacyItem, adequacyItemRequirement, normRequirement } = schema;

// Helpers compartilhados pelos módulos do router de adequação.

export async function findUnitAdequacyItem(unitId: string, adequacyItemId: string) {
  const found = await db.query.adequacyItem.findFirst({
    where: and(
      eq(adequacyItem.id, adequacyItemId),
      eq(adequacyItem.unitId, unitId),
      isNull(adequacyItem.deletedAt),
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
export async function ensureItemRequirements(item: { id: string; normId: string }) {
  const [existing] = await db
    .select({ total: count() })
    .from(adequacyItemRequirement)
    .where(eq(adequacyItemRequirement.adequacyItemId, item.id));
  if ((existing?.total ?? 0) > 0) return;

  const templates = await db
    .select({ type: normRequirement.type, question: normRequirement.question })
    .from(normRequirement)
    .where(and(eq(normRequirement.normId, item.normId), isNull(normRequirement.deletedAt)));
  if (templates.length === 0) return;

  await db.insert(adequacyItemRequirement).values(
    templates.map((template) => ({
      adequacyItemId: item.id,
      type: template.type,
      question: template.question,
    })),
  );
}
