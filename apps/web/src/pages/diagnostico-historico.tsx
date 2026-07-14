import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { formatDate } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page } from '@/components/ui/page';
import {
  NotaPill,
  adherenceBorders,
  adherenceDots,
  statusPillLabel,
} from '@/components/ui/status-pill';
import { NcCodeChip, NotaChip } from '@/components/diagnostico/nc-choice';

// Tela de histórico do item (redesign das NCs): linha do tempo com o placar de
// cada diagnóstico (barra 0–100, delta e contagem de NCs) à esquerda; à
// direita o snapshot do diagnóstico selecionado — as fichas de NC marcadas,
// as evidências com a nota derivada e o parecer.

export function DiagnosticoHistoricoPage() {
  const { companyId, unitId, adequacyItemId } = useParams({
    from: '/_authed/$companyId/$unitId/diagnosticos/$adequacyItemId/historico',
  });

  const item = useQuery(trpc.adequacy.itemDetail.queryOptions({ unitId, adequacyItemId }));
  const history = useQuery(trpc.adequacy.history.queryOptions({ unitId, adequacyItemId }));
  const entries = history.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  const ncs = useQuery({
    ...trpc.adequacy.diagnosticNcs.queryOptions({ unitId, diagnosticId: selected?.id ?? '' }),
    enabled: Boolean(selected),
  });
  const evidences = useQuery({
    ...trpc.adequacy.diagnosticEvidences.queryOptions({
      unitId,
      diagnosticId: selected?.id ?? '',
    }),
    enabled: Boolean(selected),
  });

  const latest = entries[0];

  return (
    <Page>
      <Link
        to="/$companyId/$unitId/diagnosticos"
        params={{ companyId, unitId }}
        className="flex w-fit items-center gap-1.5 font-ui text-sm font-medium text-muted hover:text-action"
      >
        <ArrowLeft aria-hidden className="size-4" /> Diagnóstico
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-ctl bg-action-soft px-2 py-0.5 font-mono text-caption font-semibold text-action">
            {item.data?.normCode ?? '…'}
          </span>
          <h1 className="font-ui text-xl font-semibold">Histórico de diagnósticos</h1>
          {latest && (
            <NotaPill
              status={latest.status}
              label={`Atual: ${statusPillLabel(latest.status)}${latest.score != null ? ` · ${latest.score}%` : ''}`}
            />
          )}
        </div>
        <p className="mt-1 max-w-[78ch] text-sm text-ink-soft">{item.data?.normDescription}</p>
      </div>

      {history.isLoading && <p className="text-sm text-muted">Carregando…</p>}
      {!history.isLoading && entries.length === 0 && (
        <div className="rounded-card border border-dashed border-line-strong p-10 text-center text-sm text-muted">
          Item ainda sem diagnóstico — a linha do tempo começa na primeira avaliação.
        </div>
      )}

      {entries.length > 0 && (
        <div className="grid overflow-hidden rounded-card border border-line bg-surface md:grid-cols-[300px_1fr]">
          {/* — Linha do tempo com placar — */}
          <nav
            aria-label="Diagnósticos do item"
            className="border-b border-line py-3 md:border-b-0 md:border-r"
          >
            <p className="px-4 pb-2 font-mono text-micro font-semibold uppercase tracking-[.1em] text-muted">
              {entries.length} diagnóstico{entries.length === 1 ? '' : 's'}
            </p>
            {entries.map((entry, index) => {
              const isSelected = entry.id === selected?.id;
              // Delta em relação ao diagnóstico anterior (lista vem desc).
              const previous = entries[index + 1];
              const delta =
                previous?.score != null && entry.score != null
                  ? entry.score - previous.score
                  : null;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={isSelected}
                  onClick={() => setSelectedId(entry.id)}
                  className={`block w-full cursor-pointer border-l-[3px] px-4 py-2.5 text-left hover:bg-paper ${
                    isSelected ? `${adherenceBorders[entry.status]} bg-paper` : 'border-l-transparent'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-caption font-semibold">
                      {formatDate(new Date(entry.createdAt))}
                    </span>
                    <span
                      className={`font-mono text-micro ${
                        delta == null
                          ? 'text-muted'
                          : delta >= 0
                            ? 'text-ok'
                            : 'text-bad'
                      }`}
                    >
                      {delta == null ? 'baseline' : `${delta >= 0 ? '▲ +' : '▼ '}${delta}`}
                    </span>
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-idle-soft">
                      <span
                        className={`block h-full rounded-full ${adherenceDots[entry.status]}`}
                        style={{ width: `${Math.max(entry.score ?? 0, 2)}%` }}
                      />
                    </span>
                    <span className="tabular w-10 text-right font-mono text-label font-semibold">
                      {entry.score != null ? `${entry.score}%` : '—'}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-2 text-micro text-muted">
                    <span>{entry.author ?? '—'}</span>
                    <span className={`font-ui font-semibold ${entry.ncCount === 0 ? 'text-ok' : 'text-ink-soft'}`}>
                      {entry.ncCount} NC{entry.ncCount === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* — Snapshot do diagnóstico selecionado — */}
          {selected && (
            <div className="flex min-w-0 flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted">
                  <b className="font-ui text-ink">{formatDate(new Date(selected.createdAt))}</b>
                  {' · '}
                  {selected.author ?? '—'}
                </span>
                <NotaPill
                  status={selected.status}
                  label={`${statusPillLabel(selected.status)}${selected.score != null ? ` · ${selected.score}%` : ''}`}
                />
              </div>

              <div>
                <p className="mb-2 font-mono text-micro font-semibold uppercase tracking-[.1em] text-muted">
                  Não conformidades{ncs.data && ncs.data.length > 0 ? ` · ${ncs.data.length}` : ''}
                </p>
                {ncs.isLoading && <p className="text-caption text-muted">Carregando…</p>}
                {ncs.data?.length === 0 && (
                  <p className="text-sm text-ok">✓ Nenhuma NC marcada — todos os requisitos conformes.</p>
                )}
                <div className="grid gap-2">
                  {ncs.data?.map((nc) => (
                    <div
                      key={nc.id}
                      className="relative overflow-hidden rounded-ctl border border-line-strong bg-surface p-2.5 pl-4"
                    >
                      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${adherenceDots[nc.adherence]}`} />
                      <div className="flex flex-wrap items-center gap-2">
                        <NcCodeChip code={nc.code} />
                        <NotaChip nota={nc.adherence} />
                        <span className="text-micro text-muted">
                          · {nc.requirementQuestion}
                          {nc.itemLabel ? ` — ${nc.itemLabel}` : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-caption leading-relaxed text-ink">{nc.description}</p>
                      {nc.recommendedAction && (
                        <p className="mt-1 text-label text-muted">
                          <b className="font-semibold text-ink-soft">Ação:</b> {nc.recommendedAction}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 font-mono text-micro font-semibold uppercase tracking-[.1em] text-muted">
                  Evidências{evidences.data ? ` · ${evidences.data.length} requisito${evidences.data.length === 1 ? '' : 's'}` : ''}
                </p>
                {evidences.isLoading && <p className="text-caption text-muted">Carregando…</p>}
                {evidences.data?.length === 0 && (
                  <p className="text-caption text-muted">Diagnóstico registrado sem evidências.</p>
                )}
                <div className="grid gap-2">
                  {evidences.data?.map((ev) => (
                    <div
                      key={ev.id}
                      className="relative flex items-center gap-3 overflow-hidden rounded-ctl border border-line bg-surface px-3 py-2 pl-4"
                    >
                      <span
                        aria-hidden
                        className={`absolute inset-y-0 left-0 w-[3px] ${adherenceDots[ev.adherence ?? 'sem_avaliacao']}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-caption font-medium" title={ev.question}>
                          {ev.question}
                        </span>
                        <span className="block truncate text-micro text-muted">
                          {ev.items
                            .map((evItem) =>
                              evItem.documentName
                                ? `📄 ${evItem.documentName}`
                                : evItem.answer || evItem.label,
                            )
                            .slice(0, 2)
                            .join(' · ')}
                          {ev.items.length > 2 ? ` · +${ev.items.length - 2}` : ''}
                        </span>
                      </span>
                      <NotaPill status={ev.adherence ?? 'sem_avaliacao'} />
                    </div>
                  ))}
                </div>
              </div>

              {selected.technicalOpinion && (
                <p className="rounded-ctl border border-line border-l-2 border-l-hazard bg-surface px-3 py-2 text-caption text-ink-soft">
                  “{selected.technicalOpinion}”
                </p>
              )}

              <div className="flex flex-wrap gap-8 border-t border-line pt-3 text-label text-muted">
                <span>
                  <b className="block font-ui text-caption font-semibold text-ink">
                    {selected.deadline ? formatDate(selected.deadline) : '—'}
                  </b>
                  {selected.deadline ? 'prazo de adequação' : 'prazo (sem ação)'}
                </span>
                <span>
                  <b className="block font-ui text-caption font-semibold text-ink">
                    {selected.responsible ?? '—'}
                  </b>
                  responsável
                </span>
                {selected.recommendedAction && (
                  <span className="min-w-0">
                    <b className="block font-ui text-caption font-semibold text-ink">
                      {selected.recommendedAction}
                    </b>
                    ação recomendada
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
