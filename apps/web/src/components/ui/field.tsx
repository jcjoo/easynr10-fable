import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export function Field({ label, hint, error, className = '', ...input }: FieldProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-ui text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={`rounded-ctl border bg-surface px-2.5 py-2 text-[15px] text-ink
          focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0
          ${error ? 'border-bad' : 'border-line-strong focus-visible:border-action'}`}
        {...input}
      />
      {error ? (
        <span className="text-xs text-bad">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}
