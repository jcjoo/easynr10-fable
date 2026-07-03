import { diagnosticStatuses, type DiagnosticStatus } from '@easynr10/shared';

// Filtro de status do guia: chip ativo em Ink (estado, não navegação).
// A seleção deve persistir na URL (search param `status`).

const dots: Record<DiagnosticStatus, string> = {
  insuficiente: 'bg-bad',
  parcial: 'bg-warn',
  suficiente: 'bg-suf',
  conforme: 'bg-ok',
};

const labels: Record<DiagnosticStatus, string> = {
  insuficiente: 'Insuficiente',
  parcial: 'Parcial',
  suficiente: 'Suficiente',
  conforme: 'Conforme',
};

interface StatusFilterProps {
  value: DiagnosticStatus | null;
  onChange: (value: DiagnosticStatus | null) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-ui text-[13px]
     font-semibold cursor-pointer ${
       active
         ? 'border-ink bg-ink text-paper'
         : 'border-line-strong bg-surface text-ink-soft hover:border-ink-soft'
     }`;

  return (
    <div role="group" aria-label="Filtrar por aderência" className="flex flex-wrap gap-1.5">
      <button type="button" className={chip(value === null)} onClick={() => onChange(null)}>
        <span aria-hidden className="size-2 rounded-full bg-line-strong" />
        Todos
      </button>
      {diagnosticStatuses.map((status) => (
        <button
          type="button"
          key={status}
          className={chip(value === status)}
          onClick={() => onChange(status)}
        >
          <span aria-hidden className={`size-2 rounded-full ${dots[status]}`} />
          {labels[status]}
        </button>
      ))}
    </div>
  );
}
