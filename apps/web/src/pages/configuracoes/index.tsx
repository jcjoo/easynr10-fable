import type { ReactNode } from 'react';
import { Link, Outlet, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  MapPinned,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useActiveContext } from '@/stores/active-context';
import type { EmpresaTab } from './empresa';

// Configurações: página INDEPENDENTE do shell do app (sem a sidebar
// principal) com navegação própria — Usuário, Administração e os grupos
// Empresa/Unidade com as subseções como FILHOS na sidebar (mesma linguagem
// da navegação principal). No mobile a navegação vira chips horizontais.

// Gravada no CLIQUE do item da sidebar principal (o redirect /configuracoes →
// /perfil descartaria um state de navegação).
export const SETTINGS_FROM_KEY = 'easynr10.settings-from';

const abaChildren: { aba: EmpresaTab; label: string }[] = [
  { aba: 'usuarios', label: 'Usuários' },
  { aba: 'papeis', label: 'Papéis' },
  { aba: 'info', label: 'Informações' },
];

function NavLink({
  to,
  search,
  label,
  description,
  icon: Icon,
  depth,
}: {
  to: string;
  search?: Record<string, string | undefined>;
  label: string;
  description?: string;
  icon?: LucideIcon;
  depth?: boolean;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      activeProps={{ className: 'active bg-action-soft text-ink' }}
      className={`group relative flex items-start gap-2.5 rounded-ctl py-2 pr-3 font-ui text-sm
        font-medium text-ink-soft hover:bg-line/60 hover:text-ink ${depth ? 'pl-9' : 'pl-3'}`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-hazard opacity-0 group-[.active]:opacity-100 group-hover:opacity-30"
      />
      {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        {description && <span className="block truncate text-label text-muted">{description}</span>}
      </span>
    </Link>
  );
}

function GroupLabel({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <span className="mt-2 flex items-center gap-2.5 px-3 pb-1 pt-1">
      <Icon aria-hidden className="size-4 shrink-0 text-muted" />
      <span className="truncate font-mono text-micro font-medium uppercase tracking-[.12em] text-muted">
        {children}
      </span>
    </span>
  );
}

export function SettingsLayout() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const { companyId, unitId } = useActiveContext();
  // Escopo atual (?empresa/?unidade) para os filhos não perderem a seleção.
  const search = useSearch({ strict: false }) as { empresa?: string; unidade?: string };

  const backTo =
    sessionStorage.getItem(SETTINGS_FROM_KEY) ??
    (companyId && unitId ? `/${companyId}/${unitId}` : companyId ? `/${companyId}` : '/');

  const empresaSearch = (aba: EmpresaTab) => ({ empresa: search.empresa, aba });
  const unidadeSearch = (aba: EmpresaTab) => ({
    empresa: search.empresa,
    unidade: search.unidade,
    aba,
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 p-3 pb-2 lg:w-72 lg:overflow-y-auto lg:p-4">
        <div className="mb-1 flex items-center gap-3 lg:mb-3 lg:flex-col lg:items-start">
          <Link
            to={backTo as '/'}
            className="flex w-fit shrink-0 items-center gap-2 rounded-ctl border border-line-strong bg-surface px-3 py-1.5 font-ui text-sm font-semibold hover:border-ink-soft"
          >
            <ArrowLeft aria-hidden className="size-4" /> Voltar
          </Link>
          <h1 className="truncate px-1 text-xl font-bold tracking-tight lg:text-title">
            Configurações
          </h1>
        </div>

        {/* Desktop: navegação agrupada com filhos */}
        <nav aria-label="Seções" className="hidden flex-col gap-0.5 lg:flex">
          <NavLink
            to="/configuracoes/perfil"
            label="Usuário"
            description="Seu perfil, senha e foto"
            icon={UserRound}
          />
          {isAdmin && (
            <>
              <NavLink
                to="/configuracoes/adm"
                label="Administração"
                description="Todos os usuários do sistema"
                icon={ShieldCheck}
              />
              <GroupLabel icon={Building2}>Empresa</GroupLabel>
              {abaChildren.map(({ aba, label }) => (
                <NavLink
                  key={`empresa-${aba}`}
                  to="/configuracoes/empresa"
                  search={empresaSearch(aba)}
                  label={label}
                  depth
                />
              ))}
              <GroupLabel icon={MapPinned}>Unidade</GroupLabel>
              {abaChildren.map(({ aba, label }) => (
                <NavLink
                  key={`unidade-${aba}`}
                  to="/configuracoes/unidade"
                  search={unidadeSearch(aba)}
                  label={label}
                  depth
                />
              ))}
            </>
          )}
        </nav>

        {/* Mobile: chips horizontais (mesma régua das sub-navegações do app) */}
        <nav aria-label="Seções" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 lg:hidden">
          {[
            { to: '/configuracoes/perfil', label: 'Usuário', search: undefined },
            ...(isAdmin
              ? [
                  { to: '/configuracoes/adm', label: 'Administração', search: undefined },
                  ...abaChildren.map(({ aba, label }) => ({
                    to: '/configuracoes/empresa',
                    label: `Empresa · ${label}`,
                    search: empresaSearch(aba),
                  })),
                  ...abaChildren.map(({ aba, label }) => ({
                    to: '/configuracoes/unidade',
                    label: `Unidade · ${label}`,
                    search: unidadeSearch(aba),
                  })),
                ]
              : []),
          ].map(({ to, label, search: linkSearch }) => (
            <Link
              key={`${to}-${label}`}
              to={to}
              search={linkSearch as never}
              activeProps={{ className: 'border-action bg-action-soft text-ink' }}
              className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 font-ui text-label font-semibold text-ink-soft"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="mx-3 mb-3 min-w-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface lg:ml-0 lg:mt-3">
        <div className="w-full space-y-5 p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// Guarda das seções administrativas.
export function AdminOnly({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  if (session && session.user.role !== 'admin') {
    return <p className="text-sm text-muted">Somente consultores PSO têm acesso a esta área.</p>;
  }
  return <>{children}</>;
}

// Hooks de escopo (empresa/unidade): resolvem o id efetivo a partir da URL,
// caindo no contexto ATIVO do app e por fim na primeira opção visível.
export function useCompanyScope(value?: string) {
  const active = useActiveContext((s) => s.companyId);
  const companies = useQuery(trpc.companies.list.queryOptions());
  const resolve = (id: string | null | undefined) =>
    companies.data?.some((row) => row.id === id) ? id! : undefined;
  const companyId = resolve(value) ?? resolve(active) ?? companies.data?.[0]?.id;
  return { companyId, companies: companies.data, empty: companies.data?.length === 0 };
}

export function useUnitScope(companyId: string | undefined, value?: string) {
  const active = useActiveContext((s) => s.unitId);
  const units = useQuery({
    ...trpc.units.listByCompany.queryOptions({ companyId: companyId ?? '' }),
    enabled: Boolean(companyId),
  });
  const resolve = (id: string | null | undefined) =>
    units.data?.some((row) => row.id === id) ? id! : undefined;
  const unitId = resolve(value) ?? resolve(active) ?? units.data?.[0]?.id;
  return { unitId, units: units.data, empty: units.data?.length === 0 };
}

// Cabeçalho padrão de seção.
export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-ui text-lg font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
