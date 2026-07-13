import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileText } from 'lucide-react';
import {
  diagnosticAdherenceScore,
  documentGroupLabels,
  registerTargetLabels,
  scoreToStatus,
  type DiagnosticStatus,
  type DocumentGroup,
  type EvidenceInput,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { formatDate } from '@easynr10/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/ui/alert-strip';
import { Field } from '@/components/ui/field';
import { AdherencePicker } from '@/components/ui/adherence-picker';
import { StatusPill, adherenceDots, statusPillLabel } from '@/components/ui/status-pill';
import { DocumentPickerDialog } from '@/components/pie/document-picker';
import {
  CadastroEvidenceCard,
  EvidenceCardShell,
  SingleNotaBadge,
  type CadastroDraft,
} from '@/components/diagnostico/evidence-cards';

// Dialog de avaliação do item (RF14–RF16): formulário do diagnóstico,
// evidências dos requisitos (§7.6 — documento/parecer/cadastro) e histórico com
// evidências snapshot. A aderência do item NÃO é escolhida à mão: é a média das
// notas das evidências (peso 1 cada; item de cadastro sem nota = Inexistente).
// Montar com `key={target.id}` — o estado reseta a cada item.

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


// Nota pequena (bolinha + rótulo) para o histórico de evidências.
function AdherenceDot({ status }: { status: DiagnosticStatus }) {
  return (
    <span className="inline-flex items-center gap-1 text-micro text-muted">
      <span aria-hidden className={`size-2 rounded-full ${adherenceDots[status]}`} />
      {statusPillLabel(status)}
    </span>
  );
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
  // Sem leitura do P.I.E no papel, não consulta documentos (evita 403 global).
  const { can: canUnit, loaded: permissionsLoaded } = useUnitPermissions(unitId);
  const canReadPie = permissionsLoaded && canUnit('pie.ler');
  // Sem "diagnostico.avaliar", o dialog é somente leitura.
  const canAssess = canUnit('diagnostico.avaliar');
  const unitDocuments = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId, folderId: null }),
    enabled: needsDocuments && canReadPie,
  });

  // Notas: documento/parecer têm nota na evidência; cadastro, nota por item.
  const [docDrafts, setDocDrafts] = useState<Record<string, string>>({});
  const [docAdherence, setDocAdherence] = useState<Record<string, DiagnosticStatus | null>>({});
  const [opinionDrafts, setOpinionDrafts] = useState<Record<string, string>>({});
  const [opinionAdherence, setOpinionAdherence] = useState<
    Record<string, DiagnosticStatus | null>
  >({});
  const [cadastroDrafts, setCadastroDrafts] = useState<Record<string, CadastroDraft[]>>({});
  const [docPicker, setDocPicker] = useState<{ requirementId: string; itemIndex?: number } | null>(
    null,
  );
  const findDoc = (documentId: string | null | undefined) =>
    documentId ? unitDocuments.data?.find((doc) => doc.id === documentId) : undefined;

  // Expande os requisitos tipo cadastro automaticamente: a lista de itens já vem
  // com o documento e a nota vinculados (default da avaliação).
  useEffect(() => {
    const cadastros = (requirements.data ?? []).filter((req) => req.type === 'cadastro');
    for (const req of cadastros) {
      if (cadastroDrafts[req.id]) continue;
      queryClient
        .fetchQuery(
          trpc.adequacy.expandCadastroRequirement.queryOptions({ unitId, requirementId: req.id }),
        )
        .then((items) => {
          setCadastroDrafts((state) =>
            state[req.id]
              ? state
              : {
                  ...state,
                  [req.id]: items.map((item) => ({
                    employeeId: item.employeeId,
                    equipmentId: item.equipmentId,
                    label: item.label,
                    documentId: item.documentId ?? '',
                    documentName: item.documentName,
                    adherence: item.adherence,
                  })),
                },
          );
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements.data]);

  // Uma evidência por requisito. Documento/parecer sempre entram (sem nota =
  // Inexistente); cadastro entra quando tem itens.
  function buildEvidences(): EvidenceInput[] {
    const evidences: EvidenceInput[] = [];
    for (const req of requirements.data ?? []) {
      if (req.type === 'document') {
        evidences.push({
          type: 'document',
          question: req.question,
          adherence: docAdherence[req.id] ?? null,
          items: [
            { label: req.question, documentId: docDrafts[req.id] || null },
          ],
        });
      } else if (req.type === 'opinion') {
        evidences.push({
          type: 'opinion',
          question: req.question,
          adherence: opinionAdherence[req.id] ?? null,
          items: [{ label: req.question, answer: opinionDrafts[req.id]?.trim() || null }],
        });
      } else if (req.type === 'cadastro' && cadastroDrafts[req.id]?.length) {
        evidences.push({
          type: 'cadastro',
          question: req.question,
          fieldKey: req.fieldKey,
          items: cadastroDrafts[req.id]!.map((item) => ({
            label: item.label,
            documentId: item.documentId || null,
            employeeId: item.employeeId,
            equipmentId: item.equipmentId,
            adherence: item.adherence,
          })),
        });
      }
    }
    return evidences;
  }

  // Preview da nota calculada (mesma conta do servidor).
  const evidences = buildEvidences();
  const previewScore = useMemo(
    () => Math.round(diagnosticAdherenceScore(evidences) * 100),
    [evidences],
  );
  const previewStatus = scoreToStatus(previewScore);

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
        // As notas voltaram para os módulos de origem — refaz os vínculos do
        // cadastro e as listas de documentos (a evidência de documento propaga
        // a nota para o P.I.E; sem invalidar, o picker e o P.I.E mostravam a
        // aderência antiga).
        queryClient.invalidateQueries({
          queryKey: trpc.registers.documentLinks.queryKey({ unitId }),
        });
        queryClient.invalidateQueries({ queryKey: trpc.documents.listBySubtree.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.documents.listByFolder.queryKey() });
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
        title="Diagnóstico"
        titleBadge={
          <span className="shrink-0 rounded-md bg-action-soft px-2 py-1 font-mono text-micro font-semibold tracking-wide text-action">
            NR-10 §{target.normCode}
          </span>
        }
        description="A média das notas das evidências define a aderência do item"
        size="lg"
        footer={
          canAssess ? (
            <>
              <span className="mr-auto text-label text-muted">
                Aderência calculada:{' '}
                <strong className="font-mono font-semibold text-ink">{previewScore}%</strong>
              </span>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" form="diagnostico-form" disabled={diagnose.isPending}>
                {diagnose.isPending ? 'Registrando…' : 'Registrar diagnóstico'}
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5">
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
              id="diagnostico-form"
              onSubmit={(e) => {
                e.preventDefault();
                diagnose.mutate({
                  unitId,
                  adequacyItemId: target.id,
                  deadline: deadline || null,
                  responsible: responsible || null,
                  recommendedAction: recommendedAction || null,
                  technicalOpinion: technicalOpinion || null,
                  evidences: evidences.length > 0 ? evidences : undefined,
                });
              }}
              className="flex flex-col gap-4"
            >
              {/* Aderência calculada (preview) + prazo — dois cards iguais */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-card border border-line bg-paper p-3">
                  <span className="block font-ui text-micro font-semibold uppercase tracking-[.1em] text-muted">
                    Aderência calculada
                  </span>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusPill status={previewStatus} />
                    <span className="font-mono text-base font-semibold text-ink">
                      {previewScore}%
                    </span>
                    <span className="ml-auto text-micro text-muted">média das evidências</span>
                  </div>
                </div>
                <div className="rounded-card border border-line bg-paper p-3">
                  <label
                    htmlFor="diag-deadline"
                    className="block font-ui text-micro font-semibold uppercase tracking-[.1em] text-muted"
                  >
                    Prazo de adequação
                  </label>
                  <input
                    id="diag-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="mt-2 w-full rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
                  />
                  <p className="mt-1.5 text-micro text-muted">Abaixo de Plena, gera ação no plano</p>
                </div>
              </div>

              {/* — Evidências dos requisitos do item (§7.6) — */}
              {(requirements.data?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2.5">
                  <p className="font-ui text-micro font-semibold uppercase tracking-[.1em] text-muted">
                    Evidências{' '}
                    <span className="font-normal normal-case tracking-normal">
                      — {requirements.data!.length} requisito
                      {requirements.data!.length > 1 ? 's' : ''}, peso igual na média
                    </span>
                  </p>
                  {requirements.data!.map((req) => {
                    if (req.type === 'cadastro') {
                      return (
                        <CadastroEvidenceCard
                          key={req.id}
                          title={req.question}
                          targetLabel={
                            req.targetGroup ? registerTargetLabels[req.targetGroup] : 'Cadastro'
                          }
                          items={cadastroDrafts[req.id] ?? []}
                          loading={!cadastroDrafts[req.id]}
                          onSetNota={(index, nota) =>
                            setCadastroDrafts((state) => ({
                              ...state,
                              [req.id]: state[req.id]!.map((entry, i) =>
                                i === index ? { ...entry, adherence: nota } : entry,
                              ),
                            }))
                          }
                          onBulk={(indices, nota) =>
                            setCadastroDrafts((state) => {
                              const set = new Set(indices);
                              return {
                                ...state,
                                [req.id]: state[req.id]!.map((entry, i) =>
                                  set.has(i) ? { ...entry, adherence: nota } : entry,
                                ),
                              };
                            })
                          }
                          onPickDoc={(index) =>
                            setDocPicker({ requirementId: req.id, itemIndex: index })
                          }
                        />
                      );
                    }
                    if (req.type === 'document') {
                      return (
                        <EvidenceCardShell
                          key={req.id}
                          title={req.question}
                          badge={
                            <span className="rounded-md bg-idle-soft px-1.5 py-0.5 font-mono text-micro tracking-wide text-ink-soft">
                              Documento
                            </span>
                          }
                          headerRight={<SingleNotaBadge nota={docAdherence[req.id] ?? null} />}
                        >
                          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                            <button
                              type="button"
                              aria-label={`Documento para ${req.question}`}
                              onClick={() => setDocPicker({ requirementId: req.id })}
                              className={`min-w-0 flex-1 cursor-pointer truncate rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-left text-sm hover:border-action ${
                                docDrafts[req.id] ? '' : 'text-muted'
                              }`}
                            >
                              {findDoc(docDrafts[req.id])?.name ?? 'Vincular documento do P.I.E…'}
                            </button>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span
                                aria-hidden
                                className={`size-2 rounded-full ${docAdherence[req.id] ? adherenceDots[docAdherence[req.id]!] : 'bg-idle'}`}
                              />
                              <AdherencePicker
                                value={docAdherence[req.id] ?? null}
                                onChange={(value) =>
                                  setDocAdherence((state) => ({ ...state, [req.id]: value }))
                                }
                                size="sm"
                              />
                            </span>
                          </div>
                        </EvidenceCardShell>
                      );
                    }
                    return (
                      <EvidenceCardShell
                        key={req.id}
                        title={req.question}
                        badge={
                          <span className="rounded-md bg-idle-soft px-1.5 py-0.5 font-mono text-micro tracking-wide text-ink-soft">
                            Parecer
                          </span>
                        }
                        headerRight={<SingleNotaBadge nota={opinionAdherence[req.id] ?? null} />}
                      >
                        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                          <textarea
                            aria-label={`Parecer para ${req.question}`}
                            rows={2}
                            placeholder="Observação / justificativa (opcional)…"
                            value={opinionDrafts[req.id] ?? ''}
                            onChange={(e) =>
                              setOpinionDrafts((state) => ({ ...state, [req.id]: e.target.value }))
                            }
                            className="min-w-0 flex-1 rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm"
                          />
                          <span className="flex shrink-0 items-center gap-1.5 sm:pt-1">
                            <span
                              aria-hidden
                              className={`size-2 rounded-full ${opinionAdherence[req.id] ? adherenceDots[opinionAdherence[req.id]!] : 'bg-idle'}`}
                            />
                            <AdherencePicker
                              value={opinionAdherence[req.id] ?? null}
                              onChange={(value) =>
                                setOpinionAdherence((state) => ({ ...state, [req.id]: value }))
                              }
                              size="sm"
                            />
                          </span>
                        </div>
                      </EvidenceCardShell>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-card border border-line bg-paper p-3">
                <span className="font-ui text-micro font-semibold uppercase tracking-[.1em] text-muted">
                  Ação e parecer
                </span>
                <div className="flex flex-col gap-3 sm:flex-row">
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
                  <label htmlFor="parecer" className="font-ui text-caption font-semibold">
                    Parecer técnico
                  </label>
                  <textarea
                    id="parecer"
                    rows={3}
                    value={technicalOpinion}
                    onChange={(e) => setTechnicalOpinion(e.target.value)}
                    className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
                  />
                </div>
              </div>
              {diagnose.error && <AlertStrip>{diagnose.error.message}</AlertStrip>}
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
                    {entry.score != null && (
                      <span className="font-mono text-caption text-muted">{entry.score}%</span>
                    )}
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
                      className="ml-auto flex cursor-pointer items-center gap-1 font-ui text-label font-medium text-muted hover:text-action"
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
                        <p className="text-caption text-muted">Carregando…</p>
                      )}
                      {pastEvidences.data?.length === 0 && (
                        <p className="text-caption text-muted">
                          Diagnóstico registrado sem evidências.
                        </p>
                      )}
                      {pastEvidences.data?.map((ev) => (
                        <div key={ev.id}>
                          <p className="flex flex-wrap items-center gap-2 text-caption font-medium">
                            {ev.question}
                            {ev.adherence && <AdherenceDot status={ev.adherence} />}
                          </p>
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {ev.items.map((item) => (
                              <li
                                key={item.id}
                                className="flex flex-wrap items-center gap-2 text-caption text-ink-soft"
                              >
                                <span>
                                  {item.label}
                                  {item.answer ? ` — ${item.answer}` : ''}
                                  {item.documentName ? (
                                    <span className="text-action">
                                      {' '}
                                      <FileText
                                        aria-hidden
                                        className="inline size-3.5 align-[-2px]"
                                      />{' '}
                                      {item.documentName}
                                    </span>
                                  ) : ev.type !== 'opinion' ? (
                                    <span className="text-muted"> (sem documento)</span>
                                  ) : null}
                                </span>
                                {item.adherence && <AdherenceDot status={item.adherence} />}
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
          docPicker?.itemIndex !== undefined
            ? (cadastroDrafts[docPicker.requirementId]?.[docPicker.itemIndex]?.documentId ?? null)
            : docPicker
              ? (docDrafts[docPicker.requirementId] ?? null)
              : null
        }
        onSelect={(doc) => {
          if (!docPicker) return;
          if (docPicker.itemIndex !== undefined) {
            const { requirementId, itemIndex } = docPicker;
            setCadastroDrafts((state) => ({
              ...state,
              [requirementId]: state[requirementId]!.map((entry, i) =>
                i === itemIndex
                  ? {
                      ...entry,
                      documentId: doc.id,
                      documentName: doc.name,
                      // Nota default = a do documento escolhido, se ainda vazia.
                      adherence: entry.adherence ?? doc.adherence,
                    }
                  : entry,
              ),
            }));
          } else {
            const { requirementId } = docPicker;
            setDocDrafts((state) => ({ ...state, [requirementId]: doc.id }));
            setDocAdherence((state) => ({
              ...state,
              [requirementId]: state[requirementId] ?? doc.adherence,
            }));
          }
        }}
      />
    </>
  );
}
