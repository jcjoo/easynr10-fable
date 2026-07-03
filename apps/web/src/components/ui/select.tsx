import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function SelectField({ label, hint, className = '', children, ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-ui text-[13px] font-semibold">
        {label}
      </label>
      <select
        id={id}
        className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] text-ink
          focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
        {...select}
      >
        {children}
      </select>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
