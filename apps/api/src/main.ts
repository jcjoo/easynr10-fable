import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { env } from './env';
import { auth } from './auth';
import { appRouter } from './routers';
import { createContext } from './trpc';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.FRONTEND_URL,
  credentials: true,
});

// Converte request Fastify → Request (fetch API) para better-auth e tRPC.
function toWebRequest(req: {
  method: string;
  url: string;
  protocol: string;
  hostname: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}): Request {
  const url = new URL(req.url, `${req.protocol}://${req.hostname}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) for (const item of value) headers.append(key, item);
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: req.body ? JSON.stringify(req.body) : undefined,
  });
}

async function sendWebResponse(reply: {
  status: (code: number) => unknown;
  header: (k: string, v: string) => unknown;
  send: (body: unknown) => unknown;
}, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
}

// Rotas do better-auth (login, logout, sessão, OAuth…).
app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  handler: async (request, reply) => {
    const response = await auth.handler(toWebRequest(request));
    await sendWebResponse(reply, response);
  },
});

// Rotas tRPC.
app.route({
  method: ['GET', 'POST'],
  url: '/api/trpc/*',
  handler: async (request, reply) => {
    const webRequest = toWebRequest(request);
    const response = await fetchRequestHandler({
      endpoint: '/api/trpc',
      req: webRequest,
      router: appRouter,
      createContext: () => createContext(webRequest.headers),
    });
    await sendWebResponse(reply, response);
  },
});

app.get('/health', () => ({ status: 'ok' }));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
