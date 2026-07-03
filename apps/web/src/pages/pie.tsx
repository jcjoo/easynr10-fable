import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Download, FileText, FolderPlus, Layers, List, Pencil, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FileTypeIcon, FolderIcon } from '@/components/ui/icons';
import { Menu, RowMenu, type MenuItem, type MenuPosition } from '@/components/ui/row-menu';
import { UploadDocumentDialog } from '@/components/pie/upload-document-dialog';
import { FolderSchemasDialog } from '@/components/pie/folder-schemas-dialog';
import { ExpiryFilter, filterByExpiry } from '@/components/pie/expiry-filter';

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string | Date;
}

interface DocumentRow {
  id: string;
  name: string;
  expiresAt: string | null;
  warnDaysBefore: number | null;
  version: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string | Date;
  // Presente só na visão "apenas documentos" (listBySubtree).
  folderId?: string;
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('pt-BR');
}

const DEFAULT_WARN_DAYS = 30;

// Ações rápidas da linha (estilo do legado): invisíveis até o hover da linha
// (tr com `group`) ou foco por teclado; o ⋯ ao lado fica sempre visível.
const rowActionClass = `cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity
  hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100`;

function ExpiryPill({
  expiresAt,
  warnDaysBefore,
}: {
  expiresAt: string | null;
  warnDaysBefore: number | null;
}) {
  if (!expiresAt) return <span className="text-muted">—</span>;
  const days = Math.ceil(
    (new Date(`${expiresAt}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );
  const date = formatDate(`${expiresAt}T00:00:00`);
  const pill = (className: string, title: string) => (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-ui text-[12.5px] font-semibold ${className}`}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {date}
    </span>
  );
  if (days < 0) return pill('text-bad bg-bad-soft', 'Vencido');
  if (days <= (warnDaysBefore ?? DEFAULT_WARN_DAYS)) {
    return pill('text-warn bg-warn-soft', `Vence em ${days} d`);
  }
  return <span className="tabular font-mono text-[13px]">{date}</span>;
}

export function PiePage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId/pie' });
  const { pasta, ver, venc, de, ate } = useSearch({ from: '/_authed/$companyId/$unitId/pie' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Visão "apenas documentos" (?ver=documentos): lista tudo abaixo da pasta atual.
  const docsOnly = ver === 'documentos';

  const folders = useQuery(trpc.folders.list.queryOptions({ unitId }));
  const documents = useQuery({
    ...trpc.documents.listByFolder.queryOptions({ unitId, folderId: pasta ?? '' }),
    enabled: Boolean(pasta) && !docsOnly,
  });
  const subtreeDocuments = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId, folderId: pasta ?? null }),
    enabled: docsOnly,
  });

  const invalidateFolders = () =>
    queryClient.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ unitId }) });

  // Diálogos do prontuário (RF08/RF09/RF11)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [schemasOpen, setSchemasOpen] = useState(false);
  const invalidateDocuments = () => {
    if (pasta) {
      queryClient.invalidateQueries({
        queryKey: trpc.documents.listByFolder.queryKey({ unitId, folderId: pasta }),
      });
    }
    queryClient.invalidateQueries({ queryKey: trpc.documents.listBySubtree.queryKey() });
  };

  const { children, path, folderById } = useMemo(() => {
    const all: FolderNode[] = folders.data ?? [];
    const byId = new Map(all.map((node) => [node.id, node]));
    const children = all.filter((node) => node.parentId === (pasta ?? null));
    const path: FolderNode[] = [];
    let cursor = pasta ? byId.get(pasta) : undefined;
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return { children, path, folderById: byId };
  }, [folders.data, pasta]);

  // Caminho completo de uma pasta (tooltip da coluna Local).
  const folderPath = (folderId: string) => {
    const parts: string[] = [];
    let cursor = folderById.get(folderId);
    while (cursor) {
      parts.unshift(cursor.name);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }
    return `_/${parts.join('/')}`;
  };

  // — Nova pasta —
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState('');
  const createFolder = useMutation(
    trpc.folders.create.mutationOptions({
      onSuccess: () => {
        setFolderName('');
        setCreating(false);
        invalidateFolders();
      },
    }),
  );

  // — Pasta: renomear / excluir —
  const [renameTarget, setRenameTarget] = useState<FolderNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameFolder = useMutation(
    trpc.folders.rename.mutationOptions({
      onSuccess: () => {
        setRenameTarget(null);
        invalidateFolders();
      },
    }),
  );
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderNode | null>(null);
  const removeFolder = useMutation(
    trpc.folders.remove.mutationOptions({
      onSuccess: () => {
        setDeleteFolderTarget(null);
        invalidateFolders();
        invalidateDocuments();
      },
    }),
  );

  // — Upload (novo documento e nova versão) —
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionTargetRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const createUploadUrl = useMutation(trpc.documents.createUploadUrl.mutationOptions());
  const confirmNewVersion = useMutation(trpc.documents.confirmNewVersion.mutationOptions());

  async function putToStorage(file: File) {
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
    return { storageKey, mimeType };
  }

  async function handleVersionFile(file: File) {
    const versionTarget = versionTargetRef.current;
    if (!versionTarget) return;
    setUploading(true);
    setActionError(null);
    try {
      const { storageKey, mimeType } = await putToStorage(file);
      await confirmNewVersion.mutateAsync({
        unitId,
        documentId: versionTarget,
        storageKey,
        mimeType,
        sizeBytes: file.size,
      });
      queryClient.invalidateQueries({
        queryKey: trpc.documents.versions.queryKey({ unitId, documentId: versionTarget }),
      });
      invalidateDocuments();
    } catch {
      setActionError('Falha ao enviar o arquivo — tente de novo.');
    } finally {
      versionTargetRef.current = null;
      setUploading(false);
    }
  }

  // — Documento: editar / excluir / versões / download —
  const [editTarget, setEditTarget] = useState<DocumentRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editExpires, setEditExpires] = useState('');
  const [editWarnDays, setEditWarnDays] = useState('');
  const updateDocument = useMutation(
    trpc.documents.update.mutationOptions({
      onSuccess: () => {
        setEditTarget(null);
        invalidateDocuments();
      },
    }),
  );

  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const removeDocument = useMutation(
    trpc.documents.remove.mutationOptions({
      onSuccess: () => {
        setDeleteTarget(null);
        invalidateDocuments();
      },
    }),
  );

  const [versionsTarget, setVersionsTarget] = useState<DocumentRow | null>(null);
  const versions = useQuery({
    ...trpc.documents.versions.queryOptions({
      unitId,
      documentId: versionsTarget?.id ?? '',
    }),
    enabled: Boolean(versionsTarget),
  });
  const restoreVersion = useMutation(
    trpc.documents.restoreVersion.mutationOptions({
      onSuccess: () => {
        if (versionsTarget) {
          queryClient.invalidateQueries({
            queryKey: trpc.documents.versions.queryKey({
              unitId,
              documentId: versionsTarget.id,
            }),
          });
        }
        invalidateDocuments();
      },
    }),
  );

  const downloadUrl = useMutation(trpc.documents.downloadUrl.mutationOptions());
  async function download(documentId: string, versionId?: string) {
    const { url } = await downloadUrl.mutateAsync({ unitId, documentId, versionId });
    window.open(url, '_blank');
  }

  function openEdit(doc: DocumentRow) {
    setEditTarget(doc);
    setEditName(doc.name);
    setEditExpires(doc.expiresAt ?? '');
    setEditWarnDays(doc.warnDaysBefore != null ? String(doc.warnDaysBefore) : '');
  }

  // Mesmo menu no ⋯ e no clique direito da linha.
  const documentMenuItems = (doc: DocumentRow): MenuItem[] => [
    { label: 'Baixar', onSelect: () => download(doc.id) },
    { label: 'Histórico de versões', onSelect: () => setVersionsTarget(doc) },
    { label: 'Editar', onSelect: () => openEdit(doc) },
    { label: 'Excluir', danger: true, onSelect: () => setDeleteTarget(doc) },
  ];

  const [contextMenu, setContextMenu] = useState<{
    position: MenuPosition;
    doc: DocumentRow;
  } | null>(null);

  // `view` omitido mantém o modo atual; 'lista' força a visão normal.
  // O filtro de vencimento acompanha a navegação entre pastas.
  const goTo = (folderId?: string, view?: 'documentos' | 'lista') => {
    const mode = view ?? (docsOnly ? 'documentos' : 'lista');
    return navigate({
      to: '/$companyId/$unitId/pie',
      params: { companyId, unitId },
      search: {
        ...(folderId ? { pasta: folderId } : {}),
        ...(mode === 'documentos' ? { ver: 'documentos' as const } : {}),
        ...(venc ? { venc } : {}),
        ...(de ? { de } : {}),
        ...(ate ? { ate } : {}),
      },
    });
  };

  const rawDocuments: DocumentRow[] =
    (docsOnly ? subtreeDocuments.data : pasta ? documents.data : undefined) ?? [];
  const docRows = filterByExpiry(rawDocuments, { venc, de, ate }, DEFAULT_WARN_DAYS);

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Prontuário de Instalações Elétricas</p>
          <h1 className="text-[28px] font-bold tracking-tight">PIE</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSchemasOpen(true)}>
            <Layers aria-hidden className="size-4" /> Estruturas
          </Button>
          <Button variant="secondary" onClick={() => setCreating((value) => !value)}>
            <FolderPlus aria-hidden className="size-4" /> Nova pasta
          </Button>
          {pasta && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload aria-hidden className="size-4" /> Enviar documento
            </Button>
          )}
          {/* input oculto: usado apenas pela nova versão (histórico) */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVersionFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Caminho dentro do prontuário + modo de visualização */}
      <div className="flex flex-wrap items-center justify-between gap-2">
      <nav
        aria-label="Caminho no PIE"
        className="flex flex-wrap items-center gap-2 font-ui text-[13px]"
      >
        <button
          type="button"
          onClick={() => goTo()}
          className={`cursor-pointer font-mono hover:text-action hover:underline ${pasta ? 'text-muted' : 'font-semibold text-ink'}`}
        >
          _
        </button>
        {path.map((node, index) => (
          <span key={node.id} className="flex items-center gap-2">
            <span aria-hidden className="text-line-strong">/</span>
            {index === path.length - 1 ? (
              <span className="font-semibold text-ink">{node.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => goTo(node.id)}
                className="cursor-pointer text-muted hover:text-action hover:underline"
              >
                {node.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
      <ExpiryFilter
        value={{ venc, de, ate }}
        onChange={(next) =>
          navigate({
            to: '/$companyId/$unitId/pie',
            params: { companyId, unitId },
            search: {
              ...(pasta ? { pasta } : {}),
              ...(ver ? { ver } : {}),
              ...next,
            },
          })
        }
      />

      {/* Alternância pastas+documentos / apenas documentos (como no legado) */}
      <div
        role="group"
        aria-label="Modo de visualização"
        className="flex items-center gap-0.5 rounded-ctl bg-paper p-0.5"
      >
        <button
          type="button"
          title="Pastas e documentos"
          aria-pressed={!docsOnly}
          onClick={() => goTo(pasta, 'lista')}
          className={`rounded-[3px] p-1.5 ${
            docsOnly
              ? 'cursor-pointer text-muted hover:text-ink'
              : 'bg-surface text-action shadow-sm'
          }`}
        >
          <List aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          title="Apenas documentos (inclui subpastas)"
          aria-pressed={docsOnly}
          onClick={() => goTo(pasta, 'documentos')}
          className={`rounded-[3px] p-1.5 ${
            docsOnly
              ? 'bg-surface text-action shadow-sm'
              : 'cursor-pointer text-muted hover:text-ink'
          }`}
        >
          <FileText aria-hidden className="size-4" />
        </button>
      </div>
      </div>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (folderName.trim())
              createFolder.mutate({ unitId, parentId: pasta ?? null, name: folderName.trim() });
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Nome da nova pasta"
            aria-label="Nome da nova pasta"
            className="flex-1 rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
          />
          <Button type="submit" disabled={createFolder.isPending}>
            Criar pasta
          </Button>
        </form>
      )}

      {(actionError || removeFolder.error) && (
        <p role="alert" className="text-sm text-bad">
          {actionError ?? removeFolder.error?.message}
        </p>
      )}

      {/* Lista única (estilo drive): pastas no topo, arquivos abaixo */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(docsOnly
                ? ['Nome', 'Local', 'Vencimento', 'Data criação', '']
                : ['Nome', 'Vencimento', 'Data criação', '']
              ).map((heading) => (
                <th
                  key={heading}
                  className="whitespace-nowrap border-b border-line-strong px-3.5 py-2.5 text-left font-ui text-xs font-semibold uppercase tracking-[.06em] text-muted"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docsOnly && !subtreeDocuments.isLoading && docRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-12 text-center text-muted">
                  {venc && rawDocuments.length > 0
                    ? 'Nenhum documento corresponde ao filtro de vencimento.'
                    : 'Nenhum documento abaixo desta pasta.'}
                </td>
              </tr>
            )}

            {!docsOnly && venc && rawDocuments.length > 0 && docRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-12 text-center text-muted">
                  Nenhum documento corresponde ao filtro de vencimento.
                </td>
              </tr>
            )}

            {!docsOnly && children.length === 0 && (documents.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-12 text-center">
                  {pasta ? (
                    <span className="text-muted">
                      Pasta vazia — envie um documento ou crie uma subpasta.
                    </span>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-muted">
                        Prontuário vazio — gere uma estrutura de pastas ou crie a primeira pasta.
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSchemasOpen(true)}
                      >
                        <Layers aria-hidden className="size-4" /> Gerar estrutura de pastas
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            )}

            {!docsOnly &&
              children.map((node) => (
              <tr
                key={node.id}
                onClick={() => goTo(node.id)}
                className="group cursor-pointer hover:bg-paper"
              >
                <td className="border-b border-line px-3.5 py-2.5">
                  <Link
                    to="/$companyId/$unitId/pie"
                    params={{ companyId, unitId }}
                    search={{ pasta: node.id }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2.5 font-medium"
                  >
                    <FolderIcon aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{node.name}</span>
                  </Link>
                </td>
                <td className="border-b border-line px-3.5 py-2.5 text-muted">—</td>
                <td className="tabular border-b border-line px-3.5 py-2.5 font-mono text-[13px]">
                  {formatDate(node.createdAt)}
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      title="Renomear"
                      aria-label={`Renomear pasta ${node.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(node);
                        setRenameValue(node.name);
                      }}
                      className={rowActionClass}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
                    <RowMenu
                      label={`Ações da pasta ${node.name}`}
                      items={[
                        {
                          label: 'Renomear',
                          onSelect: () => {
                            setRenameTarget(node);
                            setRenameValue(node.name);
                          },
                        },
                        {
                          label: 'Excluir',
                          danger: true,
                          onSelect: () => setDeleteFolderTarget(node),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}

            {docRows.map(
              (doc) => (
                <tr
                  key={doc.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ position: { top: e.clientY, left: e.clientX }, doc });
                  }}
                  className="group hover:bg-paper"
                >
                  <td className="border-b border-line px-3.5 py-2.5">
                    <span className="flex items-center gap-2.5 font-medium">
                      <FileTypeIcon
                        aria-hidden
                        mimeType={doc.mimeType}
                        name={doc.name}
                        className="size-4 shrink-0"
                      />
                      <span className="truncate">{doc.name}</span>
                    </span>
                  </td>
                  {docsOnly && (
                    <td className="border-b border-line px-3.5 py-2.5">
                      {doc.folderId ? (
                        <button
                          type="button"
                          title={folderPath(doc.folderId)}
                          onClick={() => goTo(doc.folderId, 'lista')}
                          className="flex max-w-56 cursor-pointer items-center gap-1.5 text-[13px] text-muted hover:text-action hover:underline"
                        >
                          <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {folderById.get(doc.folderId)?.name ?? '—'}
                          </span>
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  )}
                  <td className="border-b border-line px-3.5 py-2.5">
                    <ExpiryPill expiresAt={doc.expiresAt} warnDaysBefore={doc.warnDaysBefore} />
                  </td>
                  <td className="tabular border-b border-line px-3.5 py-2.5 font-mono text-[13px]">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        title="Baixar"
                        aria-label={`Baixar ${doc.name}`}
                        onClick={() => download(doc.id)}
                        className={rowActionClass}
                      >
                        <Download aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        title="Editar"
                        aria-label={`Editar ${doc.name}`}
                        onClick={() => openEdit(doc)}
                        className={rowActionClass}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <RowMenu label={`Ações de ${doc.name}`} items={documentMenuItems(doc)} />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* — Diálogos — */}

      <Dialog
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Renomear pasta"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renameTarget && renameValue.trim())
              renameFolder.mutate({
                unitId,
                folderId: renameTarget.id,
                name: renameValue.trim(),
              });
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Nome da pasta"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={renameFolder.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Editar documento"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editTarget) return;
            updateDocument.mutate({
              unitId,
              documentId: editTarget.id,
              name: editName.trim() || editTarget.name,
              expiresAt: editExpires || null,
              warnDaysBefore: editWarnDays ? Number(editWarnDays) : null,
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Nome"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="flex gap-4">
            <Field
              label="Validade"
              type="date"
              value={editExpires}
              onChange={(e) => setEditExpires(e.target.value)}
              hint="Vazio = não expira"
              className="flex-1"
            />
            <Field
              label="Avisar antes (dias)"
              type="number"
              min={1}
              value={editWarnDays}
              onChange={(e) => setEditWarnDays(e.target.value)}
              hint={`Padrão: ${DEFAULT_WARN_DAYS} dias`}
              className="flex-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateDocument.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Excluir documento"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir <strong>{deleteTarget?.name}</strong>? O histórico de versões será mantido
            no registro do prontuário.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeDocument.isPending}
              onClick={() =>
                deleteTarget && removeDocument.mutate({ unitId, documentId: deleteTarget.id })
              }
            >
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteFolderTarget)}
        onClose={() => setDeleteFolderTarget(null)}
        title="Excluir pasta"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir a pasta <strong>{deleteFolderTarget?.name}</strong>? Subpastas e documentos
            dentro dela serão excluídos junto.
          </p>
          {removeFolder.error && (
            <p role="alert" className="text-sm text-bad">
              {removeFolder.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteFolderTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeFolder.isPending}
              onClick={() =>
                deleteFolderTarget &&
                removeFolder.mutate({ unitId, folderId: deleteFolderTarget.id })
              }
            >
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(versionsTarget)}
        onClose={() => setVersionsTarget(null)}
        title={`Histórico — ${versionsTarget?.name ?? ''}`}
      >
        <button
          type="button"
          disabled={uploading}
          onClick={() => {
            if (!versionsTarget) return;
            versionTargetRef.current = versionsTarget.id;
            fileInputRef.current?.click();
          }}
          className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-line-strong py-3.5 font-ui text-sm font-semibold text-ink-soft hover:border-action hover:text-action disabled:opacity-50"
        >
          <Upload aria-hidden className="size-4" />
          {uploading ? 'Enviando…' : 'Enviar nova versão'}
        </button>
        {versions.isLoading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <ul className="flex flex-col">
            {versions.data?.map((version, index) => (
              <li
                key={version.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
              >
                <div className="flex items-baseline gap-3">
                  <span className="tabular font-mono text-[13px] font-semibold">
                    v{version.number}
                  </span>
                  <span className="tabular font-mono text-[12px] text-muted">
                    {formatBytes(version.sizeBytes)}
                  </span>
                  <span className="text-[13px] text-muted">
                    {version.uploadedBy ?? '—'} · {formatDateTime(version.createdAt)}
                  </span>
                  {index === 0 && (
                    <span className="rounded-full bg-action-soft px-2 py-0.5 font-ui text-[11px] font-semibold text-action">
                      atual
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => versionsTarget && download(versionsTarget.id, version.id)}
                    className="cursor-pointer font-ui text-[13px] font-semibold text-action hover:underline"
                  >
                    Baixar
                  </button>
                  {index !== 0 && (
                    <button
                      type="button"
                      disabled={restoreVersion.isPending}
                      onClick={() =>
                        versionsTarget &&
                        restoreVersion.mutate({
                          unitId,
                          documentId: versionsTarget.id,
                          versionId: version.id,
                        })
                      }
                      className="cursor-pointer font-ui text-[13px] font-semibold text-ink-soft hover:underline disabled:opacity-50"
                    >
                      Restaurar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {pasta && (
        <UploadDocumentDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          unitId={unitId}
          folderId={pasta}
        />
      )}

      <FolderSchemasDialog
        open={schemasOpen}
        onClose={() => setSchemasOpen(false)}
        unitId={unitId}
        currentFolderId={pasta ?? null}
        currentFolderName={path.at(-1)?.name ?? '_'}
      />

      {contextMenu && (
        <Menu
          position={contextMenu.position}
          items={documentMenuItems(contextMenu.doc)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </Page>
  );
}
