import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';

// Seletor de escopo (empresa/unidade) das Configurações: botão estilo
// breadcrumb (rótulo pequeno + nome atual) com popover de opções — no lugar
// de <select> nativo empilhado. Portal: não é cortado por overflow/transform.

export function ScopePicker({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  icon: LucideIcon;
  /** id selecionado; undefined = "todas" (quando allLabel existe). */
  value?: string;
  options?: { id: string; name: string }[];
  onChange: (id: string | undefined) => void;
  /** Opção "sem recorte" (ex.: "Todas as empresas"). */
  allLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const close = () => setAnchor(null);

  // Rolagem/resize invalidam a âncora — fecha (mesma regra do row-menu).
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  const current = options?.find((option) => option.id === value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchor)}
        onClick={() => {
          if (anchor) return close();
          const rect = buttonRef.current?.getBoundingClientRect();
          // Clampa à viewport: botão no canto direito não estoura o popover.
          if (rect) {
            setAnchor({
              top: rect.bottom + 4,
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
            });
          }
        }}
        className="flex min-w-44 cursor-pointer items-center gap-2.5 rounded-ctl border border-line-strong bg-surface py-1.5 pl-3 pr-2.5 text-left hover:border-ink-soft"
      >
        <Icon aria-hidden className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-micro uppercase tracking-[.12em] text-muted">
            {label}
          </span>
          <span className="block truncate font-ui text-sm font-semibold">
            {current?.name ?? allLabel ?? '…'}
          </span>
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
      </button>

      {anchor &&
        createPortal(
          <>
            <div aria-hidden className="fixed inset-0 z-40" onClick={close} />
            <div
              role="listbox"
              aria-label={label}
              style={{ top: anchor.top, left: anchor.left }}
              className="fixed z-50 max-h-80 min-w-56 overflow-y-auto rounded-card border border-line-strong bg-surface py-1 shadow-pop"
            >
              {allLabel && (
                <ScopeOption
                  name={allLabel}
                  selected={value === undefined}
                  onSelect={() => {
                    onChange(undefined);
                    close();
                  }}
                />
              )}
              {options?.map((option) => (
                <ScopeOption
                  key={option.id}
                  name={option.name}
                  selected={option.id === value}
                  onSelect={() => {
                    onChange(option.id);
                    close();
                  }}
                />
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function ScopeOption({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left font-ui text-sm hover:bg-paper ${
        selected ? 'font-semibold text-action' : 'text-ink'
      }`}
    >
      <Check aria-hidden className={`size-4 shrink-0 ${selected ? '' : 'invisible'}`} />
      <span className="truncate">{name}</span>
    </button>
  );
}
