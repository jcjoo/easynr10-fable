import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { FolderIcon } from '@/components/ui/icons';

// Árvore de pastas do PIE na sidebar (navegação lateral estilo Drive).
// Ancestrais da pasta ativa (?pasta= na URL) abrem sozinhos; o chevron
// permite abrir/fechar manualmente por cima disso.

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
}

export function SidebarFolderTree({
  companyId,
  unitId,
}: {
  companyId: string;
  unitId: string;
}) {
  // Só consulta o PIE quando o papel comprovadamente tem leitura (senão o
  // FORBIDDEN derrubaria a página inteira para 403).
  const { can, loaded } = useUnitPermissions(unitId);
  const folders = useQuery({
    ...trpc.folders.list.queryOptions({ unitId }),
    enabled: loaded && can('pie.ler'),
  });
  const { pasta } = useSearch({ strict: false }) as { pasta?: string };
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const { childrenOf, roots, ancestors } = useMemo(() => {
    const all: FolderNode[] = folders.data ?? [];
    const childrenOf = new Map<string | null, FolderNode[]>();
    for (const node of all) {
      childrenOf.set(node.parentId, [...(childrenOf.get(node.parentId) ?? []), node]);
    }
    const byId = new Map(all.map((node) => [node.id, node]));
    const ancestors = new Set<string>();
    let cursor = pasta ? byId.get(pasta) : undefined;
    while (cursor?.parentId) {
      ancestors.add(cursor.parentId);
      cursor = byId.get(cursor.parentId);
    }
    return { childrenOf, roots: childrenOf.get(null) ?? [], ancestors };
  }, [folders.data, pasta]);

  if (!folders.data?.length) return null;

  const isOpen = (id: string) => toggled[id] ?? ancestors.has(id);

  const renderNodes = (nodes: FolderNode[], depth: number) =>
    nodes.map((node) => {
      const kids = childrenOf.get(node.id) ?? [];
      const open = isOpen(node.id);
      return (
        <div key={node.id}>
          <div
            // Grade de recuo da sidebar: ícone em 32px no 1º nível (como os
            // filhos de seção, pl-8) e passo de 16px por nível — o ícone da
            // pasta fica em paddingLeft + 16 (caixa do chevron) + 2 (pl-0.5).
            style={{ paddingLeft: `${depth * 16 + 14}px` }}
            className={`flex items-center rounded-ctl py-1 pr-2 font-ui text-[13px] font-medium ${
              pasta === node.id
                ? 'bg-action-soft text-ink'
                : 'text-ink-soft hover:bg-line/60 hover:text-ink'
            }`}
          >
            <button
              type="button"
              aria-label={`${open ? 'Recolher' : 'Expandir'} pasta ${node.name}`}
              aria-expanded={open}
              onClick={() => setToggled((state) => ({ ...state, [node.id]: !open }))}
              className={`flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted hover:text-ink ${
                kids.length ? '' : 'invisible'
              }`}
            >
              <ChevronRight
                aria-hidden
                className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
              />
            </button>
            <Link
              to="/$companyId/$unitId/pie"
              params={{ companyId, unitId }}
              search={{ pasta: node.id }}
              className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5"
            >
              <FolderIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">{node.name}</span>
            </Link>
          </div>
          {open && kids.length > 0 && renderNodes(kids, depth + 1)}
        </div>
      );
    });

  return (
    <div role="tree" aria-label="Pastas do PIE" className="flex flex-col gap-px">
      {renderNodes(roots, 0)}
    </div>
  );
}
