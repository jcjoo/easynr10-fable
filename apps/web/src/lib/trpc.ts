import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../../api/src/routers/index';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ir e voltar na mesma rota/pasta reusa o cache por 60s em vez de
      // refazer a requisição — o frescor vem da invalidação explícita nas
      // mutações. Depois de 60s, remontagem/foco revalidam em background
      // (cobre edições de outros usuários).
      staleTime: 60_000,
    },
  },
});

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
    }),
  ],
});

// Contrato tipado ponta a ponta: o tipo AppRouter vem direto da API (sem codegen).
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client,
  queryClient,
});
