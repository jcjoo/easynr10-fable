import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import {
  diagnosticStatuses,
  diagnosticStatusLabels,
  documentGroupLabels,
  registerTargetLabels,
  type DiagnosticStatus,
  type DocumentGroup,
  type EvidenceInput,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { DocumentPickerDialog } from '@/components/pie/document-picker';

// Dialog de avaliação do item (RF14–RF16): formulário do diagnóstico,
// evidências dos requisitos (§7.6 — documento/parecer/grupo) e histórico com
// evidências snapshot. Montar com `key={target.id}` — o estado inicializa do
// target e reseta a cada item.

export interface AssessmentTarget {
  id: string;
  normCode: string;
  normDescription: string;
  normOrientation: string;
  orientation: string | null;
  documentGroup: DocumentGroup | null;
  status: DiagnosticStatus | null;
  deadline: string | null;
}

interface GroupItemDraft {
  employeeId: string | null;
  equipmentId: string | null;
  label: string;
  documentId: string;
}

export function AssessmentDialog({
  unitId,
  target,
  onClose,
  onSaved,
}: {
  unitId: string;
  target: AssessmentTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<DiagnosticStatus>(target.status ?? 'inexistente');
  const [deadline, setDeadline] = useState(target.deadline ?? '');
  const [responsible, setResponsible] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [technicalOpinion, setTechnicalOpinion] = useState('');

  const history = useQuery(
    trpc.adequacy.history.queryOptions({ unitId, adequacyItemId: target.id }),
  );

  // — Evidências (requisitos do item, §7.6) —
  const requirements = useQuery(
    trpc.adequacy.requirements.queryOptions({ unitId, adequacyItemId: target.id }),
  );
  const needsDocuments = requirements.data?.some((req) => req.type !== 'opinion') ?? false;
  // Sem leitura do PIE no papel, não consulta documentos (evita 403 global).
  const { can: canUnit, loaded: permissionsLoaded } = useUnitPermissions(unitId);
  const canReadPie = permissionsLoaded && canUnit('pie.ler');
  // Sem "diagnostico.avaliar", o dialog é somente leitura: descrição e
  // histórico aparecem, o formulário de avaliação some.
  const canAssess = canUnit('diagnostico.avaliar');
  const unitDocuments = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId, folderId: null }),
    enabled: needsDocuments && canReadPie,
  });
  const [docDrafts, setDocDrafts] = useState<Record<string, string>>({});
  const [opinionDrafts, setOpinionDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupItemDraft[]>>({});
  const [expandingId, setExpandingId] = useState<string | null>(null);
  // Seleção via modal com navegação de pastas; groupIndex presente = linha
  // de um requisito tipo grupo.
  const [docPicker, setDocPicker] = useState<{
    requirementId: string;
    groupIndex?: number;
  } | null>(null);
  const documentName = (documentId: string | null | undefined) =>
    documentId ? unitDocuments.data?.find((doc) => doc.id === documentId)?.name : undefined;

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
        queryClient.invalidateQueries({
          queryKey: trpc.adequacy.history.queryKey({ unitId, adequacyItemId: target.id }),
        });
        onSaved();
        onClose();
      },
    }),
  );

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`Diagnóstico — NR-10 §${target.normCode}`}
        size="lg"
      >
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="space-y-2 text-sm">
            <p>{target.normDescription}</p>
            <p className="rounded-card border-l-2 border-hazard bg-paper px-3 py-2 text-ink-soft">
              {target.normOrientation}
            </p>
            {target.orientation && (
              <p className="rounded-card border-l-2 border-action bg-action-soft/40 px-3 py-2 text-ink-soft">
                <span className="font-ui text-xs font-semibold uppercase tracking-[.06em] text-action">
                  Orientação da unidade:
                </span>{' '}
                {target.orientation}
              </p>
            )}
          </div>

          {canAssess && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
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
                    ({requirements.data!.length} requisito
                    {requirements.data!.length > 1 ? 's' : ''} — preencha o que se aplica)
                  </span>
                </p>
                {requirements.data!.map((req) => (
                  <div key={req.id} className="rounded-card border border-line bg-surface p-3">
                    <p className="text-sm font-medium">{req.question}</p>
                    {req.type === 'document' && (
                      <button
                        type="button"
                        aria-label={`Documento para ${req.question}`}
                        onClick={() => setDocPicker({ requirementId: req.id })}
                        className={`mt-2 w-full cursor-pointer rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-left text-sm hover:border-action ${
                          docDrafts[req.id] ? '' : 'text-muted'
                        }`}
                      >
                        {documentName(docDrafts[req.id]) ?? 'Vincular documento do PIE…'}
                      </button>
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
                            <button
                              type="button"
                              aria-label={`Documento para ${draft.label}`}
                              onClick={() =>
                                setDocPicker({ requirementId: req.id, groupIndex: index })
                              }
                              className={`w-64 cursor-pointer truncate rounded-ctl border border-line-strong bg-surface px-2 py-1 text-left text-[13px] hover:border-action ${
                                draft.documentId ? '' : 'text-muted'
                              }`}
                            >
                              {documentName(draft.documentId) ?? 'Sem documento'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-4">
              <Field
                label="Responsável"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className="flex-1"
              />
              <Field
                label="Ação recomendada"
                value={recommendedAction}
                onChange={(e) => setRecommendedAction(e.target.value)}
                className="flex-1"
              />
            </div>
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
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={diagnose.isPending}>
                {diagnose.isPending ? 'Registrando…' : 'Registrar diagnóstico'}
              </Button>
            </div>
          </form>
          )}

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
                      {entry.author ?? '—'} · {formatDate(new Date(entry.createdAt))}
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

      {/* Navegação de pastas começa na pasta do grupo documental da norma. */}
      <DocumentPickerDialog
        unitId={unitId}
        open={Boolean(docPicker)}
        onClose={() => setDocPicker(null)}
        startPath={target.documentGroup ? [documentGroupLabels[target.documentGroup]] : undefined}
        selectedId={
          docPicker?.groupIndex !== undefined
            ? (groupDrafts[docPicker.requirementId]?.[docPicker.groupIndex]?.documentId ?? null)
            : docPicker
              ? (docDrafts[docPicker.requirementId] ?? null)
              : null
        }
        onSelect={(doc) => {
          if (!docPicker) return;
          if (docPicker.groupIndex !== undefined) {
            const { requirementId, groupIndex } = docPicker;
            setGroupDrafts((state) => ({
              ...state,
              [requirementId]: state[requirementId]!.map((entry, i) =>
                i === groupIndex ? { ...entry, documentId: doc.id } : entry,
              ),
            }));
          } else {
            setDocDrafts((state) => ({ ...state, [docPicker.requirementId]: doc.id }));
          }
        }}
      />
    </>
  );
}
