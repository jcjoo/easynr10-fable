import { useEffect, type JSX } from 'react';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
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
import { DiagnosticoItemPage } from '@/pages/diagnostico-item';
import { DiagnosticosPage } from '@/pages/diagnosticos';
import { PlanoDeAcaoPage } from '@/pages/plano-de-acao';
import { RelatoriosPage, reportTabs, type ReportSearch, type ReportTab } from '@/pages/relatorios';
import { documentGroups, type DocumentGroup } from '@easynr10/shared';
import { sortSearch, type SortState } from '@/components/ui/sortable';
import { ColaboradoresPage, EquipamentosPage } from '@/pages/registros';
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
let sessionCheck: Promise<boolean> | null = null;
function hasSession() {
  sessionCheck ??= authClient.getSession().then(({ data }) => Boolean(data));
  return sessionCheck;
}

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  beforeLoad: async ({ location }) => {
    if (!(await hasSession())) {
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

const dashboardRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: DashboardPage,
});

const companiesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/empresas',
  component: CompaniesPage,
});

const companyPanelRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId',
  component: CompanyPanelPage,
});

const unitsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/unidades',
  component: UnitsPage,
});

// Período do gráfico de evolução do painel na URL (?periodo=30d|12m; 90d default).
const unitHomeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId',
  validateSearch: (search: Record<string, unknown>): { periodo?: DashboardPeriod } => ({
    periodo: dashboardPeriods.includes(search.periodo as DashboardPeriod)
      ? (search.periodo as DashboardPeriod)
      : undefined,
  }),
  component: UnitHomePage,
});

// Toda seção de unidade tem tabela ordenável (?ord=&dir= na URL).
const unitSection = (path: string, component: () => JSX.Element) =>
  createRoute({
    getParentRoute: () => authedRoute,
    path: `/$companyId/$unitId/${path}`,
    validateSearch: sortSearch,
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
// Filtro de aderência persistido na URL (?status=<aderência|sem_avaliacao|com_avaliacao>).
const diagnosticosRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/diagnosticos',
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: DiagnosticFilter } & SortState => ({
    status: diagnosticFilters.includes(search.status as DiagnosticFilter)
      ? (search.status as DiagnosticFilter)
      : undefined,
    ...sortSearch(search),
  }),
  component: DiagnosticosPage,
});
// Configuração de um item de adequação (status, orientação, requisitos).
const diagnosticoItemRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/diagnosticos/$adequacyItemId',
  component: DiagnosticoItemPage,
});
const planoDeAcaoRoute = unitSection('plano-de-acao', PlanoDeAcaoPage);
// Relatório ativo, filtros e ordenação na URL (?tipo=&status=&grupo=&q=&ord=&dir=).
const relatoriosRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/relatorios',
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    tipo: reportTabs.includes(search.tipo as ReportTab) ? (search.tipo as ReportTab) : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
    grupo: documentGroups.includes(search.grupo as DocumentGroup)
      ? (search.grupo as DocumentGroup)
      : undefined,
    q: typeof search.q === 'string' && search.q !== '' ? search.q : undefined,
    ...sortSearch(search),
  }),
  component: RelatoriosPage,
});
const equipamentosRoute = unitSection('equipamentos', EquipamentosPage);
const colaboradoresRoute = unitSection('colaboradores', ColaboradoresPage);

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    dashboardRoute,
    companiesRoute,
    usuariosRoute,
    companyPanelRoute,
    unitsRoute,
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

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
