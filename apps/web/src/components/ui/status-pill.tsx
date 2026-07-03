import type { DiagnosticStatus } from '@easynr10/shared';

// Escala de aderência do guia de design. Item sem diagnóstico usa 'sem_avaliacao'.
export type AdherenceStatus = DiagnosticStatus | 'sem_avaliacao';

const styles: Record<AdherenceStatus, { label: string; className: string }> = {
  insuficiente: { label: 'Insuficiente', className: 'text-bad bg-bad-soft' },
  parcial: { label: 'Parcial', className: 'text-warn bg-warn-soft' },
  suficiente: { label: 'Suficiente', className: 'text-suf bg-suf-soft' },
  conforme: { label: 'Conforme', className: 'text-ok bg-ok-soft' },
  sem_avaliacao: { label: 'Sem avaliação', className: 'text-idle bg-idle-soft' },
};

export function StatusPill({ status }: { status: AdherenceStatus }) {
  const { label, className } = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5
        font-ui text-[12.5px] font-semibold ${className}`}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {label}
    </span>
  );
}
