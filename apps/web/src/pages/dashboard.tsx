import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { adherenceBand, type DiagnosticStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page, PageTitle } from '@/components/ui/page';

// Painel geral (rota /): pendências consolidadas de todas as empresas e
// unidades visíveis — documentos vencidos/a vencer, itens sem diagnóstico e
// ações do plano pendentes/atrasadas, cada número linkando para a tela que
// resolve a pendência.

const statusToken: Record<DiagnosticStatus, string> = {
  inexistente: 'bad',
  inadequada: 'alert',
  parcial: 'warn',
  suficiente: 'suf',
  plena: 'ok',
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function StatTile({ label, value, token }: { label: string; value: number; token: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-line bg-paper px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-caption text-muted">
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: `var(--color-${token})` }}
        />
        {label}
      </span>
      <span className="font-ui text-2xl font-bold">{value}</span>
    </div>
  );
}

// Pendência da unidade como link para a tela que a resolve; some quando zera.
function PendencyChip({
  count,
  label,
  token,
  to,
  params,
  search,
}: {
  count: number;
  label: string;
  token: string;
  to: string;
  params: Record<string, string>;
  search?: Record<string, string>;
}) {
  if (count === 0) return null;
  return (
    <Link
      to={to}
      params={params}
      search={search}
      className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-2 pr-2.5 font-ui text-label font-medium text-ink-soft hover:border-line-strong hover:text-ink"
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: `var(--color-${token})` }}
      />
      <span className="tabular font-mono text-micro font-semibold">{count}</span>
      {label}
    </Link>
  );
}

export function DashboardPage() {
  const overview = useQuery(trpc.reports.globalOverview.queryOptions());
  const data = overview.data;
  const totalPendencies = data
    ? data.totals.expiredDocs +
      data.totals.expiringDocs +
      data.totals.unevaluated +
      data.totals.pendingActions
    : 0;

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Todas as empresas visíveis</p>
        <PageTitle>Painel geral</PageTitle>
      </div>

      {data?.companies.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-20 text-center">
          <h2 className="font-ui text-base font-semibold">Nenhuma unidade visível</h2>
          <p className="max-w-[46ch] text-sm text-muted">
            Cadastre empresas e unidades (ou solicite acesso) para acompanhar as pendências por
            aqui.
          </p>
          <Link
            to="/empresas"
            className="mt-2 font-ui text-sm font-semibold text-action hover:underline"
          >
            Ir para empresas →
          </Link>
        </div>
      )}

      {data && data.companies.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Documentos vencidos" value={data.totals.expiredDocs} token="bad" />
            <StatTile label="Documentos a vencer" value={data.totals.expiringDocs} token="warn" />
            <StatTile label="Itens sem diagnóstico" value={data.totals.unevaluated} token="idle" />
            <StatTile label="Ações atrasadas" value={data.totals.overdueActions} token="bad" />
            <StatTile label="Ações pendentes" value={data.totals.pendingActions} token="warn" />
          </div>

          {totalPendencies === 0 && (
            <p className="rounded-card border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
              ✅ Nenhuma pendência nas unidades visíveis — documentos em dia, diagnósticos feitos e
              plano de ação sem itens abertos.
            </p>
          )}

          {data.companies.map((companyRow) => (
            <section
              key={companyRow.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate font-ui text-sm font-semibold">{companyRow.name}</h2>
                <Link
                  to="/$companyId"
                  params={{ companyId: companyRow.id }}
                  className="shrink-0 font-ui text-label font-medium text-action hover:underline"
                >
                  Painel da empresa →
                </Link>
              </div>

              <ul className="flex flex-col divide-y divide-line">
                {companyRow.units.map((unit) => {
                  const params = { companyId: companyRow.id, unitId: unit.unitId };
                  const band = unit.percent !== null ? adherenceBand(unit.percent) : null;
                  const clean =
                    unit.expiredDocs +
                      unit.expiringDocs +
                      unit.unevaluated +
                      unit.pendingActions ===
                    0;
                  return (
                    <li
                      key={unit.unitId}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0"
                    >
                      <Link
                        to="/$companyId/$unitId"
                        params={params}
                        className="w-52 shrink-0 truncate font-ui text-sm font-medium hover:text-action"
                      >
                        {unit.name}
                      </Link>
                      <span
                        className="w-14 shrink-0 font-ui text-sm font-semibold"
                        style={
                          band ? { color: `var(--color-${statusToken[band.status]})` } : undefined
                        }
                      >
                        {unit.percent !== null ? `${unit.percent}%` : '—'}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PendencyChip
                          count={unit.expiredDocs}
                          label={plural(unit.expiredDocs, 'doc vencido', 'docs vencidos')}
                          token="bad"
                          to="/$companyId/$unitId/pie"
                          params={params}
                          search={{ venc: 'vencidos' }}
                        />
                        <PendencyChip
                          count={unit.expiringDocs}
                          label={plural(unit.expiringDocs, 'doc a vencer', 'docs a vencer')}
                          token="warn"
                          to="/$companyId/$unitId/pie"
                          params={params}
                          search={{ venc: 'a_vencer' }}
                        />
                        <PendencyChip
                          count={unit.unevaluated}
                          label={plural(
                            unit.unevaluated,
                            'item sem diagnóstico',
                            'itens sem diagnóstico',
                          )}
                          token="idle"
                          to="/$companyId/$unitId/diagnosticos"
                          params={params}
                          search={{ status: 'sem_avaliacao' }}
                        />
                        <PendencyChip
                          count={unit.overdueActions}
                          label={plural(unit.overdueActions, 'ação atrasada', 'ações atrasadas')}
                          token="bad"
                          to="/$companyId/$unitId/plano-de-acao"
                          params={params}
                        />
                        <PendencyChip
                          count={unit.pendingActions}
                          label={plural(unit.pendingActions, 'ação pendente', 'ações pendentes')}
                          token="warn"
                          to="/$companyId/$unitId/plano-de-acao"
                          params={params}
                        />
                        {clean && (
                          <span className="flex items-center gap-1.5 font-ui text-label text-muted">
                            <span
                              aria-hidden
                              className="size-2 rounded-full"
                              style={{ background: 'var(--color-ok)' }}
                            />
                            Sem pendências
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </Page>
  );
}
