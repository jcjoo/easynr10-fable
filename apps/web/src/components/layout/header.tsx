import { useParams, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Crumbs, type Crumb } from '@/components/ui/crumbs';
import { GlobalSearch } from '@/components/layout/global-search';
import { ThemeToggle } from '@/components/layout/theme-toggle';

// Rótulo da seção a partir do último segmento da URL.
const sectionLabels: Record<string, string> = {
  unidades: 'Unidades',
  pie: 'PIE',
  'visao-geral': 'Visão Geral',
  diagnosticos: 'Diagnóstico',
  'plano-de-acao': 'Plano de Ação',
  relatorios: 'Relatórios',
  equipamentos: 'Equipamentos',
  colaboradores: 'Colaboradores',
};

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
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
    <header className="flex items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="shrink-0 cursor-pointer rounded-ctl p-1.5 text-ink-soft hover:bg-line/60 hover:text-ink lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      <div className="min-w-0">
        <Crumbs items={crumbs} />
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-4">
        <GlobalSearch />
        <ThemeToggle />
      </div>
    </header>
  );
}
