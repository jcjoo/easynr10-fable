import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  Download,
  FileText,
  FolderPlus,
  HardHat,
  Layers,
  List,
  Pencil,
  TrafficCone,
  Upload,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Td } from '@/components/ui/table';

import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { useDialogMutation, useDialogTarget } from '@/lib/use-dialog-mutation';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Page, PageTitle } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FileTypeIcon, FolderIcon } from '@/components/ui/icons';
import { Menu, RowMenu, type MenuItem, type MenuPosition } from '@/components/ui/row-menu';
import { Pill } from '@/components/ui/pill';
import { UploadDocumentDialog } from '@/components/pie/upload-document-dialog';
import { FolderSchemasDialog } from '@/components/pie/folder-schemas-dialog';
import { ExpiryFilter, filterByExpiry } from '@/components/pie/expiry-filter';
import { DocumentVersionsDialog } from '@/components/pie/document-versions-dialog';
import {
  DocumentPreviewDialog,
  type DocumentPreview,
} from '@/components/pie/document-preview-dialog';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';
import {
  DEFAULT_WARN_DAYS,
  daysUntilExpiry,
  normalizeText,
  registerBasePath,
  registerTargets,
  type RegisterTarget,
} from '@easynr10/shared';
import { RegisterPage } from './registros';

// Pasta "Lista de <Grupo>" ganha o ícone do cadastro respectivo (mesmo da
// sidebar) — deixa claro que aquela pasta É a lista do cadastro.
const registerFolderIcon: Record<RegisterTarget, LucideIcon> = {
  colaboradores: Users,
  eletrico: Zap,
  ferramenta: Wrench,
  epi: HardHat,
  epc: TrafficCone,
};

// Caminho (nomes) igual a um registerBasePath ⇒ é a "Lista de <Grupo>".
function matchRegisterTarget(names: string[]): RegisterTarget | null {
  return (
    registerTargets.find((target) => {
      const base = registerBasePath[target];
      return base.length === names.length && base.every((name, i) => name === names[i]);
    }) ?? null
  );
}

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
  const days = daysUntilExpiry(expiresAt);
  const date = formatDate(`${expiresAt}T00:00:00`);
  if (days < 0) return <Pill label={date} className="text-bad bg-bad-soft" title="Vencido" />;
  if (days <= (warnDaysBefore ?? DEFAULT_WARN_DAYS)) {
    return <Pill label={date} className="text-warn bg-warn-soft" title={`Vence em ${days} d`} />;
  }
  return <span className="tabular font-mono text-caption">{date}</span>;
}

export function PiePage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId/pie' });
  const search = useSearch({ from: '/_authed/$companyId/$unitId/pie' });
  const { pasta, ver, venc, de, ate, ord, dir } = search;
  // Um único ponto monta a search preservando o estado atual — antes cada
  // navegação repetia a lista de parâmetros à mão.
  const patchSearch = (patch: Partial<typeof search>) => ({ ...search, ...patch });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Visão "apenas documentos" (?ver=documentos): lista tudo abaixo da pasta atual.
  const docsOnly = ver === 'documentos';

  // Ações de escrita só aparecem com a permissão confirmada no papel
  // (`can` é estrito: falso até carregar) — sem isso o usuário vê botões
  // que só renderiam 403 no servidor.
  const { can } = useUnitPermissions(unitId);
  const canCreateFolder = can('pie.pasta.criar');
  const canRenameFolder = can('pie.pasta.renomear');
  const canDeleteFolder = can('pie.pasta.excluir');
  const canUploadDoc = can('pie.documento.enviar');
  const canEditDoc = can('pie.documento.editar');
  const canDeleteDoc = can('pie.documento.excluir');
  const canRestoreDoc = can('pie.documento.restaurar');
  // Exclusão DEFINITIVA (documento com histórico, ou uma versão): ação
  // própria do papel — erros que não podem aparecer a clientes/auditores.
  const canPurge = can('exclusao.definitiva');
  const canManageSchemas = can('pie.estruturas.gerenciar');

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

  // Quando a pasta atual É a "Lista de <Grupo>" de um cadastro (caminho igual
  // ao registerBasePath), a listagem do PIE dá lugar à página do cadastro —
  // clicar num item abre a pasta dele (?pasta=) e volta ao PIE normal.
  const registerListTarget = useMemo(
    () => (pasta ? matchRegisterTarget(path.map((node) => node.name)) : null),
    [path, pasta],
  );
  const showRegister = Boolean(registerListTarget) && !docsOnly;

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
  const createFolder = useDialogMutation(trpc.folders.create.mutationOptions(), () => {
    setFolderName('');
    setCreating(false);
    invalidateFolders();
  });

  // — Pasta: renomear / excluir —
  const renameDialog = useDialogTarget<FolderNode>();
  const [renameValue, setRenameValue] = useState('');
  const renameFolder = useDialogMutation(trpc.folders.rename.mutationOptions(), () => {
    renameDialog.close();
    invalidateFolders();
  });
  const deleteFolderDialog = useDialogTarget<FolderNode>();
  const removeFolder = useDialogMutation(trpc.folders.remove.mutationOptions(), () => {
    deleteFolderDialog.close();
    invalidateFolders();
    invalidateDocuments();
  });

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
  const editDialog = useDialogTarget<DocumentRow>();
  const [editName, setEditName] = useState('');
  const [editExpires, setEditExpires] = useState('');
  const [editWarnDays, setEditWarnDays] = useState('');
  const updateDocument = useDialogMutation(trpc.documents.update.mutationOptions(), () => {
    editDialog.close();
    invalidateDocuments();
  });

  const deleteDialog = useDialogTarget<DocumentRow>();
  const removeDocument = useDialogMutation(trpc.documents.remove.mutationOptions(), () => {
    deleteDialog.close();
    invalidateDocuments();
  });
  // Exclusão definitiva opcional dentro do mesmo dialog (checkbox).
  const [purgeChecked, setPurgeChecked] = useState(false);
  const purgeDocument = useDialogMutation(trpc.documents.purge.mutationOptions(), () => {
    deleteDialog.close();
    invalidateDocuments();
  });

  const versionsDialog = useDialogTarget<DocumentRow>();

  const downloadUrl = useMutation(trpc.documents.downloadUrl.mutationOptions());
  async function download(documentId: string, versionId?: string) {
    const { url } = await downloadUrl.mutateAsync({ unitId, documentId, versionId });
    window.open(url, '_blank');
  }

  // — Preview (RF09): dialog em components/pie/document-preview-dialog.tsx —
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const previewUrl = useMutation(trpc.documents.previewUrl.mutationOptions());
  async function openPreview(doc: DocumentRow, versionId?: string) {
    try {
      const { url, mimeType } = await previewUrl.mutateAsync({
        unitId,
        documentId: doc.id,
        versionId,
      });
      setPreview({ documentId: doc.id, name: doc.name, url, mimeType });
    } catch {
      // Documento só-referência (sem arquivo enviado) → estado "sem conteúdo".
      setPreview({ documentId: doc.id, name: doc.name, url: null, mimeType: null });
    }
  }

  function openEdit(doc: DocumentRow) {
    editDialog.open(doc);
    setEditName(doc.name);
    setEditExpires(doc.expiresAt ?? '');
    setEditWarnDays(doc.warnDaysBefore != null ? String(doc.warnDaysBefore) : '');
  }

  // Mesmo menu no ⋯ e no clique direito da linha.
  const documentMenuItems = (doc: DocumentRow): MenuItem[] => [
    { label: 'Visualizar', onSelect: () => openPreview(doc) },
    { label: 'Baixar', onSelect: () => download(doc.id) },
    { label: 'Histórico de versões', onSelect: () => versionsDialog.open(doc) },
    ...(canEditDoc ? [{ label: 'Editar', onSelect: () => openEdit(doc) }] : []),
    ...(canDeleteDoc
      ? [{ label: 'Excluir', danger: true, onSelect: () => deleteDialog.open(doc) }]
      : []),
  ];

  const [contextMenu, setContextMenu] = useState<{
    position: MenuPosition;
    doc: DocumentRow;
  } | null>(null);
  // Clique direito numa pasta (ações dela) e na área da lista (Nova pasta).
  const [folderMenu, setFolderMenu] = useState<{
    position: MenuPosition;
    node: FolderNode;
  } | null>(null);
  const [sectionMenu, setSectionMenu] = useState<MenuPosition | null>(null);

  // `view` omitido mantém o modo atual; 'lista' força a visão normal.
  // Filtros e ordenação seguem intactos (patchSearch).
  const goTo = (folderId?: string, view?: 'documentos' | 'lista') => {
    const mode = view ?? (docsOnly ? 'documentos' : 'lista');
    return navigate({
      to: '/$companyId/$unitId/pie',
      params: { companyId, unitId },
      search: patchSearch({
        pasta: folderId,
        ver: mode === 'documentos' ? ('documentos' as const) : undefined,
      }),
    });
  };

  const rawDocuments: DocumentRow[] =
    (docsOnly ? subtreeDocuments.data : pasta ? documents.data : undefined) ?? [];

  // Ordenação (?ord=&dir=): documentos pela coluna ativa; pastas ficam no
  // topo e só reordenam pelo Nome (nas demais colunas seguem em ordem alfabética).
  const currentOrd = ord ?? 'nome';
  const currentDir = dir ?? 'asc';
  const docAccessors: Record<string, (doc: DocumentRow) => SortValue> = {
    nome: (doc) => normalizeText(doc.name),
    local: (doc) =>
      doc.folderId ? normalizeText(folderById.get(doc.folderId)?.name ?? '') : null,
    venc: (doc) => doc.expiresAt,
    criacao: (doc) => new Date(doc.createdAt).getTime(),
  };
  const docRows = sortRows(
    filterByExpiry(rawDocuments, { venc, de, ate }, DEFAULT_WARN_DAYS),
    docAccessors[currentOrd] ?? docAccessors.nome!,
    currentDir,
  );
  const sortedChildren = sortRows(
    children,
    (node) => normalizeText(node.name),
    currentOrd === 'nome' ? currentDir : 'asc',
  );
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/$unitId/pie',
      params: { companyId, unitId },
      search: patchSearch(toggleSort({ ord, dir }, key, 'nome')),
    });

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Prontuário de Instalações Elétricas</p>
          <PageTitle>P.I.E</PageTitle>
        </div>
        <div className="flex gap-2">
          {canManageSchemas && !showRegister && (
            <Button variant="secondary" onClick={() => setSchemasOpen(true)}>
              <Layers aria-hidden className="size-4" /> Estruturas
            </Button>
          )}
          {pasta && canUploadDoc && !showRegister && (
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
        aria-label="Caminho no P.I.E"
        className="flex flex-wrap items-center gap-2 font-ui text-caption"
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

      {!showRegister && (
      <div className="flex items-center gap-2">
      <ExpiryFilter
        value={{ venc, de, ate }}
        onChange={(next) =>
          navigate({
            to: '/$companyId/$unitId/pie',
            params: { companyId, unitId },
            search: patchSearch({ venc: undefined, de: undefined, ate: undefined, ...next }),
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
      )}
      </div>

      {showRegister && registerListTarget && (
        <RegisterPage
          module={registerListTarget === 'colaboradores' ? 'colaboradores' : 'equipamentos'}
          embed={{ target: registerListTarget }}
        />
      )}

      {!showRegister && (actionError || removeFolder.error) && (
        <p role="alert" className="text-sm text-bad">
          {actionError ?? removeFolder.error?.message}
        </p>
      )}

      {/* Lista única (estilo drive): pastas no topo, arquivos abaixo.
          Clique direito fora das linhas abre o menu da seção (Nova pasta). */}
      {!showRegister && (
      <div
        className="min-h-48 overflow-x-auto"
        onContextMenu={(e) => {
          if (docsOnly || (!canCreateFolder && !(pasta && canUploadDoc))) return;
          e.preventDefault();
          setSectionMenu({ top: e.clientY, left: e.clientX });
        }}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(
                (docsOnly
                  ? [
                      ['nome', 'Nome'],
                      ['local', 'Local'],
                      ['venc', 'Vencimento'],
                      ['criacao', 'Data criação'],
                    ]
                  : [
                      ['nome', 'Nome'],
                      ['venc', 'Vencimento'],
                      ['criacao', 'Data criação'],
                    ]) as [string, string][]
              ).map(([key, label]) => (
                <SortableTh
                  key={key}
                  colKey={key}
                  label={label}
                  ord={currentOrd}
                  dir={currentDir}
                  onSort={handleSort}
                />
              ))}
              <PlainTh />
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

            {!docsOnly && !creating && children.length === 0 && (documents.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-12 text-center">
                  {pasta ? (
                    <span className="text-muted">
                      {canUploadDoc || canCreateFolder
                        ? 'Pasta vazia — envie um documento ou crie uma subpasta.'
                        : 'Pasta vazia.'}
                    </span>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-muted">
                        {canManageSchemas || canCreateFolder
                          ? 'Prontuário vazio — gere uma estrutura de pastas ou crie a primeira pasta.'
                          : 'Prontuário vazio.'}
                      </span>
                      {canManageSchemas && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setSchemasOpen(true)}
                        >
                          <Layers aria-hidden className="size-4" /> Gerar estrutura de pastas
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}

            {!docsOnly &&
              sortedChildren.map((node) => {
              // Pasta "Lista de <Grupo>" (filha) usa o ícone do cadastro.
              const childTarget = matchRegisterTarget([...path.map((p) => p.name), node.name]);
              const NodeIcon = childTarget ? registerFolderIcon[childTarget] : FolderIcon;
              return (
              <tr
                key={node.id}
                onClick={() => goTo(node.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFolderMenu({ position: { top: e.clientY, left: e.clientX }, node });
                }}
                className="group cursor-pointer hover:bg-paper"
              >
                <Td>
                  <Link
                    to="/$companyId/$unitId/pie"
                    params={{ companyId, unitId }}
                    search={{ pasta: node.id }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2.5 font-medium"
                  >
                    <NodeIcon
                      aria-hidden
                      className={`size-4 shrink-0 ${childTarget ? 'text-action' : 'text-muted'}`}
                    />
                    <span className="truncate">{node.name}</span>
                  </Link>
                </Td>
                <Td className="text-muted">—</Td>
                <Td className="tabular font-mono text-caption">
                  {formatDate(node.createdAt)}
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-0.5">
                    {canRenameFolder && (
                      <button
                        type="button"
                        title="Renomear"
                        aria-label={`Renomear pasta ${node.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          renameDialog.open(node);
                          setRenameValue(node.name);
                        }}
                        className={rowActionClass}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                    )}
                    {(canRenameFolder || canDeleteFolder) && (
                      <RowMenu
                        label={`Ações da pasta ${node.name}`}
                        items={[
                          ...(canRenameFolder
                            ? [
                                {
                                  label: 'Renomear',
                                  onSelect: () => {
                                    renameDialog.open(node);
                                    setRenameValue(node.name);
                                  },
                                },
                              ]
                            : []),
                          ...(canDeleteFolder
                            ? [
                                {
                                  label: 'Excluir',
                                  danger: true,
                                  onSelect: () => deleteFolderDialog.open(node),
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </div>
                </Td>
              </tr>
              );
              })}

            {/* Input inline de nova pasta — entra logo depois da última pasta */}
            {!docsOnly && creating && (
              <tr>
                <td colSpan={4} className="border-b border-line px-3.5 py-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (folderName.trim())
                        createFolder.mutate({
                          unitId,
                          parentId: pasta ?? null,
                          name: folderName.trim(),
                        });
                    }}
                    className="flex items-center gap-2.5"
                  >
                    <FolderPlus aria-hidden className="size-4 shrink-0 text-muted" />
                    <input
                      autoFocus
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                      placeholder="Nome da nova pasta"
                      aria-label="Nome da nova pasta"
                      className="flex-1 rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
                    />
                    <Button type="submit" disabled={createFolder.isPending}>
                      {createFolder.isPending ? 'Criando…' : 'Criar'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                      Cancelar
                    </Button>
                  </form>
                </td>
              </tr>
            )}

            {docRows.map(
              (doc) => (
                <tr
                  key={doc.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ position: { top: e.clientY, left: e.clientX }, doc });
                  }}
                  className="group hover:bg-paper"
                >
                  <Td>
                    <span className="flex items-center gap-2.5 font-medium">
                      <FileTypeIcon
                        aria-hidden
                        mimeType={doc.mimeType}
                        name={doc.name}
                        className="size-4 shrink-0"
                      />
                      <button
                        type="button"
                        title={`Visualizar ${doc.name}`}
                        onClick={() => openPreview(doc)}
                        className="cursor-pointer truncate hover:text-action hover:underline"
                      >
                        {doc.name}
                      </button>
                    </span>
                  </Td>
                  {docsOnly && (
                    <Td>
                      {doc.folderId ? (
                        <button
                          type="button"
                          title={folderPath(doc.folderId)}
                          onClick={() => goTo(doc.folderId, 'lista')}
                          className="flex max-w-56 cursor-pointer items-center gap-1.5 text-caption text-muted hover:text-action hover:underline"
                        >
                          <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {folderById.get(doc.folderId)?.name ?? '—'}
                          </span>
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  )}
                  <Td>
                    <ExpiryPill expiresAt={doc.expiresAt} warnDaysBefore={doc.warnDaysBefore} />
                  </Td>
                  <Td className="tabular font-mono text-caption">
                    {formatDate(doc.createdAt)}
                  </Td>
                  <Td>
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
                      {canEditDoc && (
                        <button
                          type="button"
                          title="Editar"
                          aria-label={`Editar ${doc.name}`}
                          onClick={() => openEdit(doc)}
                          className={rowActionClass}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </button>
                      )}
                      <RowMenu label={`Ações de ${doc.name}`} items={documentMenuItems(doc)} />
                    </div>
                  </Td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      )}

      {/* — Diálogos — */}

      <Dialog
        open={renameDialog.isOpen}
        onClose={() => renameDialog.close()}
        title="Renomear pasta"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renameDialog.target && renameValue.trim())
              renameFolder.mutate({
                unitId,
                folderId: renameDialog.target.id,
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
            <Button type="button" variant="secondary" onClick={() => renameDialog.close()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={renameFolder.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={editDialog.isOpen}
        onClose={() => editDialog.close()}
        title="Editar documento"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editDialog.target) return;
            updateDocument.mutate({
              unitId,
              documentId: editDialog.target.id,
              name: editName.trim() || editDialog.target.name,
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
          <div className="flex flex-col gap-4 sm:flex-row">
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
            <Button type="button" variant="secondary" onClick={() => editDialog.close()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateDocument.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleteDialog.isOpen}
        onClose={() => {
          deleteDialog.close();
          setPurgeChecked(false);
        }}
        title="Excluir documento"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir <strong>{deleteDialog.target?.name}</strong>?{' '}
            {purgeChecked
              ? 'Documento, histórico de versões e arquivos serão APAGADOS do sistema.'
              : 'O histórico de versões será mantido no registro do prontuário.'}
          </p>
          {canPurge && (
            <label className="flex cursor-pointer items-start gap-2 rounded-ctl border border-line bg-paper p-3 text-sm">
              <input
                type="checkbox"
                checked={purgeChecked}
                onChange={(e) => setPurgeChecked(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-bad)]"
              />
              <span>
                <strong>Excluir definitivamente</strong> — apaga também o histórico de versões e
                os arquivos, sem recuperação (nem pelo suporte).
              </span>
            </label>
          )}
          {(removeDocument.error || purgeDocument.error) && (
            <p role="alert" className="text-sm text-bad">
              {removeDocument.error?.message ?? purgeDocument.error?.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                deleteDialog.close();
                setPurgeChecked(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeDocument.isPending || purgeDocument.isPending}
              onClick={() => {
                if (!deleteDialog.target) return;
                const input = { unitId, documentId: deleteDialog.target.id };
                if (purgeChecked) purgeDocument.mutate(input);
                else removeDocument.mutate(input);
                setPurgeChecked(false);
              }}
            >
              {purgeChecked ? 'Excluir definitivamente' : 'Excluir'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteFolderDialog.isOpen}
        onClose={() => deleteFolderDialog.close()}
        title="Excluir pasta"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir a pasta <strong>{deleteFolderDialog.target?.name}</strong>? Subpastas e documentos
            dentro dela serão excluídos junto.
          </p>
          {removeFolder.error && (
            <p role="alert" className="text-sm text-bad">
              {removeFolder.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => deleteFolderDialog.close()}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeFolder.isPending}
              onClick={() =>
                deleteFolderDialog.target &&
                removeFolder.mutate({ unitId, folderId: deleteFolderDialog.target.id })
              }
            >
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>

      <DocumentVersionsDialog
        unitId={unitId}
        target={versionsDialog.target}
        uploading={uploading}
        canUpload={canUploadDoc}
        canRestore={canRestoreDoc}
        canPurge={canPurge}
        onClose={() => versionsDialog.close()}
        onUploadNewVersion={() => {
          if (!versionsDialog.target) return;
          versionTargetRef.current = versionsDialog.target.id;
          fileInputRef.current?.click();
        }}
        onDownload={(versionId) => versionsDialog.target && download(versionsDialog.target.id, versionId)}
        onPreview={(versionId) => versionsDialog.target && openPreview(versionsDialog.target, versionId)}
        onDocumentsChanged={invalidateDocuments}
      />

      <DocumentPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onDownload={(documentId) => download(documentId)}
      />

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

      {folderMenu && (
        <Menu
          position={folderMenu.position}
          onClose={() => setFolderMenu(null)}
          items={[
            { label: 'Abrir', onSelect: () => goTo(folderMenu.node.id) },
            ...(canRenameFolder
              ? [
                  {
                    label: 'Renomear',
                    onSelect: () => {
                      renameDialog.open(folderMenu.node);
                      setRenameValue(folderMenu.node.name);
                    },
                  },
                ]
              : []),
            ...(canCreateFolder
              ? [
                  {
                    label: 'Nova pasta dentro',
                    onSelect: () => {
                      goTo(folderMenu.node.id);
                      setFolderName('');
                      setCreating(true);
                    },
                  },
                ]
              : []),
            ...(canDeleteFolder
              ? [
                  {
                    label: 'Excluir',
                    danger: true,
                    onSelect: () => deleteFolderDialog.open(folderMenu.node),
                  },
                ]
              : []),
          ]}
        />
      )}

      {sectionMenu && (
        <Menu
          position={sectionMenu}
          onClose={() => setSectionMenu(null)}
          items={[
            ...(canCreateFolder
              ? [
                  {
                    label: 'Nova pasta',
                    onSelect: () => {
                      setFolderName('');
                      setCreating(true);
                    },
                  },
                ]
              : []),
            ...(pasta && canUploadDoc
              ? [{ label: 'Enviar documento', onSelect: () => setUploadOpen(true) }]
              : []),
          ]}
        />
      )}
    </Page>
  );
}
