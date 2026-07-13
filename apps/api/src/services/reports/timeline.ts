import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import {
  diagnosticStatusScore,
  timelineIntervals,
  type DiagnosticStatus,
} from '@easynr10/shared';

const { adequacyItem, diagnostic, norm } = schema;

// Evolução da aderência no tempo (relatório timeline do legado): varredura de
// diagnósticos por ponto — em cada data vale o último diagnóstico até ali.
// Itens ainda sem avaliação na data não entram na média (regra da v2).
export async function timelineSeries(
  db: Db,
  unitId: string,
  from: string,
  to: string,
  interval: (typeof timelineIntervals)[number],
) {
  const items = await db
    .select({ id: adequacyItem.id, importanceWeight: norm.importanceWeight })
    .from(adequacyItem)
    .innerJoin(norm, eq(adequacyItem.normId, norm.id))
    .where(
      and(
        eq(adequacyItem.unitId, unitId),
        eq(adequacyItem.isActive, true),
        notDeleted(adequacyItem),
      ),
    );

  const points: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && points.length < 400) {
    points.push(cursor.toISOString().slice(0, 10));
    if (interval === 'daily') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (interval === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  if (items.length === 0 || points.length === 0) {
    return points.map((date) => ({ date, percent: null as number | null, evaluated: 0 }));
  }

  // Todos os diagnósticos até o fim do período, mais antigos primeiro —
  // inclui a baseline anterior ao início (último estado conhecido).
  const events = await db
    .select({
      adequacyItemId: diagnostic.adequacyItemId,
      status: diagnostic.status,
      createdAt: diagnostic.createdAt,
    })
    .from(diagnostic)
    .where(
      and(
        inArray(
          diagnostic.adequacyItemId,
          items.map((item) => item.id),
        ),
        lte(diagnostic.createdAt, new Date(`${to}T23:59:59.999Z`)),
        notDeleted(diagnostic),
      ),
    )
    .orderBy(asc(diagnostic.createdAt));

  const weightById = new Map(items.map((item) => [item.id, item.importanceWeight]));
  const current = new Map<string, DiagnosticStatus>();
  let pointer = 0;

  return points.map((date) => {
    const pointEnd = Date.parse(`${date}T23:59:59.999Z`);
    while (pointer < events.length && events[pointer]!.createdAt.getTime() <= pointEnd) {
      current.set(events[pointer]!.adequacyItemId, events[pointer]!.status);
      pointer += 1;
    }
    let weightSum = 0;
    let scoreSum = 0;
    for (const [itemId, status] of current) {
      const weight = weightById.get(itemId) ?? 0;
      weightSum += weight;
      scoreSum += weight * diagnosticStatusScore[status];
    }
    return {
      date,
      percent: weightSum > 0 ? Math.round((scoreSum / weightSum) * 100) : null,
      evaluated: current.size,
    };
  });
}
