import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { adherenceBand, type DiagnosticStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page, PageTitle } from '@/components/ui/page';

// Painel da empresa (RF19): aderência geral consolidada por unidade.

const statusToken: Record<DiagnosticStatus, string> = {
  inexistente: 'bad',
  inadequada: 'alert',
  parcial: 'warn',
  suficiente: 'suf',
  plena: 'ok',
};

export function CompanyPanelPage() {
  const { companyId } = useParams({ from: '/_authed/$companyId' });
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  const units = useQuery(trpc.reports.companyOverview.queryOptions({ companyId }));

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Empresa</p>
        <PageTitle>{company.data?.name ?? '…'}</PageTitle>
      </div>

      {units.data?.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-20 text-center">
          <h2 className="font-ui text-base font-semibold">Nenhuma unidade visível</h2>
          <p className="max-w-[46ch] text-sm text-muted">
            Cadastre unidades desta empresa (ou solicite acesso) para acompanhar a conformidade.
          </p>
        </div>
      )}

      {(units.data?.length ?? 0) > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.data!.map((row) => {
            const band = row.percent !== null ? adherenceBand(row.percent) : null;
            const token = band ? statusToken[band.status] : 'idle';
            return (
              <Link
                key={row.unitId}
                to="/$companyId/$unitId"
                params={{ companyId, unitId: row.unitId }}
                className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4 hover:border-line-strong"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="truncate font-ui text-base font-semibold">{row.name}</h2>
                  <span className="font-ui text-2xl font-bold">
                    {row.percent !== null ? `${row.percent}%` : '—'}
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={`Aderência de ${row.name}: ${
                    row.percent !== null ? `${row.percent}%` : 'sem avaliação'
                  }`}
                  className="h-2 w-full overflow-hidden rounded-full"
                  style={{ background: `var(--color-${token}-soft)` }}
                >
                  {row.percent !== null && (
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.percent}%`, background: `var(--color-${token})` }}
                    />
                  )}
                </div>
                <p className="font-mono text-micro text-muted">
                  {band ? `${band.emoji} ${band.label} · ` : ''}
                  {row.evaluated}/{row.activeTotal} itens avaliados
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </Page>
  );
}
