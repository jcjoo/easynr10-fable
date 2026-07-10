import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileText, Plus, Text, Trash2, Users } from 'lucide-react';
import type { RegisterTarget, RequirementType } from '@easynr10/shared';
import {
  defaultRegisterFields,
  registerTargetLabels,
  registerTargets,
  requirementTypeLabels,
  requirementTypes,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Page, PageTitle } from '@/components/ui/page';
import { SelectField } from '@/components/ui/select';

// Configuração de um item de adequação (RF13.1), porte do itemDetail do
// legado: status do item, orientação da unidade e requisitos de evidência.

const typeLabels = requirementTypeLabels;

const typeIcons: Record<RequirementType, typeof FileText> = {
  document: FileText,
  opinion: Text,
  cadastro: Users,
};

// Colunas de documento (kind=document) de um cadastro-alvo — o requisito
// cadastro expande usando os vínculos dessa coluna.
function documentColumns(target: RegisterTarget) {
  return defaultRegisterFields[target].filter((field) => field.kind === 'document');
}

export function DiagnosticoItemPage() {
  const { companyId, unitId, adequacyItemId } = useParams({
    from: '/_authed/$companyId/$unitId/diagnosticos/$adequacyItemId',
  });
  const queryClient = useQueryClient();

  // Sem as permissões de escrita, a página vira leitura: salvar/checkbox/
  // orientação seguem "diagnostico.configurar" e os requisitos,
  // "diagnostico.requisitos".
  const { can } = useUnitPermissions(unitId);
  const canConfigure = can('diagnostico.configurar');
  const canEditRequirements = can('diagnostico.requisitos');

  const item = useQuery(trpc.adequacy.itemDetail.queryOptions({ unitId, adequacyItemId }));
  const requirements = useQuery(
    trpc.adequacy.requirements.queryOptions({ unitId, adequacyItemId }),
  );

  // — Status + orientação —
  const [isActive, setIsActive] = useState(true);
  const [orientation, setOrientation] = useState('');
  useEffect(() => {
    if (item.data) {
      setIsActive(item.data.isActive);
      setOrientation(item.data.orientation ?? '');
    }
  }, [item.data]);

  const updateItem = useMutation(
    trpc.adequacy.updateItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.adequacy.itemDetail.queryKey({ unitId, adequacyItemId }),
        });
        queryClient.invalidateQueries({ queryKey: trpc.adequacy.list.queryKey({ unitId }) });
      },
    }),
  );

  // — Requisitos —
  const invalidateRequirements = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.adequacy.requirements.queryKey({ unitId, adequacyItemId }),
    });
  const addRequirement = useMutation(
    trpc.adequacy.addRequirement.mutationOptions({
      onSuccess: () => {
        invalidateRequirements();
        setQuestion('');
      },
    }),
  );
  const removeRequirement = useMutation(
    trpc.adequacy.removeRequirement.mutationOptions({ onSuccess: invalidateRequirements }),
  );
  const removeAll = useMutation(
    trpc.adequacy.removeAllRequirements.mutationOptions({
      onSuccess: () => {
        setConfirmRemoveAll(false);
        invalidateRequirements();
      },
    }),
  );

  const [type, setType] = useState<RequirementType>('document');
  const [question, setQuestion] = useState('');
  const [targetGroup, setTargetGroup] = useState<RegisterTarget | ''>('');
  const [fieldKey, setFieldKey] = useState('');
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  const canAdd =
    question.trim().length > 0 &&
    (type !== 'cadastro' || (targetGroup && fieldKey)) &&
    !addRequirement.isPending;

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/$companyId/$unitId/diagnosticos"
          params={{ companyId, unitId }}
          className="flex items-center gap-1.5 font-ui text-sm font-medium text-muted hover:text-action"
        >
          <ArrowLeft aria-hidden className="size-4" /> Diagnóstico
        </Link>
        {canConfigure && (
          <Button
            disabled={updateItem.isPending}
            onClick={() => updateItem.mutate({ unitId, adequacyItemId, isActive, orientation: orientation || null })}
          >
            {updateItem.isPending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        )}
      </div>

      <div>
        <p className="text-sm text-muted">Configuração do item</p>
        <PageTitle>
          NR-10 §{item.data?.normCode ?? '…'}
        </PageTitle>
      </div>

      <div className="space-y-2 text-sm">
        <p>{item.data?.normDescription}</p>
        <p className="rounded-card border-l-2 border-hazard bg-paper px-3 py-2 text-ink-soft">
          {item.data?.normOrientation}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-card border border-line p-4">
        <div>
          <p className="font-ui text-sm font-semibold">Item ativo na avaliação</p>
          <p className="text-caption text-muted">
            Desative para tirar a norma do escopo desta unidade.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 font-ui text-sm font-medium">
          <input
            type="checkbox"
            checked={isActive}
            disabled={!canConfigure}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-[var(--color-action)]"
          />
          {isActive ? 'Ativo' : 'Fora de escopo'}
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="orientacao" className="font-ui text-caption font-semibold">
          Orientação da unidade
        </label>
        <textarea
          id="orientacao"
          rows={3}
          disabled={!canConfigure}
          value={orientation}
          onChange={(e) => setOrientation(e.target.value)}
          placeholder="Instruções específicas de como esta norma se aplica nesta unidade…"
          className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
        />
      </div>

      {/* — Requisitos de evidência — */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-ui text-base font-semibold">
            Requisitos de evidência
            <span className="ml-2 rounded-full bg-idle-soft px-2 py-0.5 font-mono text-micro text-idle">
              {requirements.data?.length ?? 0}
            </span>
          </h2>
          {canEditRequirements && (requirements.data?.length ?? 0) > 0 && (
            <Button variant="ghost" onClick={() => setConfirmRemoveAll(true)}>
              <Trash2 aria-hidden className="size-4" /> Remover todos
            </Button>
          )}
        </div>

        {requirements.data?.length === 0 && (
          <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-sm text-muted">
            Nenhum requisito — o diagnóstico deste item não pedirá evidências.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {requirements.data?.map((req) => {
            const Icon = typeIcons[req.type];
            return (
              <li
                key={req.id}
                className="group flex items-center justify-between gap-3 rounded-card border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-mono text-micro font-medium uppercase tracking-[.08em] text-muted">
                    <Icon aria-hidden className="size-3.5" /> {typeLabels[req.type]}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{req.question}</p>
                  {req.type === 'cadastro' && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {req.targetGroup && (
                        <span className="rounded-full bg-idle-soft px-2 py-0.5 text-micro text-idle">
                          {registerTargetLabels[req.targetGroup]}
                        </span>
                      )}
                      {req.targetGroup && req.fieldKey && (
                        <span className="rounded-full bg-idle-soft px-2 py-0.5 text-micro text-idle">
                          coluna:{' '}
                          {documentColumns(req.targetGroup).find((f) => f.key === req.fieldKey)
                            ?.label ?? req.fieldKey}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {canEditRequirements && (
                  <button
                    type="button"
                    title="Remover requisito"
                    aria-label={`Remover requisito ${req.question}`}
                    disabled={removeRequirement.isPending}
                    onClick={() => removeRequirement.mutate({ unitId, requirementId: req.id })}
                    className="cursor-pointer rounded-ctl p-1.5 text-muted opacity-0 transition-opacity hover:bg-bad-soft hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* Novo requisito */}
        {canEditRequirements && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAdd) return;
            addRequirement.mutate({
              unitId,
              adequacyItemId,
              type,
              question: question.trim(),
              targetGroup: type === 'cadastro' && targetGroup ? targetGroup : null,
              fieldKey: type === 'cadastro' && fieldKey ? fieldKey : null,
            });
          }}
          className="space-y-3 rounded-card border border-dashed border-line-strong bg-paper p-4"
        >
          <p className="font-ui text-sm font-semibold">Novo requisito</p>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Tipo"
              value={type}
              onChange={(e) => setType(e.target.value as RequirementType)}
              className="w-40"
            >
              {requirementTypes.map((value) => (
                <option key={value} value={value}>
                  {typeLabels[value]}
                </option>
              ))}
            </SelectField>
            <Field
              label={type === 'cadastro' ? 'Pergunta (por item do cadastro)' : 'Descrição'}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                type === 'cadastro'
                  ? 'Ex.: Certificado de treinamento NR-10'
                  : 'Ex.: Laudo técnico atualizado das instalações'
              }
              className="min-w-64 flex-1"
            />
            <Button type="submit" disabled={!canAdd}>
              <Plus aria-hidden className="size-4" /> Adicionar
            </Button>
          </div>

          {type === 'cadastro' && (
            <div className="flex flex-wrap gap-3 rounded-card border border-action/20 bg-action-soft/40 p-3">
              <SelectField
                label="Cadastro alvo"
                value={targetGroup}
                onChange={(e) => {
                  setTargetGroup(e.target.value as RegisterTarget | '');
                  setFieldKey('');
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
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                className="min-w-52 flex-1"
                disabled={!targetGroup}
                hint={!targetGroup ? 'Escolha o cadastro primeiro' : undefined}
              >
                <option value="">Selecionar coluna…</option>
                {targetGroup &&
                  documentColumns(targetGroup).map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
              </SelectField>
            </div>
          )}
          {addRequirement.error && (
            <p role="alert" className="text-sm text-bad">
              {addRequirement.error.message}
            </p>
          )}
        </form>
        )}
      </div>

      <Dialog
        open={confirmRemoveAll}
        onClose={() => setConfirmRemoveAll(false)}
        title="Remover todos os requisitos"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Remover os <strong>{requirements.data?.length ?? 0} requisitos</strong> deste item?
            Diagnósticos já realizados não são alterados.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmRemoveAll(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeAll.isPending}
              onClick={() => removeAll.mutate({ unitId, adequacyItemId })}
            >
              Remover todos
            </Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}
