import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ChevronRight, Settings2 } from 'lucide-react';
import {
  adherenceBand,
  compareNormCodes,
  diagnosticStatuses,
  diagnosticStatusLabels,
  diagnosticStatusScore,
  normalizeText,
  registerTargetLabels,
  type DiagnosticStatus,
  type EvidenceInput,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';
import { StatusFilter } from '@/components/ui/status-filter';
import { StatusPill } from '@/components/ui/status-pill';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';

interface AdequacyRow {
  id: string;
  isActive: boolean;
  normCode: string;
  normDescription: string;
  normOrientation: string;
  orientation: string | null;
  importanceWeight: number;
  status: DiagnosticStatus | null;
  deadline: string | null;
}

interface GroupItemDraft {
  employeeId: string | null;
  equipmentId: string | null;
  label: string;
  documentId: string;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

export function DiagnosticosPage() {
  const { companyId, unitId } = useParams({
    from: '/_authed/$companyId/$unitId/diagnosticos',
  });
  const { status: statusFilter, ord, dir } = useSearch({
    from: '/_authed/$companyId/$unitId/diagnosticos',
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const items = useQuery(trpc.adequacy.list.queryOptions({ unitId }));
  const invalidateItems = () =>
    queryClient.invalidateQueries({ queryKey: trpc.adequacy.list.queryKey({ unitId }) });

  const generate = useMutation(
    trpc.adequacy.generate.mutationOptions({ onSuccess: invalidateItems }),
  );

  // — Avaliação —
  const [target, setTarget] = useState<AdequacyRow | null>(null);
  const [status, setStatus] = useState<DiagnosticStatus>('inexistente');
  const [deadline, setDeadline] = useState('');
  const [responsible, setResponsible] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [technicalOpinion, setTechnicalOpinion] = useState('');

  const history = useQuery({
    ...trpc.adequacy.history.queryOptions({ unitId, adequacyItemId: target?.id ?? '' }),
    enabled: Boolean(target),
  });

  // — Evidências (requisitos do item, §7.6) —
  const requirements = useQuery({
    ...trpc.adequacy.requirements.queryOptions({ unitId, adequacyItemId: target?.id ?? '' }),
    enabled: Boolean(target),
  });
  const needsDocuments = requirements.data?.some((req) => req.type !== 'opinion') ?? false;
  const unitDocuments = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId, folderId: null }),
    enabled: Boolean(target) && needsDocuments,
  });
  const [docDrafts, setDocDrafts] = useState<Record<string, string>>({});
  const [opinionDrafts, setOpinionDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupItemDraft[]>>({});
  const [expandingId, setExpandingId] = useState<string | null>(null);

  async function expandGroup(requirementId: string) {
    setExpandingId(requirementId);
    try {
      const items = await queryClient.fetchQuery(
        trpc.adequacy.expandGroupRequirement.queryOptions({ unitId, requirementId }),
      );
      setGroupDrafts((state) => ({
        ...state,
        [requirementId]: items.map((item) => ({
          employeeId: item.employeeId,
          equipmentId: item.equipmentId,
          label: item.label,
          documentId: item.suggestedDocumentId ?? '',
        })),
      }));
    } finally {
      setExpandingId(null);
    }
  }

  function buildEvidences(): EvidenceInput[] {
    const evidences: EvidenceInput[] = [];
    for (const req of requirements.data ?? []) {
      if (req.type === 'document' && docDrafts[req.id]) {
        evidences.push({
          type: req.type,
          question: req.question,
          items: [{ label: req.question, documentId: docDrafts[req.id] }],
        });
      } else if (req.type === 'opinion' && opinionDrafts[req.id]?.trim()) {
        evidences.push({
          type: req.type,
          question: req.question,
          items: [{ label: req.question, answer: opinionDrafts[req.id]!.trim() }],
        });
      } else if (req.type === 'group' && groupDrafts[req.id]?.length) {
        evidences.push({
          type: req.type,
          question: req.question,
          items: groupDrafts[req.id]!.map((item) => ({
            label: item.label,
            documentId: item.documentId || null,
            employeeId: item.employeeId,
            equipmentId: item.equipmentId,
          })),
        });
      }
    }
    return evidences;
  }

  // — Evidências de diagnósticos passados (histórico) —
  const [expandedDiagnosticId, setExpandedDiagnosticId] = useState<string | null>(null);
  const pastEvidences = useQuery({
    ...trpc.adequacy.diagnosticEvidences.queryOptions({
      unitId,
      diagnosticId: expandedDiagnosticId ?? '',
    }),
    enabled: Boolean(expandedDiagnosticId),
  });

  const diagnose = useMutation(
    trpc.adequacy.diagnose.mutationOptions({
      onSuccess: () => {
        invalidateItems();
        if (target) {
          queryClient.invalidateQueries({
            queryKey: trpc.adequacy.history.queryKey({ unitId, adequacyItemId: target.id }),
          });
        }
        setTarget(null);
      },
    }),
  );

  function openAssessment(row: AdequacyRow) {
    setTarget(row);
    setStatus(row.status ?? 'inexistente');
    setDeadline(row.deadline ?? '');
    setResponsible('');
    setRecommendedAction('');
    setTechnicalOpinion('');
    setDocDrafts({});
    setOpinionDrafts({});
    setGroupDrafts({});
    setExpandedDiagnosticId(null);
  }

  const allRows = items.data ?? [];
  const filtered = allRows.filter((row) => {
    if (!statusFilter) return true;
    if (statusFilter === 'sem_avaliacao') return row.status === null;
    if (statusFilter === 'com_avaliacao') return row.status !== null;
    return row.status === statusFilter;
  });

  // Ordenação (?ord=&dir=): servidor entrega por norma; o clique reordena.
  const currentOrd = ord ?? 'norma';
  const currentDir = dir ?? 'asc';
  const accessors: Record<string, (row: AdequacyRow) => SortValue> = {
    norma: (row) => row.normCode,
    exigencia: (row) => normalizeText(row.normDescription),
    peso: (row) => row.importanceWeight,
    aderencia: (row) => (row.status ? diagnosticStatusScore[row.status] : -1),
    prazo: (row) => row.deadline,
  };
  const sorted = sortRows(
    filtered,
    accessors[currentOrd] ?? accessors.norma!,
    currentDir,
    currentOrd === 'norma' ? compareNormCodes : undefined,
  );
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/$unitId/diagnosticos',
      params: { companyId, unitId },
      search: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...toggleSort({ ord, dir }, key, 'norma'),
      },
    });

  // Contadores dos chips.
  const counts = {
    todos: allRows.length,
    sem_avaliacao: allRows.filter((row) => row.status === null).length,
    com_avaliacao: allRows.filter((row) => row.status !== null).length,
    ...Object.fromEntries(
      diagnosticStatuses.map((value) => [
        value,
        allRows.filter((row) => row.status === value).length,
      ]),
    ),
  };

  // Aderência geral: média dos scores ponderada pelo peso da norma, só dos
  // itens ativos já avaliados; a faixa (%) dá o rótulo e a frase.
  const evaluated = allRows.filter((row) => row.isActive && row.status !== null);
  const activeTotal = allRows.filter((row) => row.isActive).length;
  const weightSum = evaluated.reduce((sum, row) => sum + row.importanceWeight, 0);
  const scoreSum = evaluated.reduce(
    (sum, row) => sum + row.importanceWeight * diagnosticStatusScore[row.status!],
    0,
  );
  const percent = weightSum > 0 ? Math.round((scoreSum / weightSum) * 100) : null;
  const band = percent !== null ? adherenceBand(percent) : null;

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Avaliação da Conformidade</p>
        <h1 className="text-[28px] font-bold tracking-tight">Diagnóstico</h1>
      </div>

      {band && percent !== null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-line bg-paper px-4 py-3">
          <span className="text-2xl" aria-hidden>
            {band.emoji}
          </span>
          <div>
            <p className="font-ui text-base font-bold tracking-tight">
              Aderência geral: {percent}% — {band.label}
            </p>
            <p className="text-sm text-ink-soft">{band.phrase}</p>
          </div>
          <span className="ml-auto font-mono text-[12px] text-muted">
            {evaluated.length} de {activeTotal} itens ativos avaliados
          </span>
        </div>
      )}

      <StatusFilter
        value={statusFilter ?? null}
        counts={counts}
        onChange={(value) =>
          navigate({
            to: '/$companyId/$unitId/diagnosticos',
            params: { companyId, unitId },
            search: { ...(value ? { status: value } : {}), ord, dir },
          })
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(
                [
                  ['norma', 'Norma'],
                  ['exigencia', 'Exigência'],
                  ['peso', 'Peso'],
                  ['aderencia', 'Aderência'],
                  ['prazo', 'Prazo'],
                ] as const
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
            {items.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3.5 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-muted">
                      Nenhum item de adequação — gere os itens a partir do catálogo NR-10.
                    </span>
                    <Button
                      variant="secondary"
                      disabled={generate.isPending}
                      onClick={() => generate.mutate({ unitId })}
                    >
                      {generate.isPending ? 'Gerando…' : 'Gerar itens de adequação'}
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {items.data && items.data.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3.5 py-10 text-center text-muted">
                  Nenhum item com essa aderência.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr
                key={row.id}
                onClick={() => openAssessment(row)}
                className="group cursor-pointer hover:bg-paper"
              >
                <td className="border-b border-line px-3.5 py-2.5">
                  <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-[12.5px] text-action">
                    {row.normCode}
                  </span>
                </td>
                <td className="w-full border-b border-line px-3.5 py-2.5">
                  <span className="line-clamp-2">{row.normDescription}</span>
                </td>
                <td className="tabular border-b border-line px-3.5 py-2.5 font-mono text-[13px]">
                  {row.importanceWeight}
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <StatusPill status={row.status ?? 'sem_avaliacao'} />
                </td>
                <td className="tabular border-b border-line px-3.5 py-2.5 font-mono text-[13px]">
                  {formatDate(row.deadline)}
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <div className="flex justify-end">
                    <Link
                      to="/$companyId/$unitId/diagnosticos/$adequacyItemId"
                      params={{ companyId, unitId, adequacyItemId: row.id }}
                      title="Configurar item (requisitos de evidência)"
                      aria-label={`Configurar item ${row.normCode}`}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Settings2 aria-hidden className="size-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`Diagnóstico — NR-10 §${target?.normCode ?? ''}`}
      >
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="space-y-2 text-sm">
            <p>{target?.normDescription}</p>
            <p className="rounded-card border-l-2 border-hazard bg-paper px-3 py-2 text-ink-soft">
              {target?.normOrientation}
            </p>
            {target?.orientation && (
              <p className="rounded-card border-l-2 border-action bg-action-soft/40 px-3 py-2 text-ink-soft">
                <span className="font-ui text-xs font-semibold uppercase tracking-[.06em] text-action">
                  Orientação da unidade:
                </span>{' '}
                {target.orientation}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!target) return;
              const evidences = buildEvidences();
              diagnose.mutate({
                unitId,
                adequacyItemId: target.id,
                status,
                deadline: deadline || null,
                responsible: responsible || null,
                recommendedAction: recommendedAction || null,
                technicalOpinion: technicalOpinion || null,
                evidences: evidences.length > 0 ? evidences : undefined,
              });
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex gap-4">
              <SelectField
                label="Aderência"
                value={status}
                onChange={(e) => setStatus(e.target.value as DiagnosticStatus)}
                className="flex-1"
              >
                {diagnosticStatuses.map((value) => (
                  <option key={value} value={value}>
                    {diagnosticStatusLabels[value]}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Prazo de adequação"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                hint="Abaixo de Conforme, gera ação no plano"
                className="flex-1"
              />
            </div>

            {/* — Evidências dos requisitos do item (§7.6) — */}
            {(requirements.data?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-3 rounded-card border border-line bg-paper p-3">
                <p className="font-ui text-[13px] font-semibold">
                  Evidências{' '}
                  <span className="font-normal text-muted">
                    ({requirements.data!.length} requisito{requirements.data!.length > 1 ? 's' : ''} —
                    preencha o que se aplica)
                  </span>
                </p>
                {requirements.data!.map((req) => (
                  <div key={req.id} className="rounded-card border border-line bg-surface p-3">
                    <p className="text-sm font-medium">{req.question}</p>
                    {req.type === 'document' && (
                      <select
                        aria-label={`Documento para ${req.question}`}
                        value={docDrafts[req.id] ?? ''}
                        onChange={(e) =>
                          setDocDrafts((state) => ({ ...state, [req.id]: e.target.value }))
                        }
                        className="mt-2 w-full rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-sm"
                      >
                        <option value="">Vincular documento do PIE…</option>
                        {unitDocuments.data?.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {req.type === 'opinion' && (
                      <textarea
                        aria-label={`Parecer para ${req.question}`}
                        rows={2}
                        placeholder="Resposta / parecer…"
                        value={opinionDrafts[req.id] ?? ''}
                        onChange={(e) =>
                          setOpinionDrafts((state) => ({ ...state, [req.id]: e.target.value }))
                        }
                        className="mt-2 w-full rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-sm"
                      />
                    )}
                    {req.type === 'group' && (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                          <span className="rounded-full bg-idle-soft px-2 py-0.5 text-[11px] text-idle">
                            {req.targetGroup ? registerTargetLabels[req.targetGroup] : 'grupo'}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={expandingId === req.id}
                            onClick={() => expandGroup(req.id)}
                          >
                            {expandingId === req.id
                              ? 'Expandindo…'
                              : groupDrafts[req.id]
                                ? 'Re-expandir grupo'
                                : 'Expandir grupo'}
                          </Button>
                        </div>
                        {groupDrafts[req.id]?.length === 0 && (
                          <p className="text-[13px] text-muted">O grupo não tem itens.</p>
                        )}
                        {groupDrafts[req.id]?.map((draft, index) => (
                          <div
                            key={draft.employeeId ?? draft.equipmentId ?? index}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span className="min-w-40 flex-1 text-[13px]">{draft.label}</span>
                            <select
                              aria-label={`Documento para ${draft.label}`}
                              value={draft.documentId}
                              onChange={(e) =>
                                setGroupDrafts((state) => ({
                                  ...state,
                                  [req.id]: state[req.id]!.map((entry, i) =>
                                    i === index ? { ...entry, documentId: e.target.value } : entry,
                                  ),
                                }))
                              }
                              className="w-64 rounded-ctl border border-line-strong bg-surface px-2 py-1 text-[13px]"
                            >
                              <option value="">Sem documento</option>
                              {unitDocuments.data?.map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                  {doc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Field
              label="Responsável"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            />
            <Field
              label="Ação recomendada"
              value={recommendedAction}
              onChange={(e) => setRecommendedAction(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="parecer" className="font-ui text-[13px] font-semibold">
                Parecer técnico
              </label>
              <textarea
                id="parecer"
                rows={3}
                value={technicalOpinion}
                onChange={(e) => setTechnicalOpinion(e.target.value)}
                className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={diagnose.isPending}>
                {diagnose.isPending ? 'Registrando…' : 'Registrar diagnóstico'}
              </Button>
            </div>
          </form>

          <div>
            <h3 className="font-ui text-sm font-semibold">Histórico</h3>
            {history.data?.length === 0 && (
              <p className="mt-1 text-sm text-muted">Item ainda sem avaliação.</p>
            )}
            <ul className="mt-1 flex flex-col">
              {history.data?.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-1 border-b border-line py-2.5 text-sm last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={entry.status} />
                    <span className="text-muted">
                      {entry.author ?? '—'} ·{' '}
                      {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
                      {entry.deadline ? ` · prazo ${formatDate(entry.deadline)}` : ''}
                    </span>
                    <button
                      type="button"
                      aria-expanded={expandedDiagnosticId === entry.id}
                      onClick={() =>
                        setExpandedDiagnosticId((current) =>
                          current === entry.id ? null : entry.id,
                        )
                      }
                      className="ml-auto flex cursor-pointer items-center gap-1 font-ui text-[12.5px] font-medium text-muted hover:text-action"
                    >
                      <ChevronRight
                        aria-hidden
                        className={`size-3.5 transition-transform ${
                          expandedDiagnosticId === entry.id ? 'rotate-90' : ''
                        }`}
                      />
                      Evidências
                    </button>
                  </div>
                  {entry.technicalOpinion && (
                    <p className="text-ink-soft">{entry.technicalOpinion}</p>
                  )}
                  {expandedDiagnosticId === entry.id && (
                    <div className="mt-1 flex flex-col gap-2 rounded-card bg-paper p-3">
                      {pastEvidences.isLoading && (
                        <p className="text-[13px] text-muted">Carregando…</p>
                      )}
                      {pastEvidences.data?.length === 0 && (
                        <p className="text-[13px] text-muted">
                          Diagnóstico registrado sem evidências.
                        </p>
                      )}
                      {pastEvidences.data?.map((ev) => (
                        <div key={ev.id}>
                          <p className="text-[13px] font-medium">{ev.question}</p>
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {ev.items.map((item) => (
                              <li key={item.id} className="text-[13px] text-ink-soft">
                                {item.label}
                                {item.answer ? ` — ${item.answer}` : ''}
                                {item.documentName ? (
                                  <span className="text-action"> 📄 {item.documentName}</span>
                                ) : ev.type !== 'opinion' ? (
                                  <span className="text-muted"> (sem documento)</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}
