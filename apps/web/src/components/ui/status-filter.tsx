import { diagnosticStatuses, diagnosticStatusLabels, type DiagnosticStatus } from '@easynr10/shared';
import { FilterChips } from './filter-chips';
import { adherenceDots } from './status-pill';

// Filtro de aderência: chips com contador (estado, não navegação; seleção
// persiste na URL). Além da escala, filtra itens sem/com avaliação.
// Chips COMPÕEM (multi-seleção, união dos recortes): clicar alterna o chip;
// "Todos" limpa. Na URL a seleção vira CSV (?status=inexistente,inadequada).

export type DiagnosticFilter = DiagnosticStatus | 'sem_avaliacao' | 'com_avaliacao';
export const diagnosticFilters: DiagnosticFilter[] = [
  ...diagnosticStatuses,
  'sem_avaliacao',
  'com_avaliacao',
];

const dots: Record<DiagnosticFilter, string> = {
  ...adherenceDots,
  com_avaliacao: 'bg-action',
};

const labels: Record<DiagnosticFilter, string> = {
  ...diagnosticStatusLabels,
  sem_avaliacao: 'Sem avaliação',
  com_avaliacao: 'Com avaliação',
};

interface StatusFilterProps {
  value: DiagnosticFilter[];
  onChange: (value: DiagnosticFilter[]) => void;
  // Contadores por filtro; vazio (Todos) usa a chave 'todos'.
  counts: Partial<Record<DiagnosticFilter | 'todos', number>>;
}

export function StatusFilter({ value, onChange, counts }: StatusFilterProps) {
  return (
    <FilterChips
      label="Filtrar por aderência"
      options={[
        { value: null, label: 'Todos', count: counts.todos ?? 0, dot: 'bg-line-strong' },
        ...diagnosticFilters.map((filter) => ({
          value: filter as string,
          label: labels[filter],
          count: counts[filter] ?? 0,
          dot: dots[filter],
        })),
      ]}
      isActive={(chip) => (chip === null ? value.length === 0 : value.includes(chip as DiagnosticFilter))}
      onSelect={(chip) => {
        if (chip === null) return onChange([]);
        const filter = chip as DiagnosticFilter;
        onChange(
          value.includes(filter) ? value.filter((item) => item !== filter) : [...value, filter],
        );
      }}
    />
  );
}
