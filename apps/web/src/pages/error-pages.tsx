import { Link, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { isForbiddenError } from '@/lib/trpc';

// Páginas de erro (403/404/genérica) — mesmo esqueleto: código gigante em
// mono, título, frase e ações. 404 = rota não encontrada (router);
// 403 = FORBIDDEN do tRPC estourado no error boundary (throwOnError).

function ErrorShell({
  code,
  title,
  phrase,
  children,
}: {
  code: string;
  title: string;
  phrase: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] w-full flex-1 flex-col items-center justify-center gap-5 bg-paper p-8 text-center">
      <div aria-hidden className="font-mono text-[88px] font-bold leading-none tracking-tight text-line-strong">
        {code}
      </div>
      <div>
        <h1 className="font-ui text-xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 max-w-[52ch] text-sm text-muted">{phrase}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <Button type="button" variant="secondary" onClick={() => router.history.back()}>
      Voltar
    </Button>
  );
}

function HomeLink() {
  return (
    <Link
      to="/"
      className="inline-flex cursor-pointer items-center gap-2 rounded-ctl bg-action px-4 py-2 font-ui text-sm font-semibold leading-snug text-white hover:opacity-90"
    >
      Ir para o início
    </Link>
  );
}

export function NotFoundPage() {
  return (
    <ErrorShell
      code="404"
      title="Página não encontrada"
      phrase="O endereço não existe ou foi movido — confira o link ou volte para o início."
    >
      <BackButton />
      <HomeLink />
    </ErrorShell>
  );
}

export function ForbiddenPage() {
  return (
    <ErrorShell
      code="403"
      title="Sem acesso"
      phrase="Você não tem permissão para ver este conteúdo. Se acha que deveria ter, peça a liberação a um consultor PSO."
    >
      <BackButton />
      <HomeLink />
    </ErrorShell>
  );
}

// Error boundary padrão das rotas: FORBIDDEN vira 403; o resto cai num
// erro genérico com opção de tentar de novo.
export function RouteErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  if (isForbiddenError(error)) return <ForbiddenPage />;
  return (
    <ErrorShell
      code=":("
      title="Algo deu errado"
      phrase={error.message || 'Erro inesperado ao carregar esta página.'}
    >
      <Button type="button" variant="secondary" onClick={reset}>
        Tentar de novo
      </Button>
      <HomeLink />
    </ErrorShell>
  );
}
