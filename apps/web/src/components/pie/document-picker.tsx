import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Search } from 'lucide-react';
import { normalizeText, type DiagnosticStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { Dialog } from '@/components/ui/dialog';
import { FileTypeIcon, FolderIcon } from '@/components/ui/icons';

// Seletor de documento do P.I.E com navegação de pastas (padrão de todo lugar
// que vincula documento — avaliação, CA de cadastro etc.). `startPath` abre a
// navegação já na pasta do grupo (por NOMES a partir da raiz, ex.:
// ['Equipamentos', 'EPI']); se o caminho não existir, para no ancestral mais
// próximo. A busca filtra os documentos da subárvore atual.

export interface PickedDocument {
  /** Vencimento — a avaliação usa para a NC automática de documento vencido. */
  expiresAt: string | null;
  id: string;
  name: string;
  adherence: DiagnosticStatus | null;
}

interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
}

export function resolveFolderPath(folders: FolderNode[], path: string[]): string | null {
  let current: string | null = null;
  for (const segment of path) {
    const wanted = normalizeText(segment);
    const next = folders.find(
      (node) => node.parentId === current && normalizeText(node.name) === wanted,
    );
    if (!next) return current;
    current = next.id;
  }
  return current;
}

interface DocumentPickerDialogProps {
  unitId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (doc: PickedDocument) => void;
  startPath?: string[];
  selectedId?: string | null;
  title?: string;
}

export function DocumentPickerDialog({
  unitId,
  open,
  onClose,
  onSelect,
  startPath,
  selectedId,
  title = 'Escolher documento do P.I.E',
}: DocumentPickerDialogProps) {
  // Sem leitura do P.I.E no papel, o seletor não consulta nada (evita 403).
  const { can, loaded } = useUnitPermissions(unitId);
  const canRead = loaded && can('pie.ler');
  const folders = useQuery({
    ...trpc.folders.list.queryOptions({ unitId }),
    enabled: open && canRead,
  });
  const documents = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId, folderId: null }),
    enabled: open && canRead,
  });

  const [current, setCurrent] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!open) setInitialized(false);
  }, [open]);
  useEffect(() => {
    if (open && !initialized && folders.data) {
      setCurrent(startPath ? resolveFolderPath(folders.data, startPath) : null);
      setQ('');
      setInitialized(true);
    }
  }, [open, initialized, folders.data, startPath]);

  const folderById = useMemo(
    () => new Map((folders.data ?? []).map((node) => [node.id, node])),
    [folders.data],
  );

  // Subárvore da pasta atual (para a busca); null = unidade inteira.
  const subtreeIds = useMemo(() => {
    if (current === null) return null;
    const children = new Map<string | null, string[]>();
    for (const node of folders.data ?? []) {
      const list = children.get(node.parentId) ?? [];
      list.push(node.id);
      children.set(node.parentId, list);
    }
    const ids = new Set<string>([current]);
    const queue = [current];
    while (queue.length > 0) {
      for (const child of children.get(queue.pop()!) ?? []) {
        ids.add(child);
        queue.push(child);
      }
    }
    return ids;
  }, [current, folders.data]);

  const crumbs = useMemo(() => {
    const chain: FolderNode[] = [];
    for (let node = current ? folderById.get(current) : undefined; node; ) {
      chain.unshift(node);
      node = node.parentId ? folderById.get(node.parentId) : undefined;
    }
    return chain;
  }, [current, folderById]);

  const qNorm = normalizeText(q).trim();
  const childFolders = (folders.data ?? [])
    .filter((node) => node.parentId === current)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const rows = qNorm
    ? (documents.data ?? []).filter(
        (doc) =>
          (subtreeIds === null || (doc.folderId && subtreeIds.has(doc.folderId))) &&
          normalizeText(doc.name).includes(qNorm),
      )
    : (documents.data ?? []).filter((doc) => doc.folderId === current);

  const itemClass =
    'flex w-full cursor-pointer items-center gap-2.5 rounded-ctl px-2.5 py-2 text-left text-sm hover:bg-paper';

  return (
    <Dialog open={open} onClose={onClose} title={title} size="lg">
      <div className="flex flex-col gap-3">
        {/* Caminho + busca */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-caption">
            <button
              type="button"
              onClick={() => setCurrent(null)}
              className={`cursor-pointer hover:text-action hover:underline ${current === null ? 'font-semibold' : 'text-muted'}`}
            >
              P.I.E
            </button>
            {crumbs.map((node, index) => (
              <span key={node.id} className="flex items-center gap-1">
                <ChevronRight aria-hidden className="size-3 text-muted" />
                <button
                  type="button"
                  onClick={() => setCurrent(node.id)}
                  className={`cursor-pointer hover:text-action hover:underline ${
                    index === crumbs.length - 1 ? 'font-semibold' : 'text-muted'
                  }`}
                >
                  {node.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              placeholder="Buscar nesta pasta…"
              aria-label="Buscar documento"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-56 rounded-ctl border border-line-strong bg-surface py-1.5 pl-8 pr-2.5 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
            />
          </div>
        </div>

        <div className="h-[46vh] overflow-y-auto rounded-card border border-line p-1.5">
          {loaded && !canRead && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">
              Seu papel nesta unidade não tem leitura do P.I.E.
            </p>
          )}
          {canRead && (folders.isLoading || documents.isLoading) && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">Carregando…</p>
          )}
          {!qNorm &&
            childFolders.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setCurrent(node.id)}
                className={itemClass}
              >
                <FolderIcon aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="flex-1 truncate font-medium">{node.name}</span>
                <ChevronRight aria-hidden className="size-3.5 text-muted" />
              </button>
            ))}
          {rows.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => {
                onSelect({
                  id: doc.id,
                  name: doc.name,
                  adherence: doc.adherence ?? null,
                  expiresAt: doc.expiresAt ?? null,
                });
                onClose();
              }}
              className={itemClass}
            >
              <FileTypeIcon
                aria-hidden
                mimeType={doc.mimeType}
                name={doc.name}
                className="size-4 shrink-0"
              />
              <span className="flex-1 truncate">{doc.name}</span>
              {qNorm && doc.folderId && (
                <span className="max-w-40 truncate text-label text-muted">
                  {folderById.get(doc.folderId)?.name}
                </span>
              )}
              {doc.id === selectedId && <Check aria-hidden className="size-4 text-action" />}
            </button>
          ))}
          {!folders.isLoading && !documents.isLoading && childFolders.length === 0 && rows.length === 0 && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">
              {qNorm ? 'Nenhum documento encontrado.' : 'Pasta vazia.'}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
