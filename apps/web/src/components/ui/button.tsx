import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'inline-flex items-center gap-2 rounded-ctl px-4 py-2 font-ui text-sm font-semibold ' +
  'leading-snug cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-paper',
  ghost: 'bg-transparent text-action hover:bg-action-soft',
  danger: 'bg-bad text-white hover:bg-[#a32b2b]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
