import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** md = formulários simples (default); lg = fluxos densos (diagnóstico);
   *  xl = conteúdo grande (preview de documento). */
  size?: 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

// Camada flutuante: única superfície com sombra (guia — raio & elevação).
export function Dialog({ open, onClose, title, children, size = 'md' }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${sizeClasses[size]} rounded-card border border-line-strong bg-surface shadow-[0_8px_24px_rgba(26,35,51,.2)]`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-ui text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-paper hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
