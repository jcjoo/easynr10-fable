import {
  diagnosticStatuses,
  diagnosticStatusLabels,
  type DiagnosticStatus,
} from '@easynr10/shared';

// Filtro de aderência: chips com contador (estado, não navegação; seleção
// persiste na URL). Além da escala, filtra itens sem/com avaliação.

export type DiagnosticFilter = DiagnosticStatus | 'sem_avaliacao' | 'com_avaliacao';
export const diagnosticFilters: DiagnosticFilter[] = [
  ...diagnosticStatuses,
  'sem_avaliacao',
  'com_avaliacao',
];

const dots: Record<DiagnosticFilter, string> = {
  inexistente: 'bg-bad',
  inadequada: 'bg-alert',
  parcial: 'bg-warn',
  suficiente: 'bg-suf',
  plena: 'bg-ok',
  sem_avaliacao: 'bg-idle',
  com_avaliacao: 'bg-action',
};

const labels: Record<DiagnosticFilter, string> = {
  ...diagnosticStatusLabels,
  sem_avaliacao: 'Sem avaliação',
  com_avaliacao: 'Com avaliação',
};

interface StatusFilterProps {
  value: DiagnosticFilter | null;
  onChange: (value: DiagnosticFilter | null) => void;
  // Contadores por filtro; `null` (Todos) usa a chave 'todos'.
  counts: Partial<Record<DiagnosticFilter | 'todos', number>>;
}

export function StatusFilter({ value, onChange, counts }: StatusFilterProps) {
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-ui text-[13px]
     font-semibold cursor-pointer ${
       active
         ? 'border-ink bg-ink text-paper'
         : 'border-line-strong bg-surface text-ink-soft hover:border-ink-soft'
     }`;

  const countBadge = (active: boolean, total: number | undefined) => (
    <span
      className={`tabular rounded-full px-1.5 font-mono text-[11px] ${
        active ? 'bg-paper/20' : 'bg-paper text-muted'
      }`}
    >
      {total ?? 0}
    </span>
  );

  return (
    <div role="group" aria-label="Filtrar por aderência" className="flex flex-wrap gap-1.5">
      <button type="button" className={chip(value === null)} onClick={() => onChange(null)}>
        <span aria-hidden className="size-2 rounded-full bg-line-strong" />
        Todos
        {countBadge(value === null, counts.todos)}
      </button>
      {diagnosticFilters.map((filter) => (
        <button
          type="button"
          key={filter}
          className={chip(value === filter)}
          onClick={() => onChange(filter)}
        >
          <span aria-hidden className={`size-2 rounded-full ${dots[filter]}`} />
          {labels[filter]}
          {countBadge(value === filter, counts[filter])}
        </button>
      ))}
    </div>
  );
}
