import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  adherenceBand,
  diagnosticStatuses,
  documentGroupLabels,
  documentSituationLabels,
  type DiagnosticStatus,
  type DocumentSituation,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page, PageTitle } from '@/components/ui/page';
import { statusPillLabel } from '@/components/ui/status-pill';
import { SegmentedTabs } from '@/components/ui/tabs';
import { AdherenceTimeline } from '@/components/charts/adherence-timeline';

// Painel da unidade (RF19): aderência geral, distribuição da avaliação,
// grupos documentais, evolução no tempo, plano de ação e situação do P.I.E.

export const dashboardPeriods = ['30d', '90d', '12m'] as const;
export type DashboardPeriod = (typeof dashboardPeriods)[number];

const periodLabels: Record<DashboardPeriod, string> = {
  '30d': '30 dias',
  '90d': '90 dias',
  '12m': '12 meses',
};

type StatusKey = DiagnosticStatus | 'sem_avaliacao';

// Tokens de status do guia de design (mesmos da StatusPill).
const statusToken: Record<StatusKey, string> = {
  inexistente: 'bad',
  inadequada: 'alert',
  parcial: 'warn',
  suficiente: 'suf',
  plena: 'ok',
  sem_avaliacao: 'idle',
};

const situationToken: Record<DocumentSituation, string> = {
  vencido: 'bad',
  a_vencer: 'warn',
  em_dia: 'ok',
  sem_validade: 'idle',
};

function isoDate(date: Date) {
  return date.toLocaleDateString('sv-SE');
}

function periodRange(period: DashboardPeriod) {
  const to = new Date();
  const from = new Date();
  if (period === '30d') {
    from.setDate(from.getDate() - 29);
    return { from: isoDate(from), to: isoDate(to), interval: 'daily' as const };
  }
  if (period === '90d') {
    from.setDate(from.getDate() - 90);
    return { from: isoDate(from), to: isoDate(to), interval: 'weekly' as const };
  }
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return { from: isoDate(from), to: isoDate(to), interval: 'monthly' as const };
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-ui text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, token }: { label: string; value: number; token?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-line bg-surface px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-caption text-muted">
        {token && (
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: `var(--color-${token})` }}
          />
        )}
        {label}
      </span>
      <span className="font-ui text-2xl font-bold">{value}</span>
    </div>
  );
}

export function UnitHomePage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId' });
  const { periodo } = useSearch({ from: '/_authed/$companyId/$unitId' });
  const navigate = useNavigate();
  const period: DashboardPeriod = periodo ?? '90d';

  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  const unit = useQuery(trpc.units.byId.queryOptions({ unitId }));
  const overview = useQuery(trpc.reports.overview.queryOptions({ unitId }));

  const range = periodRange(period);
  const timeline = useQuery(
    trpc.reports.timeline.queryOptions({
      unitId,
      from: range.from,
      to: range.to,
      interval: range.interval,
    }),
  );

  const data = overview.data;
  const percent = data?.adherence.percent ?? null;
  const band = percent !== null ? adherenceBand(percent) : null;
  const distributionTotal = data?.adherence.activeTotal ?? 0;

  const pendencias = data
    ? data.actions.counts.pendente + data.actions.counts.em_andamento
    : 0;

  const sectionLink = (label: string, to: string, search?: Record<string, string>) => (
    <Link
      to={to}
      params={{ companyId, unitId }}
      search={search}
      className="font-ui text-label font-medium text-action hover:underline"
    >
      {label} →
    </Link>
  );

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">{company.data?.name ?? '…'}</p>
        <PageTitle>{unit.data?.name ?? 'Unidade'}</PageTitle>
      </div>

      {data && distributionTotal === 0 && (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-16 text-center">
          <h2 className="font-ui text-base font-semibold">Unidade ainda sem itens de adequação</h2>
          <p className="max-w-[46ch] text-sm text-muted">
            Gere os itens a partir do catálogo NR-10 para começar o diagnóstico e acompanhar a
            conformidade por aqui.
          </p>
          <Link
            to="/$companyId/$unitId/diagnosticos"
            params={{ companyId, unitId }}
            className="mt-2 font-ui text-sm font-semibold text-action hover:underline"
          >
            Ir para o Diagnóstico →
          </Link>
        </div>
      )}

      {data && distributionTotal > 0 && (
        <>
          {/* Aderência geral — número-herói do painel */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-line bg-paper px-5 py-4">
            <span className="text-3xl" aria-hidden>
              {band?.emoji ?? '⏳'}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-ui text-5xl font-bold leading-none tracking-tight">
                {percent !== null ? `${percent}%` : '—'}
              </span>
              <div>
                <p className="font-ui text-base font-bold tracking-tight">
                  Aderência geral{band ? ` — ${band.label}` : ''}
                </p>
                <p className="text-sm text-ink-soft">
                  {band?.phrase ?? 'Nenhum item avaliado ainda — registre o primeiro diagnóstico.'}
                </p>
              </div>
            </div>
            <span className="ml-auto font-mono text-label text-muted">
              {data.adherence.evaluated} de {data.adherence.activeTotal} itens ativos avaliados
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="Distribuição da avaliação"
              action={sectionLink('Diagnóstico', '/$companyId/$unitId/diagnosticos')}
            >
              <div
                role="img"
                aria-label="Proporção de itens por aderência"
                className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
              >
                {([...diagnosticStatuses, 'sem_avaliacao'] as StatusKey[]).map((status) => {
                  const count = data.adherence.distribution[status];
                  if (count === 0) return null;
                  return (
                    <div
                      key={status}
                      title={`${statusPillLabel(status)}: ${count}`}
                      style={{
                        width: `${(count / distributionTotal) * 100}%`,
                        background: `var(--color-${statusToken[status]})`,
                      }}
                    />
                  );
                })}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {([...diagnosticStatuses, 'sem_avaliacao'] as StatusKey[]).map((status) => (
                  <li key={status}>
                    <Link
                      to="/$companyId/$unitId/diagnosticos"
                      params={{ companyId, unitId }}
                      search={{ status }}
                      className="flex items-center gap-1.5 font-ui text-caption text-ink-soft hover:text-ink"
                    >
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ background: `var(--color-${statusToken[status]})` }}
                      />
                      {statusPillLabel(status)}
                      <span className="tabular rounded-full bg-surface px-1.5 font-mono text-micro text-muted">
                        {data.adherence.distribution[status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Aderência por grupo documental">
              <ul className="flex flex-col gap-2.5">
                {data.groups.map((group) => {
                  const groupBand = group.percent !== null ? adherenceBand(group.percent) : null;
                  const token = groupBand ? statusToken[groupBand.status] : 'idle';
                  return (
                    <li key={group.group} className="flex items-center gap-3">
                      <span className="w-44 shrink-0 truncate text-caption">
                        {documentGroupLabels[group.group]}
                      </span>
                      <div
                        role="img"
                        aria-label={`${documentGroupLabels[group.group]}: ${
                          group.percent !== null ? `${group.percent}%` : 'sem avaliação'
                        }`}
                        className="h-2 flex-1 overflow-hidden rounded-full"
                        style={{ background: `var(--color-${token}-soft)` }}
                      >
                        {group.percent !== null && (
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${group.percent}%`,
                              background: `var(--color-${token})`,
                            }}
                          />
                        )}
                      </div>
                      <span className="w-12 shrink-0 text-right font-ui text-caption font-semibold">
                        {group.percent !== null ? `${group.percent}%` : '—'}
                      </span>
                      <span className="w-24 shrink-0 text-right font-mono text-micro text-muted">
                        {group.evaluated}/{group.count} aval.
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          </div>

          <SectionCard
            title="Evolução da aderência"
            action={
              <SegmentedTabs
                label="Período"
                value={period}
                options={dashboardPeriods.map((value) => ({
                  value,
                  label: periodLabels[value],
                }))}
                onChange={(value) =>
                  navigate({
                    to: '/$companyId/$unitId',
                    params: { companyId, unitId },
                    search: value === '90d' ? {} : { periodo: value },
                  })
                }
              />
            }
          >
            <AdherenceTimeline points={timeline.data ?? []} interval={range.interval} />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="Plano de ação"
              action={sectionLink('Ver plano', '/$companyId/$unitId/plano-de-acao')}
            >
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile label="Pendências" value={pendencias} token="warn" />
                <StatTile label="Prazo vencido" value={data.actions.overdue} token="bad" />
                <StatTile label="Concluídas" value={data.actions.counts.concluida} token="ok" />
              </div>
            </SectionCard>

            <SectionCard
              title="Documentos do P.I.E"
              action={sectionLink('Situação documental', '/$companyId/$unitId/relatorios', {
                tipo: 'situacao-documental',
              })}
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(Object.keys(situationToken) as DocumentSituation[]).map((situation) => (
                  <StatTile
                    key={situation}
                    label={documentSituationLabels[situation]}
                    value={data.documents.counts[situation]}
                    token={situationToken[situation]}
                  />
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </Page>
  );
}
