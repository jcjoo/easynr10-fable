import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/stores/theme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Modo escuro"
      title={dark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      onClick={toggle}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors
        ${dark ? 'border-action bg-action' : 'border-line-strong bg-idle-soft'}`}
    >
      <span
        className={`absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full
          bg-surface shadow-sm transition-[left]
          ${dark ? 'left-[22px]' : 'left-0.5'}`}
      >
        {dark ? (
          <Moon aria-hidden className="size-3 text-action" />
        ) : (
          <Sun aria-hidden className="size-3 text-muted" />
        )}
      </span>
    </button>
  );
}
