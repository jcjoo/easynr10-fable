import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, X } from 'lucide-react';
import { normalizeText, type DiagnosticStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/ui/alert-strip';
import { Field } from '@/components/ui/field';
import { AdherencePicker } from '@/components/ui/adherence-picker';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.dwg';
const ACCEPT_LIST = ACCEPT.split(',');

// Comparação frouxa para busca/auto-match: sem acento, caixa e pontuação.
const squash = (value: string) => normalizeText(value).replace(/[^a-z0-9]/g, '');

// A convenção "- *" no nome do documento padrão marca onde entra o
// complemento (ex.: "ASO - *" → "ASO - João Silva"). Na UI ela nunca
// aparece crua: mostramos o nome-base e um campo "Complemento".
const baseName = (name: string) => name.replace('- *', '').trim();

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

// PUT com XMLHttpRequest: fetch não reporta progresso de upload — um DWG
// grande ficava em "Enviando…" indefinido.
function putFile(url: string, file: File, mimeType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('falha de rede'));
    xhr.send(file);
  });
}

interface UploadDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  folderId: string;
  /** Nome da pasta de destino — vira a descrição do cabeçalho. */
  folderName?: string;
}

// Enviar documento (o modal mais usado do P.I.E): o arquivo — objeto da ação —
// vem primeiro e sugere o nome; o nome é documento padrão (com complemento
// quando o cadastro usa "- *") ou nome livre; os demais campos são opcionais.
export function UploadDocumentDialog({
  open,
  onClose,
  unitId,
  folderId,
  folderName,
}: UploadDocumentDialogProps) {
  const queryClient = useQueryClient();
  const defaultDocuments = useQuery(trpc.defaultDocuments.list.queryOptions());

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'padrao' | 'livre'>('padrao');
  const [defaultDocumentId, setDefaultDocumentId] = useState('');
  const [docQuery, setDocQuery] = useState('');
  const [freeName, setFreeName] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [warnDays, setWarnDays] = useState('');
  const [adherence, setAdherence] = useState<DiagnosticStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setMode('padrao');
      setDefaultDocumentId('');
      setDocQuery('');
      setFreeName('');
      setLabel('');
      setExpiresAt('');
      setWarnDays('');
      setAdherence(null);
      setProgress(null);
      setNotice(null);
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
  const needsLabel = mode === 'padrao' && Boolean(selected?.name.includes('- *'));
  const finalName =
    mode === 'livre'
      ? freeName.trim()
      : needsLabel
        ? (selected?.name.replace('- *', `- ${label.trim()}`) ?? '')
        : (selected?.name ?? '');

  const filtered = docQuery
    ? sorted.filter((doc) => squash(doc.name).includes(squash(docQuery)))
    : sorted;

  // Complemento sugerido: o que sobra do nome do arquivo depois do nome-base
  // do documento padrão ("ASO - João Silva.pdf" com base "ASO" → "João Silva").
  function complementFor(docName: string, fileName: string) {
    if (!docName.includes('- *')) return '';
    const base = baseName(docName);
    const stem = fileName.replace(/\.[^.]+$/, '').trim();
    return normalizeText(stem).startsWith(normalizeText(base))
      ? stem.slice(base.length).replace(/^[\s\-–—·]+/, '')
      : '';
  }

  // Nome do arquivo não é desperdiçado: sugere documento padrão (e o
  // complemento) por prefixo; sem match, vira sugestão de nome livre.
  function suggestFromFileName(fileName: string) {
    const stem = fileName.replace(/\.[^.]+$/, '').trim();
    if (!stem) return;
    const match = sorted.find((doc) => {
      const base = squash(baseName(doc.name));
      return base.length > 0 && squash(stem).startsWith(base);
    });
    if (match) {
      setMode('padrao');
      setDefaultDocumentId(match.id);
      const rest = complementFor(match.name, fileName);
      if (rest && !label.trim()) setLabel(rest);
    } else if (!freeName.trim()) {
      setFreeName(stem);
    }
  }

  function pickFiles(list: FileList | null) {
    setNotice(null);
    setError(null);
    const files = Array.from(list ?? []);
    const first = files[0];
    if (!first) return;
    // O accept do input não vale no drag & drop — validamos aqui também.
    if (!ACCEPT_LIST.includes(extensionOf(first.name))) {
      setError(`Tipo de arquivo não aceito (${extensionOf(first.name) || 'sem extensão'}).`);
      return;
    }
    if (files.length > 1) {
      setNotice(`Um arquivo por envio — usando ${first.name}; os demais foram ignorados.`);
    }
    setFile(first);
    if (!defaultDocumentId) suggestFromFileName(first.name);
  }

  const createUploadUrl = useMutation(trpc.documents.createUploadUrl.mutationOptions());
  const confirmUpload = useMutation(trpc.documents.confirmUpload.mutationOptions());

  const canSubmit =
    Boolean(file) &&
    finalName.length > 0 &&
    (!needsLabel || label.trim().length > 0) &&
    !submitting;

  // O botão desabilitado explica o que falta (no rodapé, ao lado dele).
  const missingHint = !file
    ? 'Falta escolher o arquivo'
    : mode === 'padrao' && !selected
      ? 'Falta escolher o documento padrão'
      : needsLabel && !label.trim()
        ? 'Falta o complemento do nome'
        : mode === 'livre' && !freeName.trim()
          ? 'Falta o nome do documento'
          : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !canSubmit) return;
    setSubmitting(true);
    setProgress(0);
    setError(null);
    try {
      const mimeType = file.type || 'application/octet-stream';
      const { uploadUrl, storageKey } = await createUploadUrl.mutateAsync({
        unitId,
        fileName: file.name,
        mimeType,
      });
      await putFile(uploadUrl, file, mimeType, setProgress);
      await confirmUpload.mutateAsync({
        unitId,
        folderId,
        name: finalName,
        storageKey,
        mimeType,
        sizeBytes: file.size,
        expiresAt: expiresAt || null,
        warnDaysBefore: expiresAt && warnDays ? Number(warnDays) : null,
        documentGroup: mode === 'livre' ? null : (selected?.documentGroup ?? null),
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
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
      setError(`Falha ao enviar o documento${detail} — tente de novo.`);
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const segment = (value: 'padrao' | 'livre', text: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={`cursor-pointer px-3 py-1.5 font-ui text-label font-semibold transition-colors ${
        mode === value ? 'bg-action-soft text-action' : 'bg-surface text-muted hover:text-ink'
      }`}
    >
      {text}
    </button>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Enviar documento"
      description={folderName ? `Para a pasta ${folderName}` : undefined}
      footer={
        <>
          {submitting && progress !== null ? (
            <span
              aria-live="polite"
              className="mr-auto flex items-center gap-2 text-label text-muted"
            >
              <span className="h-1 w-28 overflow-hidden rounded-full bg-idle-soft">
                <span
                  className="block h-full rounded-full bg-action transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="tabular font-mono">{progress}%</span>
            </span>
          ) : missingHint ? (
            <span className="mr-auto text-label text-muted">{missingHint}</span>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="upload-doc-form" disabled={!canSubmit}>
            {submitting ? 'Enviando…' : 'Enviar documento'}
          </Button>
        </>
      }
    >
      <form id="upload-doc-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Arquivo primeiro — é o objeto da ação e sugere o nome */}
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
              pickFiles(e.dataTransfer.files);
            }}
            // focus-within: o input que cobre a área é invisível — o anel de
            // foco aparece no contêiner.
            className={`relative rounded-card border-2 border-dashed p-6 text-center transition-colors focus-within:border-action ${
              isDragging ? 'border-action bg-action-soft' : 'border-line-strong hover:border-ink-soft'
            }`}
          >
            <input
              type="file"
              accept={ACCEPT}
              aria-label="Selecionar arquivo"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = '';
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0 focus-visible:outline-none"
            />
            {file ? (
              <div className="pointer-events-none flex items-center justify-center gap-2">
                <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 truncate font-ui text-sm font-medium">{file.name}</span>
                <span className="shrink-0 font-mono text-micro text-muted">
                  {formatBytes(file.size)}
                </span>
                <span className="shrink-0 font-ui text-label font-semibold text-action">
                  trocar
                </span>
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
          {notice && <p className="text-xs text-muted">{notice}</p>}
        </div>

        {/* Nome do documento: padrão (vincula ao cadastro pelo nome) ou livre */}
        <div className="flex flex-col gap-2">
          <span className="font-ui text-caption font-semibold">Nome do documento</span>
          <div
            role="group"
            aria-label="Origem do nome"
            className="flex w-fit overflow-hidden rounded-ctl border border-line-strong [&>button+button]:border-l [&>button+button]:border-line-strong"
          >
            {segment('padrao', 'Documento padrão')}
            {segment('livre', 'Nome livre')}
          </div>

          {mode === 'padrao' &&
            (selected ? (
              <div className="flex items-center gap-2 rounded-ctl border border-line-strong bg-paper px-2.5 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{baseName(selected.name)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setDefaultDocumentId('');
                    setLabel('');
                    setDocQuery('');
                  }}
                  className="shrink-0 cursor-pointer font-ui text-label font-semibold text-action hover:underline"
                >
                  trocar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <input
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder="Buscar documento padrão…"
                  aria-label="Buscar documento padrão"
                  className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
                />
                {defaultDocuments.isLoading ? (
                  <p className="text-xs text-muted">Carregando documentos padrão…</p>
                ) : (
                  <ul className="max-h-40 overflow-y-auto rounded-ctl border border-line">
                    {filtered.map((doc) => (
                      <li key={doc.id} className="border-b border-line last:border-b-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDefaultDocumentId(doc.id);
                            if (file && !label.trim()) {
                              const rest = complementFor(doc.name, file.name);
                              if (rest) setLabel(rest);
                            }
                          }}
                          className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-caption hover:bg-paper"
                        >
                          <span className="min-w-0 flex-1 truncate">{baseName(doc.name)}</span>
                          {doc.name.includes('- *') && (
                            <span className="shrink-0 rounded-full bg-idle-soft px-2 py-0.5 font-ui text-micro font-medium text-muted">
                              pede complemento
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                    {filtered.length === 0 && (
                      <li className="px-2.5 py-2 text-caption text-muted">
                        Nenhum documento padrão com “{docQuery}”.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}

          {mode === 'livre' && (
            <Field
              label="Nome"
              value={freeName}
              onChange={(e) => setFreeName(e.target.value)}
              placeholder="Digite o nome do documento"
            />
          )}

          {needsLabel && (
            <Field
              label="Complemento"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: nome do colaborador ou do equipamento"
            />
          )}

          {finalName && (
            <p className="break-words text-xs text-muted">
              Vai aparecer como <strong className="text-ink-soft">{finalName}</strong>
              {mode === 'padrao' && ' — o vínculo com o cadastro é pelo nome'}
            </p>
          )}
        </div>

        {/* Detalhes opcionais */}
        <div className="flex flex-col gap-3">
          <span className="font-ui text-caption font-semibold">
            Detalhes <span className="font-normal text-muted">(opcionais)</span>
          </span>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field
              label="Vencimento"
              type="date"
              value={expiresAt}
              onChange={(e) => {
                setExpiresAt(e.target.value);
                if (!e.target.value) setWarnDays('');
              }}
              hint="Vazio = não expira"
              className="flex-1"
            />
            <Field
              label="Avisar antes (dias)"
              type="number"
              min={1}
              value={warnDays}
              disabled={!expiresAt}
              onChange={(e) => setWarnDays(e.target.value)}
              hint={!expiresAt ? 'Defina o vencimento primeiro' : undefined}
              className="flex-1"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-ui text-caption font-semibold">Aderência</span>
            <AdherencePicker value={adherence} onChange={setAdherence} size="sm" />
            <p className="text-xs text-muted">
              Vira a nota inicial ao vincular este documento num cadastro e nas evidências.
            </p>
          </div>
        </div>

        {error && <AlertStrip>{error}</AlertStrip>}
      </form>
    </Dialog>
  );
}
