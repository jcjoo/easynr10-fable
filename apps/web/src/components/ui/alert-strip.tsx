import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

// Erro em faixa (guia — review dos modais): fundo bad-soft + borda + ícone,
// sempre imediatamente acima das ações — nunca texto solto no meio do corpo.
export function AlertStrip({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-ctl border border-bad/35 bg-bad-soft px-2.5 py-2 text-caption text-bad"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
