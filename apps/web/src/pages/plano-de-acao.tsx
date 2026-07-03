import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { ActionStatus } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page } from '@/components/ui/page';
import { RowMenu } from '@/components/ui/row-menu';
import { StatusPill } from '@/components/ui/status-pill';

const actionStyles: Record<ActionStatus, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'text-idle bg-idle-soft' },
  em_andamento: { label: 'Em andamento', className: 'text-warn bg-warn-soft' },
  concluida: { label: 'Concluída', className: 'text-ok bg-ok-soft' },
  cancelada: { label: 'Cancelada', className: 'text-muted bg-idle-soft' },
};

function ActionPill({ status, overdue }: { status: ActionStatus; overdue: boolean }) {
  const style =
    overdue && (status === 'pendente' || status === 'em_andamento')
      ? { label: 'Prazo vencido', className: 'text-bad bg-bad-soft' }
      : actionStyles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-ui text-[12.5px] font-semibold ${style.className}`}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {style.label}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

export function PlanoDeAcaoPage() {
  const { unitId } = useParams({ from: '/_authed/$companyId/$unitId/plano-de-acao' });
  const queryClient = useQueryClient();
  const actions = useQuery(trpc.adequacy.actionItems.queryOptions({ unitId }));

  const setStatus = useMutation(
    trpc.adequacy.setActionStatus.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.adequacy.actionItems.queryKey({ unitId }),
        }),
    }),
  );

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">Avaliação da Conformidade</p>
        <h1 className="text-[28px] font-bold tracking-tight">Plano de Ação</h1>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Norma', 'Ação recomendada', 'Aderência', 'Responsável', 'Prazo', 'Situação', ''].map(
                (heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap border-b border-line-strong px-3.5 py-2.5 text-left font-ui text-xs font-semibold uppercase tracking-[.06em] text-muted"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {actions.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-12 text-center text-muted">
                  Nenhuma ação no plano — diagnósticos abaixo de Conforme com prazo geram ações
                  automaticamente.
                </td>
              </tr>
            )}
            {actions.data?.map((action) => {
              const overdue =
                Boolean(action.deadline) &&
                new Date(`${action.deadline}T23:59:59`).getTime() < Date.now();
              return (
                <tr key={action.id} className="hover:bg-paper">
                  <td className="border-b border-line px-3.5 py-2.5">
                    <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-[12.5px] text-action">
                      {action.normCode}
                    </span>
                  </td>
                  <td className="w-full border-b border-line px-3.5 py-2.5">
                    <span className="line-clamp-2">
                      {action.recommendedAction ?? action.normDescription}
                    </span>
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5">
                    <StatusPill status={action.adherence} />
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5 text-muted">
                    {action.responsible ?? '—'}
                  </td>
                  <td className="tabular border-b border-line px-3.5 py-2.5 font-mono text-[13px]">
                    {formatDate(action.deadline)}
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5">
                    <ActionPill status={action.status} overdue={overdue} />
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5">
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Ações da norma ${action.normCode}`}
                        items={[
                          {
                            label: 'Marcar em andamento',
                            onSelect: () =>
                              setStatus.mutate({
                                unitId,
                                actionItemId: action.id,
                                status: 'em_andamento',
                              }),
                          },
                          {
                            label: 'Concluir',
                            onSelect: () =>
                              setStatus.mutate({
                                unitId,
                                actionItemId: action.id,
                                status: 'concluida',
                              }),
                          },
                          {
                            label: 'Cancelar ação',
                            danger: true,
                            onSelect: () =>
                              setStatus.mutate({
                                unitId,
                                actionItemId: action.id,
                                status: 'cancelada',
                              }),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
