import { Children, isValidElement, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Building2,
  Cable,
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileClock,
  FileSignature,
  FolderKanban,
  Gauge,
  HardHat,
  House,
  LayoutGrid,
  ListChecks,
  ListTodo,
  MapPinned,
  Settings,
  TrafficCone,
  TriangleAlert,
  Users,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { signOut, useSession } from '@/lib/auth-client';
import { useActiveContext } from '@/stores/active-context';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { SETTINGS_FROM_KEY } from '@/pages/configuracoes';
import { NewMenu } from './new-menu';
import fullLogo from '@/assets/fullLogo.png';
import fullLogoDark from '@/assets/fullLogoDark.png';
import { SidebarFolderTree } from './folder-tree';


interface NavItemProps {
  to: string;
  params?: Record<string, string>;
  /** Sub-navegações (?tipo=): o item só acende quando o search casa. */
  search?: Record<string, string>;
  /** Clique (ex.: gravar a origem para o Voltar das Configurações). */
  onClick?: () => void;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Nível de indentação: 1 = filho de seção, 2 = neto (tipos de equipamento). */
  depth?: 1 | 2;
}

const navItemPadding = { 1: 'pl-8', 2: 'pl-12' } as const;

function NavItem({ to, params, search, onClick, label, icon: Icon, exact, depth }: NavItemProps) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      onClick={onClick}
      activeOptions={{ exact: exact ?? false }}
      activeProps={{ className: 'active bg-action-soft text-ink' }}
      className={`group relative flex items-center gap-2.5 rounded-ctl py-1.5 pr-3 font-ui text-sm
        font-medium text-ink-soft hover:bg-line/60 hover:text-ink
        ${depth ? navItemPadding[depth] : 'pl-3.5'}`}
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
    <span className="truncate px-3.5 pb-1 font-mono text-micro font-medium uppercase tracking-[.12em] text-muted">
      {children}
    </span>
  );
}

// Seção recolhível da unidade (mesmo padrão da árvore do P.I.E): estado por
// seção persistido em localStorage, aberta por padrão.
function useCollapsed(id: string) {
  const key = `easynr10.sidebar.${id}`;
  const [open, setOpen] = useState(() => localStorage.getItem(key) !== 'fechada');
  const toggle = () =>
    setOpen((current) => {
      localStorage.setItem(key, current ? 'fechada' : 'aberta');
      return !current;
    });
  const expand = () => {
    localStorage.setItem(key, 'aberta');
    setOpen(true);
  };
  return { open, toggle, expand };
}

interface NavTarget {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}

// Primeiro descendente navegável (DFS) — atravessa fragments e seções
// aninhadas. Usado para o cabeçalho de seção "cair" no primeiro filho válido
// (ex.: Avaliação da Conformidade → Visão Geral).
function findFirstNav(children: ReactNode): NavTarget | null {
  let found: NavTarget | null = null;
  Children.forEach(children, (child) => {
    if (found || !isValidElement(child)) return;
    const props = child.props as {
      to?: string;
      params?: Record<string, string>;
      search?: Record<string, string>;
      children?: ReactNode;
    };
    if (typeof props.to === 'string') {
      found = { to: props.to, params: props.params, search: props.search };
      return;
    }
    if (props.children != null) {
      const nested = findFirstNav(props.children);
      if (nested) found = nested;
    }
  });
  return found;
}

// Pai recolhível — MESMA linguagem visual em todos os níveis (padrão do item
// P.I.E): linha de item com chevron colado no ícone, na grade de recuo única
// (ícone em 14px no nível 0 / 32px no nível 1; filhos um passo abaixo).
function Section({
  id,
  label,
  icon: Icon,
  depth,
  children,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  depth?: 1;
  children: ReactNode;
}) {
  const { open, toggle, expand } = useCollapsed(id);
  // Sem navegação própria: o cabeçalho cai no primeiro filho navegável (e
  // expande). A seta continua recolhendo/expandindo (padrão do item P.I.E).
  const target = findFirstNav(children);
  const rowClass = `group flex cursor-pointer items-center gap-2.5 rounded-ctl py-1.5 pr-3 text-left
    font-ui text-sm font-medium text-ink-soft hover:bg-line/60 hover:text-ink
    ${depth ? 'pl-5' : 'mt-1 pl-0.5'}`;
  const iconChevron = (
    <>
      <ChevronRight
        aria-hidden
        className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`}
      />
      <Icon aria-hidden className="size-4 shrink-0" />
    </>
  );
  return (
    <>
      {target ? (
        // Texto navega ao 1º filho + expande; a seta+ícone recolhem (padrão P.I.E).
        <Link
          to={target.to}
          params={target.params}
          search={target.search}
          onClick={expand}
          className={rowClass}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Recolher ${label}` : `Expandir ${label}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }}
            className="flex shrink-0 cursor-pointer items-center"
          >
            {iconChevron}
          </button>
          <span className="truncate">{label}</span>
        </Link>
      ) : (
        <button type="button" aria-expanded={open} onClick={toggle} className={rowClass}>
          <span className="flex shrink-0 items-center">{iconChevron}</span>
          <span className="truncate">{label}</span>
        </button>
      )}
      {open ? (
        children
      ) : (
        // Recolhida, a seção ainda mostra o item ATIVO (e só ele) — a página
        // atual nunca some da navegação. Esconde também os toggles filhos
        // (Equipamentos), cujo próprio recolhido repete a regra.
        <div className="contents [&_a:not(.active)]:hidden [&_button]:hidden">{children}</div>
      )}
    </>
  );
}

function CompanyGroup({ companyId }: { companyId: string }) {
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  // Cliente com uma única unidade entra direto nela — "Unidades" some
  // (a rota redirecionaria de volta). Enquanto carrega, não esconder.
  const units = useQuery({
    ...trpc.units.listByCompany.queryOptions({ companyId }),
    enabled: session != null && !isAdmin,
  });
  const showUnits = isAdmin || !units.isSuccess || units.data.length > 1;
  return (
    <div className="flex flex-col gap-0.5">
      <GroupLabel>{company.data?.name ?? '…'}</GroupLabel>
      <NavItem to="/$companyId" params={{ companyId }} label="Painel" icon={LayoutGrid} exact />
      {showUnits && (
        <NavItem
          to="/$companyId/unidades"
          params={{ companyId }}
          label="Unidades"
          icon={MapPinned}
        />
      )}
    </div>
  );
}

const PIE_TREE_KEY = 'easynr10.pie-tree';

function UnitGroup({ companyId, unitId }: { companyId: string; unitId: string }) {
  const unit = useQuery(trpc.units.byId.queryOptions({ unitId }));
  const params = { companyId, unitId };
  // Módulo sem permissão de leitura ("*.ler") some da navegação.
  const { can, loaded } = useUnitPermissions(unitId);
  const show = (action: Parameters<typeof can>[0]) => !loaded || can(action);
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
      {show('painel.ler') && (
        <NavItem to="/$companyId/$unitId" params={params} label="Painel" icon={LayoutGrid} exact />
      )}
      {show('pie.ler') && (
        <>
      {/* Item P.I.E com seta colada no ícone (estilo Drive): seta+ícone alternam
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
          aria-label={treeOpen ? 'Recolher pastas do P.I.E' : 'Expandir pastas do P.I.E'}
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
        <span className="truncate">P.I.E</span>
      </Link>
      {treeOpen && <SidebarFolderTree companyId={companyId} unitId={unitId} />}
        </>
      )}
      {(show('diagnostico.ler') || show('plano.ler')) && (
        <Section id="avaliacao" label="Avaliação da Conformidade" icon={BadgeCheck}>
          {show('diagnostico.ler') && (
            <>
              <NavItem
                to="/$companyId/$unitId/visao-geral"
                params={params}
                label="Visão Geral"
                icon={Gauge}
                depth={1}
              />
              <NavItem
                to="/$companyId/$unitId/diagnosticos"
                params={params}
                label="Diagnóstico"
                icon={ClipboardList}
                depth={1}
              />
            </>
          )}
          {show('plano.ler') && (
            <NavItem
              to="/$companyId/$unitId/plano-de-acao"
              params={params}
              label="Plano de Ação"
              icon={ListTodo}
              depth={1}
            />
          )}
        </Section>
      )}
      {/* Relatórios e tipos de equipamento são FILHOS aqui — as páginas não
          têm mais navegação interna (?tipo= na URL acende o item). */}
      {show('relatorios.ler') && (
        <Section id="relatorios" label="Relatórios" icon={ChartColumn}>
          <NavItem
            to="/$companyId/$unitId/relatorios"
            params={params}
            search={{ tipo: 'nao-conformidades' }}
            label="Não Conformidades"
            icon={TriangleAlert}
            depth={1}
          />
          <NavItem
            to="/$companyId/$unitId/relatorios"
            params={params}
            search={{ tipo: 'situacao-documental' }}
            label="Situação Documental"
            icon={FileClock}
            depth={1}
          />
          <NavItem
            to="/$companyId/$unitId/relatorios"
            params={params}
            search={{ tipo: 'plano-de-acao' }}
            label="Plano de Ação"
            icon={ListChecks}
            depth={1}
          />
        </Section>
      )}
      {show('cadastros.ler') && (
        <Section id="cadastros" label="Cadastros" icon={Database}>
          <NavItem
            to="/$companyId/$unitId/colaboradores"
            params={params}
            label="Colaboradores"
            icon={Users}
            depth={1}
          />
          <Section id="equipamentos" label="Equipamentos" icon={Cable} depth={1}>
            <NavItem
              to="/$companyId/$unitId/equipamentos"
              params={params}
              search={{ tipo: 'eletrico' }}
              label="Elétricos"
              icon={Zap}
              depth={2}
            />
            <NavItem
              to="/$companyId/$unitId/equipamentos"
              params={params}
              search={{ tipo: 'ferramenta' }}
              label="Ferramentas"
              icon={Wrench}
              depth={2}
            />
            <NavItem
              to="/$companyId/$unitId/equipamentos"
              params={params}
              search={{ tipo: 'epi' }}
              label="EPI"
              icon={HardHat}
              depth={2}
            />
            <NavItem
              to="/$companyId/$unitId/equipamentos"
              params={params}
              search={{ tipo: 'epc' }}
              label="EPC"
              icon={TrafficCone}
              depth={2}
            />
          </Section>
        </Section>
      )}
      {/* Autorizações é seção própria (não mais filha de Cadastros). */}
      {show('autorizacoes.ler') && (
        <Section id="autorizacoes" label="Autorizações" icon={FileSignature}>
          <NavItem
            to="/$companyId/$unitId/autorizacoes"
            params={params}
            search={{ tipo: 'permissao-trabalho' }}
            label="Autorização de Trabalho"
            icon={ClipboardCheck}
            depth={1}
          />
          <NavItem
            to="/$companyId/$unitId/autorizacoes"
            params={params}
            search={{ tipo: 'ficha-epi' }}
            label="Ficha de EPI"
            icon={HardHat}
            depth={1}
          />
        </Section>
      )}
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session } = useSession();
  const { companyId, unitId } = useActiveContext();
  const isAdmin = session?.user.role === 'admin';
  // Origem para o "Voltar" das Configurações (página fora deste shell).
  const currentHref = useRouterState({ select: (state) => state.location.href });
  // Cliente com uma única empresa entra direto nela — "Empresas" some
  // (a rota redirecionaria de volta). Enquanto carrega, não esconder.
  const companies = useQuery({
    ...trpc.companies.list.queryOptions(),
    enabled: session != null && !isAdmin,
  });
  const showCompanies = isAdmin || !companies.isSuccess || companies.data.length > 1;

  return (
    // Mobile: drawer sobreposto (o AuthedLayout põe o backdrop e fecha ao
    // navegar). Desktop (lg+): coluna fixa como antes.
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col bg-paper
        transition-transform lg:static lg:z-auto lg:translate-x-0
        ${open ? 'translate-x-0 shadow-pop lg:shadow-none' : '-translate-x-full'}`}
    >
      <div className="flex h-16 items-center justify-between px-5">
        <Link to="/" aria-label="EasyNR10 — início">
          <img src={fullLogo} alt="EasyNR10" className="h-9 dark:hidden" />
          <img src={fullLogoDark} alt="EasyNR10" className="hidden h-9 dark:block" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar menu"
          className="cursor-pointer rounded-ctl p-1.5 text-muted hover:bg-line/60 hover:text-ink lg:hidden"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      {/* Slot de altura FIXA do "Novo": sem unidade ativa (ou papel sem
          escrita) o botão some, mas o espaço fica — a navegação não pula. */}
      <div className="h-[42px] shrink-0">
        {companyId && unitId && <NewMenu companyId={companyId} unitId={unitId} />}
      </div>

      <nav className="mt-3 flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col gap-0.5">
          {/* Início = painel geral (/); cliente de empresa única é
              redirecionado pela própria rota. */}
          <NavItem to="/" label="Início" icon={House} exact />
          {showCompanies && <NavItem to="/empresas" label="Empresas" icon={Building2} />}
        </div>
        {companyId && <CompanyGroup companyId={companyId} />}
        {companyId && unitId && <UnitGroup companyId={companyId} unitId={unitId} />}
      </nav>

      {/* Seção fixa no rodapé (acima do usuário): Configurações é uma página
          própria — a origem gravada aqui alimenta o "Voltar" de lá. */}
      <div className="border-t border-line px-3 py-2">
        <NavItem
          to="/configuracoes"
          onClick={() => sessionStorage.setItem(SETTINGS_FROM_KEY, currentHref)}
          label="Configurações"
          icon={Settings}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line p-4">
        <div className="min-w-0">
          <p className="truncate font-ui text-sm font-medium">{session?.user.name}</p>
          <p className="truncate text-xs text-muted">{session?.user.email}</p>
        </div>
        <button
          onClick={() => signOut().then(() => window.location.assign('/login'))}
          className="shrink-0 cursor-pointer rounded-ctl border border-line-strong px-2.5 py-1 font-ui text-caption font-semibold hover:bg-line/60"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
