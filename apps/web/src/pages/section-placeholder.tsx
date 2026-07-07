// Placeholder genérico de seção (sem uso no momento — última seção real
// entregue na F4; mantido para fases futuras).

import { Page, PageTitle } from '@/components/ui/page';

export function SectionPlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <Page>
      <PageTitle>{title}</PageTitle>
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-20 text-center">
        <h2 className="font-ui text-base font-semibold">Em construção</h2>
        <p className="max-w-[46ch] text-sm text-muted">{description}</p>
        <span className="mt-2 font-mono text-xs uppercase tracking-[.12em] text-muted">
          {phase}
        </span>
      </div>
    </Page>
  );
}
