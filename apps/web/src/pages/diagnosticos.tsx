import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Settings2 } from 'lucide-react';
import { Td } from '@/components/ui/table';
import {
  compareNormCodes,
  diagnosticStatuses,
  diagnosticStatusScore,
  normalizeText,
  type DiagnosticStatus,
  type DocumentGroup,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Page, PageTitle } from '@/components/ui/page';
import { StatusFilter, type DiagnosticFilter } from '@/components/ui/status-filter';
import { StatusPill } from '@/components/ui/status-pill';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';
import { AssessmentDialog } from '@/components/diagnostico/assessment-dialog';

// Diagnóstico da unidade (RF12–RF16): filtros componíveis e
// tabela dos itens; a avaliação em si vive em components/diagnostico.

interface AdequacyRow {
  id: string;
  isActive: boolean;
  normCode: string;
  normDescription: string;
  normOrientation: string;
  orientation: string | null;
  importanceWeight: number;
  documentGroup: DocumentGroup | null;
  status: DiagnosticStatus | null;
  deadline: string | null;
  lastDiagnosticAt: string | Date | null;
}

export function DiagnosticosPage() {
  const { companyId, unitId } = useParams({
    from: '/_authed/$companyId/$unitId/diagnosticos',
  });
  const { status: statusFilter, ord, dir } = useSearch({
    from: '/_authed/$companyId/$unitId/diagnosticos',
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Ações de escrita só aparecem com a permissão confirmada no papel.
  const { can } = useUnitPermissions(unitId);
  const canConfigure = can('diagnostico.configurar') || can('diagnostico.requisitos');

  const items = useQuery(trpc.adequacy.list.queryOptions({ unitId }));
  const invalidateItems = () =>
    queryClient.invalidateQueries({ queryKey: trpc.adequacy.list.queryKey({ unitId }) });

  const generate = useMutation(
    trpc.adequacy.generate.mutationOptions({ onSuccess: invalidateItems }),
  );

  const [target, setTarget] = useState<AdequacyRow | null>(null);

  // Filtros compõem (união): ?status=inexistente,inadequada mostra os dois.
  const selectedFilters = (statusFilter ?? '').split(',').filter(Boolean) as DiagnosticFilter[];
  const matchesFilter = (row: AdequacyRow, filter: DiagnosticFilter) => {
    if (filter === 'sem_avaliacao') return row.status === null;
    if (filter === 'com_avaliacao') return row.status !== null;
    return row.status === filter;
  };
  const allRows = items.data ?? [];
  const filtered = allRows.filter(
    (row) =>
      selectedFilters.length === 0 ||
      selectedFilters.some((filter) => matchesFilter(row, filter)),
  );

  // Ordenação (?ord=&dir=): servidor entrega por norma; o clique reordena.
  const currentOrd = ord ?? 'norma';
  const currentDir = dir ?? 'asc';
  const accessors: Record<string, (row: AdequacyRow) => SortValue> = {
    norma: (row) => row.normCode,
    exigencia: (row) => normalizeText(row.normDescription),
    aderencia: (row) => diagnosticStatusScore[row.status ?? 'inexistente'],
    avaliacao: (row) =>
      row.lastDiagnosticAt ? new Date(row.lastDiagnosticAt).getTime() : null,
  };
  const sorted = sortRows(
    filtered,
    accessors[currentOrd] ?? accessors.norma!,
    currentDir,
    currentOrd === 'norma' ? compareNormCodes : undefined,
  );
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/$unitId/diagnosticos',
      params: { companyId, unitId },
      search: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...toggleSort({ ord, dir }, key, 'norma'),
      },
    });

  // Contadores dos chips.
  const counts = {
    todos: allRows.length,
    sem_avaliacao: allRows.filter((row) => row.status === null).length,
    com_avaliacao: allRows.filter((row) => row.status !== null).length,
    ...Object.fromEntries(
      diagnosticStatuses.map((value) => [
        value,
        allRows.filter((row) => row.status === value).length,
      ]),
    ),
  };

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Avaliação da Conformidade</p>
        <PageTitle>Diagnóstico</PageTitle>
      </div>

      <StatusFilter
        value={selectedFilters}
        counts={counts}
        onChange={(value) =>
          navigate({
            to: '/$companyId/$unitId/diagnosticos',
            params: { companyId, unitId },
            search: { ...(value.length > 0 ? { status: value.join(',') } : {}), ord, dir },
          })
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(
                [
                  ['norma', 'Norma'],
                  ['exigencia', 'Exigência'],
                  ['aderencia', 'Aderência'],
                  ['avaliacao', 'Última avaliação'],
                ] as const
              ).map(([key, label]) => (
                <SortableTh
                  key={key}
                  colKey={key}
                  label={label}
                  ord={currentOrd}
                  dir={currentDir}
                  onSort={handleSort}
                />
              ))}
              <PlainTh />
            </tr>
          </thead>
          <tbody>
            {items.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-muted">
                      {can('diagnostico.gerar')
                        ? 'Nenhum item de adequação — gere os itens a partir do catálogo NR-10.'
                        : 'Nenhum item de adequação nesta unidade.'}
                    </span>
                    {can('diagnostico.gerar') && (
                      <Button
                        variant="secondary"
                        disabled={generate.isPending}
                        onClick={() => generate.mutate({ unitId })}
                      >
                        {generate.isPending ? 'Gerando…' : 'Gerar itens de adequação'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {items.data && items.data.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-10 text-center text-muted">
                  Nenhum item com essa aderência.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr
                key={row.id}
                onClick={() => setTarget(row)}
                className="group cursor-pointer hover:bg-paper"
              >
                <Td>
                  <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-label text-action">
                    {row.normCode}
                  </span>
                </Td>
                <Td className="w-full">
                  <span className="line-clamp-2">{row.normDescription}</span>
                </Td>
                <Td>
                  <StatusPill status={row.status ?? 'inexistente'} />
                </Td>
                <Td className="tabular whitespace-nowrap font-mono text-caption">
                  {row.lastDiagnosticAt ? (
                    formatDate(new Date(row.lastDiagnosticAt))
                  ) : (
                    <span className="font-ui text-muted">Sem avaliação</span>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end">
                    {canConfigure && (
                      <Link
                        to="/$companyId/$unitId/diagnosticos/$adequacyItemId"
                        params={{ companyId, unitId, adequacyItemId: row.id }}
                        title="Configurar item (requisitos de evidência)"
                        aria-label={`Configurar item ${row.normCode}`}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Settings2 aria-hidden className="size-4" />
                      </Link>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <AssessmentDialog
          key={target.id}
          unitId={unitId}
          target={target}
          onClose={() => setTarget(null)}
          onSaved={invalidateItems}
        />
      )}
    </Page>
  );
}
