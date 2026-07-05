// Controle segmentado (abas de visão) — padrão único do sistema, o mesmo das
// abas de tipo de equipamento nos Cadastros. Para filtros use FilterChips.
interface SegmentedTabsProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SegmentedTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-fit items-center gap-0.5 rounded-ctl bg-paper p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-[3px] px-3 py-1.5 font-ui text-[13px] font-semibold ${
            value === option.value
              ? 'bg-surface text-action shadow-sm'
              : 'cursor-pointer text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
