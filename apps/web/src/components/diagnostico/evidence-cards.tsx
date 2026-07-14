import { useState, type ReactNode } from 'react';
import { ChevronRight, FileText, Search } from 'lucide-react';
import {
  daysUntilExpiry,
  diagnosticStatusScore,
  scoreToStatus,
  worstStatus,
  type DiagnosticStatus,
} from '@easynr10/shared';
import { AdherencePicker } from '@/components/ui/adherence-picker';
import {
  NotaPill,
  adherenceBorders,
  adherenceDots,
  adherenceSoftBg,
  adherenceText,
  statusPillLabel,
} from '@/components/ui/status-pill';
import { NcCodeChip, NotaChip, type NcOption } from '@/components/diagnostico/nc-choice';

// Cards de evidência do diagnóstico (redesign das NCs, 13/07/2026): cabeçalho
// fixo com o tipo, a pergunta e a nota derivada; requisito de cadastro traz a
// legenda das NCs no topo e chips de código por item — sem NCs configuradas,
// volta ao seletor de nota manual (por item).

export interface CadastroDraft {
  employeeId: string | null;
  equipmentId: string | null;
  label: string;
  documentId: string;
  documentName: string | null;
  /** Vencimento do documento vinculado — vencido gera a NC automática (Parcial). */
  expiresAt: string | null;
  /** NC marcada ('' = sem NC) — só nos requisitos com NCs configuradas. */
  ncId: string;
  /** Nota do item: derivada da NC (modo NC) ou manual (requisito sem NCs). */
  adherence: DiagnosticStatus | null;
}

export const isDocExpired = (expiresAt: string | null) =>
  Boolean(expiresAt && daysUntilExpiry(expiresAt) < 0);

// Nota efetiva do item: a da NC marcada (ou manual), rebaixada a Parcial
// quando o documento vinculado está vencido — vale a MENOR. Sem NC marcada:
// Pleno com documento; Inexistente sem (Conforme não se aplica a documento
// faltante).
export function cadastroItemNota(
  item: CadastroDraft,
  ncAdherence: (ncId: string) => DiagnosticStatus | undefined,
  ncMode: boolean,
): DiagnosticStatus | null {
  const base = ncMode
    ? (ncAdherence(item.ncId) ?? (item.documentId ? 'plena' : 'inexistente'))
    : item.adherence;
  if (base === null) return null;
  return isDocExpired(item.expiresAt) ? worstStatus(base, 'parcial') : base;
}

const spineBg = (nota: DiagnosticStatus | null) => (nota ? adherenceDots[nota] : 'bg-idle');
const notaScore = (nota: DiagnosticStatus | null) => (nota ? diagnosticStatusScore[nota] : 0);

// — Casca comum: cabeçalho tipo + pergunta + nota derivada; o corpo recolhe
// pelo cabeçalho (a nota continua visível fechado) —
export function EvidenceCardShell({
  kind,
  title,
  headerRight,
  defaultOpen = true,
  children,
}: {
  kind: string;
  title: string;
  headerRight: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-paper">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full cursor-pointer items-center gap-2.5 bg-surface px-3.5 py-2.5 text-left hover:bg-ink/[.03] ${open ? 'border-b border-line' : ''}`}
      >
        <ChevronRight
          aria-hidden
          className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="shrink-0 rounded-ctl bg-idle-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-muted">
          {kind}
        </span>
        <span className="min-w-0 flex-1 truncate font-ui text-caption font-semibold" title={title}>
          {title}
        </span>
        <span className="flex shrink-0 items-center gap-2">{headerRight}</span>
      </button>
      {open && children}
    </div>
  );
}

// Chip de seleção por item do cadastro (Conforme + um por código de NC).
function SelChip({
  label,
  nota,
  checked,
  onSelect,
  ariaLabel,
  disabled,
  disabledReason,
}: {
  label: string;
  nota: DiagnosticStatus;
  checked: boolean;
  onSelect: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onSelect}
      className={`rounded-full border px-2.5 py-0.5 font-ui text-label font-semibold ${
        disabled
          ? 'cursor-not-allowed border-line bg-surface text-muted opacity-45'
          : checked
            ? `cursor-pointer ${adherenceBorders[nota]} ${adherenceText[nota]} ${adherenceSoftBg[nota]}`
            : 'cursor-pointer border-line-strong bg-surface text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

// — Card de cadastro: legenda das NCs no topo, chips por linha, massa —
export function CadastroEvidenceCard({
  title,
  targetLabel,
  items,
  ncOptions,
  loading,
  onSetNc,
  onBulkNc,
  onSetNota,
  onBulkNota,
  onPickDoc,
}: {
  title: string;
  targetLabel: string;
  items: CadastroDraft[];
  /** NCs configuradas neste requisito (vazio = modo manual, nota por item). */
  ncOptions: NcOption[];
  loading: boolean;
  onSetNc: (index: number, ncId: string | null) => void;
  onBulkNc: (indices: number[], ncId: string | null) => void;
  onSetNota: (index: number, nota: DiagnosticStatus | null) => void;
  onBulkNota: (indices: number[], nota: DiagnosticStatus | null) => void;
  onPickDoc: (index: number) => void;
}) {
  const [query, setQuery] = useState('');
  // Massa: null = Conforme no modo NC / "sem nota" no manual.
  const [bulkNc, setBulkNc] = useState<string | null>(null);
  const [bulkNota, setBulkNota] = useState<DiagnosticStatus | null>(null);

  const ncMode = ncOptions.length > 0;
  const ncById = new Map(ncOptions.map((nc) => [nc.id, nc]));
  const notaOf = (item: CadastroDraft): DiagnosticStatus | null =>
    cadastroItemNota(item, (ncId) => ncById.get(ncId)?.adherence, ncMode);

  const q = query.trim().toLowerCase();
  const shown = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !q || item.label.toLowerCase().includes(q));

  const percent = items.length
    ? Math.round((items.reduce((s, it) => s + notaScore(notaOf(it)), 0) / items.length) * 100)
    : 0;

  return (
    <EvidenceCardShell
      kind="Cadastro"
      title={`${title} — ${targetLabel}`}
      headerRight={
        items.length > 0 ? (
          <NotaPill status={scoreToStatus(percent)} label={`${percent}%`} />
        ) : null
      }
    >
      {loading ? (
        <p className="p-4 text-caption text-muted">Carregando itens…</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-caption text-muted">O cadastro não tem itens.</p>
      ) : (
        <>
          {/* Legenda: as fichas do requisito, lidas uma vez — as linhas usam só o código. */}
          {ncMode && (
            <div className="grid gap-1.5 border-b border-line bg-paper px-3 py-2.5">
              {ncOptions.map((nc) => (
                <div
                  key={nc.id}
                  className="relative flex items-center gap-2 overflow-hidden rounded-ctl border border-line bg-surface py-1.5 pl-3.5 pr-2.5"
                >
                  <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${adherenceDots[nc.adherence]}`} />
                  <NcCodeChip code={nc.code} />
                  <NotaChip nota={nc.adherence} />
                  <span className="min-w-0 flex-1 truncate text-label text-ink-soft" title={nc.description}>
                    {nc.description}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Busca + definição em massa dos itens exibidos */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2">
            <span className="flex min-w-36 flex-1 items-center gap-1.5 rounded-ctl border border-line-strong bg-surface px-2">
              <Search aria-hidden className="size-3.5 shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${targetLabel.toLowerCase()}…`}
                className="min-w-0 flex-1 bg-transparent py-1.5 text-caption outline-none"
              />
            </span>
            <span className="text-label text-muted">
              Definir {shown.length} exibido{shown.length === 1 ? '' : 's'}:
            </span>
            {ncMode ? (
              <span role="radiogroup" aria-label="NC em massa" className="flex flex-wrap gap-1.5">
                <SelChip label="Conforme" nota="plena" checked={bulkNc === null} onSelect={() => setBulkNc(null)} />
                {ncOptions.map((nc) => (
                  <SelChip
                    key={nc.id}
                    label={nc.code}
                    nota={nc.adherence}
                    checked={bulkNc === nc.id}
                    onSelect={() => setBulkNc(nc.id)}
                  />
                ))}
              </span>
            ) : (
              <AdherencePicker value={bulkNota} onChange={setBulkNota} size="sm" ariaLabel="Nota em massa" />
            )}
            <button
              type="button"
              disabled={shown.length === 0}
              onClick={() => {
                // NC não-Inexistente exige documento; Inexistente exige a
                // ausência dele — a massa pula os itens incompatíveis (as
                // chips deles ficam desabilitadas).
                const bulkNota2 = bulkNc ? ncById.get(bulkNc)?.adherence : null;
                const indices = shown
                  .filter(({ item }) => {
                    if (!ncMode) return true;
                    // Conforme (massa sem NC) exige documento vinculado.
                    if (!bulkNc) return Boolean(item.documentId);
                    return bulkNota2 === 'inexistente'
                      ? !item.documentId
                      : Boolean(item.documentId);
                  })
                  .map((s) => s.index);
                if (ncMode) onBulkNc(indices, bulkNc);
                else onBulkNota(indices, bulkNota);
              }}
              className="cursor-pointer font-ui text-label font-semibold text-action hover:underline disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>

          <ul className="max-h-72 overflow-y-auto">
            {shown.length === 0 ? (
              <li className="p-4 text-center text-caption text-muted">Nenhum item com essa busca.</li>
            ) : (
              shown.map(({ item, index }) => {
                const nota = notaOf(item);
                return (
                  <li
                    key={item.employeeId ?? item.equipmentId ?? index}
                    className="relative flex items-center gap-2.5 border-b border-line/60 bg-surface py-1.5 pl-4 pr-3 last:border-b-0"
                  >
                    <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${spineBg(nota)}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption" title={item.label}>
                        {item.label}
                      </span>
                      <span className="block truncate text-micro text-muted">
                        {item.documentName ?? 'sem documento vinculado'}
                        {isDocExpired(item.expiresAt) && (
                          <span className="font-ui font-semibold text-warn"> · vencido — NC automática Parcial</span>
                        )}
                      </span>
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
                    {ncMode ? (
                      <span
                        role="radiogroup"
                        aria-label={`NC de ${item.label}`}
                        className="flex shrink-0 flex-wrap justify-end gap-1.5"
                      >
                        <SelChip
                          label="Conforme"
                          nota="plena"
                          checked={item.ncId === ''}
                          disabled={!item.documentId}
                          disabledReason="Sem documento vinculado, o item não pode estar Conforme (conta como Inexistente)"
                          onSelect={() => onSetNc(index, null)}
                          ariaLabel={`Conforme — ${item.label}`}
                        />
                        {ncOptions.map((nc) => (
                          <SelChip
                            key={nc.id}
                            label={nc.code}
                            nota={nc.adherence}
                            checked={item.ncId === nc.id}
                            disabled={
                              nc.adherence !== 'inexistente'
                                ? !item.documentId
                                : Boolean(item.documentId)
                            }
                            disabledReason={
                              nc.adherence !== 'inexistente'
                                ? 'Sem documento vinculado, só NCs de nota Inexistente'
                                : 'Com documento vinculado, a ausência (Inexistente) não se aplica'
                            }
                            // Marcar de novo desmarca (volta a Conforme).
                            onSelect={() => onSetNc(index, item.ncId === nc.id ? null : nc.id)}
                            ariaLabel={`${nc.code} (${statusPillLabel(nc.adherence)}) — ${item.label}`}
                          />
                        ))}
                      </span>
                    ) : (
                      <AdherencePicker
                        value={item.adherence}
                        onChange={(value) => onSetNota(index, value)}
                        size="sm"
                        className="w-36 shrink-0"
                        ariaLabel={`Nota de ${item.label}`}
                      />
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
    </EvidenceCardShell>
  );
}

// Nota de uma evidência simples (documento/parecer) no cabeçalho do card.
export function SingleNotaBadge({ nota }: { nota: DiagnosticStatus | null }) {
  return <NotaPill status={nota ?? 'sem_avaliacao'} label={nota ? undefined : 'Sem nota'} />;
}
