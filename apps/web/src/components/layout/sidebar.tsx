import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ChevronRight,
  ClipboardList,
  FileChartColumn,
  FolderKanban,
  LayoutGrid,
  ListTodo,
  MapPinned,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { signOut, useSession } from '@/lib/auth-client';
import { useActiveContext } from '@/stores/active-context';
import fullLogo from '@/assets/fullLogo.png';
import fullLogoDark from '@/assets/fullLogoDark.png';
import { SidebarFolderTree } from './folder-tree';

interface NavItemProps {
  to: string;
  params?: Record<string, string>;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  indent?: boolean;
}

function NavItem({ to, params, label, icon: Icon, exact, indent }: NavItemProps) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact: exact ?? false }}
      activeProps={{ className: 'active bg-action-soft text-ink' }}
      className={`group relative flex items-center gap-2.5 rounded-ctl py-1.5 pr-3 font-ui text-sm
        font-medium text-ink-soft hover:bg-line/60 hover:text-ink
        ${indent ? 'pl-8' : 'pl-3.5'}`}
    >
      {/* Indicador ativo: momento de marca (âmbar), como no client-test */}
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-hazard opacity-0 group-[.active]:opacity-100 group-hover:opacity-30"
      />
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <span className="truncate px-3.5 pb-1 font-mono text-[11px] font-medium uppercase tracking-[.12em] text-muted">
      {children}
    </span>
  );
}

function SubLabel({ children }: { children: string }) {
  return (
    <span className="truncate px-3.5 pb-0.5 pt-2 font-ui text-[12px] font-semibold text-muted">
      {children}
    </span>
  );
}

function CompanyGroup({ companyId }: { companyId: string }) {
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  return (
    <div className="flex flex-col gap-0.5">
      <GroupLabel>{company.data?.name ?? '…'}</GroupLabel>
      <NavItem to="/$companyId" params={{ companyId }} label="Painel" icon={LayoutGrid} exact />
      <NavItem
        to="/$companyId/unidades"
        params={{ companyId }}
        label="Unidades"
        icon={MapPinned}
      />
    </div>
  );
}

const PIE_TREE_KEY = 'easynr10.pie-tree';

function UnitGroup({ companyId, unitId }: { companyId: string; unitId: string }) {
  const unit = useQuery(trpc.units.byId.queryOptions({ unitId }));
  const params = { companyId, unitId };
  // Árvore de pastas recolhível (persistido; aberta por padrão).
  const [treeOpen, setTreeOpen] = useState(
    () => localStorage.getItem(PIE_TREE_KEY) !== 'fechada',
  );
  const toggleTree = () =>
    setTreeOpen((open) => {
      localStorage.setItem(PIE_TREE_KEY, open ? 'fechada' : 'aberta');
      return !open;
    });

  return (
    <div className="flex flex-col gap-0.5">
      <GroupLabel>{unit.data?.name ?? '…'}</GroupLabel>
      <NavItem to="/$companyId/$unitId" params={params} label="Painel" icon={LayoutGrid} exact />
      {/* Item PIE com seta colada no ícone (estilo Drive): seta+ícone alternam
          a árvore, o texto navega. pl-0.5 + seta(12px) deixa o ícone alinhado
          com os demais itens (pl-3.5 = 14px). */}
      <Link
        to="/$companyId/$unitId/pie"
        params={params}
        activeOptions={{ exact: false }}
        activeProps={{ className: 'active bg-action-soft text-ink' }}
        className="group relative flex items-center gap-2.5 rounded-ctl py-1.5 pl-0.5 pr-3 font-ui
          text-sm font-medium text-ink-soft hover:bg-line/60 hover:text-ink"
      >
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-hazard opacity-0 group-[.active]:opacity-100 group-hover:opacity-30"
        />
        <button
          type="button"
          aria-expanded={treeOpen}
          aria-label={treeOpen ? 'Recolher pastas do PIE' : 'Expandir pastas do PIE'}
          title={treeOpen ? 'Recolher pastas' : 'Expandir pastas'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTree();
          }}
          className="flex shrink-0 cursor-pointer items-center"
        >
          <ChevronRight
            aria-hidden
            className={`size-3 transition-transform ${treeOpen ? 'rotate-90' : ''}`}
          />
          <FolderKanban aria-hidden className="size-4 shrink-0" />
        </button>
        <span className="truncate">PIE</span>
      </Link>
      {treeOpen && <SidebarFolderTree companyId={companyId} unitId={unitId} />}
      <SubLabel>Avaliação da Conformidade</SubLabel>
      <NavItem
        to="/$companyId/$unitId/diagnosticos"
        params={params}
        label="Diagnóstico"
        icon={ClipboardList}
        indent
      />
      <NavItem
        to="/$companyId/$unitId/plano-de-acao"
        params={params}
        label="Plano de Ação"
        icon={ListTodo}
        indent
      />
      <NavItem
        to="/$companyId/$unitId/relatorios"
        params={params}
        label="Relatórios"
        icon={FileChartColumn}
      />
      <SubLabel>Cadastros</SubLabel>
      <NavItem
        to="/$companyId/$unitId/equipamentos"
        params={params}
        label="Equipamentos"
        icon={Wrench}
        indent
      />
      <NavItem
        to="/$companyId/$unitId/colaboradores"
        params={params}
        label="Colaboradores"
        icon={Users}
        indent
      />
    </div>
  );
}

export function Sidebar() {
  const { data: session } = useSession();
  const { companyId, unitId } = useActiveContext();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-paper">
      <div className="flex h-12 items-center px-5">
        <Link to="/" aria-label="EasyNR10 — início">
          <img src={fullLogo} alt="EasyNR10" className="h-5 dark:hidden" />
          <img src={fullLogoDark} alt="EasyNR10" className="hidden h-5 dark:block" />
        </Link>
      </div>

      <nav className="mt-3 flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col gap-0.5">
          <NavItem to="/empresas" label="Empresas" icon={Building2} />
          {session?.user.role === 'admin' && (
            <NavItem to="/usuarios" label="Usuários" icon={UserCog} />
          )}
        </div>
        {companyId && <CompanyGroup companyId={companyId} />}
        {companyId && unitId && <UnitGroup companyId={companyId} unitId={unitId} />}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-line p-4">
        <div className="min-w-0">
          <p className="truncate font-ui text-sm font-medium">{session?.user.name}</p>
          <p className="truncate text-xs text-muted">{session?.user.email}</p>
        </div>
        <button
          onClick={() => signOut().then(() => window.location.assign('/login'))}
          className="shrink-0 cursor-pointer rounded-ctl border border-line-strong px-2.5 py-1 font-ui text-[13px] font-semibold hover:bg-line/60"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
