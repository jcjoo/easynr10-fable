import { diagnosticStatuses, diagnosticStatusLabels, type DiagnosticStatus } from '@easynr10/shared';

// Seletor da nota de aderência (documento, vínculo, evidência) — 5 níveis.
// null = sem nota (conta como Inexistente no cálculo); com `allowClear`, a
// opção "Sem nota" limpa a seleção.
export function AdherencePicker({
  value,
  onChange,
  allowClear = true,
  size = 'md',
  className = '',
  ariaLabel,
}: {
  value: DiagnosticStatus | null;
  onChange: (value: DiagnosticStatus | null) => void;
  allowClear?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  const pad = size === 'sm' ? 'px-2 py-1 text-caption' : 'px-2.5 py-2 text-[15px]';
  return (
    <select
      aria-label={ariaLabel ?? 'Aderência'}
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as DiagnosticStatus | null)}
      className={`cursor-pointer rounded-ctl border border-line-strong bg-surface text-ink focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0 ${pad} ${className}`}
    >
      {allowClear && <option value="">Sem nota</option>}
      {diagnosticStatuses.map((status) => (
        <option key={status} value={status}>
          {diagnosticStatusLabels[status]}
        </option>
      ))}
    </select>
  );
}
