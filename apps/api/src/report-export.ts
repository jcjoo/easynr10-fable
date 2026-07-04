import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import {
  actionStatusLabels,
  diagnosticStatusLabels,
  documentGroupLabels,
  documentSituationLabels,
  normalizeText,
  type DocumentGroup,
} from '@easynr10/shared';
import { auth } from './auth';
import { db } from './db';
import { env } from './env';
import { actionPlanRows, documentSituationRows, nonConformityRows } from './routers/reports';

// Exportação de relatórios (RF22) por rota HTTP própria: download com o
// cookie de sessão (link direto no browser), fora do envelope JSON do tRPC.
// CSV gerado aqui; PDF via Gotenberg (HTML → /forms/chromium/convert/html).

const { company, membership, unit } = schema;

interface Column {
  label: string;
  value: (row: Record<string, unknown>) => string;
}

function formatDate(value: unknown) {
  if (!value) return '';
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  // Datas puras (YYYY-MM-DD) sem passar por Date — evita o shift de fuso.
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const text = (key: string) => (row: Record<string, unknown>) => String(row[key] ?? '');
const date = (key: string) => (row: Record<string, unknown>) => formatDate(row[key]);

const reportDefs = {
  'nao-conformidades': {
    title: 'Relatório de Não Conformidades',
    fetch: (unitId: string) => nonConformityRows(unitId),
    columns: [
      { label: 'Norma', value: text('normCode') },
      { label: 'Exigência', value: text('normDescription') },
      { label: 'Peso', value: text('importanceWeight') },
      {
        label: 'Aderência',
        value: (row) =>
          row.status
            ? diagnosticStatusLabels[row.status as keyof typeof diagnosticStatusLabels]
            : 'Sem avaliação',
      },
      { label: 'Prazo', value: date('deadline') },
      { label: 'Responsável', value: text('responsible') },
      { label: 'Ação recomendada', value: text('recommendedAction') },
      { label: 'Última avaliação', value: date('lastDiagnosticAt') },
    ] satisfies Column[],
  },
  'situacao-documental': {
    title: 'Situação Documental do PIE',
    fetch: (unitId: string) => documentSituationRows(unitId),
    columns: [
      { label: 'Documento', value: text('name') },
      { label: 'Local', value: text('path') },
      {
        label: 'Grupo',
        value: (row) =>
          row.documentGroup ? documentGroupLabels[row.documentGroup as DocumentGroup] : '',
      },
      {
        label: 'Situação',
        value: (row) =>
          documentSituationLabels[row.situation as keyof typeof documentSituationLabels],
      },
      { label: 'Validade', value: date('expiresAt') },
      {
        label: 'Dias p/ vencer',
        value: (row) => (row.daysToExpiry == null ? '' : String(row.daysToExpiry)),
      },
      { label: 'Atualizado em', value: date('updatedAt') },
    ] satisfies Column[],
  },
  'plano-de-acao': {
    title: 'Plano de Ação',
    fetch: (unitId: string) => actionPlanRows(unitId, 'todas'),
    columns: [
      { label: 'Norma', value: text('normCode') },
      { label: 'Exigência', value: text('normDescription') },
      {
        label: 'Aderência',
        value: (row) =>
          diagnosticStatusLabels[row.adherence as keyof typeof diagnosticStatusLabels],
      },
      {
        label: 'Status',
        value: (row) =>
          `${actionStatusLabels[row.status as keyof typeof actionStatusLabels]}${row.overdue ? ' (prazo vencido)' : ''}`,
      },
      { label: 'Prazo', value: date('deadline') },
      { label: 'Responsável', value: text('responsible') },
      { label: 'Ação recomendada', value: text('recommendedAction') },
      { label: 'Concluída em', value: date('completedAt') },
    ] satisfies Column[],
  },
} as const;

export type ReportExportType = keyof typeof reportDefs;

// Mesmos filtros da tela de Relatórios (?status=&grupo=&q=) — o arquivo
// exportado espelha o que o usuário está vendo.
function applyFilters(
  type: ReportExportType,
  rows: Record<string, unknown>[],
  query: Record<string, string | undefined>,
) {
  const q = normalizeText(query.q ?? '').trim();
  const grupo = query.grupo;
  const status = query.status;

  return rows.filter((row) => {
    if (grupo && type !== 'plano-de-acao' && row.documentGroup !== grupo) return false;

    if (status) {
      if (type === 'nao-conformidades') {
        const rowStatus = row.status ?? 'sem_avaliacao';
        if (rowStatus !== status) return false;
      } else if (type === 'situacao-documental') {
        if (row.situation !== status) return false;
      } else {
        const pending = row.status === 'pendente' || row.status === 'em_andamento';
        if (status === 'pendencias' && !pending) return false;
        if (status === 'vencidas' && !row.overdue) return false;
        if (
          status !== 'pendencias' &&
          status !== 'vencidas' &&
          status !== 'todas' &&
          row.status !== status
        ) {
          return false;
        }
      }
    } else if (type === 'plano-de-acao') {
      // Sem filtro explícito, o relatório é o de pendências (default da tela).
      if (row.status !== 'pendente' && row.status !== 'em_andamento') return false;
    }

    if (q) {
      const haystack =
        type === 'situacao-documental'
          ? `${row.name} ${row.path}`
          : `${row.normCode} ${row.normDescription} ${row.responsible ?? ''}`;
      if (!normalizeText(haystack).includes(q)) return false;
    }
    return true;
  });
}

// CSV com BOM e ';' (Excel pt-BR abre direto com colunas separadas).
function toCsv(columns: readonly Column[], rows: Record<string, unknown>[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [
    columns.map((col) => escape(col.label)).join(';'),
    ...rows.map((row) => columns.map((col) => escape(col.value(row))).join(';')),
  ];
  return Buffer.from('\uFEFF' + lines.join('\r\n'));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toHtml(
  title: string,
  subtitle: string,
  columns: readonly Column[],
  rows: Record<string, unknown>[],
) {
  const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((col) => `<td>${escapeHtml(col.value(row))}</td>`).join('')}</tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 14mm 12mm; }
  body { font: 10px/1.45 Helvetica, Arial, sans-serif; color: #1a1d21; }
  header { display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 2px solid #1a1d21; padding-bottom: 6px; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0; }
  .brand { font-size: 10px; font-weight: bold; letter-spacing: .08em; text-transform: uppercase; }
  .sub { color: #555; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em;
    color: #555; border-bottom: 1.5px solid #1a1d21; padding: 4px 6px; }
  td { border-bottom: 0.5px solid #c9ccd1; padding: 4px 6px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .total { margin-top: 10px; color: #555; }
</style></head><body>
<header><div><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(subtitle)}</p></div>
<span class="brand">EasyNR10 · PSO Engenharia</span></header>
<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table>
<p class="total">${rows.length} registro${rows.length === 1 ? '' : 's'}.</p>
</body></html>`;
}

async function toPdf(html: string) {
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  const response = await fetch(`${env.GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Gotenberg respondeu ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function requestHeaders(request: FastifyRequest) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) for (const item of value) headers.append(key, item);
  }
  return headers;
}

export function registerReportExport(app: FastifyInstance) {
  app.get('/api/reports/export', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const type = query.type as ReportExportType | undefined;
    const format = query.format;
    const unitId = query.unitId;

    if (!type || !(type in reportDefs) || !unitId || (format !== 'csv' && format !== 'pdf')) {
      return reply.status(400).send({ error: 'Parâmetros inválidos' });
    }

    // Mesma regra do unitProcedure: admin ou membro da unidade (RNF02).
    const session = await auth.api.getSession({ headers: requestHeaders(request) });
    if (!session) return reply.status(401).send({ error: 'Não autenticado' });
    if (session.user.role !== 'admin') {
      const member = await db.query.membership.findFirst({
        where: and(
          eq(membership.unitId, unitId),
          eq(membership.userId, session.user.id),
          isNull(membership.deletedAt),
        ),
      });
      if (!member) return reply.status(403).send({ error: 'Sem acesso a esta unidade' });
    }

    const [unitRow] = await db
      .select({ unitName: unit.name, companyName: company.name })
      .from(unit)
      .innerJoin(company, eq(unit.companyId, company.id))
      .where(and(eq(unit.id, unitId), isNull(unit.deletedAt)));
    if (!unitRow) return reply.status(404).send({ error: 'Unidade não encontrada' });

    const def = reportDefs[type];
    const fetched = (await def.fetch(unitId)) as unknown as Record<string, unknown>[];
    const rows = applyFilters(type, fetched, query);
    const fileBase = `${type}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${fileBase}.csv"`);
      return reply.send(toCsv(def.columns, rows));
    }

    const subtitle = `${unitRow.companyName} — ${unitRow.unitName} · gerado em ${new Date().toLocaleDateString('pt-BR')}`;
    const pdf = await toPdf(toHtml(def.title, subtitle, def.columns, rows));
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${fileBase}.pdf"`);
    return reply.send(pdf);
  });
}
