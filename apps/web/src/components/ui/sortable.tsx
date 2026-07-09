import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

// Ordenação de tabelas: estado (?ord=&dir=) na URL, cabeçalho clicável com
// aria-sort e nulos sempre no fim. Usado por todas as tabelas do sistema.

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | null;

export interface SortState {
  ord?: string;
  dir?: SortDir;
}

// validateSearch das rotas que ordenam (mesclável com outros params).
export function sortSearch(search: Record<string, unknown>): SortState {
  return {
    ord: typeof search.ord === 'string' ? search.ord : undefined,
    dir: search.dir === 'desc' ? 'desc' : search.dir === 'asc' ? 'asc' : undefined,
  };
}

// Clique no cabeçalho: mesma coluna alterna asc/desc; coluna nova começa asc.
export function toggleSort(state: SortState, key: string, defaultOrd: string): SortState {
  if ((state.ord ?? defaultOrd) === key) {
    return { ord: key, dir: (state.dir ?? 'asc') === 'asc' ? 'desc' : 'asc' };
  }
  return { ord: key, dir: 'asc' };
}

export function sortRows<T>(
  rows: T[],
  accessor: (row: T) => SortValue,
  dir: SortDir,
  compare?: (a: string, b: string) => number,
) {
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // nulos sempre no fim
    if (vb === null) return -1;
    const base =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : compare
          ? compare(String(va), String(vb))
          : String(va).localeCompare(String(vb));
    return dir === 'desc' ? -base : base;
  });
}

export function SortableTh({
  label,
  colKey,
  ord,
  dir,
  onSort,
  title,
}: {
  label: string;
  colKey: string;
  ord: string;
  dir: SortDir;
  onSort: (key: string) => void;
  title?: string;
}) {
  const active = ord === colKey;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className="whitespace-nowrap border-b border-line-strong p-0"
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(colKey)}
        className={`flex w-full cursor-pointer items-center gap-1 px-3.5 py-2.5 text-left font-ui text-xs font-semibold uppercase tracking-[.06em] hover:text-ink ${
          active ? 'text-ink' : 'text-muted'
        }`}
      >
        {label}
        <Icon aria-hidden className={`size-3 shrink-0 ${active ? '' : 'opacity-45'}`} />
      </button>
    </th>
  );
}

// Cabeçalho não ordenável no mesmo estilo (coluna de ações etc.).
export function PlainTh({ label = '' }: { label?: string }) {
  return (
    <th className="whitespace-nowrap border-b border-line-strong px-3.5 py-2.5 text-left font-ui text-xs font-semibold uppercase tracking-[.06em] text-muted">
      {label}
    </th>
  );
}
