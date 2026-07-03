import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';
import { Page } from '@/components/ui/page';

export function UnitHomePage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId' });
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  const unit = useQuery(trpc.units.byId.queryOptions({ unitId }));

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">{company.data?.name ?? '…'}</p>
        <h1 className="text-[28px] font-bold tracking-tight">
          {unit.data?.name ?? 'Unidade'}
        </h1>
      </div>

      <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-20 text-center">
        <h2 className="font-ui text-base font-semibold">Painel da unidade em construção</h2>
        <p className="max-w-[44ch] text-sm text-muted">
          PIE, diagnósticos, plano de ação e relatórios desta unidade vão aparecer aqui (fases
          F2–F4).
        </p>
      </div>
    </Page>
  );
}
