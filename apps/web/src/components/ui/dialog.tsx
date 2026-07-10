import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Chip opcional ao lado do título (ex.: código da norma no diagnóstico). */
  titleBadge?: ReactNode;
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
export function Dialog({ open, onClose, title, titleBadge, children, size = 'md' }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Portal no body: `fixed` dentro de ancestral com transform (ex.: a sidebar,
  // que anima com translate-x) vira relativo a ele — o modal ficava preso aos
  // 256px do aside quando aberto pelo menu "Novo".
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        // min-w-0: sem isso o item de grid expande até o min-content do
        // conteúdo e o dialog estoura a viewport no mobile.
        className={`flex max-h-[calc(100dvh-2rem)] w-full min-w-0 flex-col ${sizeClasses[size]} rounded-card border border-line-strong bg-surface shadow-pop`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex min-w-0 items-center gap-2.5 font-ui text-base font-semibold">
            <span className="truncate">{title}</span>
            {titleBadge}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-paper hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
