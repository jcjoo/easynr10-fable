import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { compareNormCodes, normalizeText } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Dialog } from '@/components/ui/dialog';
import { StatusPill } from '@/components/ui/status-pill';
import type { AssessmentTarget } from './assessment-dialog';

// Escolha do item da norma para um novo diagnóstico (botão "Novo" da
// sidebar): lista os itens de adequação ativos da unidade com busca; ao
// clicar, o chamador abre o dialog de avaliação.

export function ItemPickerDialog({
  unitId,
  open,
  onClose,
  onSelect,
}: {
  unitId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (item: AssessmentTarget) => void;
}) {
  const items = useQuery({
    ...trpc.adequacy.list.queryOptions({ unitId }),
    enabled: open,
  });
  const [q, setQ] = useState('');
  const qNorm = normalizeText(q).trim();

  const rows = (items.data ?? [])
    .filter(
      (row) =>
        row.isActive &&
        (!qNorm || normalizeText(`${row.normCode} ${row.normDescription}`).includes(qNorm)),
    )
    .sort((a, b) => compareNormCodes(a.normCode, b.normCode));

  return (
    <Dialog open={open} onClose={onClose} title="Novo diagnóstico — escolha o item" size="lg">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
          />
          <input
            autoFocus
            type="search"
            placeholder="Buscar norma ou exigência…"
            aria-label="Buscar item de adequação"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-ctl border border-line-strong bg-surface py-1.5 pl-8 pr-2.5 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
          />
        </div>

        <div className="h-[52vh] overflow-y-auto rounded-card border border-line p-1.5">
          {items.isLoading && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">Carregando…</p>
          )}
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                onSelect(row);
                onClose();
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-ctl px-2.5 py-2 text-left text-sm hover:bg-paper"
            >
              <span className="shrink-0 rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-[12.5px] text-action">
                {row.normCode}
              </span>
              <span className="line-clamp-1 flex-1">{row.normDescription}</span>
              <StatusPill status={row.status ?? 'inexistente'} />
            </button>
          ))}
          {!items.isLoading && rows.length === 0 && (
            <p className="px-2.5 py-6 text-center text-sm text-muted">
              {qNorm ? 'Nenhum item encontrado.' : 'Nenhum item de adequação ativo na unidade.'}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
