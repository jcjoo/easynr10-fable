import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { normalizeText } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/format';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { useDialogMutation, useDialogTarget } from '@/lib/use-dialog-mutation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/ui/alert-strip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Page, PageTitle } from '@/components/ui/page';
import { Td } from '@/components/ui/table';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortState,
  type SortValue,
} from '@/components/ui/sortable';

// Catálogo de atividades da unidade: opções do checklist marcado na
// Autorização de Trabalho (WorkPermitDetails.atividades guarda o NOME
// escolhido, não este id — ver autorizacoes.tsx). CRUD simples: nome único
// por unidade, sem pasta/campos personalizados.

interface ActivityRow {
  id: string;
  name: string;
  createdAt: string;
}

const rowActionClass = `cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity
  hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100`;

export function AtividadesPage() {
  const { companyId, unitId } = useParams({ strict: false }) as {
    companyId: string;
    unitId: string;
  };
  const { ord, dir } = useSearch({ strict: false }) as SortState;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { can } = useUnitPermissions(unitId);
  const canManage = can('autorizacoes.gerar');

  const list = useQuery(trpc.authorizations.listActivities.queryOptions({ unitId }));
  const rows = (list.data ?? []) as ActivityRow[];
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.authorizations.listActivities.queryKey({ unitId }),
    });

  // — Criar/editar (mesmo diálogo; editing = null cria) —
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityRow | null>(null);
  const [name, setName] = useState('');

  function openCreate() {
    setEditing(null);
    setName('');
    setDialogOpen(true);
  }
  function openEdit(row: ActivityRow) {
    setEditing(row);
    setName(row.name);
    setDialogOpen(true);
  }

  const upsert = useDialogMutation(trpc.authorizations.upsertActivity.mutationOptions(), () => {
    setDialogOpen(false);
    invalidate();
  });

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    upsert.mutate({ unitId, activityId: editing?.id, name: name.trim() });
  }

  // — Excluir —
  const removeDialog = useDialogTarget<ActivityRow>();
  const remove = useDialogMutation(trpc.authorizations.removeActivity.mutationOptions(), () => {
    removeDialog.close();
    invalidate();
  });

  // Ordenação (?ord=&dir=).
  const currentOrd = ord ?? 'nome';
  const currentDir = dir ?? 'asc';
  const accessors: Record<string, (row: ActivityRow) => SortValue> = {
    nome: (row) => normalizeText(row.name),
    criada: (row) => row.createdAt,
  };
  const sorted = sortRows(rows, accessors[currentOrd] ?? accessors.nome!, currentDir);
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/$unitId/atividades',
      params: { companyId, unitId },
      search: toggleSort({ ord, dir }, key, 'nome'),
    });

  return (
    <Page>
      <Link
        to="/$companyId/$unitId/autorizacoes"
        params={{ companyId, unitId }}
        search={{ tipo: 'permissao-trabalho' }}
        className="flex w-fit items-center gap-1.5 font-ui text-sm font-medium text-muted hover:text-action"
      >
        <ArrowLeft aria-hidden className="size-4" /> Autorizações
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Autorizações · Autorização de Trabalho</p>
          <PageTitle>Atividades</PageTitle>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus aria-hidden className="size-4" /> Nova
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <SortableTh colKey="nome" label="Nome" ord={currentOrd} dir={currentDir} onSort={handleSort} />
              <SortableTh
                colKey="criada"
                label="Criada em"
                ord={currentOrd}
                dir={currentDir}
                onSort={handleSort}
              />
              <PlainTh />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3.5 py-12 text-center text-muted">
                  Nenhuma atividade cadastrada ainda
                  {canManage ? ' — clique em "Nova" para começar.' : '.'}
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr key={row.id} className="group hover:bg-paper">
                <Td className="font-medium">{row.name}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{formatDate(row.createdAt)}</Td>
                <Td>
                  {canManage && (
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        title="Editar atividade"
                        aria-label={`Editar atividade ${row.name}`}
                        onClick={() => openEdit(row)}
                        className={rowActionClass}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        title="Excluir atividade"
                        aria-label={`Excluir atividade ${row.name}`}
                        onClick={() => removeDialog.open(row)}
                        className={`${rowActionClass} hover:bg-bad-soft hover:text-bad`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* — Nova/editar atividade — */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar atividade' : 'Nova atividade'}
      >
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Manutenção em painel elétrico energizado"
            autoFocus
          />
          {upsert.error && <AlertStrip>{upsert.error.message}</AlertStrip>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || upsert.isPending}>
              {upsert.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* — Excluir — */}
      <ConfirmDialog
        open={removeDialog.isOpen}
        onClose={removeDialog.close}
        title="Excluir atividade"
        actionLabel="Excluir atividade"
        pendingLabel="Excluindo…"
        pending={remove.isPending}
        error={remove.error?.message}
        onConfirm={() =>
          removeDialog.target && remove.mutate({ unitId, activityId: removeDialog.target.id })
        }
      >
        A atividade <strong>{removeDialog.target?.name}</strong> deixa de aparecer no checklist de
        novas autorizações de trabalho; autorizações já geradas não são afetadas.
      </ConfirmDialog>
    </Page>
  );
}
