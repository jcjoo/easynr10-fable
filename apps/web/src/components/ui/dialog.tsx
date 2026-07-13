import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Título curto e estável — dado variável (nome de arquivo etc.) vai em `description`. */
  title: string;
  /** Chip opcional ao lado do título (ex.: código da norma no diagnóstico). */
  titleBadge?: ReactNode;
  /** Linha secundária sob o título; vira o aria-describedby do dialog. */
  description?: ReactNode;
  children: ReactNode;
  /** sm = confirmações (400px); md = formulários simples (default);
   *  lg = fluxos densos (diagnóstico); xl = conteúdo grande (preview). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Ações fixas no rodapé. Com footer, o corpo é o único contêiner rolável —
   *  o consumidor não precisa (nem deve) medir viewport com max-h-[7xvh]. */
  footer?: ReactNode;
  /** Fita âmbar de sinalização no topo — reservada ao ConfirmDialog. */
  tape?: boolean;
}

const sizeClasses = {
  sm: 'max-w-[400px]',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

// Pilha de dialogs abertos: só o do topo responde ao ESC (dialogs aninhados,
// ex.: confirmação sobre o histórico de versões, não fecham o de baixo junto).
const dialogStack: symbol[] = [];
// Trava de scroll do fundo com contagem — dois dialogs abertos ao mesmo tempo
// não podem destravar o body quando o primeiro fechar.
let scrollLocks = 0;

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), ' +
  'select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, ...props }: DialogProps) {
  if (!open) return null;
  return <DialogLayer {...props} />;
}

// Camada flutuante: única superfície com sombra (guia — raio & elevação).
// Componente separado para os efeitos de foco/trava valerem por abertura.
function DialogLayer({
  onClose,
  title,
  titleBadge,
  description,
  children,
  size = 'md',
  footer,
  tape = false,
}: Omit<DialogProps, 'open'>) {
  const id = useRef(Symbol('dialog'));
  const containerRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  // Guarda de rascunho: texto digitado no dialog não se perde num ESC/✕
  // acidental — pedimos confirmação antes de descartar.
  const dirtyRef = useRef(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const confirmingDiscardRef = useRef(false);
  confirmingDiscardRef.current = confirmingDiscard;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestCloseRef = useRef(() => {});
  requestCloseRef.current = () => {
    if (confirmingDiscardRef.current) {
      setConfirmingDiscard(false);
      return;
    }
    if (dirtyRef.current) {
      setConfirmingDiscard(true);
      return;
    }
    onCloseRef.current();
  };

  useEffect(() => {
    const self = id.current;
    dialogStack.push(self);
    scrollLocks += 1;
    document.body.style.overflow = 'hidden';

    // Foco entra no primeiro campo (ou no botão Cancelar, nas confirmações)
    // e volta ao elemento que abriu quando o dialog fecha.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const target =
      container?.querySelector<HTMLElement>('[data-autofocus]') ??
      (size === 'sm'
        ? container?.querySelector<HTMLElement>('[data-dialog-foot] button:not(:disabled)')
        : null) ??
      container?.querySelector<HTMLElement>(
        '[data-dialog-body] input:not([type="hidden"]):not(:disabled), ' +
          '[data-dialog-body] select:not(:disabled), [data-dialog-body] textarea:not(:disabled)',
      ) ??
      container?.querySelector<HTMLElement>(`[data-dialog-body] :is(${FOCUSABLE})`) ??
      container?.querySelector<HTMLElement>('[data-dialog-foot] button:not(:disabled)') ??
      container ??
      null;
    target?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (dialogStack.at(-1) !== self) return;
      event.stopPropagation();
      requestCloseRef.current();
    }
    window.addEventListener('keydown', onKeyDown);

    return () => {
      dialogStack.splice(dialogStack.indexOf(self), 1);
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, []);

  // Tab preso ao dialog — sem escapar para a página atrás do overlay.
  function trapTab(event: React.KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const container = containerRef.current;
    if (!container) return;
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function markDirty(event: React.FormEvent) {
    const el = event.target;
    const isText =
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'file', 'button', 'submit', 'range'].includes(el.type));
    if (isText) dirtyRef.current = true;
  }

  // Portal no body: `fixed` dentro de ancestral com transform (ex.: a sidebar,
  // que anima com translate-x) vira relativo a ele — o modal ficava preso aos
  // 256px do aside quando aberto pelo menu "Novo".
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 animate-[overlay-in_140ms_ease-out] motion-reduce:animate-none"
      // Clique no backdrop só fecha confirmações — num formulário, um clique
      // acidental fora descartaria o que foi preenchido.
      onClick={size === 'sm' ? () => requestCloseRef.current() : undefined}
      onKeyDown={trapTab}
      onInput={markDirty}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // min-w-0: sem isso o item de grid expande até o min-content do
        // conteúdo e o dialog estoura a viewport no mobile.
        className={`flex max-h-[calc(100dvh-2rem)] w-full min-w-0 flex-col ${sizeClasses[size]} rounded-card border border-line-strong bg-surface shadow-pop animate-[dialog-in_140ms_ease-out] motion-reduce:animate-none`}
      >
        {tape && <div aria-hidden className="tape h-[5px] shrink-0 rounded-t-card" />}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="flex min-w-0 items-center gap-2.5 font-ui text-base font-semibold">
              <span className="truncate">{title}</span>
              {titleBadge}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 truncate text-caption text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => requestCloseRef.current()}
            aria-label="Fechar"
            className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-paper hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
        {footer && (
          <div
            data-dialog-foot
            className="flex shrink-0 items-center justify-end gap-2 rounded-b-card border-t border-line bg-paper/60 px-5 py-3"
          >
            {footer}
          </div>
        )}
      </div>

      {confirmingDiscard && (
        <div
          className="absolute inset-0 z-10 grid place-items-center bg-ink/40 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Descartar alterações"
            className="flex w-full max-w-[360px] flex-col rounded-card border border-line-strong bg-surface shadow-pop animate-[dialog-in_140ms_ease-out] motion-reduce:animate-none"
          >
            <div aria-hidden className="tape h-[5px] shrink-0 rounded-t-card" />
            <p className="px-5 pb-2 pt-4 font-ui text-base font-semibold">Descartar alterações?</p>
            <p className="px-5 text-sm text-ink-soft">
              O que você digitou aqui ainda não foi salvo.
            </p>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                autoFocus
                onClick={() => setConfirmingDiscard(false)}
              >
                Continuar editando
              </Button>
              <Button type="button" variant="danger" onClick={() => onCloseRef.current()}>
                Descartar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
