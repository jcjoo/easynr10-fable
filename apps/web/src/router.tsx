import { useEffect, useState, type JSX } from 'react';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useParams,
  useRouterState,
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
import { SettingsLayout } from '@/pages/configuracoes';
import { PerfilPage } from '@/pages/configuracoes/perfil';
import { AdmPage } from '@/pages/configuracoes/adm';
import { EmpresaPage, empresaTabs, type EmpresaTab } from '@/pages/configuracoes/empresa';
import { UnidadePage } from '@/pages/configuracoes/unidade';
import { DiagnosticoItemPage } from '@/pages/diagnostico-item';
import { DiagnosticosPage } from '@/pages/diagnosticos';
import { VisaoGeralPage } from '@/pages/visao-geral';
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
  // chegar por link direto já seleciona empresa/unidade; rota global (/,
  // /empresas, /configuracoes) LIMPA o contexto — manter a última empresa/
  // unidade na sidebar confundia ("por que ainda estou vendo essa unidade?").
  const params = useParams({ strict: false }) as { companyId?: string; unitId?: string };
  const setCompany = useActiveContext((s) => s.setCompany);
  const setUnit = useActiveContext((s) => s.setUnit);
  const clear = useActiveContext((s) => s.clear);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Configurações vive FORA deste layout, então não passa por aqui — entrar
  // e voltar de lá preserva o contexto ativo naturalmente.
  useEffect(() => {
    if (params.companyId && params.unitId) setUnit(params.companyId, params.unitId);
    else if (params.companyId) setCompany(params.companyId);
    else clear();
  }, [params.companyId, params.unitId, setCompany, setUnit, clear]);

  // No mobile a sidebar vira drawer (hambúrguer no header); navegar fecha.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => setSidebarOpen(false), [pathname]);

  return (
    // Shell fixo na viewport: sidebar e header não rolam; só o <main> tem scroll.
    // h-dvh (não h-screen): no mobile a barra do navegador encolhe a viewport.
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      {sidebarOpen && (
        <div
          aria-hidden
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        {/* Painel de conteúdo estilo Drive: surface arredondada sobre o fundo paper */}
        <main className="mx-3 mb-3 min-w-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface lg:ml-0">
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

// Usuários e Papéis da empresa moveram para Configurações — os links
// antigos redirecionam já com a empresa selecionada (?empresa=).
const usuariosEmpresaRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/usuarios',
  beforeLoad: ({ params }) => {
    requireUuidParams(params);
    throw redirect({
      to: '/configuracoes/empresa',
      search: { empresa: params.companyId, aba: 'usuarios' },
    });
  },
});

const papeisRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/papeis',
  beforeLoad: ({ params }) => {
    requireUuidParams(params);
    throw redirect({
      to: '/configuracoes/empresa',
      search: { empresa: params.companyId, aba: 'papeis' },
    });
  },
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

// Configurações: página INDEPENDENTE do shell autenticado (layout próprio,
// sem a sidebar principal) — mesma guarda de sessão, árvore separada.
const settingsAuthRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_settings',
  beforeLoad: async ({ location }) => {
    if (!(await getSession())) {
      sessionCheck = null;
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
});

const configuracoesRoute = createRoute({
  getParentRoute: () => settingsAuthRoute,
  path: '/configuracoes',
  component: SettingsLayout,
});

const configIndexRoute = createRoute({
  getParentRoute: () => configuracoesRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/configuracoes/perfil' });
  },
});

const configPerfilRoute = createRoute({
  getParentRoute: () => configuracoesRoute,
  path: '/perfil',
  component: PerfilPage,
});

const empresaSearch = (search: Record<string, unknown>): { empresa?: string } => ({
  empresa: typeof search.empresa === 'string' ? search.empresa : undefined,
});
const unidadeSearch = (search: Record<string, unknown>): { unidade?: string } => ({
  unidade: typeof search.unidade === 'string' ? search.unidade : undefined,
});
// Default no parse (mesma regra do ?tipo dos relatórios): os filhos da
// sidebar das Configurações acendem mesmo com a URL sem ?aba.
const abaSearch = (search: Record<string, unknown>): { aba: EmpresaTab } => ({
  aba: empresaTabs.includes(search.aba as EmpresaTab) ? (search.aba as EmpresaTab) : 'usuarios',
});

const configAdmRoute = createRoute({
  getParentRoute: () => configuracoesRoute,
  path: '/adm',
  validateSearch: (search: Record<string, unknown>) => ({
    ...empresaSearch(search),
    ...unidadeSearch(search),
  }),
  component: AdmPage,
});

const configEmpresaRoute = createRoute({
  getParentRoute: () => configuracoesRoute,
  path: '/empresa',
  validateSearch: (search: Record<string, unknown>) => ({
    ...empresaSearch(search),
    ...abaSearch(search),
  }),
  component: EmpresaPage,
});

const configUnidadeRoute = createRoute({
  getParentRoute: () => configuracoesRoute,
  path: '/unidade',
  validateSearch: (search: Record<string, unknown>) => ({
    ...empresaSearch(search),
    ...unidadeSearch(search),
    ...abaSearch(search),
  }),
  component: UnidadePage,
});

// Seções antigas das Configurações — reorganizadas nas 4 atuais.
const settingsRedirect = (path: string, to: string, aba?: EmpresaTab) =>
  createRoute({
    getParentRoute: () => configuracoesRoute,
    path,
    beforeLoad: () => {
      throw redirect({ to, search: aba ? { aba } : {} });
    },
  });
const configUsuariosRedirect = settingsRedirect('/usuarios', '/configuracoes/adm');
const configUsuariosEmpresaRedirect = settingsRedirect(
  '/usuarios-empresa',
  '/configuracoes/empresa',
  'usuarios',
);
const configUsuariosUnidadeRedirect = settingsRedirect(
  '/usuarios-unidade',
  '/configuracoes/unidade',
  'usuarios',
);
const configPapeisRedirect = settingsRedirect('/papeis', '/configuracoes/empresa', 'papeis');

// Rota antiga da gestão de usuários — movida para Configurações.
const usuariosRedirectRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/usuarios',
  beforeLoad: () => {
    throw redirect({ to: '/configuracoes/adm' });
  },
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
// Visão Geral da conformidade: itens do diagnóstico agrupados pela estrutura
// de grupos do checklist NR-10; mesmo filtro de aderência na URL.
const visaoGeralRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/$companyId/$unitId/visao-geral',
  beforeLoad: ({ params }) => requireUuidParams(params),
  validateSearch: (search: Record<string, unknown>): { status?: string } => {
    const tokens =
      typeof search.status === 'string'
        ? search.status
            .split(',')
            .filter((token) => diagnosticFilters.includes(token as DiagnosticFilter))
        : [];
    return { status: tokens.length > 0 ? tokens.join(',') : undefined };
  },
  component: VisaoGeralPage,
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
  settingsAuthRoute.addChildren([
    configuracoesRoute.addChildren([
      configIndexRoute,
      configPerfilRoute,
      configAdmRoute,
      configEmpresaRoute,
      configUnidadeRoute,
      configUsuariosRedirect,
      configUsuariosEmpresaRedirect,
      configUsuariosUnidadeRedirect,
      configPapeisRedirect,
    ]),
  ]),
  authedRoute.addChildren([
    dashboardRoute,
    companiesRoute,
    usuariosRedirectRoute,
    companyPanelRoute,
    unitsRoute,
    papeisRoute,
    usuariosEmpresaRoute,
    unitHomeRoute,
    pieRoute,
    visaoGeralRoute,
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
