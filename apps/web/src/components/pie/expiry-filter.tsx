import { useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { daysUntilExpiry } from '@easynr10/shared';
import { Button } from '@/components/ui/button';

// Filtro de vencimento do PIE, portado do legado (documents/filters.tsx +
// hooks/documents/documentsFilters.ts). Presets e período personalizado;
// clicar na opção ativa limpa o filtro. O valor vive na URL (?venc=&de=&ate=).

export const expiryPresets = ['a_vencer', 'vencidos', 'personalizado'] as const;
export type ExpiryPreset = (typeof expiryPresets)[number];

export interface ExpiryFilterValue {
  venc?: ExpiryPreset;
  de?: string;
  ate?: string;
}

const options: { value: ExpiryPreset; label: string; dot: string }[] = [
  { value: 'a_vencer', label: 'A vencer', dot: 'bg-warn' },
  { value: 'vencidos', label: 'Vencidos', dot: 'bg-bad' },
  { value: 'personalizado', label: 'Personalizado', dot: 'bg-idle' },
];

// Mesma regra do legado, mas "A vencer" usa a janela de aviso do próprio
// documento (warn_days_before) em vez de um valor global. Os dias vêm da
// regra única do shared (mesma da API).
export function filterByExpiry<
  T extends { expiresAt: string | null; warnDaysBefore: number | null },
>(rows: T[], { venc, de, ate }: ExpiryFilterValue, defaultWarnDays: number): T[] {
  if (!venc) return rows;

  return rows.filter((row) => {
    if (!row.expiresAt) return false;
    const days = daysUntilExpiry(row.expiresAt);
    switch (venc) {
      case 'vencidos':
        return days < 0;
      case 'a_vencer':
        return days >= 0 && days <= (row.warnDaysBefore ?? defaultWarnDays);
      case 'personalizado':
        return Boolean(de && ate && row.expiresAt >= de && row.expiresAt <= ate);
    }
  });
}

export function ExpiryFilter({
  value,
  onChange,
}: {
  value: ExpiryFilterValue;
  onChange: (next: ExpiryFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  // Rascunho do período: só vai para a URL no "Aplicar".
  const [de, setDe] = useState(value.de ?? '');
  const [ate, setAte] = useState(value.ate ?? '');

  const current = options.find((opt) => opt.value === value.venc);

  const select = (preset: ExpiryPreset) => {
    if (value.venc === preset) {
      onChange({});
      setOpen(false);
      return;
    }
    if (preset === 'personalizado') {
      onChange({ venc: preset, de: value.de, ate: value.ate });
      return; // mantém aberto para escolher o período
    }
    onChange({ venc: preset });
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Chip ativo com ✕ para limpar (estilo Drive: label | ✕) */}
      <div
        className={`flex items-stretch rounded-ctl border font-ui text-[13px] font-semibold ${
          current
            ? 'border-action bg-action-soft text-action'
            : 'border-line-strong text-ink-soft hover:border-ink-soft'
        }`}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((state) => !state)}
          className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5"
        >
          <Filter aria-hidden className="size-3.5" />
          {current?.label ?? 'Vencimento'}
          <ChevronDown
            aria-hidden
            className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {current && (
          <>
            <span aria-hidden className="my-1 w-px bg-action/30" />
            <button
              type="button"
              title="Limpar filtro"
              aria-label="Limpar filtro de vencimento"
              onClick={() => {
                onChange({});
                setOpen(false);
              }}
              className="cursor-pointer rounded-r-ctl px-2 hover:bg-action/10"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-card border border-line-strong bg-surface p-1.5 shadow-[0_8px_24px_rgba(26,35,51,.18)]">
            <p className="px-2 pb-1 pt-0.5 font-mono text-[11px] font-medium uppercase tracking-[.12em] text-muted">
              Filtrar por vencimento
            </p>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => select(opt.value)}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left
                  font-ui text-[13.5px] font-medium ${
                    value.venc === opt.value ? 'bg-action-soft text-action' : 'hover:bg-paper'
                  }`}
              >
                <span aria-hidden className={`size-2 rounded-full ${opt.dot}`} />
                {opt.label}
              </button>
            ))}

            {value.venc === 'personalizado' && (
              <div className="mt-1 flex flex-col gap-2 border-t border-line px-2 pb-1.5 pt-2">
                <label className="flex flex-col gap-1 font-ui text-xs font-medium text-muted">
                  Data inicial
                  <input
                    type="date"
                    value={de}
                    onChange={(e) => setDe(e.target.value)}
                    className="rounded-ctl border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 font-ui text-xs font-medium text-muted">
                  Data final
                  <input
                    type="date"
                    value={ate}
                    onChange={(e) => setAte(e.target.value)}
                    className="rounded-ctl border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink"
                  />
                </label>
                <Button
                  type="button"
                  disabled={!de || !ate}
                  onClick={() => {
                    onChange({ venc: 'personalizado', de, ate });
                    setOpen(false);
                  }}
                >
                  Aplicar filtro
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
