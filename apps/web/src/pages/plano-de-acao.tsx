import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { actionPriorities, compareNormCodes, normalizeText } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { formatDate } from '@/lib/format';
import { Page, PageTitle } from '@/components/ui/page';
import { RowMenu } from '@/components/ui/row-menu';
import { ActionStatusPill, PriorityPill } from '@/components/ui/status-pill';
import { Td } from '@/components/ui/table';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';

function isOverdue(deadline: string | null) {
  return Boolean(deadline) && new Date(`${deadline}T23:59:59`).getTime() < Date.now();
}

export function PlanoDeAcaoPage() {
  const { companyId, unitId } = useParams({ from: '/_authed/$companyId/$unitId/plano-de-acao' });
  const { ord, dir } = useSearch({ from: '/_authed/$companyId/$unitId/plano-de-acao' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actions = useQuery(trpc.adequacy.actionItems.queryOptions({ unitId }));
  // Sem "plano.status" no papel, o menu de mudança de situação some.
  const { can } = useUnitPermissions(unitId);
  const canSetStatus = can('plano.status');

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
    prioridade: (row) => actionPriorities.indexOf(row.priority),
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
        <PageTitle>Plano de Ação</PageTitle>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(
                [
                  ['norma', 'Norma'],
                  ['acao', 'Ação recomendada'],
                  ['prioridade', 'Prioridade'],
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
                  <Td>
                    <span className="rounded-ctl bg-action-soft px-1.5 py-0.5 font-mono text-label text-action">
                      {action.normCode}
                    </span>
                  </Td>
                  <Td className="w-full">
                    <span className="line-clamp-2">
                      {action.recommendedAction ?? action.normDescription}
                    </span>
                  </Td>
                  <Td>
                    <PriorityPill priority={action.priority} />
                  </Td>
                  <Td className="text-muted">
                    {action.responsible ?? '—'}
                  </Td>
                  <Td className="tabular font-mono text-caption">
                    {formatDate(action.deadline)}
                  </Td>
                  <Td>
                    <ActionStatusPill status={action.status} overdue={overdue} />
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      {canSetStatus && (
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
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
