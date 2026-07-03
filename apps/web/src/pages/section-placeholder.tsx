// Placeholders das seções da unidade/empresa até as fases F2–F4.

import { Page } from '@/components/ui/page';

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
      <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
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

export function RelatoriosPage() {
  return (
    <SectionPlaceholder
      title="Relatórios"
      description="Relatório de Não Conformidades, situação documental do PIE e pendências do plano de ação — exportáveis em PDF e CSV."
      phase="Fase F4"
    />
  );
}

export function EquipamentosPage() {
  return (
    <SectionPlaceholder
      title="Equipamentos"
      description="Cadastro de equipamentos (elétrico, ferramenta, EPI, EPC) com pasta correspondente no PIE."
      phase="Fase F3"
    />
  );
}

export function ColaboradoresPage() {
  return (
    <SectionPlaceholder
      title="Colaboradores"
      description="Cadastro de colaboradores da unidade com pasta correspondente no PIE."
      phase="Fase F3"
    />
  );
}
