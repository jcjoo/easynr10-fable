import { useState, type ReactNode } from 'react';
import { ChevronRight, FileText, Search } from 'lucide-react';
import {
  diagnosticStatusScore,
  scoreToStatus,
  type DiagnosticStatus,
} from '@easynr10/shared';
import { AdherencePicker } from '@/components/ui/adherence-picker';
import { adherenceDots, statusPillLabel } from '@/components/ui/status-pill';

// Cards de evidência do diagnóstico (redesign 10/07/2026): cada requisito é um
// card colapsável; o de cadastro traz busca, filtros e "definir em massa" para
// dar conta de listas grandes (padrão + exceções).

export interface CadastroDraft {
  employeeId: string | null;
  equipmentId: string | null;
  label: string;
  documentId: string;
  documentName: string | null;
  adherence: DiagnosticStatus | null;
}

const notaVar: Record<DiagnosticStatus, string> = {
  inexistente: 'var(--color-bad)',
  inadequada: 'var(--color-alert)',
  parcial: 'var(--color-warn)',
  suficiente: 'var(--color-suf)',
  plena: 'var(--color-ok)',
};
const notaColor = (nota: DiagnosticStatus | null) => (nota ? notaVar[nota] : 'var(--color-idle)');
const notaScore = (nota: DiagnosticStatus | null) => (nota ? diagnosticStatusScore[nota] : 0);

// — Casca colapsável comum a todos os tipos de evidência —
export function EvidenceCardShell({
  title,
  badge,
  headerRight,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge: ReactNode;
  headerRight: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`overflow-hidden rounded-card border bg-paper ${open ? 'border-line-strong' : 'border-line'}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-ink/[.03]"
      >
        <ChevronRight
          aria-hidden
          className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-caption text-muted">{badge}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">{headerRight}</span>
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </div>
  );
}

const badgeClass = 'rounded-md bg-idle-soft px-1.5 py-0.5 font-mono text-micro tracking-wide text-ink-soft';

// Barra de distribuição das notas (assinatura reusada por requisito).
function DistributionMeter({ items, className = '' }: { items: CadastroDraft[]; className?: string }) {
  const total = items.length || 1;
  const order: (DiagnosticStatus | 'sem')[] = [
    'inexistente',
    'inadequada',
    'parcial',
    'suficiente',
    'plena',
    'sem',
  ];
  const count = (key: DiagnosticStatus | 'sem') =>
    items.filter((it) => (key === 'sem' ? it.adherence === null : it.adherence === key)).length;
  return (
    <span className={`flex h-1.5 overflow-hidden rounded-full bg-idle-soft ${className}`}>
      {order.map((key) => {
        const c = count(key);
        if (!c) return null;
        const bg = key === 'sem' ? adherenceDots.sem_avaliacao : adherenceDots[key];
        return <span key={key} className={bg} style={{ width: `${(c / total) * 100}%` }} />;
      })}
    </span>
  );
}

type Filter = 'all' | 'sem' | 'prob' | 'ok';

// — Card de cadastro: lista densa com busca, filtros e ação em massa —
export function CadastroEvidenceCard({
  title,
  targetLabel,
  items,
  loading,
  onSetNota,
  onBulk,
  onPickDoc,
}: {
  title: string;
  targetLabel: string;
  items: CadastroDraft[];
  loading: boolean;
  onSetNota: (index: number, nota: DiagnosticStatus | null) => void;
  onBulk: (indices: number[], nota: DiagnosticStatus | null) => void;
  onPickDoc: (index: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [bulk, setBulk] = useState<DiagnosticStatus | null>(null);

  const isSem = (n: DiagnosticStatus | null) => n === null;
  const isProb = (n: DiagnosticStatus | null) => n !== null && notaScore(n) < 0.75;
  const isOk = (n: DiagnosticStatus | null) => n !== null && notaScore(n) >= 0.75;
  const counts = {
    all: items.length,
    sem: items.filter((it) => isSem(it.adherence)).length,
    prob: items.filter((it) => isProb(it.adherence)).length,
    ok: items.filter((it) => isOk(it.adherence)).length,
  };

  const q = query.trim().toLowerCase();
  const shown = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (q && !item.label.toLowerCase().includes(q)) return false;
      if (filter === 'sem') return isSem(item.adherence);
      if (filter === 'prob') return isProb(item.adherence);
      if (filter === 'ok') return isOk(item.adherence);
      return true;
    });

  const percent = items.length
    ? Math.round((items.reduce((s, it) => s + notaScore(it.adherence), 0) / items.length) * 100)
    : 0;
  const status = scoreToStatus(percent);

  const chip = (key: Filter, label: string, dot?: string) => (
    <button
      type="button"
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-ui text-label font-medium ${
        filter === key
          ? 'border-action bg-action-soft text-ink'
          : 'border-line-strong text-muted hover:text-ink'
      }`}
    >
      {dot && <span aria-hidden className={`size-1.5 rounded-sm ${dot}`} />}
      {label} <span className="font-mono text-micro text-muted">{counts[key]}</span>
    </button>
  );

  return (
    <EvidenceCardShell
      title={title}
      badge={
        <>
          <span className={badgeClass}>Cadastro · {targetLabel}</span>
          {!loading && <span>{items.length} itens</span>}
        </>
      }
      headerRight={
        <>
          <DistributionMeter items={items} className="hidden w-24 sm:flex" />
          <span
            className="w-10 text-right font-mono text-sm font-semibold"
            style={{ color: notaColor(status) }}
          >
            {items.length ? `${percent}%` : '—'}
          </span>
        </>
      }
    >
      {loading ? (
        <p className="p-4 text-caption text-muted">Carregando itens…</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-caption text-muted">O cadastro não tem itens.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 border-b border-line p-3">
            <div className="flex items-center gap-2 rounded-ctl border border-line-strong bg-surface px-2.5">
              <Search aria-hidden className="size-4 shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${targetLabel.toLowerCase()}…`}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {chip('all', 'Todas')}
              {chip('sem', 'Sem nota', adherenceDots.sem_avaliacao)}
              {chip('prob', 'Problemas', adherenceDots.inexistente)}
              {chip('ok', 'Conformes', adherenceDots.plena)}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line-strong bg-surface px-2.5 py-2">
              <span className="text-caption text-muted">
                Definir <strong className="text-ink">{shown.length}</strong>{' '}
                {shown.length === 1 ? 'item exibido' : 'itens exibidos'}:
              </span>
              <AdherencePicker value={bulk} onChange={setBulk} size="sm" ariaLabel="Nota em massa" />
              <button
                type="button"
                disabled={shown.length === 0}
                onClick={() => onBulk(shown.map((s) => s.index), bulk)}
                className="cursor-pointer rounded-ctl border border-line-strong px-2.5 py-1 font-ui text-label font-semibold text-ink-soft hover:bg-paper disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          </div>

          <ul className="max-h-72 overflow-y-auto">
            {shown.length === 0 ? (
              <li className="p-4 text-center text-caption text-muted">Nenhum item com esse filtro.</li>
            ) : (
              shown.map(({ item, index }) => (
                <li
                  key={item.employeeId ?? item.equipmentId ?? index}
                  className="flex items-center gap-2.5 border-b border-line/60 py-1.5 pl-2 pr-3 last:border-b-0 hover:bg-ink/[.03]"
                  style={{ borderLeft: `3px solid ${notaColor(item.adherence)}` }}
                >
                  <span className="min-w-0 flex-1 truncate text-caption" title={item.label}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPickDoc(index)}
                    title={item.documentName ?? 'Vincular documento'}
                    aria-label={
                      item.documentName
                        ? `Documento: ${item.documentName}`
                        : `Vincular documento de ${item.label}`
                    }
                    className={`shrink-0 cursor-pointer rounded-ctl p-1 hover:bg-paper ${
                      item.documentId ? 'text-suf' : 'text-muted'
                    }`}
                  >
                    <FileText aria-hidden className="size-4" />
                  </button>
                  <span className="flex w-36 shrink-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: notaColor(item.adherence) }}
                    />
                    <AdherencePicker
                      value={item.adherence}
                      onChange={(nota) => onSetNota(index, nota)}
                      size="sm"
                      className="min-w-0 flex-1"
                      ariaLabel={`Nota de ${item.label}`}
                    />
                  </span>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </EvidenceCardShell>
  );
}

// Nota de uma evidência simples (documento/parecer) no cabeçalho do card.
export function SingleNotaBadge({ nota }: { nota: DiagnosticStatus | null }) {
  if (!nota) return <span className="text-caption text-muted">sem nota</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2 rounded-full ${adherenceDots[nota]}`} />
      <span className="text-caption text-ink-soft">{statusPillLabel(nota)}</span>
    </span>
  );
}
