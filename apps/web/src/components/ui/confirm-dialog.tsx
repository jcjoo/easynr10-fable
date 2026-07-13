import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertStrip } from '@/components/ui/alert-strip';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Botão de confirmação nomeando o objeto: «Excluir unidade», não só «Excluir». */
  actionLabel: string;
  /** Rótulo durante o pending (ex.: «Excluindo…»); sem ele, actionLabel desabilitado. */
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  cancelLabel?: string;
  /** Texto da confirmação (e extras, ex.: checkbox de exclusão definitiva). */
  children: ReactNode;
}

// Confirmação destrutiva única (encerra os miolos duplicados nas páginas):
// size sm — backdrop fecha — com a fita âmbar de isolamento demarcando a ação
// de risco, o único lugar onde a faixa de sinalização aparece num dialog.
export function ConfirmDialog({
  open,
  onClose,
  title,
  actionLabel,
  pendingLabel,
  pending = false,
  disabled = false,
  error,
  onConfirm,
  cancelLabel = 'Cancelar',
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      tape
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending || disabled}
            onClick={onConfirm}
          >
            {pending && pendingLabel ? pendingLabel : actionLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-ink-soft [&_strong]:text-ink">{children}</div>
        {error && <AlertStrip>{error}</AlertStrip>}
      </div>
    </Dialog>
  );
}
