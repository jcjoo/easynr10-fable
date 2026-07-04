import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Download, Search, X } from 'lucide-react';
import {
  actionStatusLabels,
  compareNormCodes,
  diagnosticStatusLabels,
  diagnosticStatusScore,
  documentGroupLabels,
  documentGroups,
  documentSituationLabels,
  documentSituations,
  normalizeText,
  type ActionStatus,
  type DiagnosticStatus,
  type DocumentGroup,
  type DocumentSituation,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page } from '@/components/ui/page';
import { StatusPill } from '@/components/ui/status-pill';
import {
  SortableTh,
  sortRows,
  toggleSort,
  type SortDir,
  type SortValue,
} from '@/components/ui/sortable';

// Seção de relatórios analíticos (RF21) com exportação CSV/PDF (RF22).
// Relatório ativo, filtros e ordenação vivem na URL
// (?tipo=&status=&grupo=&q=&ord=&dir=) — o export espelha os filtros.

export const reportTabs = ['nao-conformidades', 'situacao-documental', 'plano-de-acao'] as const;
export type ReportTab = (typeof reportTabs)[number];

export interface ReportSearch {
  tipo?: ReportTab;
  status?: string;
  grupo?: DocumentGroup;
  q?: string;
  ord?: string;
  dir?: SortDir;
}

const tabLabels: Record<ReportTab, string> = {
  'nao-conformidades': 'Não Conformidades',
  'situacao-documental': 'Situação Documental',
  'plano-de-acao': 'Plano de Ação',
};

const tabDescriptions: Record<ReportTab, string> = {
  'nao-conformidades':
    'Itens de adequação ativos com aderência abaixo de Plena, incluindo os ainda sem avaliação.',
  'situacao-documental': 'Todos os documentos do PIE com local, validade e situação.',
  'plano-de-acao': 'Ações geradas pelos diagnósticos, com prazo e responsável.',
};

// Chips de status das não conformidades (Plena não aparece — está fora do relatório).
const ncStatuses = ['sem_avaliacao', 'inexistente', 'inadequada', 'parcial', 'suficiente'] as const;

const td = 'border-b border-line px-3.5 py-2.5 align-top';

function formatDate(value: string | Date | null) {
  if (!value) return '—';
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const situationStyles: Record<DocumentSituation, string> = {
  vencido: 'text-bad bg-bad-soft',
  a_vencer: 'text-warn bg-warn-soft',
  em_dia: 'text-ok bg-ok-soft',
  sem_validade: 'text-idle bg-idle-soft',
};

const actionStyles: Record<ActionStatus, string> = {
  pendente: 'text-idle bg-idle-soft',
  em_andamento: 'text-warn bg-warn-soft',
  concluida: 'text-ok bg-ok-soft',
  cancelada: 'text-muted bg-idle-soft',
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-ui text-[12.5px] font-semibold ${className}`}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {label}
    </span>
  );
}

export function RelatoriosPage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId/relatorios' });
  const search = useSearch({ from: '/_authed/$companyId/$unitId/relatorios' });
  const navigate = useNavigate();
  const tab: ReportTab = search.tipo ?? 'nao-conformidades';
  const q = search.q ?? '';
  const qNorm = normalizeText(q).trim();

  const nonConformities = useQuery({
    ...trpc.reports.nonConformities.queryOptions({ unitId }),
    enabled: tab === 'nao-conformidades',
  });
  const documents = useQuery({
    ...trpc.reports.documentsSituation.queryOptions({ unitId }),
    enabled: tab === 'situacao-documental',
  });
  const actions = useQuery({
    ...trpc.reports.actionPlan.queryOptions({ unitId, scope: 'todas' }),
    enabled: tab === 'plano-de-acao',
  });

  function setSearch(next: ReportSearch) {
    navigate({
      to: '/$companyId/$unitId/relatorios',
      params: { companyId, unitId },
      search: next,
    });
  }
  // Mantém os demais filtros e troca só as chaves passadas.
  function patchSearch(patch: Partial<ReportSearch>) {
    setSearch({ ...search, tipo: tab, ...patch });
  }
  function onSort(defaultOrd: string) {
    return (key: string) => patchSearch(toggleSort(search, key, defaultOrd));
  }

  const dir: SortDir = search.dir ?? 'asc';

  // — Filtros + ordenação por relatório (contadores dos chips consideram
  //   busca e grupo, mas não o próprio status — padrão do Diagnóstico) —

  const matchesQ = (haystack: string) => !qNorm || normalizeText(haystack).includes(qNorm);

  // Não Conformidades
  const ncBase = (nonConformities.data ?? []).filter(
    (row) =>
      (!search.grupo || row.documentGroup === search.grupo) &&
      matchesQ(`${row.normCode} ${row.normDescription} ${row.responsible ?? ''}`),
  );
  const ncFiltered = ncBase.filter(
    (row) => !search.status || (row.status ?? 'sem_avaliacao') === search.status,
  );
  const ncOrd = search.ord ?? 'norma';
  type NcRow = (typeof ncFiltered)[number];
  const ncAccessors: Record<string, (r: NcRow) => SortValue> = {
    norma: (r) => r.normCode,
    exigencia: (r) => normalizeText(r.normDescription),
    peso: (r) => r.importanceWeight,
    aderencia: (r) => (r.status ? diagnosticStatusScore[r.status] : -1),
    prazo: (r) => r.deadline,
    responsavel: (r) => (r.responsible ? normalizeText(r.responsible) : null),
    avaliacao: (r) => (r.lastDiagnosticAt ? new Date(r.lastDiagnosticAt).getTime() : null),
  };
  const ncSorted = sortRows(
    ncFiltered,
    ncAccessors[ncOrd] ?? ncAccessors.norma!,
    dir,
    ncOrd === 'norma' ? compareNormCodes : undefined,
  );

  // Situação Documental
  const docBase = (documents.data ?? []).filter(
    (row) =>
      (!search.grupo || row.documentGroup === search.grupo) &&
      matchesQ(`${row.name} ${row.path}`),
  );
  const docFiltered = docBase.filter((row) => !search.status || row.situation === search.status);
  const docOrd = search.ord ?? 'documento';
  type DocRow = (typeof docFiltered)[number];
  const docAccessors: Record<string, (r: DocRow) => SortValue> = {
    documento: (r) => normalizeText(r.name),
    local: (r) => normalizeText(r.path),
    grupo: (r) => (r.documentGroup ? normalizeText(documentGroupLabels[r.documentGroup]) : null),
    situacao: (r) => documentSituations.indexOf(r.situation),
    validade: (r) => r.expiresAt,
    dias: (r) => r.daysToExpiry,
  };
  const docSorted = sortRows(docFiltered, docAccessors[docOrd] ?? docAccessors.documento!, dir);

  // Plano de Ação (default = pendências; chips para os demais recortes)
  const planStatus = search.status ?? 'pendencias';
  const planBase = (actions.data ?? []).filter((row) =>
    matchesQ(`${row.normCode} ${row.normDescription} ${row.responsible ?? ''}`),
  );
  const isPending = (row: (typeof planBase)[number]) =>
    row.status === 'pendente' || row.status === 'em_andamento';
  const planFiltered = planBase.filter((row) => {
    if (planStatus === 'todas') return true;
    if (planStatus === 'pendencias') return isPending(row);
    if (planStatus === 'vencidas') return row.overdue;
    return row.status === planStatus;
  });
  const planOrd = search.ord ?? 'prazo';
  type PlanRow = (typeof planFiltered)[number];
  const actionRank = (row: PlanRow) =>
    row.overdue ? 0 : { pendente: 1, em_andamento: 2, concluida: 3, cancelada: 4 }[row.status];
  const planAccessors: Record<string, (r: PlanRow) => SortValue> = {
    norma: (r) => r.normCode,
    exigencia: (r) => normalizeText(r.normDescription),
    aderencia: (r) => diagnosticStatusScore[r.adherence],
    status: (r) => actionRank(r),
    prazo: (r) => r.deadline,
    responsavel: (r) => (r.responsible ? normalizeText(r.responsible) : null),
  };
  const planSorted = sortRows(
    planFiltered,
    planAccessors[planOrd] ?? planAccessors.prazo!,
    dir,
    planOrd === 'norma' ? compareNormCodes : undefined,
  );

  const total =
    tab === 'nao-conformidades'
      ? ncSorted.length
      : tab === 'situacao-documental'
        ? docSorted.length
        : planSorted.length;
  const loaded =
    tab === 'nao-conformidades'
      ? nonConformities.data
      : tab === 'situacao-documental'
        ? documents.data
        : actions.data;

  const exportUrl = (format: 'csv' | 'pdf') => {
    const params = new URLSearchParams({ unitId, type: tab, format });
    if (search.status) params.set('status', search.status);
    if (search.grupo) params.set('grupo', search.grupo);
    if (qNorm) params.set('q', q);
    return `/api/reports/export?${params}`;
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-ui text-[13px]
     font-semibold cursor-pointer ${
       active
         ? 'border-ink bg-ink text-paper'
         : 'border-line-strong bg-surface text-ink-soft hover:border-ink-soft'
     }`;
  const smallChip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-ui text-[12.5px]
     font-semibold cursor-pointer ${
       active
         ? 'border-ink bg-ink text-paper'
         : 'border-line-strong bg-surface text-ink-soft hover:border-ink-soft'
     }`;
  const countBadge = (active: boolean, totalCount: number) => (
    <span
      className={`tabular rounded-full px-1.5 font-mono text-[11px] ${
        active ? 'bg-paper/20' : 'bg-paper text-muted'
      }`}
    >
      {totalCount}
    </span>
  );

  const exportButton =
    'inline-flex items-center gap-2 rounded-ctl px-4 py-2 font-ui text-sm font-semibold ' +
    'leading-snug cursor-pointer bg-surface text-ink border border-line-strong hover:bg-paper';

  // Chips de status com contadores por relatório.
  let statusChips: { value: string | null; label: string; count: number }[] = [];
  if (tab === 'nao-conformidades') {
    statusChips = [
      { value: null, label: 'Todas', count: ncBase.length },
      ...ncStatuses.map((value) => ({
        value: value as string,
        label:
          value === 'sem_avaliacao'
            ? 'Sem avaliação'
            : diagnosticStatusLabels[value as DiagnosticStatus],
        count: ncBase.filter((row) => (row.status ?? 'sem_avaliacao') === value).length,
      })),
    ];
  } else if (tab === 'situacao-documental') {
    statusChips = [
      { value: null, label: 'Todos', count: docBase.length },
      ...documentSituations.map((value) => ({
        value: value as string,
        label: documentSituationLabels[value],
        count: docBase.filter((row) => row.situation === value).length,
      })),
    ];
  } else {
    statusChips = [
      { value: null, label: 'Pendências', count: planBase.filter(isPending).length },
      { value: 'vencidas', label: 'Prazo vencido', count: planBase.filter((r) => r.overdue).length },
      {
        value: 'concluida',
        label: 'Concluídas',
        count: planBase.filter((r) => r.status === 'concluida').length,
      },
      {
        value: 'cancelada',
        label: 'Canceladas',
        count: planBase.filter((r) => r.status === 'cancelada').length,
      },
      { value: 'todas', label: 'Todas', count: planBase.length },
    ];
  }
  const activeStatus = search.status ?? null;

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Relatórios</p>
          <h1 className="text-[28px] font-bold tracking-tight">{tabLabels[tab]}</h1>
        </div>
        <div className="flex gap-2">
          <a href={exportUrl('csv')} download className={exportButton}>
            <Download aria-hidden className="size-4" /> CSV
          </a>
          <a href={exportUrl('pdf')} download className={exportButton}>
            <Download aria-hidden className="size-4" /> PDF
          </a>
        </div>
      </div>

      <div role="group" aria-label="Escolher relatório" className="flex flex-wrap gap-1.5">
        {reportTabs.map((value) => (
          <button
            key={value}
            type="button"
            className={chip(tab === value)}
            onClick={() => setSearch({ tipo: value })}
          >
            {tabLabels[value]}
          </button>
        ))}
      </div>

      {/* Filtros: busca + grupo + status (uma linha, quebram em telas menores) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            placeholder={tab === 'situacao-documental' ? 'Buscar documento ou local…' : 'Buscar norma, exigência ou responsável…'}
            aria-label="Buscar no relatório"
            value={q}
            onChange={(e) => patchSearch({ q: e.target.value || undefined })}
            className="w-72 rounded-ctl border border-line-strong bg-surface py-1.5 pl-8 pr-2.5 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
          />
        </div>

        {tab !== 'plano-de-acao' && (
          <select
            aria-label="Filtrar por grupo documental"
            value={search.grupo ?? ''}
            onChange={(e) =>
              patchSearch({ grupo: (e.target.value || undefined) as DocumentGroup | undefined })
            }
            className="rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-sm"
          >
            <option value="">Todos os grupos</option>
            {documentGroups.map((group) => (
              <option key={group} value={group}>
                {documentGroupLabels[group]}
              </option>
            ))}
          </select>
        )}

        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
          {statusChips.map(({ value, label, count }) => {
            const active = activeStatus === value;
            return (
              <button
                key={value ?? 'todos'}
                type="button"
                className={smallChip(active)}
                onClick={() => patchSearch({ status: value ?? undefined })}
              >
                {label}
                {countBadge(active, count)}
              </button>
            );
          })}
        </div>

        {(search.status || search.grupo || qNorm) && (
          <button
            type="button"
            onClick={() => setSearch({ tipo: tab, ord: search.ord, dir: search.dir })}
            className="flex cursor-pointer items-center gap-1 font-ui text-[12.5px] font-medium text-muted hover:text-ink"
          >
            <X aria-hidden className="size-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        {tabDescriptions[tab]}
        {loaded && (
          <span className="font-mono text-[12px]">
            {' '}
            · {total} de {loaded.length} registro{loaded.length === 1 ? '' : 's'}
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        {tab === 'nao-conformidades' && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {(
                  [
                    ['norma', 'Norma'],
                    ['exigencia', 'Exigência'],
                    ['peso', 'Peso'],
                    ['aderencia', 'Aderência'],
                    ['prazo', 'Prazo'],
                    ['responsavel', 'Responsável'],
                    ['avaliacao', 'Última avaliação'],
                  ] as const
                ).map(([key, label]) => (
                  <SortableTh
                    key={key}
                    colKey={key}
                    label={label}
                    ord={ncOrd}
                    dir={dir}
                    onSort={onSort('norma')}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {ncSorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3.5 py-10 text-center text-muted">
                    {ncBase.length === 0 && !qNorm && !search.grupo
                      ? 'Nenhuma não conformidade — todos os itens ativos estão com aderência Plena. 🎉'
                      : 'Nenhum item com esses filtros.'}
                  </td>
                </tr>
              )}
              {ncSorted.map((row) => (
                <tr key={row.id} className="hover:bg-paper">
                  <td className={td}>
                    <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-[12.5px] text-action">
                      {row.normCode}
                    </span>
                  </td>
                  <td className={`${td} w-full`}>
                    <span className="line-clamp-2">{row.normDescription}</span>
                  </td>
                  <td className={`${td} tabular font-mono text-[13px]`}>{row.importanceWeight}</td>
                  <td className={td}>
                    <StatusPill status={row.status ?? 'sem_avaliacao'} />
                  </td>
                  <td className={`${td} tabular font-mono text-[13px]`}>{formatDate(row.deadline)}</td>
                  <td className={td}>{row.responsible ?? '—'}</td>
                  <td className={`${td} tabular font-mono text-[13px]`}>
                    {row.lastDiagnosticAt ? formatDate(new Date(row.lastDiagnosticAt)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'situacao-documental' && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {(
                  [
                    ['documento', 'Documento'],
                    ['local', 'Local'],
                    ['grupo', 'Grupo'],
                    ['situacao', 'Situação'],
                    ['validade', 'Validade'],
                    ['dias', 'Dias'],
                  ] as const
                ).map(([key, label]) => (
                  <SortableTh
                    key={key}
                    colKey={key}
                    label={label}
                    ord={docOrd}
                    dir={dir}
                    onSort={onSort('documento')}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {docSorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-muted">
                    {docBase.length === 0 && !qNorm && !search.grupo
                      ? 'Nenhum documento no PIE desta unidade.'
                      : 'Nenhum documento com esses filtros.'}
                  </td>
                </tr>
              )}
              {docSorted.map((row) => (
                <tr key={row.id} className="hover:bg-paper">
                  <td className={`${td} font-medium`}>{row.name}</td>
                  <td className={`${td} max-w-80`}>
                    <span className="line-clamp-1 text-muted" title={row.path}>
                      {row.path}
                    </span>
                  </td>
                  <td className={td}>
                    {row.documentGroup ? documentGroupLabels[row.documentGroup] : '—'}
                  </td>
                  <td className={td}>
                    <Pill
                      label={documentSituationLabels[row.situation]}
                      className={situationStyles[row.situation]}
                    />
                  </td>
                  <td className={`${td} tabular font-mono text-[13px]`}>{formatDate(row.expiresAt)}</td>
                  <td className={`${td} tabular font-mono text-[13px]`}>
                    {row.daysToExpiry == null ? '—' : row.daysToExpiry}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'plano-de-acao' && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {(
                  [
                    ['norma', 'Norma'],
                    ['exigencia', 'Exigência'],
                    ['aderencia', 'Aderência'],
                    ['status', 'Status'],
                    ['prazo', 'Prazo'],
                    ['responsavel', 'Responsável'],
                  ] as const
                ).map(([key, label]) => (
                  <SortableTh
                    key={key}
                    colKey={key}
                    label={label}
                    ord={planOrd}
                    dir={dir}
                    onSort={onSort('prazo')}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {planSorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-muted">
                    {planBase.length === 0 && !qNorm
                      ? 'Nenhuma ação no plano desta unidade.'
                      : 'Nenhuma ação com esses filtros.'}
                  </td>
                </tr>
              )}
              {planSorted.map((row) => (
                <tr key={row.id} className="hover:bg-paper">
                  <td className={td}>
                    <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-[12.5px] text-action">
                      {row.normCode}
                    </span>
                  </td>
                  <td className={`${td} w-full`}>
                    <span className="line-clamp-2">{row.normDescription}</span>
                  </td>
                  <td className={td}>
                    <StatusPill status={row.adherence} />
                  </td>
                  <td className={td}>
                    {row.overdue ? (
                      <Pill label="Prazo vencido" className="text-bad bg-bad-soft" />
                    ) : (
                      <Pill label={actionStatusLabels[row.status]} className={actionStyles[row.status]} />
                    )}
                  </td>
                  <td className={`${td} tabular font-mono text-[13px]`}>{formatDate(row.deadline)}</td>
                  <td className={td}>{row.responsible ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  );
}
