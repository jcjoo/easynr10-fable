import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, Pencil, Plus, Text, Trash2, Users, X } from 'lucide-react';
import {
  diagnosticStatusLabels,
  defaultRegisterFields,
  registerTargetLabels,
  registerTargets,
  requirementTypeLabels,
  requirementTypes,
  type DiagnosticStatus,
  type RegisterTarget,
  type RequirementType,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { AlertStrip } from '@/components/ui/alert-strip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';
import { adherenceDots, adherenceSoftBg, adherenceText, adherenceBorders } from '@/components/ui/status-pill';
import { NcCodeChip, NotaChip } from '@/components/diagnostico/nc-choice';

// Árvore Requisito → NCs (redesign da configuração do item): o requisito é o
// bloco e as NCs são linhas compactas dentro dele — o vínculo se lê na
// estrutura, não num select. Editar expande a linha no lugar; "＋ NC neste
// requisito" já nasce vinculada; NC sem requisito cai na quarentena âmbar.

const typeIcons: Record<RequirementType, typeof FileText> = {
  document: FileText,
  opinion: Text,
  cadastro: Users,
};

interface RequirementRow {
  id: string;
  type: RequirementType;
  question: string;
  targetGroup: RegisterTarget | null;
  fieldKey: string | null;
}

interface NcRow {
  id: string;
  code: string;
  description: string;
  recommendedAction: string;
  requirementId: string | null;
  adherence: DiagnosticStatus;
}

interface NcDraft {
  code: string;
  description: string;
  recommendedAction: string;
  adherence: DiagnosticStatus;
}

// Uma NC nunca implica Plena — Pleno é a ausência de NC.
const linkableNotas: DiagnosticStatus[] = ['inexistente', 'inadequada', 'parcial', 'suficiente'];

function documentColumns(target: RegisterTarget) {
  return defaultRegisterFields[target].filter((field) => field.kind === 'document');
}

// Próximo código no padrão do catálogo (NC01, NC02, …), único no item.
function nextCode(rows: NcRow[]) {
  const max = rows.reduce((top, row) => {
    const match = /^NC(\d+)$/.exec(row.code.trim());
    return match ? Math.max(top, Number(match[1])) : top;
  }, 0);
  return `NC${String(max + 1).padStart(2, '0')}`;
}

// — Editor de NC (linha expandida): código, nota implicada, textos —
function NcEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  error,
  saveLabel,
}: {
  draft: NcDraft;
  onChange: (next: NcDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error?: string | null;
  saveLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line bg-paper px-4 py-3">
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Código"
          value={draft.code}
          onChange={(e) => onChange({ ...draft, code: e.target.value })}
          className="w-28 font-mono"
        />
        <div className="flex flex-col gap-1.5">
          <span className="font-ui text-caption font-semibold">Nota que esta NC implica</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nota da NC">
            {linkableNotas.map((nota) => {
              const active = draft.adherence === nota;
              return (
                <button
                  key={nota}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...draft, adherence: nota })}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-ui text-label font-semibold ${
                    active
                      ? `${adherenceBorders[nota]} ${adherenceText[nota]} ${adherenceSoftBg[nota]}`
                      : 'border-line-strong bg-surface text-muted hover:text-ink'
                  }`}
                >
                  <span aria-hidden className={`size-2 rounded-full ${adherenceDots[nota]}`} />
                  {diagnosticStatusLabels[nota]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-caption font-semibold">Não conformidade</label>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-caption font-semibold">Ação recomendada</label>
        <textarea
          rows={2}
          value={draft.recommendedAction}
          onChange={(e) => onChange({ ...draft, recommendedAction: e.target.value })}
          className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
        />
      </div>
      {error && <AlertStrip>{error}</AlertStrip>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!draft.code.trim() || !draft.description.trim() || saving}
          onClick={onSave}
        >
          {saving ? 'Salvando…' : saveLabel}
        </Button>
      </div>
    </div>
  );
}

const rowToolClass =
  'cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100';

export function RequisitosNcs({
  unitId,
  adequacyItemId,
  canEdit,
}: {
  unitId: string;
  adequacyItemId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const requirements = useQuery(
    trpc.adequacy.requirements.queryOptions({ unitId, adequacyItemId }),
  );
  const ncs = useQuery(trpc.adequacy.ncs.queryOptions({ unitId, adequacyItemId }));
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.adequacy.requirements.queryKey({ unitId, adequacyItemId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.adequacy.ncs.queryKey({ unitId, adequacyItemId }),
    });
  };

  const reqRows: RequirementRow[] = requirements.data ?? [];
  const ncRows: NcRow[] = ncs.data ?? [];
  const ncsOf = (requirementId: string) =>
    ncRows.filter((nc) => nc.requirementId === requirementId);
  const looseNcs = ncRows.filter(
    (nc) => !nc.requirementId || !reqRows.some((req) => req.id === nc.requirementId),
  );

  // — NC: criar/editar/remover —
  const [ncEditing, setNcEditing] = useState<string | null>(null);
  const [ncCreatingIn, setNcCreatingIn] = useState<string | null>(null);
  const [ncDraft, setNcDraft] = useState<NcDraft>({
    code: '',
    description: '',
    recommendedAction: '',
    adherence: 'inexistente',
  });
  const closeNcEditor = () => {
    setNcEditing(null);
    setNcCreatingIn(null);
  };
  const addNc = useMutation(
    trpc.adequacy.addNc.mutationOptions({
      onSuccess: () => {
        closeNcEditor();
        invalidate();
      },
    }),
  );
  const updateNc = useMutation(
    trpc.adequacy.updateNc.mutationOptions({
      onSuccess: () => {
        closeNcEditor();
        invalidate();
      },
    }),
  );
  const removeNc = useMutation(trpc.adequacy.removeNc.mutationOptions({ onSuccess: invalidate }));
  // Quarentena: mover a NC solta para um requisito (o resto fica igual).
  const moveNc = useMutation(trpc.adequacy.updateNc.mutationOptions({ onSuccess: invalidate }));

  function startCreateNc(requirementId: string) {
    setNcEditing(null);
    setNcCreatingIn(requirementId);
    setNcDraft({
      code: nextCode(ncRows),
      description: '',
      recommendedAction: '',
      adherence: 'inexistente',
    });
  }
  function startEditNc(nc: NcRow) {
    setNcCreatingIn(null);
    setNcEditing(nc.id);
    setNcDraft({
      code: nc.code,
      description: nc.description,
      recommendedAction: nc.recommendedAction,
      adherence: nc.adherence,
    });
  }

  // — Requisito: criar/renomear/remover —
  const [reqFormOpen, setReqFormOpen] = useState(false);
  const [reqType, setReqType] = useState<RequirementType>('document');
  const [reqQuestion, setReqQuestion] = useState('');
  const [reqTarget, setReqTarget] = useState<RegisterTarget | ''>('');
  const [reqFieldKey, setReqFieldKey] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  const addRequirement = useMutation(
    trpc.adequacy.addRequirement.mutationOptions({
      onSuccess: () => {
        setReqQuestion('');
        setReqFormOpen(false);
        invalidate();
      },
    }),
  );
  const updateRequirement = useMutation(
    trpc.adequacy.updateRequirement.mutationOptions({
      onSuccess: () => {
        setRenaming(null);
        invalidate();
      },
    }),
  );
  const removeRequirement = useMutation(
    trpc.adequacy.removeRequirement.mutationOptions({ onSuccess: invalidate }),
  );
  const removeAll = useMutation(
    trpc.adequacy.removeAllRequirements.mutationOptions({
      onSuccess: () => {
        setConfirmRemoveAll(false);
        invalidate();
      },
    }),
  );

  const canAddReq =
    reqQuestion.trim().length > 0 &&
    (reqType !== 'cadastro' || (reqTarget && reqFieldKey)) &&
    !addRequirement.isPending;

  const saveNc = () => {
    const payload = {
      unitId,
      code: ncDraft.code.trim(),
      description: ncDraft.description.trim(),
      recommendedAction: ncDraft.recommendedAction.trim(),
      adherence: ncDraft.adherence,
    };
    if (ncCreatingIn) {
      addNc.mutate({ ...payload, adequacyItemId, requirementId: ncCreatingIn });
    } else if (ncEditing) {
      const current = ncRows.find((nc) => nc.id === ncEditing);
      updateNc.mutate({ ...payload, ncId: ncEditing, requirementId: current?.requirementId ?? null });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-ui text-base font-semibold">
          Requisitos &amp; não conformidades
          <span className="ml-2 rounded-full bg-idle-soft px-2 py-0.5 font-mono text-micro text-idle">
            {reqRows.length} req · {ncRows.length} NC
          </span>
        </h2>
        {canEdit && reqRows.length > 0 && (
          <Button variant="ghost" onClick={() => setConfirmRemoveAll(true)}>
            <Trash2 aria-hidden className="size-4" /> Remover todos
          </Button>
        )}
      </div>
      <p className="text-caption text-muted">
        Na avaliação, o consultor marca a NC do requisito — a nota é a que a NC implica; sem NC
        marcada, Pleno. Requisito sem nenhuma NC usa nota manual.
      </p>

      {requirements.isLoading && <p className="text-sm text-muted">Carregando…</p>}

      {!requirements.isLoading && reqRows.length === 0 && (
        <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-sm text-muted">
          Nenhum requisito — o diagnóstico deste item não pedirá evidências.
        </p>
      )}

      {reqRows.map((req) => {
        const Icon = typeIcons[req.type];
        const reqNcs = ncsOf(req.id);
        return (
          <div key={req.id} className="overflow-hidden rounded-card border border-line bg-surface">
            {/* Cabeçalho do bloco: tipo, pergunta (renomeável) e contagem */}
            <div className="flex items-center gap-2.5 border-b border-line bg-paper px-3.5 py-2.5">
              <span className="flex shrink-0 items-center gap-1.5 rounded-ctl bg-idle-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-muted">
                <Icon aria-hidden className="size-3" /> {requirementTypeLabels[req.type]}
              </span>
              {renaming === req.id ? (
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    aria-label="Pergunta do requisito"
                    autoFocus
                    className="min-w-0 flex-1 rounded-ctl border border-line-strong bg-surface px-2 py-1 text-caption focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
                  />
                  <button
                    type="button"
                    title="Salvar pergunta"
                    disabled={!renameValue.trim() || updateRequirement.isPending}
                    onClick={() =>
                      updateRequirement.mutate({
                        unitId,
                        requirementId: req.id,
                        question: renameValue.trim(),
                      })
                    }
                    className="cursor-pointer rounded-ctl p-1 text-ok hover:bg-ok-soft"
                  >
                    <Check aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Cancelar"
                    onClick={() => setRenaming(null)}
                    className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-line/60"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate font-ui text-caption font-semibold" title={req.question}>
                  {req.question}
                  {req.type === 'cadastro' && req.targetGroup && (
                    <span className="ml-2 rounded-full bg-idle-soft px-2 py-0.5 font-body text-micro font-normal text-idle">
                      {registerTargetLabels[req.targetGroup]}
                      {req.fieldKey
                        ? ` · ${documentColumns(req.targetGroup).find((f) => f.key === req.fieldKey)?.label ?? req.fieldKey}`
                        : ''}
                    </span>
                  )}
                </span>
              )}
              <span
                className={`shrink-0 font-mono text-micro ${reqNcs.length === 0 ? 'text-warn' : 'text-muted'}`}
              >
                {reqNcs.length === 0 ? 'nota manual' : `${reqNcs.length} NC${reqNcs.length === 1 ? '' : 's'}`}
              </span>
              {canEdit && renaming !== req.id && (
                <span className="group flex shrink-0 items-center">
                  <button
                    type="button"
                    title="Renomear requisito"
                    aria-label={`Renomear requisito ${req.question}`}
                    onClick={() => {
                      setRenaming(req.id);
                      setRenameValue(req.question);
                    }}
                    className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-line/60 hover:text-ink"
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Remover requisito"
                    aria-label={`Remover requisito ${req.question}`}
                    disabled={removeRequirement.isPending}
                    onClick={() => removeRequirement.mutate({ unitId, requirementId: req.id })}
                    className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-bad-soft hover:text-bad"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </span>
              )}
            </div>

            {/* NCs do requisito: linha compacta; ✎ expande a edição no lugar */}
            {reqNcs.map((nc) =>
              ncEditing === nc.id ? (
                <NcEditor
                  key={nc.id}
                  draft={ncDraft}
                  onChange={setNcDraft}
                  onCancel={closeNcEditor}
                  onSave={saveNc}
                  saving={updateNc.isPending}
                  error={updateNc.error?.message}
                  saveLabel="Salvar NC"
                />
              ) : (
                <div
                  key={nc.id}
                  className="group relative flex items-center gap-2.5 border-b border-line/70 py-2 pl-4 pr-3 last:border-b-0"
                >
                  <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${adherenceDots[nc.adherence]}`} />
                  <NcCodeChip code={nc.code} />
                  <span className="min-w-0 flex-1 truncate text-caption" title={nc.description}>
                    {nc.description}
                  </span>
                  <NotaChip nota={nc.adherence} />
                  {canEdit && (
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        title="Editar NC"
                        aria-label={`Editar NC ${nc.code}`}
                        onClick={() => startEditNc(nc)}
                        className={rowToolClass}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remover NC"
                        aria-label={`Remover NC ${nc.code}`}
                        disabled={removeNc.isPending}
                        onClick={() => removeNc.mutate({ unitId, ncId: nc.id })}
                        className={`${rowToolClass} hover:bg-bad-soft hover:text-bad`}
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              ),
            )}

            {reqNcs.length === 0 && ncCreatingIn !== req.id && (
              <p className="px-4 py-2.5 text-label text-muted">
                Sem NCs — na avaliação este requisito usa o seletor de nota. Adicione uma NC para
                padronizar a avaliação.
              </p>
            )}

            {/* Criar NC dentro do bloco: nasce vinculada, com o código sugerido */}
            {ncCreatingIn === req.id ? (
              <NcEditor
                draft={ncDraft}
                onChange={setNcDraft}
                onCancel={closeNcEditor}
                onSave={saveNc}
                saving={addNc.isPending}
                error={addNc.error?.message}
                saveLabel="Adicionar NC"
              />
            ) : (
              canEdit && (
                <button
                  type="button"
                  onClick={() => startCreateNc(req.id)}
                  className="flex w-full cursor-pointer items-center gap-1.5 border-t border-dashed border-line-strong px-3.5 py-2 text-left font-ui text-label font-semibold text-action hover:bg-action-soft"
                >
                  <Plus aria-hidden className="size-3.5" /> Não conformidade neste requisito
                </button>
              )
            )}
          </div>
        );
      })}

      {/* Quarentena: NC sem requisito nunca aparece na avaliação */}
      {looseNcs.length > 0 && (
        <div className="rounded-card border border-dashed border-line-strong bg-warn-soft/30 px-3.5 py-3">
          <p className="flex items-center gap-1.5 font-ui text-label font-semibold text-warn">
            ⚠ {looseNcs.length} NC{looseNcs.length === 1 ? '' : 's'} sem requisito — nunca aparece
            na avaliação
          </p>
          {looseNcs.map((nc) => (
            <div key={nc.id} className="relative mt-2 flex items-center gap-2.5 py-1 pl-3.5">
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1 rounded-full ${adherenceDots[nc.adherence]}`} />
              <NcCodeChip code={nc.code} />
              <span className="min-w-0 flex-1 truncate text-caption" title={nc.description}>
                {nc.description}
              </span>
              <NotaChip nota={nc.adherence} />
              {canEdit && (
                <select
                  aria-label={`Mover ${nc.code} para um requisito`}
                  value=""
                  disabled={moveNc.isPending}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    moveNc.mutate({
                      unitId,
                      ncId: nc.id,
                      code: nc.code,
                      description: nc.description,
                      recommendedAction: nc.recommendedAction,
                      adherence: nc.adherence,
                      requirementId: e.target.value,
                    });
                  }}
                  className="shrink-0 cursor-pointer rounded-ctl border border-line-strong bg-surface px-2 py-1 font-ui text-label font-semibold text-action"
                >
                  <option value="">mover para…</option>
                  {reqRows.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.question}
                    </option>
                  ))}
                </select>
              )}
              {canEdit && (
                <button
                  type="button"
                  title="Remover NC"
                  aria-label={`Remover NC ${nc.code}`}
                  onClick={() => removeNc.mutate({ unitId, ncId: nc.id })}
                  className="shrink-0 cursor-pointer rounded-ctl p-1 text-muted hover:bg-bad-soft hover:text-bad"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ＋ Requisito: cria o bloco e abre a pergunta para digitar */}
      {canEdit && !reqFormOpen && (
        <button
          type="button"
          onClick={() => setReqFormOpen(true)}
          className="flex w-full cursor-pointer items-center gap-1.5 rounded-card border border-dashed border-line-strong bg-surface px-3.5 py-2.5 text-left font-ui text-label font-semibold text-action hover:bg-action-soft"
        >
          <Plus aria-hidden className="size-4" /> Requisito
        </button>
      )}
      {canEdit && reqFormOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAddReq) return;
            addRequirement.mutate({
              unitId,
              adequacyItemId,
              type: reqType,
              question: reqQuestion.trim(),
              targetGroup: reqType === 'cadastro' && reqTarget ? reqTarget : null,
              fieldKey: reqType === 'cadastro' && reqFieldKey ? reqFieldKey : null,
            });
          }}
          className="space-y-3 rounded-card border border-dashed border-line-strong bg-paper p-4"
        >
          <p className="font-ui text-sm font-semibold">Novo requisito</p>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Tipo"
              value={reqType}
              onChange={(e) => setReqType(e.target.value as RequirementType)}
              className="w-40"
            >
              {requirementTypes.map((value) => (
                <option key={value} value={value}>
                  {requirementTypeLabels[value]}
                </option>
              ))}
            </SelectField>
            <Field
              label={reqType === 'cadastro' ? 'Pergunta (por item do cadastro)' : 'Descrição'}
              value={reqQuestion}
              onChange={(e) => setReqQuestion(e.target.value)}
              placeholder={
                reqType === 'cadastro'
                  ? 'Ex.: Certificado de treinamento NR-10'
                  : 'Ex.: Laudo técnico atualizado das instalações'
              }
              autoFocus
              className="min-w-64 flex-1"
            />
          </div>
          {reqType === 'cadastro' && (
            <div className="flex flex-wrap gap-3 rounded-card border border-action/20 bg-action-soft/40 p-3">
              <SelectField
                label="Cadastro alvo"
                value={reqTarget}
                onChange={(e) => {
                  setReqTarget(e.target.value as RegisterTarget | '');
                  setReqFieldKey('');
                }}
                className="min-w-52 flex-1"
              >
                <option value="">Selecionar cadastro…</option>
                {registerTargets.map((target) => (
                  <option key={target} value={target}>
                    {registerTargetLabels[target]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Coluna de documento"
                value={reqFieldKey}
                onChange={(e) => setReqFieldKey(e.target.value)}
                className="min-w-52 flex-1"
                disabled={!reqTarget}
                hint={!reqTarget ? 'Escolha o cadastro primeiro' : undefined}
              >
                <option value="">Selecionar coluna…</option>
                {reqTarget &&
                  documentColumns(reqTarget).map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
              </SelectField>
            </div>
          )}
          {addRequirement.error && <AlertStrip>{addRequirement.error.message}</AlertStrip>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReqFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canAddReq}>
              <Plus aria-hidden className="size-4" /> Adicionar requisito
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmRemoveAll}
        onClose={() => setConfirmRemoveAll(false)}
        title="Remover todos os requisitos"
        actionLabel="Remover requisitos"
        pendingLabel="Removendo…"
        pending={removeAll.isPending}
        error={removeAll.error?.message}
        onConfirm={() => removeAll.mutate({ unitId, adequacyItemId })}
      >
        Os <strong>{reqRows.length} requisitos</strong> deste item são removidos — as NCs deles
        ficam sem requisito (quarentena). Diagnósticos já realizados não são alterados.
      </ConfirmDialog>
    </div>
  );
}
