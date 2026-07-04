import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  compareNormCodes,
  diagnosticStatusScore,
  normalizeText,
  type ActionStatus,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Page } from '@/components/ui/page';
import { RowMenu } from '@/components/ui/row-menu';
import { StatusPill } from '@/components/ui/status-pill';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';

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

function isOverdue(deadline: string | null) {
  return Boolean(deadline) && new Date(`${deadline}T23:59:59`).getTime() < Date.now();
}

export function PlanoDeAcaoPage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId/plano-de-acao' });
  const { ord, dir } = useSearch({ from: '/_authed/$companyId/$unitId/plano-de-acao' });
  const navigate = useNavigate();
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

  // Ordenação (?ord=&dir=): servidor entrega por prazo; o clique reordena.
  type ActionRow = NonNullable<typeof actions.data>[number];
  const currentOrd = ord ?? 'prazo';
  const currentDir = dir ?? 'asc';
  const situationRank = (row: ActionRow) =>
    isOverdue(row.deadline) && (row.status === 'pendente' || row.status === 'em_andamento')
      ? 0
      : { pendente: 1, em_andamento: 2, concluida: 3, cancelada: 4 }[row.status];
  const accessors: Record<string, (row: ActionRow) => SortValue> = {
    norma: (row) => row.normCode,
    acao: (row) => normalizeText(row.recommendedAction ?? row.normDescription),
    aderencia: (row) => diagnosticStatusScore[row.adherence],
    responsavel: (row) => (row.responsible ? normalizeText(row.responsible) : null),
    prazo: (row) => row.deadline,
    situacao: (row) => situationRank(row),
  };
  const sorted = sortRows(
    actions.data ?? [],
    accessors[currentOrd] ?? accessors.prazo!,
    currentDir,
    currentOrd === 'norma' ? compareNormCodes : undefined,
  );
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/$unitId/plano-de-acao',
      params: { companyId, unitId },
      search: toggleSort({ ord, dir }, key, 'prazo'),
    });

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
              {(
                [
                  ['norma', 'Norma'],
                  ['acao', 'Ação recomendada'],
                  ['aderencia', 'Aderência'],
                  ['responsavel', 'Responsável'],
                  ['prazo', 'Prazo'],
                  ['situacao', 'Situação'],
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
            {actions.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-12 text-center text-muted">
                  Nenhuma ação no plano — diagnósticos abaixo de Conforme com prazo geram ações
                  automaticamente.
                </td>
              </tr>
            )}
            {sorted.map((action) => {
              const overdue = isOverdue(action.deadline);
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
