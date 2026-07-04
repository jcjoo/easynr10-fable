import { diagnosticStatusLabels, type DiagnosticStatus } from '@easynr10/shared';

// Escala de aderência (5 níveis) definida pelo usuário. Item sem diagnóstico
// usa 'sem_avaliacao'.
export type AdherenceStatus = DiagnosticStatus | 'sem_avaliacao';

const colors: Record<AdherenceStatus, string> = {
  inexistente: 'text-bad bg-bad-soft',
  inadequada: 'text-alert bg-alert-soft',
  parcial: 'text-warn bg-warn-soft',
  suficiente: 'text-suf bg-suf-soft',
  plena: 'text-ok bg-ok-soft',
  sem_avaliacao: 'text-idle bg-idle-soft',
};

export function statusPillLabel(status: AdherenceStatus) {
  return status === 'sem_avaliacao' ? 'Sem avaliação' : diagnosticStatusLabels[status];
}

export function StatusPill({ status }: { status: AdherenceStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5
        font-ui text-[12.5px] font-semibold ${colors[status]}`}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {statusPillLabel(status)}
    </span>
  );
}
