import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { env } from './env';
import { auth } from './auth';
import { appRouter } from './routers';
import { createContext } from './trpc';
import { registerReportExport } from './report-export';
import { bootstrapAdmin } from './bootstrap-admin';

// Hono fetch-native no Bun.serve: better-auth e tRPC já falam Request/Response
// web-standard, então as rotas repassam o request cru — sem adaptadores.
const app = new Hono();

app.use(logger());
app.use('/api/*', cors({ origin: env.FRONTEND_URL, credentials: true }));

// Rotas do better-auth (login, logout, sessão, OAuth…). O auto-registro
// público fica bloqueado: contas são criadas SÓ pelo admin (users.create /
// createForCompany / bootstrap-admin), que chama `auth.api.signUpEmail`
// server-side — em processo, sem passar por este handler HTTP. Bloquear aqui
// (em vez de `disableSignUp`) fecha o endpoint público sem quebrar a criação
// interna, que passaria pela mesma guarda do better-auth.
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  if (c.req.path.startsWith('/api/auth/sign-up')) {
    return c.json({ error: 'Cadastro público desabilitado' }, 403);
  }
  return auth.handler(c.req.raw);
});

// Rotas tRPC.
app.on(['GET', 'POST'], '/api/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c.req.raw.headers),
  }),
);

// Download de relatórios (CSV/PDF) com o cookie de sessão (RF22).
registerReportExport(app);

app.get('/health', (c) => c.json({ status: 'ok' }));

await bootstrapAdmin();

Bun.serve({ port: env.PORT, hostname: '0.0.0.0', fetch: app.fetch });
console.log(`API ouvindo em :${env.PORT}`);
