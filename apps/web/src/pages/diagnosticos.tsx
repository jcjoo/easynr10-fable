import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { diagnosticStatuses, type DiagnosticStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';
import { StatusFilter } from '@/components/ui/status-filter';
import { StatusPill } from '@/components/ui/status-pill';

interface AdequacyRow {
  id: string;
  normCode: string;
  normDescription: string;
  normOrientation: string;
  importanceWeight: number;
  status: DiagnosticStatus | null;
  deadline: string | null;
}

const statusLabels: Record<DiagnosticStatus, string> = {
  insuficiente: 'Insuficiente',
  parcial: 'Parcial',
  suficiente: 'Suficiente',
  conforme: 'Conforme',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

export function DiagnosticosPage() {
  const { companyId, unitId } = useParams({
    from: '/_authed/$companyId/$unitId/diagnosticos',
  });
  const { status: statusFilter } = useSearch({
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
  const [status, setStatus] = useState<DiagnosticStatus>('insuficiente');
  const [deadline, setDeadline] = useState('');
  const [responsible, setResponsible] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [technicalOpinion, setTechnicalOpinion] = useState('');

  const history = useQuery({
    ...trpc.adequacy.history.queryOptions({ unitId, adequacyItemId: target?.id ?? '' }),
    enabled: Boolean(target),
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
    setStatus(row.status ?? 'insuficiente');
    setDeadline(row.deadline ?? '');
    setResponsible('');
    setRecommendedAction('');
    setTechnicalOpinion('');
  }

  const filtered = (items.data ?? []).filter(
    (row) => !statusFilter || row.status === statusFilter,
  );

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Avaliação da Conformidade</p>
        <h1 className="text-[28px] font-bold tracking-tight">Diagnóstico</h1>
      </div>

      <StatusFilter
        value={statusFilter ?? null}
        onChange={(value) =>
          navigate({
            to: '/$companyId/$unitId/diagnosticos',
            params: { companyId, unitId },
            search: value ? { status: value } : {},
          })
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Norma', 'Exigência', 'Peso', 'Aderência', 'Prazo'].map((heading) => (
                <th
                  key={heading}
                  className="whitespace-nowrap border-b border-line-strong px-3.5 py-2.5 text-left font-ui text-xs font-semibold uppercase tracking-[.06em] text-muted"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-12 text-center">
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
                <td colSpan={5} className="px-3.5 py-10 text-center text-muted">
                  Nenhum item com essa aderência.
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr
                key={row.id}
                onClick={() => openAssessment(row)}
                className="cursor-pointer hover:bg-paper"
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
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!target) return;
              diagnose.mutate({
                unitId,
                adequacyItemId: target.id,
                status,
                deadline: deadline || null,
                responsible: responsible || null,
                recommendedAction: recommendedAction || null,
                technicalOpinion: technicalOpinion || null,
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
                    {statusLabels[value]}
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
                  </div>
                  {entry.technicalOpinion && (
                    <p className="text-ink-soft">{entry.technicalOpinion}</p>
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
