// Chips de filtro/segmentação — padrão visual único do sistema (o mesmo do
// Diagnóstico): ponto colorido opcional + contador opcional. Quem usa decide
// a semântica do clique (única ou composta) via isActive/onSelect.
export interface FilterChipOption {
  value: string | null;
  label: string;
  count?: number;
  /** Classe bg-* do ponto; omitido = sem ponto. */
  dot?: string;
}

interface FilterChipsProps {
  label: string;
  options: FilterChipOption[];
  isActive: (value: string | null) => boolean;
  onSelect: (value: string | null) => void;
}

const chipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-ui text-caption
   font-semibold cursor-pointer ${
     active
       ? 'border-ink bg-ink text-paper'
       : 'border-line-strong bg-surface text-ink-soft hover:border-ink-soft'
   }`;

export function FilterChips({ label, options, isActive, onSelect }: FilterChipsProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = isActive(option.value);
        return (
          <button
            key={option.value ?? '__todos'}
            type="button"
            aria-pressed={active}
            className={chipClass(active)}
            onClick={() => onSelect(option.value)}
          >
            {option.dot && <span aria-hidden className={`size-2 rounded-full ${option.dot}`} />}
            {option.label}
            {option.count !== undefined && (
              <span
                className={`tabular rounded-full px-1.5 font-mono text-micro ${
                  active ? 'bg-paper/20' : 'bg-paper text-muted'
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
