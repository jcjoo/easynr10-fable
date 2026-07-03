import { Link } from '@tanstack/react-router';

export function DashboardPage() {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 p-16 text-center">
      <h1 className="text-xl font-bold tracking-tight">Painel em construção</h1>
      <p className="max-w-[44ch] text-sm text-muted">
        Os indicadores gerais de conformidade das empresas vão aparecer aqui (fase F4).
      </p>
      <Link
        to="/empresas"
        className="rounded-ctl bg-action px-4 py-2 font-ui text-sm font-semibold text-white hover:bg-action-hover"
      >
        Ir para empresas
      </Link>
    </div>
  );
}
