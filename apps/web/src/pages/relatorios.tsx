import { Td } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Download, Search, X } from 'lucide-react';
import {
  actionPriorities,
  compareNormCodes,
  diagnosticStatusLabels,
  diagnosticStatusScore,
  documentGroupLabels,
  documentGroups,
  documentSituationLabels,
  documentSituations,
  normalizeText,
  type DiagnosticStatus,
  type DocumentGroup,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@easynr10/shared';
import { Page, PageTitle } from '@/components/ui/page';
import { FilterChips, type FilterChipOption } from '@/components/ui/filter-chips';
import {
  ActionStatusPill,
  PriorityPill,
  SituationPill,
  StatusPill,
  adherenceDots,
  situationDots,
} from '@/components/ui/status-pill';
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
    'Não conformidades geradas pelo último diagnóstico de cada item ativo, com a ação recomendada correspondente.',
  'situacao-documental': 'Todos os documentos do P.I.E com local, validade e situação.',
  'plano-de-acao': 'Ações geradas pelos diagnósticos, com prazo e responsável.',
};

// Chips de nota das NCs (Plena não gera NC — está fora do relatório).
const ncStatuses = ['inexistente', 'inadequada', 'parcial', 'suficiente'] as const;


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
  //   busca e grupo, mas não o próprio status — padrão do Diagnóstico).
  //   Chips de status COMPÕEM (união): ?status=a,b na URL. —

  const statusTokens = (search.status ?? '').split(',').filter(Boolean);
  const hasStatus = (value: string) => statusTokens.includes(value);

  const matchesQ = (haystack: string) => !qNorm || normalizeText(haystack).includes(qNorm);

  // Não Conformidades (geradas pelo último diagnóstico de cada item)
  const ncBase = (nonConformities.data ?? []).filter(
    (row) =>
      (!search.grupo || row.documentGroup === search.grupo) &&
      matchesQ(
        `${row.normCode} ${row.code} ${row.description} ${row.requirementQuestion} ${row.itemLabel ?? ''}`,
      ),
  );
  const ncFiltered = ncBase.filter(
    (row) => statusTokens.length === 0 || hasStatus(row.adherence),
  );
  const ncOrd = search.ord ?? 'norma';
  type NcRow = (typeof ncFiltered)[number];
  const ncAccessors: Record<string, (r: NcRow) => SortValue> = {
    norma: (r) => r.normCode,
    codigo: (r) => r.code,
    descricao: (r) => normalizeText(r.description),
    nota: (r) => diagnosticStatusScore[r.adherence],
    acao: (r) => normalizeText(r.recommendedAction),
    diagnostico: (r) => new Date(r.diagnosticAt).getTime(),
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
  const docFiltered = docBase.filter(
    (row) => statusTokens.length === 0 || hasStatus(row.situation),
  );
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

  // Plano de Ação (default = pendências; 'todas' é exclusivo, o resto compõe)
  const planBase = (actions.data ?? []).filter((row) =>
    matchesQ(`${row.normCode} ${row.normDescription} ${row.responsible ?? ''}`),
  );
  const isPending = (row: (typeof planBase)[number]) =>
    row.status === 'pendente' || row.status === 'em_andamento';
  const planFiltered = planBase.filter((row) => {
    if (statusTokens.length === 0) return isPending(row);
    return statusTokens.some((token) => {
      if (token === 'todas') return true;
      if (token === 'vencidas') return row.overdue;
      return row.status === token;
    });
  });
  const planOrd = search.ord ?? 'prazo';
  type PlanRow = (typeof planFiltered)[number];
  const actionRank = (row: PlanRow) =>
    row.overdue ? 0 : { pendente: 1, em_andamento: 2, concluida: 3, cancelada: 4 }[row.status];
  const planAccessors: Record<string, (r: PlanRow) => SortValue> = {
    norma: (r) => r.normCode,
    exigencia: (r) => normalizeText(r.normDescription),
    prioridade: (r) => actionPriorities.indexOf(r.priority),
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

  const exportButton =
    'inline-flex items-center gap-2 rounded-ctl px-4 py-2 font-ui text-sm font-semibold ' +
    'leading-snug cursor-pointer bg-surface text-ink border border-line-strong hover:bg-paper';

  // Chips de status com contadores por relatório (ponto na cor da pill).
  let statusChips: FilterChipOption[] = [];
  if (tab === 'nao-conformidades') {
    statusChips = [
      { value: null, label: 'Todas', count: ncBase.length, dot: 'bg-line-strong' },
      ...ncStatuses.map((value) => ({
        value: value as string,
        label: diagnosticStatusLabels[value as DiagnosticStatus],
        count: ncBase.filter((row) => row.adherence === value).length,
        dot: adherenceDots[value],
      })),
    ];
  } else if (tab === 'situacao-documental') {
    statusChips = [
      { value: null, label: 'Todos', count: docBase.length, dot: 'bg-line-strong' },
      ...documentSituations.map((value) => ({
        value: value as string,
        label: documentSituationLabels[value],
        count: docBase.filter((row) => row.situation === value).length,
        dot: situationDots[value],
      })),
    ];
  } else {
    statusChips = [
      {
        value: null,
        label: 'Pendências',
        count: planBase.filter(isPending).length,
        dot: 'bg-idle',
      },
      {
        value: 'vencidas',
        label: 'Prazo vencido',
        count: planBase.filter((r) => r.overdue).length,
        dot: 'bg-bad',
      },
      {
        value: 'concluida',
        label: 'Concluídas',
        count: planBase.filter((r) => r.status === 'concluida').length,
        dot: 'bg-ok',
      },
      {
        value: 'cancelada',
        label: 'Canceladas',
        count: planBase.filter((r) => r.status === 'cancelada').length,
        dot: 'bg-idle',
      },
      { value: 'todas', label: 'Todas', count: planBase.length, dot: 'bg-line-strong' },
    ];
  }
  // Alterna um chip na seleção composta; null (Todas/Pendências) limpa e
  // 'todas' do plano é exclusivo (é superconjunto dos demais recortes).
  function toggleStatus(value: string | null) {
    if (value === null) return patchSearch({ status: undefined });
    let next: string[];
    if (value === 'todas') {
      next = hasStatus('todas') ? [] : ['todas'];
    } else {
      next = hasStatus(value)
        ? statusTokens.filter((token) => token !== value)
        : [...statusTokens.filter((token) => token !== 'todas'), value];
    }
    patchSearch({ status: next.length > 0 ? next.join(',') : undefined });
  }
  const chipActive = (value: string | null) =>
    value === null ? statusTokens.length === 0 : hasStatus(value);

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Relatórios</p>
          <PageTitle>{tabLabels[tab]}</PageTitle>
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

      {/* A escolha do relatório vive na sidebar (filhos de Relatórios, ?tipo=). */}

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

        <FilterChips
          label="Filtrar por status"
          options={statusChips}
          isActive={chipActive}
          onSelect={toggleStatus}
        />

        {(search.status || search.grupo || qNorm) && (
          <button
            type="button"
            onClick={() => setSearch({ tipo: tab, ord: search.ord, dir: search.dir })}
            className="flex cursor-pointer items-center gap-1 font-ui text-label font-medium text-muted hover:text-ink"
          >
            <X aria-hidden className="size-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        {tabDescriptions[tab]}
        {loaded && (
          <span className="font-mono text-label">
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
                    ['codigo', 'Código'],
                    ['descricao', 'Não conformidade'],
                    ['nota', 'Nota'],
                    ['acao', 'Ação recomendada'],
                    ['diagnostico', 'Diagnóstico'],
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
                  <td colSpan={6} className="px-3.5 py-10 text-center text-muted">
                    {ncBase.length === 0 && !qNorm && !search.grupo
                      ? 'Nenhuma não conformidade gerada — faça os diagnósticos ou comemore a aderência Plena. 🎉'
                      : 'Nenhuma NC com esses filtros.'}
                  </td>
                </tr>
              )}
              {ncSorted.map((row) => (
                <tr key={row.id} className="hover:bg-paper">
                  <Td className="align-top">
                    <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-label text-action">
                      {row.normCode}
                    </span>
                  </Td>
                  <Td className="align-top">
                    <span className="rounded-ctl bg-idle-soft px-1.5 py-0.5 font-mono text-label text-ink-soft">
                      {row.code}
                    </span>
                  </Td>
                  <Td className="align-top w-full">
                    <span className="line-clamp-3">{row.description}</span>
                    <span className="mt-0.5 block text-label text-muted">
                      Requisito: {row.requirementQuestion}
                      {row.itemLabel ? ` — ${row.itemLabel}` : ''}
                    </span>
                  </Td>
                  <Td className="align-top">
                    <StatusPill status={row.adherence} />
                  </Td>
                  <Td className="align-top min-w-64">
                    <span className="line-clamp-3">{row.recommendedAction || '—'}</span>
                  </Td>
                  <Td className="align-top tabular font-mono text-caption">
                    {formatDate(new Date(row.diagnosticAt))}
                  </Td>
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
                      ? 'Nenhum documento no P.I.E desta unidade.'
                      : 'Nenhum documento com esses filtros.'}
                  </td>
                </tr>
              )}
              {docSorted.map((row) => (
                <tr key={row.id} className="hover:bg-paper">
                  <Td className="align-top font-medium">{row.name}</Td>
                  <Td className="align-top max-w-80">
                    <span className="line-clamp-1 text-muted" title={row.path}>
                      {row.path}
                    </span>
                  </Td>
                  <Td className="align-top">
                    {row.documentGroup ? documentGroupLabels[row.documentGroup] : '—'}
                  </Td>
                  <Td className="align-top">
                    <SituationPill situation={row.situation} />
                  </Td>
                  <Td className="align-top tabular font-mono text-caption">{formatDate(row.expiresAt)}</Td>
                  <Td className="align-top tabular font-mono text-caption">
                    {row.daysToExpiry == null ? '—' : row.daysToExpiry}
                  </Td>
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
                    ['prioridade', 'Prioridade'],
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
                  <td colSpan={7} className="px-3.5 py-10 text-center text-muted">
                    {planBase.length === 0 && !qNorm
                      ? 'Nenhuma ação no plano desta unidade.'
                      : 'Nenhuma ação com esses filtros.'}
                  </td>
                </tr>
              )}
              {planSorted.map((row) => (
                <tr key={row.id} className="hover:bg-paper">
                  <Td className="align-top">
                    <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-label text-action">
                      {row.normCode}
                    </span>
                  </Td>
                  <Td className="align-top w-full">
                    <span className="line-clamp-2">{row.normDescription}</span>
                  </Td>
                  <Td className="align-top">
                    <PriorityPill priority={row.priority} />
                  </Td>
                  <Td className="align-top">
                    <StatusPill status={row.adherence} />
                  </Td>
                  <Td className="align-top">
                    <ActionStatusPill status={row.status} overdue={row.overdue} />
                  </Td>
                  <Td className="align-top tabular font-mono text-caption">{formatDate(row.deadline)}</Td>
                  <Td className="align-top">{row.responsible ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  );
}
