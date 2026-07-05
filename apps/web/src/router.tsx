import { useEffect, type JSX } from 'react';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { queryClient, trpc } from '@/lib/trpc';
import { useActiveContext } from '@/stores/active-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { CompaniesPage } from '@/pages/companies';
import { CompanyPanelPage } from '@/pages/company-panel';
import { UnitsPage } from '@/pages/units';
import { UnitHomePage, dashboardPeriods, type DashboardPeriod } from '@/pages/unit-home';
import { PiePage } from '@/pages/pie';
import { UsuariosPage } from '@/pages/usuarios';
import { PapeisPage } from '@/pages/papeis';
import { UsuariosEmpresaPage } from '@/pages/usuarios-empresa';
import { DiagnosticoItemPage } from '@/pages/diagnostico-item';
import { DiagnosticosPage } from '@/pages/diagnosticos';
import { PlanoDeAcaoPage } from '@/pages/plano-de-acao';
import { RelatoriosPage, reportTabs, type ReportSearch, type ReportTab } from '@/pages/relatorios';
import {
  documentGroups,
  equipmentTypes,
  type DocumentGroup,
  type EquipmentType,
} from '@easynr10/shared';
import { sortSearch, type SortState } from '@/components/ui/sortable';
import { ColaboradoresPage, EquipamentosPage } from '@/pages/registros';
import { NotFoundPage, RouteErrorPage } from '@/pages/error-pages';
import { expiryPresets, type ExpiryPreset } from '@/components/pie/expiry-filter';
import { diagnosticFilters, type DiagnosticFilter } from '@/components/ui/status-filter';

const rootRoute = createRootRoute({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// Layout autenticado: sem sessão → /login (a URL é a fonte da verdade).
// A sessão é validada UMA vez por load da SPA (não a cada navegação) — a
// expiração no meio do uso aparece como 401 nas chamadas tRPC.
let sessionCheck: Promise<{ user: { role?: string | null } } | null> | null = null;
function getSession() {
  sessionCheck ??= authClient.getSession().then(({ data }) => data ?? null);
  return sessionCheck;
}

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  beforeLoad: async ({ location }) => {
    if (!(await getSession())) {
      sessionCheck = null; // pós-login, a próxima navegação revalida
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  // Sincroniza o contexto ativo (sidebar) com os params da rota atual:
  // chegar por link direto já seleciona empresa/unidade.
  const params = useParams({ strict: false }) as { companyId?: string; unitId?: string };
  const setCompany = useActiveContext((s) => s.setCompany);
  const setUnit = useActiveContext((s) => s.setUnit);

  useEffect(() => {
    if (params.companyId && params.unitId) setUnit(params.companyId, params.unitId);
    else if (params.companyId) setCompany(params.companyId);
  }, [params.companyId, params.unitId, setCompany, setUnit]);

  return (
    // Shell fixo na viewport: sidebar e header não rolam; só o <main> tem scroll.
    <div className="flex h-screen overflow-hidden bg-paper text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {/* Painel de conteúdo estilo Drive: surface arredondada sobre o fundo paper */}
        <main className="mb-3 mr-3 min-w-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Cliente com UMA única empresa visível entra direto nela (a sidebar nem
// mostra "Empresas") — admins sempre veem a lista, que é onde criam empresas.
async function redirectSingleCompany() {
  const session = await getSession();
  if (!session || session.user.role === 'admin') return;
  const companies = await queryClient.ensureQueryData(trpc.companies.list.queryOptions());
  if (companies.length === 1) {
    throw redirect({ to: '/$companyId/unidades', params: { companyId: companies[0]!.id } });
  }
}

const dashboardRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  beforeLoad: redirectSingleCompany,
  component: DashboardPage,
});

const companiesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/empresas',
  beforeLoad: redirectSingleCompany,
  component: CompaniesPage,
});

// Params de rota são UUIDs — qualquer outra coisa é 404 (sem isso,
// /qualquer-coisa casaria com /$companyId e viraria "empresa" fantasma).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireUuidParams = (params: Record<string, string>) => {
  for (const value of Object.values(params)) {
    if (!UUID_RE.test(value)) throw notFound();
  }
};

const companyPanelRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId',
  beforeLoad: ({ params }) => requireUuidParams(params),
  component: CompanyPanelPage,
});

// Cliente com UMA única unidade visível na empresa entra direto nela (a
// entrada da unidade resolve a seção pela permissão, abaixo).
const unitsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/unidades',
  beforeLoad: async ({ params }) => {
    requireUuidParams(params);
    const session = await getSession();
    if (!session || session.user.role === 'admin') return;
    const units = await queryClient.ensureQueryData(
      trpc.units.listByCompany.queryOptions({ companyId: params.companyId }),
    );
    if (units.length === 1) {
      throw redirect({
        to: '/$companyId/$unitId',
        params: { companyId: params.companyId, unitId: units[0]!.id },
      });
    }
  },
  component: UnitsPage,
});

// Usuários da empresa (admin): só quem tem vínculo em unidades dela.
const usuariosEmpresaRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/usuarios',
  beforeLoad: ({ params }) => requireUuidParams(params),
  validateSearch: sortSearch,
  component: UsuariosEmpresaPage,
});

// Papéis por empresa (admin): mapeamento 1:1 com as permissões do servidor.
const papeisRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/papeis',
  beforeLoad: ({ params }) => requireUuidParams(params),
  component: PapeisPage,
});

// Entrar na unidade cai na primeira seção que o papel permite ler, na ordem
// da sidebar — sem "painel.ler" o usuário não toma 403 no painel; se nenhum
// módulo for legível, o 403 do painel fica como resposta honesta.
const unitEntrySections = [
  ['pie.ler', '/$companyId/$unitId/pie'],
  ['diagnostico.ler', '/$companyId/$unitId/diagnosticos'],
  ['plano.ler', '/$companyId/$unitId/plano-de-acao'],
  ['relatorios.ler', '/$companyId/$unitId/relatorios'],
  ['cadastros.ler', '/$companyId/$unitId/equipamentos'],
] as const;

// Período do gráfico de evolução do painel na URL (?periodo=30d|12m; 90d default).
const unitHomeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId',
  beforeLoad: async ({ params }) => {
    requireUuidParams(params);
    const permissions = new Set(
      await queryClient.ensureQueryData(
        trpc.units.myPermissions.queryOptions({ unitId: params.unitId }),
      ),
    );
    if (permissions.has('painel.ler')) return;
    const entry = unitEntrySections.find(([action]) => permissions.has(action));
    if (entry) throw redirect({ to: entry[1], params });
  },
  validateSearch: (search: Record<string, unknown>): { periodo?: DashboardPeriod } => ({
    periodo: dashboardPeriods.includes(search.periodo as DashboardPeriod)
      ? (search.periodo as DashboardPeriod)
      : undefined,
  }),
  component: UnitHomePage,
});

// Toda seção de unidade tem tabela ordenável (?ord=&dir= na URL) e aceita
// ?novo=1 (botão "Novo" da sidebar abre o editor de criação da tela).
const unitSection = (path: string, component: () => JSX.Element) =>
  createRoute({
    getParentRoute: () => authedRoute,
    path: `/$companyId/$unitId/${path}`,
    beforeLoad: ({ params }) => requireUuidParams(params),
    validateSearch: (search: Record<string, unknown>): { novo?: '1' } & SortState => ({
      novo: search.novo === '1' ? '1' : undefined,
      ...sortSearch(search),
    }),
    component,
  });

// Painel de usuários (admin): liberar acesso a empresas/unidades.
const usuariosRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/usuarios',
  validateSearch: sortSearch,
  component: UsuariosPage,
});

// Pasta atual, modo de visualização e filtro de vencimento do prontuário
// vivem na URL (?pasta=<id>&ver=documentos&venc=<preset>&de=&ate=).
const pieRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/pie',
  beforeLoad: ({ params }) => requireUuidParams(params),
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    pasta?: string;
    ver?: 'documentos';
    venc?: ExpiryPreset;
    de?: string;
    ate?: string;
  } & SortState => ({
    pasta: typeof search.pasta === 'string' ? search.pasta : undefined,
    ver: search.ver === 'documentos' ? 'documentos' : undefined,
    venc: expiryPresets.includes(search.venc as ExpiryPreset)
      ? (search.venc as ExpiryPreset)
      : undefined,
    de: typeof search.de === 'string' ? search.de : undefined,
    ate: typeof search.ate === 'string' ? search.ate : undefined,
    ...sortSearch(search),
  }),
  component: PiePage,
});
// Filtro de aderência persistido na URL — CSV componível
// (?status=inexistente,inadequada); só tokens válidos sobrevivem.
const diagnosticosRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/diagnosticos',
  beforeLoad: ({ params }) => requireUuidParams(params),
  validateSearch: (search: Record<string, unknown>): { status?: string } & SortState => {
    const tokens =
      typeof search.status === 'string'
        ? search.status
            .split(',')
            .filter((token) => diagnosticFilters.includes(token as DiagnosticFilter))
        : [];
    return {
      status: tokens.length > 0 ? tokens.join(',') : undefined,
      ...sortSearch(search),
    };
  },
  component: DiagnosticosPage,
});
// Configuração de um item de adequação (status, orientação, requisitos).
const diagnosticoItemRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/diagnosticos/$adequacyItemId',
  beforeLoad: ({ params }) => requireUuidParams(params),
  component: DiagnosticoItemPage,
});
const planoDeAcaoRoute = unitSection('plano-de-acao', PlanoDeAcaoPage);
// Relatório ativo, filtros e ordenação na URL (?tipo=&status=&grupo=&q=&ord=&dir=).
// O tipo tem default no parse — os filhos "Relatórios" da sidebar acendem
// pelo search mesmo quando a URL chega sem ?tipo.
const relatoriosRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/relatorios',
  beforeLoad: ({ params }) => requireUuidParams(params),
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    tipo: reportTabs.includes(search.tipo as ReportTab)
      ? (search.tipo as ReportTab)
      : 'nao-conformidades',
    status: typeof search.status === 'string' ? search.status : undefined,
    grupo: documentGroups.includes(search.grupo as DocumentGroup)
      ? (search.grupo as DocumentGroup)
      : undefined,
    q: typeof search.q === 'string' && search.q !== '' ? search.q : undefined,
    ...sortSearch(search),
  }),
  component: RelatoriosPage,
});
// Tipo de equipamento na URL (?tipo=eletrico|ferramenta|epi|epc, default
// eletrico) — os tipos são filhos de Cadastros na sidebar, não abas na página.
const equipamentosRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/equipamentos',
  beforeLoad: ({ params }) => requireUuidParams(params),
  validateSearch: (
    search: Record<string, unknown>,
  ): { novo?: '1'; tipo?: EquipmentType } & SortState => ({
    novo: search.novo === '1' ? '1' : undefined,
    tipo: equipmentTypes.includes(search.tipo as EquipmentType)
      ? (search.tipo as EquipmentType)
      : 'eletrico',
    ...sortSearch(search),
  }),
  component: EquipamentosPage,
});
const colaboradoresRoute = unitSection('colaboradores', ColaboradoresPage);

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    dashboardRoute,
    companiesRoute,
    usuariosRoute,
    companyPanelRoute,
    unitsRoute,
    papeisRoute,
    usuariosEmpresaRoute,
    unitHomeRoute,
    pieRoute,
    diagnosticosRoute,
    diagnosticoItemRoute,
    planoDeAcaoRoute,
    relatoriosRoute,
    equipamentosRoute,
    colaboradoresRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
