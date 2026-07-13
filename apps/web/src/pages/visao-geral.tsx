import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Td } from '@/components/ui/table';
import {
  adherenceBand,
  diagnosticStatuses,
  nr10GroupFor,
  summarizeNr10Groups,
  weightedAdherencePercent,
  type DiagnosticStatus,
  type DocumentGroup,
  type Nr10GroupSummary,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@easynr10/shared';
import { Page, PageTitle } from '@/components/ui/page';
import { StatusFilter, type DiagnosticFilter } from '@/components/ui/status-filter';
import { StatusPill } from '@/components/ui/status-pill';
import { AssessmentDialog } from '@/components/diagnostico/assessment-dialog';

// Visão Geral da Avaliação da Conformidade: os mesmos itens da aba
// Diagnóstico, organizados pela estrutura de grupos do checklist NR-10
// (planilha resumo — grupos A–O por requisito raiz). Cada grupo mostra a
// aderência ponderada, o indicador e o farol de prioridade; expandir revela
// os itens, que abrem o mesmo dialog de avaliação do Diagnóstico.

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

export function VisaoGeralPage() {
  const { companyId, unitId } = useParams({
    from: '/_authed/$companyId/$unitId/visao-geral',
  });
  const { status: statusFilter } = useSearch({
    from: '/_authed/$companyId/$unitId/visao-geral',
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const items = useQuery(trpc.adequacy.list.queryOptions({ unitId }));
  const invalidateItems = () =>
    queryClient.invalidateQueries({ queryKey: trpc.adequacy.list.queryKey({ unitId }) });

  const [target, setTarget] = useState<AdequacyRow | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (letter: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });

  const allRows: AdequacyRow[] = items.data ?? [];
  // Itens fora de escopo aparecem na lista (esmaecidos), mas não entram nas
  // médias — mesma regra do painel (adequacySnapshot considera só ativos).
  const scopedRows = allRows.filter((row) => row.isActive);
  const summaries = summarizeNr10Groups(scopedRows);
  const overall = weightedAdherencePercent(scopedRows);

  // Filtro de aderência: recorta as LINHAS visíveis; os agregados do grupo
  // não mudam com o filtro. Com filtro ativo os grupos já vêm expandidos.
  const selectedFilters = (statusFilter ?? '').split(',').filter(Boolean) as DiagnosticFilter[];
  const filterActive = selectedFilters.length > 0;
  const matchesFilter = (row: AdequacyRow, filter: DiagnosticFilter) => {
    if (filter === 'sem_avaliacao') return row.status === null;
    if (filter === 'com_avaliacao') return row.status !== null;
    return row.status === filter;
  };
  const visible = (rows: AdequacyRow[]) =>
    rows.filter(
      (row) => !filterActive || selectedFilters.some((filter) => matchesFilter(row, filter)),
    );

  // Resolver do shared — prefixo cru colocaria 10.2.8/10.2.9 dentro do A.
  const rowsOf = (summary: Nr10GroupSummary) =>
    allRows.filter((row) => nr10GroupFor(row.normCode) === summary.group);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Avaliação da Conformidade</p>
          <PageTitle>Visão Geral</PageTitle>
        </div>
        {overall !== null && (
          <div className="text-right">
            <p className="font-mono text-2xl font-semibold tabular-nums">{overall}%</p>
            <p className="text-caption text-muted">
              Aderência geral · {adherenceBand(overall).label}
            </p>
          </div>
        )}
      </div>

      <StatusFilter
        value={selectedFilters}
        counts={counts}
        onChange={(value) =>
          navigate({
            to: '/$companyId/$unitId/visao-geral',
            params: { companyId, unitId },
            search: value.length > 0 ? { status: value.join(',') } : {},
          })
        }
      />

      {items.isSuccess && allRows.length === 0 && (
        <p className="rounded-card border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          Nenhum item de adequação nesta unidade — gere os itens na aba Diagnóstico.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {summaries.map((summary) => {
          const groupRows = visible(rowsOf(summary));
          if (filterActive && groupRows.length === 0) return null;
          const expanded = filterActive || open.has(summary.group.letter);
          return (
            <section
              key={summary.group.letter}
              className="overflow-hidden rounded-card border border-line"
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggle(summary.group.letter)}
                className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-paper"
              >
                <ChevronRight
                  aria-hidden
                  className={`size-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
                />
                <span className="shrink-0 rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-label text-action">
                  {summary.group.requirement}
                </span>
                {/* basis-40 + flex-wrap: em telas estreitas os pills descem
                    para a linha de baixo em vez de esmagar o título. */}
                <span className="min-w-0 flex-1 basis-40">
                  <span className="line-clamp-2 text-sm font-semibold">
                    {summary.group.title}
                  </span>
                  <span className="block text-label text-muted">
                    Grupo {summary.group.letter} · {summary.evaluated} de {summary.total}{' '}
                    {summary.total === 1 ? 'item avaliado' : 'itens avaliados'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  {summary.adherencePercent !== null && summary.indicator ? (
                    <>
                      <StatusPill status={summary.indicator} />
                      <span className="w-12 text-right font-mono text-sm font-semibold tabular-nums">
                        {summary.adherencePercent}%
                      </span>
                    </>
                  ) : (
                    <StatusPill status="sem_avaliacao" />
                  )}
                </span>
              </button>

              {expanded && (
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {groupRows.length === 0 && (
                        <tr>
                          <td className="px-4 py-4 text-center text-muted">
                            Nenhum item neste grupo.
                          </td>
                        </tr>
                      )}
                      {groupRows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => setTarget(row)}
                          className={`cursor-pointer hover:bg-paper ${row.isActive ? '' : 'opacity-50'}`}
                        >
                          <td className="whitespace-nowrap border-b border-line py-2.5 pl-11 pr-3.5">
                            <span className="font-mono text-label text-muted">
                              {row.normCode}
                            </span>
                          </td>
                          <Td className="w-full">
                            <span className="line-clamp-2">{row.normDescription}</span>
                          </Td>
                          <Td>
                            {row.isActive ? (
                              <StatusPill status={row.status ?? 'sem_avaliacao'} />
                            ) : (
                              <span className="whitespace-nowrap text-label text-muted">
                                Fora de escopo
                              </span>
                            )}
                          </Td>
                          <Td className="tabular whitespace-nowrap font-mono text-caption">
                            {row.lastDiagnosticAt ? (
                              formatDate(new Date(row.lastDiagnosticAt))
                            ) : (
                              <span className="font-ui text-muted">—</span>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
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
