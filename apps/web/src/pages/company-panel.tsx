import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';
import { Page } from '@/components/ui/page';

export function CompanyPanelPage() {
  const { companyId } = useParams({ from: '/_authed/$companyId' });
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Empresa</p>
        <h1 className="text-[28px] font-bold tracking-tight">{company.data?.name ?? '…'}</h1>
      </div>
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-20 text-center">
        <h2 className="font-ui text-base font-semibold">Painel da empresa em construção</h2>
        <p className="max-w-[46ch] text-sm text-muted">
          Indicadores consolidados de conformidade das unidades desta empresa vão aparecer aqui.
        </p>
        <span className="mt-2 font-mono text-xs uppercase tracking-[.12em] text-muted">
          Fase F4
        </span>
      </div>
    </Page>
  );
}
