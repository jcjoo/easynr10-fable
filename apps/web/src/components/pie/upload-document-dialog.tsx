import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, X } from 'lucide-react';
import type { DiagnosticStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';
import { AdherencePicker } from '@/components/ui/adherence-picker';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.dwg';

interface UploadDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  folderId: string;
}

// Modal de novo documento, fiel ao legado: dropzone + documento padrão
// (com complemento quando o nome tem "- *") ou nome livre sem referência.
export function UploadDocumentDialog({
  open,
  onClose,
  unitId,
  folderId,
}: UploadDocumentDialogProps) {
  const queryClient = useQueryClient();
  const defaultDocuments = useQuery(trpc.defaultDocuments.list.queryOptions());

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [defaultDocumentId, setDefaultDocumentId] = useState('');
  const [withoutReference, setWithoutReference] = useState(false);
  const [freeName, setFreeName] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [warnDays, setWarnDays] = useState('');
  const [adherence, setAdherence] = useState<DiagnosticStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setDefaultDocumentId('');
      setWithoutReference(false);
      setFreeName('');
      setLabel('');
      setExpiresAt('');
      setWarnDays('');
      setAdherence(null);
      setError(null);
    }
  }, [open]);

  const sorted = useMemo(
    () =>
      [...(defaultDocuments.data ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      ),
    [defaultDocuments.data],
  );
  const selected = sorted.find((doc) => doc.id === defaultDocumentId);
  const needsLabel = !withoutReference && Boolean(selected?.name.includes('- *'));
  const finalName = withoutReference
    ? freeName.trim()
    : needsLabel
      ? (selected?.name.replace('- *', `- ${label.trim()}`) ?? '')
      : (selected?.name ?? '');

  const createUploadUrl = useMutation(trpc.documents.createUploadUrl.mutationOptions());
  const confirmUpload = useMutation(trpc.documents.confirmUpload.mutationOptions());

  const canSubmit =
    Boolean(file) &&
    finalName.length > 0 &&
    (!needsLabel || label.trim().length > 0) &&
    !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const mimeType = file.type || 'application/octet-stream';
      const { uploadUrl, storageKey } = await createUploadUrl.mutateAsync({
        unitId,
        fileName: file.name,
        mimeType,
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': mimeType },
      });
      if (!put.ok) throw new Error(`PUT ${put.status}`);
      await confirmUpload.mutateAsync({
        unitId,
        folderId,
        name: finalName,
        storageKey,
        mimeType,
        sizeBytes: file.size,
        expiresAt: expiresAt || null,
        warnDaysBefore: warnDays ? Number(warnDays) : null,
        documentGroup: withoutReference ? null : (selected?.documentGroup ?? null),
        adherence,
      });
      queryClient.invalidateQueries({
        queryKey: trpc.documents.listByFolder.queryKey({ unitId, folderId }),
      });
      // Re-avalia o auto-vínculo dos cadastros: se o documento tem o nome de um
      // documento padrão na pasta de um item, passa a aparecer vinculado lá.
      queryClient.invalidateQueries({
        queryKey: trpc.registers.documentLinks.queryKey({ unitId }),
      });
      onClose();
    } catch {
      setError('Falha ao enviar o documento — tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Novo documento">
      <form onSubmit={handleSubmit} className="flex max-h-[72vh] flex-col gap-4 overflow-y-auto pr-1">
        {/* Referência ao documento padrão */}
        {!withoutReference && (
          <SelectField
            label="Documento padrão"
            value={defaultDocumentId}
            onChange={(e) => setDefaultDocumentId(e.target.value)}
            hint={defaultDocuments.isLoading ? 'Carregando documentos padrão…' : undefined}
          >
            <option value="">Selecione o documento padrão</option>
            {sorted.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </SelectField>
        )}

        {withoutReference && (
          <Field
            label="Nome do documento"
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
            placeholder="Digite o nome do documento"
          />
        )}

        <label className="flex cursor-pointer items-center gap-2 font-ui text-caption font-medium">
          <input
            type="checkbox"
            checked={withoutReference}
            onChange={(e) => setWithoutReference(e.target.checked)}
            className="size-4 accent-[var(--color-action)]"
          />
          Documento sem referência
        </label>

        {needsLabel && (
          <div className="flex flex-col gap-1.5">
            <Field
              label="Complemento do documento"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: nome do equipamento ou colaborador"
            />
            <p className="break-words text-xs text-muted">{finalName}</p>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row">
          <Field
            label="Vencimento"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            hint="Vazio = não expira"
            className="flex-1"
          />
          <Field
            label="Notificar antes (dias)"
            type="number"
            min={1}
            value={warnDays}
            onChange={(e) => setWarnDays(e.target.value)}
            className="flex-1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-ui text-caption font-semibold">Aderência (opcional)</span>
          <AdherencePicker value={adherence} onChange={setAdherence} size="sm" />
          <p className="text-xs text-muted">
            Vira a nota inicial ao vincular este documento num cadastro e nas evidências.
          </p>
        </div>

        {/* Dropzone */}
        <div className="flex flex-col gap-1.5">
          <span className="font-ui text-caption font-semibold">Arquivo</span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) setFile(dropped);
            }}
            className={`relative rounded-card border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? 'border-action bg-action-soft' : 'border-line-strong hover:border-ink-soft'
            }`}
          >
            <input
              type="file"
              accept={ACCEPT}
              aria-label="Selecionar arquivo"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) setFile(picked);
                e.target.value = '';
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
            {file ? (
              <div className="pointer-events-none flex items-center justify-center gap-2">
                <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="truncate font-ui text-sm font-medium">{file.name}</span>
                <button
                  type="button"
                  aria-label="Remover arquivo"
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                  }}
                  className="pointer-events-auto cursor-pointer rounded-ctl p-1 text-muted hover:bg-paper hover:text-ink"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-1">
                <Upload aria-hidden className="size-7 text-muted" />
                <p className="text-sm text-ink-soft">Clique ou arraste um arquivo</p>
                <p className="text-xs text-muted">PDF, DOC, XLS, DWG, imagens…</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? 'Enviando…' : 'Criar documento'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
