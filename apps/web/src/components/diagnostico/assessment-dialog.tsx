import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import {
  diagnosticAdherenceScore,
  documentGroupLabels,
  registerTargetLabels,
  scoreToStatus,
  worstStatus,
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
import { adherenceDots, adherenceText, statusPillLabel } from '@/components/ui/status-pill';
import { AdherencePicker } from '@/components/ui/adherence-picker';
import { AutoNcCard, NcChoice, type NcOption } from '@/components/diagnostico/nc-choice';
import { DocumentPickerDialog } from '@/components/pie/document-picker';
import {
  CadastroEvidenceCard,
  EvidenceCardShell,
  SingleNotaBadge,
  cadastroItemNota,
  isDocExpired,
  type CadastroDraft,
} from '@/components/diagnostico/evidence-cards';

// Dialog de avaliação do item (RF14–RF16): evidências dos requisitos (§7.6 —
// documento/parecer/cadastro) com a NC definindo a nota. O histórico vive na
// tela própria (pages/diagnostico-historico). A aderência do item é a média
// das notas das evidências (peso 1 cada).
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

  // NCs configuradas no item, agrupadas por requisito: a avaliação marca a NC
  // (não a nota) — a nota do requisito é derivada da NC; sem NC, Plena.
  // Requisito SEM NENHUMA NC configurada volta ao modo manual (nota direta).
  const ncs = useQuery(trpc.adequacy.ncs.queryOptions({ unitId, adequacyItemId: target.id }));
  const ncsByRequirement = useMemo(() => {
    const map = new Map<string, NcOption[]>();
    for (const nc of ncs.data ?? []) {
      if (!nc.requirementId) continue;
      map.set(nc.requirementId, [...(map.get(nc.requirementId) ?? []), nc]);
    }
    return map;
  }, [ncs.data]);
  const ncById = useMemo(() => new Map((ncs.data ?? []).map((nc) => [nc.id, nc])), [ncs.data]);
  const notaOf = (ncId: string | null | undefined): DiagnosticStatus =>
    (ncId && ncById.get(ncId)?.adherence) || 'plena';
  const hasNcs = (requirementId: string) =>
    (ncsByRequirement.get(requirementId)?.length ?? 0) > 0;

  // Seleções: documento/parecer têm a NC na evidência; cadastro, NC por item.
  // Requisitos sem NCs usam os estados manuais (docNota/opinionNota/adherence).
  const [docDrafts, setDocDrafts] = useState<Record<string, string>>({});
  const [docNc, setDocNc] = useState<Record<string, string>>({});
  const [docNota, setDocNota] = useState<Record<string, DiagnosticStatus | null>>({});
  const [opinionDrafts, setOpinionDrafts] = useState<Record<string, string>>({});
  const [opinionNc, setOpinionNc] = useState<Record<string, string>>({});
  const [opinionNota, setOpinionNota] = useState<Record<string, DiagnosticStatus | null>>({});
  const [cadastroDrafts, setCadastroDrafts] = useState<Record<string, CadastroDraft[]>>({});
  const [docPicker, setDocPicker] = useState<{ requirementId: string; itemIndex?: number } | null>(
    null,
  );
  const findDoc = (documentId: string | null | undefined) =>
    documentId ? unitDocuments.data?.find((doc) => doc.id === documentId) : undefined;

  // Nota efetiva do requisito simples no modo atual (NC ou manual). Documento
  // vinculado vencido soma a NC automática (Parcial) — vale a MENOR nota.
  const docExpired = (requirementId: string) =>
    isDocExpired(findDoc(docDrafts[requirementId])?.expiresAt ?? null);
  // Ficha da NC automática de documento vencido (mesmo conteúdo do servidor).
  const autoVencNc = (requirementId: string): NcOption | null => {
    const doc = findDoc(docDrafts[requirementId]);
    if (!doc || !isDocExpired(doc.expiresAt ?? null)) return null;
    return {
      id: 'auto-venc',
      code: 'VENC',
      description: `Documento vinculado vencido: ${doc.name} (venceu em ${formatDate(doc.expiresAt)}).`,
      recommendedAction: 'Renovar/atualizar o documento vinculado.',
      adherence: 'parcial',
    };
  };
  const docNotaOf = (requirementId: string): DiagnosticStatus | null => {
    // Sem NC marcada: Pleno com documento; Inexistente sem (Conforme bloqueado).
    const base = hasNcs(requirementId)
      ? docNc[requirementId]
        ? notaOf(docNc[requirementId])
        : docDrafts[requirementId]
          ? ('plena' as const)
          : ('inexistente' as const)
      : (docNota[requirementId] ?? null);
    if (base === null) return null;
    return docExpired(requirementId) ? worstStatus(base, 'parcial') : base;
  };
  const opinionNotaOf = (requirementId: string): DiagnosticStatus | null =>
    hasNcs(requirementId) ? notaOf(opinionNc[requirementId]) : (opinionNota[requirementId] ?? null);

  // Expande os requisitos tipo cadastro automaticamente: a lista de itens já
  // vem com o documento vinculado. A NC de cada item começa vazia; a nota do
  // vínculo entra como default do modo manual (requisito sem NCs).
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
                    expiresAt: item.expiresAt,
                    ncId: '',
                    adherence: item.adherence,
                  })),
                },
          );
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements.data]);

  // Uma evidência por requisito; a nota enviada é a derivada da NC (o servidor
  // re-deriva de qualquer forma — a config do item é a autoridade).
  function buildEvidences(): EvidenceInput[] {
    const evidences: EvidenceInput[] = [];
    for (const req of requirements.data ?? []) {
      const ncMode = hasNcs(req.id);
      if (req.type === 'document') {
        evidences.push({
          type: 'document',
          question: req.question,
          requirementId: req.id,
          ncId: ncMode ? docNc[req.id] || null : null,
          adherence: docNotaOf(req.id),

          items: [
            { label: req.question, documentId: docDrafts[req.id] || null },
          ],
        });
      } else if (req.type === 'opinion') {
        evidences.push({
          type: 'opinion',
          question: req.question,
          requirementId: req.id,
          ncId: ncMode ? opinionNc[req.id] || null : null,
          adherence: opinionNotaOf(req.id),
          items: [{ label: req.question, answer: opinionDrafts[req.id]?.trim() || null }],
        });
      } else if (req.type === 'cadastro' && cadastroDrafts[req.id]?.length) {
        evidences.push({
          type: 'cadastro',
          question: req.question,
          requirementId: req.id,
          fieldKey: req.fieldKey,
          items: cadastroDrafts[req.id]!.map((item) => ({
            label: item.label,
            documentId: item.documentId || null,
            employeeId: item.employeeId,
            equipmentId: item.equipmentId,
            ncId: ncMode ? item.ncId || null : null,
            adherence: cadastroItemNota(item, (ncId) => ncById.get(ncId)?.adherence, ncMode),
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
        // O diagnóstico gera NCs — o relatório de Não Conformidades muda.
        queryClient.invalidateQueries({
          queryKey: trpc.reports.nonConformities.queryKey({ unitId }),
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
        title="Diagnóstico"
        titleBadge={
          <span className="shrink-0 rounded-md bg-action-soft px-2 py-1 font-mono text-micro font-semibold tracking-wide text-action">
            {target.normCode}
          </span>
        }
        size="lg"
        footer={
          canAssess ? (
            <>
              {/* Placar vivo: recalcula a cada NC marcada — a consequência da
                  escolha nunca sai da tela. */}
              <span className="mr-auto flex min-w-0 items-center gap-2.5" aria-live="polite">
                <span className="h-[5px] w-24 overflow-hidden rounded-full bg-idle-soft">
                  <span
                    className={`block h-full rounded-full transition-all ${adherenceDots[previewStatus]}`}
                    style={{ width: `${Math.max(previewScore, 2)}%` }}
                  />
                </span>
                <span className="tabular font-mono text-sm font-semibold">{previewScore}%</span>
                <span className={`font-ui text-label font-semibold ${adherenceText[previewStatus]}`}>
                  {statusPillLabel(previewStatus)}
                </span>
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
            {/* Orientação de avaliação no lugar da descrição do item — a
                descrição já está na tabela e na configuração do item. */}
            <p>{target.normOrientation}</p>
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
                  evidences: evidences.length > 0 ? evidences : undefined,
                });
              }}
              className="flex flex-col gap-4"
            >
              {/* — Requisitos do item (§7.6) — */}
              {(requirements.data?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2.5">
                  <p className="font-ui text-micro font-semibold uppercase tracking-[.1em] text-muted">
                    Requisitos
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
                          ncOptions={ncsByRequirement.get(req.id) ?? []}
                          loading={!cadastroDrafts[req.id]}
                          onSetNc={(index, ncId) =>
                            setCadastroDrafts((state) => ({
                              ...state,
                              [req.id]: state[req.id]!.map((entry, i) =>
                                i === index ? { ...entry, ncId: ncId ?? '' } : entry,
                              ),
                            }))
                          }
                          onBulkNc={(indices, ncId) =>
                            setCadastroDrafts((state) => {
                              const set = new Set(indices);
                              return {
                                ...state,
                                [req.id]: state[req.id]!.map((entry, i) =>
                                  set.has(i) ? { ...entry, ncId: ncId ?? '' } : entry,
                                ),
                              };
                            })
                          }
                          onSetNota={(index, nota) =>
                            setCadastroDrafts((state) => ({
                              ...state,
                              [req.id]: state[req.id]!.map((entry, i) =>
                                i === index ? { ...entry, adherence: nota } : entry,
                              ),
                            }))
                          }
                          onBulkNota={(indices, nota) =>
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
                          kind="Documento"
                          title={req.question}
                          headerRight={<SingleNotaBadge nota={docNotaOf(req.id)} />}
                        >
                          <div className="flex flex-col gap-3 p-3">
                            {hasNcs(req.id) ? (
                              <NcChoice
                                options={ncsByRequirement.get(req.id) ?? []}
                                value={docNc[req.id] || null}
                                onChange={(ncId) =>
                                  setDocNc((state) => ({ ...state, [req.id]: ncId ?? '' }))
                                }
                                ariaLabel={`Situação do requisito ${req.question}`}
                                documentLinked={Boolean(docDrafts[req.id])}
                                autoNc={autoVencNc(req.id)}
                              />
                            ) : (
                              <div className="flex flex-wrap items-center gap-2.5">
                                <AdherencePicker
                                  value={docNota[req.id] ?? null}
                                  onChange={(value) =>
                                    setDocNota((state) => ({ ...state, [req.id]: value }))
                                  }
                                  size="sm"
                                  ariaLabel={`Nota de ${req.question}`}
                                />
                                <span className="text-label text-muted">
                                  Sem NCs configuradas — nota manual (configure NCs na tela do item)
                                </span>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-label text-muted">
                              <button
                                type="button"
                                aria-label={`Documento para ${req.question}`}
                                onClick={() => setDocPicker({ requirementId: req.id })}
                                className={`flex max-w-full cursor-pointer items-center gap-1.5 rounded-ctl border px-2.5 py-1 font-ui text-label font-medium ${
                                  docDrafts[req.id]
                                    ? 'border-line-strong bg-surface text-suf'
                                    : 'border-dashed border-line-strong bg-surface text-ink-soft hover:border-action hover:text-action'
                                }`}
                              >
                                <FileText aria-hidden className="size-3.5 shrink-0" />
                                <span className="truncate">
                                  {findDoc(docDrafts[req.id])?.name ?? 'Vincular documento do P.I.E'}
                                </span>
                              </button>
                              {docDrafts[req.id] && (
                                <button
                                  type="button"
                                  onClick={() => setDocPicker({ requirementId: req.id })}
                                  className="cursor-pointer font-ui font-semibold text-action hover:underline"
                                >
                                  trocar
                                </button>
                              )}
                              <span>· evidência do requisito (opcional)</span>
                            </div>
                            {!hasNcs(req.id) && docExpired(req.id) && (
                              <AutoNcCard nc={autoVencNc(req.id)!} />
                            )}
                          </div>
                        </EvidenceCardShell>
                      );
                    }
                    return (
                      <EvidenceCardShell
                        key={req.id}
                        kind="Parecer"
                        title={req.question}
                        headerRight={<SingleNotaBadge nota={opinionNotaOf(req.id)} />}
                      >
                        <div className="flex flex-col gap-3 p-3">
                          {hasNcs(req.id) ? (
                            <NcChoice
                              options={ncsByRequirement.get(req.id) ?? []}
                              value={opinionNc[req.id] || null}
                              onChange={(ncId) =>
                                setOpinionNc((state) => ({ ...state, [req.id]: ncId ?? '' }))
                              }
                              ariaLabel={`Situação do requisito ${req.question}`}
                            />
                          ) : (
                            <div className="flex flex-wrap items-center gap-2.5">
                              <AdherencePicker
                                value={opinionNota[req.id] ?? null}
                                onChange={(value) =>
                                  setOpinionNota((state) => ({ ...state, [req.id]: value }))
                                }
                                size="sm"
                                ariaLabel={`Nota de ${req.question}`}
                              />
                              <span className="text-label text-muted">
                                Sem NCs configuradas — nota manual (configure NCs na tela do item)
                              </span>
                            </div>
                          )}
                          <textarea
                            aria-label={`Parecer para ${req.question}`}
                            rows={2}
                            placeholder="Observação / justificativa (opcional)…"
                            value={opinionDrafts[req.id] ?? ''}
                            onChange={(e) =>
                              setOpinionDrafts((state) => ({ ...state, [req.id]: e.target.value }))
                            }
                            className="min-w-0 rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
                          />
                        </div>
                      </EvidenceCardShell>
                    );
                  })}
                </div>
              )}

              {diagnose.error && <AlertStrip>{diagnose.error.message}</AlertStrip>}
            </form>
          )}

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
            // No modo NC a nota segue vindo da NC marcada; no manual, a nota do
            // documento entra como default se o item ainda não tem nota.
            setCadastroDrafts((state) => ({
              ...state,
              [requirementId]: state[requirementId]!.map((entry, i) =>
                i === itemIndex
                  ? {
                      ...entry,
                      documentId: doc.id,
                      documentName: doc.name,
                      expiresAt: doc.expiresAt ?? null,
                      // Com documento, NC Inexistente não se aplica — limpa.
                      ncId:
                        entry.ncId && notaOf(entry.ncId) === 'inexistente' ? '' : entry.ncId,
                      adherence: entry.adherence ?? doc.adherence,
                    }
                  : entry,
              ),
            }));
          } else {
            const { requirementId } = docPicker;
            setDocDrafts((state) => ({ ...state, [requirementId]: doc.id }));
            // Com documento vinculado, NC Inexistente não se aplica — limpa a
            // marcação (volta a Conforme) em vez de deixar um estado inválido.
            if (notaOf(docNc[requirementId]) === 'inexistente') {
              setDocNc((state) => ({ ...state, [requirementId]: '' }));
            }
            if (!hasNcs(requirementId)) {
              setDocNota((state) => ({
                ...state,
                [requirementId]: state[requirementId] ?? doc.adherence,
              }));
            }
          }
        }}
      />
    </>
  );
}
