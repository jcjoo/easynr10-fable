import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FolderIcon } from '@/components/ui/icons';

// Seletor de PASTA do PIE com navegação (botão "Novo" da sidebar): o usuário
// navega até onde quer criar o documento/pasta e confirma a pasta atual.

export interface PickedFolder {
  id: string | null; // null = raiz do prontuário
  name: string;
}

interface FolderPickerDialogProps {
  unitId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (folder: PickedFolder) => void;
  title: string;
  confirmLabel: string;
  /** Permite confirmar a raiz (criar pasta na raiz); documentos exigem pasta. */
  allowRoot?: boolean;
}

interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
}

export function FolderPickerDialog({
  unitId,
  open,
  onClose,
  onSelect,
  title,
  confirmLabel,
  allowRoot = false,
}: FolderPickerDialogProps) {
  const { can, loaded } = useUnitPermissions(unitId);
  const canRead = loaded && can('pie.ler');
  const folders = useQuery({
    ...trpc.folders.list.queryOptions({ unitId }),
    enabled: open && canRead,
  });
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (open) setCurrent(null);
  }, [open]);

  const folderById = useMemo(
    () => new Map((folders.data ?? []).map((node) => [node.id, node as FolderNode])),
    [folders.data],
  );
  const crumbs = useMemo(() => {
    const chain: FolderNode[] = [];
    for (let node = current ? folderById.get(current) : undefined; node; ) {
      chain.unshift(node);
      node = node.parentId ? folderById.get(node.parentId) : undefined;
    }
    return chain;
  }, [current, folderById]);

  const childFolders = (folders.data ?? [])
    .filter((node) => node.parentId === current)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const currentName = current ? (folderById.get(current)?.name ?? '') : 'Raiz do PIE';
  const canConfirm = allowRoot || current !== null;

  return (
    <Dialog open={open} onClose={onClose} title={title} size="lg">
      <div className="flex flex-col gap-3">
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-[13px]">
          <button
            type="button"
            onClick={() => setCurrent(null)}
            className={`cursor-pointer hover:text-action hover:underline ${current === null ? 'font-semibold' : 'text-muted'}`}
          >
            PIE
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

        <div className="h-[40vh] overflow-y-auto rounded-card border border-line p-1.5">
          {folders.isLoading && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">Carregando…</p>
          )}
          {childFolders.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => setCurrent(node.id)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-ctl px-2.5 py-2 text-left text-sm hover:bg-paper"
            >
              <FolderIcon aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="flex-1 truncate font-medium">{node.name}</span>
              <ChevronRight aria-hidden className="size-3.5 text-muted" />
            </button>
          ))}
          {!folders.isLoading && childFolders.length === 0 && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">Sem subpastas aqui.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[13px] text-muted">
            Destino: <strong className="text-ink">{currentName}</strong>
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!canConfirm}
              onClick={() => {
                onSelect({ id: current, name: currentName });
                onClose();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
