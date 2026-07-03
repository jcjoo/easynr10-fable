import { useParams, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { Crumbs, type Crumb } from '@/components/ui/crumbs';
import { GlobalSearch } from '@/components/layout/global-search';
import { ThemeToggle } from '@/components/layout/theme-toggle';

// Rótulo da seção a partir do último segmento da URL.
const sectionLabels: Record<string, string> = {
  unidades: 'Unidades',
  pie: 'PIE',
  diagnosticos: 'Diagnóstico',
  'plano-de-acao': 'Plano de Ação',
  relatorios: 'Relatórios',
  equipamentos: 'Equipamentos',
  colaboradores: 'Colaboradores',
};

export function Header() {
  const params = useParams({ strict: false }) as { companyId?: string; unitId?: string };
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const company = useQuery({
    ...trpc.companies.byId.queryOptions({ id: params.companyId ?? '' }),
    enabled: Boolean(params.companyId),
  });
  const unit = useQuery({
    ...trpc.units.byId.queryOptions({ unitId: params.unitId ?? '' }),
    enabled: Boolean(params.unitId),
  });

  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  const section = sectionLabels[lastSegment];

  const crumbs: Crumb[] = [];
  if (pathname === '/') {
    crumbs.push({ label: 'Início' });
  } else {
    if (!params.companyId) {
      crumbs.push({ label: 'Empresas' });
    } else {
      // Nome da empresa volta para a lista de empresas; nome da unidade,
      // para a lista de unidades (não para os painéis).
      crumbs.push({ label: company.data?.name ?? '…', to: '/empresas' });
      if (params.unitId) {
        crumbs.push({
          label: unit.data?.name ?? '…',
          to: '/$companyId/unidades',
          params: { companyId: params.companyId },
        });
        crumbs.push({ label: section ?? 'Painel' });
      } else {
        crumbs.push({ label: section ?? 'Painel' });
      }
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-2.5">
      <Crumbs items={crumbs} />
      <div className="flex flex-1 items-center justify-end gap-4">
        <GlobalSearch />
        <ThemeToggle />
      </div>
    </header>
  );
}
